/**
 * User Service Tests
 * Mocks MySQL pool so no real DB is needed.
 */

// --- mock mysql2/promise before requiring the app ---
jest.mock('mysql2/promise', () => {
  const mockExecute = jest.fn();
  const mockRelease = jest.fn();
  const mockCommit = jest.fn();
  const mockRollback = jest.fn();

  const connection = {
    execute: mockExecute,
    release: mockRelease,
    commit: mockCommit,
    rollback: mockRollback,
    beginTransaction: jest.fn(),
  };

  const pool = {
    getConnection: jest.fn().mockResolvedValue(connection),
  };

  return {
    createPool: jest.fn(() => pool),
    _mockExecute: mockExecute,
    _mockConnection: connection,
  };
});

const request = require('supertest');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');

// Bootstrap the app inline (same code as server.js but without app.listen)
const app = express();
app.use(express.json());
const cors = require('cors');
app.use(cors());

const pool = mysql.createPool({});
const mockExecute = mysql._mockExecute;

const JWT_SECRET = 'test-secret';

const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Register
app.post('/register', async (req, res) => {
  try {
    const { email, password, first_name, last_name, user_type, business_name } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const type = user_type || 'customer';
    if (!['customer', 'business'].includes(type)) return res.status(400).json({ error: 'Invalid user_type' });

    const hashed = await bcrypt.hash(password, 10);
    const conn = await pool.getConnection();
    await conn.beginTransaction();
    const [result] = await conn.execute(
      'INSERT INTO users (email, password_hash, first_name, last_name, user_type) VALUES (?, ?, ?, ?, ?)',
      [email, hashed, first_name || null, last_name || null, type]
    );
    if (type === 'business' && business_name) {
      await conn.execute('INSERT INTO business_profiles (user_id, business_name) VALUES (?, ?)', [result.insertId, business_name]);
    }
    await conn.commit();
    conn.release();
    res.status(201).json({ message: 'User registered successfully', user_type: type });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Email already exists' });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const conn = await pool.getConnection();
    const [users] = await conn.execute('SELECT * FROM users WHERE email = ?', [email]);
    conn.release();
    if (users.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const user = users[0];
    if (!(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id, email: user.email, user_type: user.user_type }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user: { id: user.id, email: user.email, user_type: user.user_type } });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Profile
app.get('/profile', verifyToken, async (req, res) => {
  try {
    const conn = await pool.getConnection();
    const [users] = await conn.execute('SELECT id, email, first_name, last_name FROM users WHERE id = ?', [req.user.id]);
    conn.release();
    if (users.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(users[0]);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ----------------------------------------------------------------
// Tests
// ----------------------------------------------------------------

describe('POST /register', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mysql._mockConnection.beginTransaction.mockResolvedValue();
    mysql._mockConnection.commit.mockResolvedValue();
    mysql._mockConnection.rollback.mockResolvedValue();
    mysql._mockConnection.release.mockResolvedValue();
  });

  test('400 when email missing', async () => {
    const res = await request(app).post('/register').send({ password: 'pass123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Email and password required/);
  });

  test('400 when password missing', async () => {
    const res = await request(app).post('/register').send({ email: 'a@b.com' });
    expect(res.status).toBe(400);
  });

  test('400 for invalid user_type', async () => {
    const res = await request(app).post('/register').send({ email: 'a@b.com', password: 'p', user_type: 'admin' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid user_type/);
  });

  test('201 for valid customer registration', async () => {
    mockExecute.mockResolvedValueOnce([{ insertId: 1 }]);
    const res = await request(app).post('/register').send({ email: 'customer@test.com', password: 'pass123', user_type: 'customer' });
    expect(res.status).toBe(201);
    expect(res.body.user_type).toBe('customer');
  });

  test('201 for valid business registration with business_name', async () => {
    mockExecute
      .mockResolvedValueOnce([{ insertId: 2 }])  // INSERT users
      .mockResolvedValueOnce([{}]);               // INSERT business_profiles
    const res = await request(app).post('/register').send({ email: 'biz@test.com', password: 'pass123', user_type: 'business', business_name: 'ACME Corp' });
    expect(res.status).toBe(201);
    expect(res.body.user_type).toBe('business');
  });

  test('409 when email already exists', async () => {
    const dup = new Error('Duplicate'); dup.code = 'ER_DUP_ENTRY';
    mockExecute.mockRejectedValueOnce(dup);
    const res = await request(app).post('/register').send({ email: 'dup@test.com', password: 'pass123' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/Email already exists/);
  });
});

describe('POST /login', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mysql._mockConnection.release.mockResolvedValue();
  });

  test('400 when credentials missing', async () => {
    const res = await request(app).post('/login').send({});
    expect(res.status).toBe(400);
  });

  test('401 when user not found', async () => {
    mockExecute.mockResolvedValueOnce([[]]); // no rows
    const res = await request(app).post('/login').send({ email: 'x@x.com', password: 'p' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Invalid credentials/);
  });

  test('401 when password wrong', async () => {
    const hash = await bcrypt.hash('correctpass', 10);
    mockExecute.mockResolvedValueOnce([[{ id: 1, email: 'x@x.com', password_hash: hash, user_type: 'customer' }]]);
    const res = await request(app).post('/login').send({ email: 'x@x.com', password: 'wrongpass' });
    expect(res.status).toBe(401);
  });

  test('200 and returns JWT on valid login', async () => {
    const hash = await bcrypt.hash('mypassword', 10);
    mockExecute.mockResolvedValueOnce([[{ id: 99, email: 'ok@test.com', password_hash: hash, user_type: 'customer' }]]);
    const res = await request(app).post('/login').send({ email: 'ok@test.com', password: 'mypassword' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user.email).toBe('ok@test.com');
    // Verify the JWT is valid
    const decoded = jwt.verify(res.body.token, JWT_SECRET);
    expect(decoded.id).toBe(99);
  });
});

describe('GET /profile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mysql._mockConnection.release.mockResolvedValue();
  });

  test('401 with no token', async () => {
    const res = await request(app).get('/profile');
    expect(res.status).toBe(401);
  });

  test('401 with bad token', async () => {
    const res = await request(app).get('/profile').set('Authorization', 'Bearer bad.token');
    expect(res.status).toBe(401);
  });

  test('200 with valid token', async () => {
    const token = jwt.sign({ id: 5, email: 'me@test.com', user_type: 'customer' }, JWT_SECRET);
    mockExecute.mockResolvedValueOnce([[{ id: 5, email: 'me@test.com', first_name: 'Bob', last_name: 'Smith' }]]);
    const res = await request(app).get('/profile').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('me@test.com');
  });

  test('404 when user not in DB', async () => {
    const token = jwt.sign({ id: 999, email: 'ghost@test.com', user_type: 'customer' }, JWT_SECRET);
    mockExecute.mockResolvedValueOnce([[]]); // empty result
    const res = await request(app).get('/profile').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
