/**
 * Order Service Tests
 * Mocks MySQL pool and Kafka producer.
 */

jest.mock('mysql2/promise', () => {
  const mockExecute = jest.fn();
  const mockRelease = jest.fn();
  const connection = { execute: mockExecute, release: mockRelease };
  const pool = { getConnection: jest.fn().mockResolvedValue(connection) };
  return { createPool: jest.fn(() => pool), _mockExecute: mockExecute, _mockConnection: connection };
});

jest.mock('kafkajs', () => {
  const mockSend = jest.fn().mockResolvedValue({});
  const mockConnect = jest.fn().mockResolvedValue({});
  const producer = { connect: mockConnect, send: mockSend };
  const Kafka = jest.fn(() => ({ producer: jest.fn(() => producer) }));
  return { Kafka, _mockSend: mockSend };
});

const request = require('supertest');
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const { Kafka, _mockSend } = require('kafkajs');

const pool = mysql.createPool({});
const mockExecute = mysql._mockExecute;

const kafka = new Kafka({});
const producer = kafka.producer();

const app = express();
app.use(express.json());
app.use(cors());

// Health
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'order-service' }));

// Create order
app.post('/', async (req, res) => {
  try {
    const { user_id, items, total_amount } = req.body;
    if (!user_id || !items || items.length === 0) return res.status(400).json({ error: 'User ID and items required' });

    const conn = await pool.getConnection();
    const [orderResult] = await conn.execute(
      'INSERT INTO orders (user_id, total_amount, status) VALUES (?, ?, ?)',
      [user_id, total_amount, 'PENDING']
    );
    const orderId = orderResult.insertId;

    for (const item of items) {
      await conn.execute(
        'INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)',
        [orderId, item.product_id, item.quantity, item.unit_price]
      );
    }

    const eventPayload = { orderId, userId: user_id, items, totalAmount: total_amount };
    await conn.execute(
      'INSERT INTO events_outbox (aggregate_id, aggregate_type, event_type, payload) VALUES (?, ?, ?, ?)',
      [orderId, 'Order', 'OrderCreated', JSON.stringify(eventPayload)]
    );

    await producer.send({
      topic: 'order-events',
      messages: [{ key: orderId.toString(), value: JSON.stringify({ type: 'OrderCreated', ...eventPayload }) }],
    });

    conn.release();
    res.status(201).json({ orderId, status: 'PENDING', total_amount });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get order by ID
app.get('/:order_id', async (req, res) => {
  try {
    const conn = await pool.getConnection();
    const [orders] = await conn.execute('SELECT * FROM orders WHERE id = ?', [req.params.order_id]);
    if (orders.length === 0) { conn.release(); return res.status(404).json({ error: 'Order not found' }); }
    const [items] = await conn.execute('SELECT * FROM order_items WHERE order_id = ?', [req.params.order_id]);
    conn.release();
    res.json({ ...orders[0], items });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's orders
app.get('/user/:user_id', async (req, res) => {
  try {
    const conn = await pool.getConnection();
    const [orders] = await conn.execute(
      'SELECT id, user_id, order_date, total_amount, status FROM orders WHERE user_id = ? ORDER BY order_date DESC',
      [req.params.user_id]
    );
    conn.release();
    res.json(orders);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update status
app.patch('/:order_id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const conn = await pool.getConnection();
    await conn.execute('UPDATE orders SET status = ? WHERE id = ?', [status, req.params.order_id]);
    await conn.execute(
      'INSERT INTO events_outbox (aggregate_id, aggregate_type, event_type, payload) VALUES (?, ?, ?, ?)',
      [req.params.order_id, 'Order', 'OrderStatusChanged', JSON.stringify({ orderId: req.params.order_id, newStatus: status })]
    );
    await producer.send({
      topic: 'order-events',
      messages: [{ key: req.params.order_id, value: JSON.stringify({ type: 'OrderStatusChanged' }) }],
    });
    conn.release();
    res.json({ message: 'Order status updated' });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ----------------------------------------------------------------
// Tests
// ----------------------------------------------------------------

describe('GET /health', () => {
  test('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('POST / (create order)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mysql._mockConnection.release.mockResolvedValue();
  });

  test('400 when user_id missing', async () => {
    const res = await request(app).post('/').send({ items: [{ product_id: 1, quantity: 2, unit_price: 10 }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/User ID and items required/);
  });

  test('400 when items is empty array', async () => {
    const res = await request(app).post('/').send({ user_id: 1, items: [], total_amount: 0 });
    expect(res.status).toBe(400);
  });

  test('201 creates order and publishes to Kafka', async () => {
    mockExecute
      .mockResolvedValueOnce([{ insertId: 42 }])  // INSERT orders
      .mockResolvedValueOnce([{}])                 // INSERT order_items
      .mockResolvedValueOnce([{}]);                // INSERT events_outbox

    const res = await request(app).post('/').send({
      user_id: 7,
      items: [{ product_id: 1, quantity: 2, unit_price: 29.99 }],
      total_amount: 59.98
    });

    expect(res.status).toBe(201);
    expect(res.body.orderId).toBe(42);
    expect(res.body.status).toBe('PENDING');
    expect(res.body.total_amount).toBe(59.98);

    // Kafka was called
    expect(_mockSend).toHaveBeenCalledTimes(1);
    const kafkaCall = _mockSend.mock.calls[0][0];
    expect(kafkaCall.topic).toBe('order-events');
    const msg = JSON.parse(kafkaCall.messages[0].value);
    expect(msg.type).toBe('OrderCreated');
    expect(msg.orderId).toBe(42);
  });

  test('outbox INSERT is called with OrderCreated event', async () => {
    mockExecute
      .mockResolvedValueOnce([{ insertId: 10 }])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([{}]);

    await request(app).post('/').send({ user_id: 1, items: [{ product_id: 2, quantity: 1, unit_price: 5 }], total_amount: 5 });

    const outboxCall = mockExecute.mock.calls[2];
    expect(outboxCall[0]).toContain('events_outbox');
    expect(outboxCall[1][2]).toBe('OrderCreated');
  });
});

describe('GET /:order_id', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mysql._mockConnection.release.mockResolvedValue();
  });

  test('404 when order not found', async () => {
    mockExecute.mockResolvedValueOnce([[]]); // no order rows
    const res = await request(app).get('/999');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Order not found/);
  });

  test('200 returns order with items', async () => {
    mockExecute
      .mockResolvedValueOnce([[{ id: 1, user_id: 7, total_amount: 59.98, status: 'PENDING' }]])
      .mockResolvedValueOnce([[{ id: 1, order_id: 1, product_id: 1, quantity: 2, unit_price: 29.99 }]]);

    const res = await request(app).get('/1');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].quantity).toBe(2);
  });
});

describe('GET /user/:user_id', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mysql._mockConnection.release.mockResolvedValue();
  });

  test('200 returns user orders', async () => {
    mockExecute.mockResolvedValueOnce([[
      { id: 1, user_id: 7, total_amount: 50, status: 'DELIVERED' },
      { id: 2, user_id: 7, total_amount: 30, status: 'PENDING' },
    ]]);
    const res = await request(app).get('/user/7');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  test('200 returns empty array when no orders', async () => {
    mockExecute.mockResolvedValueOnce([[]]);
    const res = await request(app).get('/user/999');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('PATCH /:order_id/status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mysql._mockConnection.release.mockResolvedValue();
  });

  test('200 updates status and publishes Kafka event', async () => {
    mockExecute.mockResolvedValue([{}]);
    const res = await request(app).patch('/1/status').send({ status: 'SHIPPED' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/updated/);
    expect(_mockSend).toHaveBeenCalledTimes(1);
    const msg = JSON.parse(_mockSend.mock.calls[0][0].messages[0].value);
    expect(msg.type).toBe('OrderStatusChanged');
  });
});
