const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

let pool;

// Mock Stripe integration (replace with real Stripe SDK in production)
class MockStripe {
  async chargeCard(amount, token) {
    return {
      id: `txn_${uuidv4()}`,
      amount,
      status: 'succeeded',
      timestamp: new Date(),
    };
  }
}

const stripe = new MockStripe();

// Database initialization
async function initializePool() {
  pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root_password',
    database: process.env.DB_NAME || 'ecommerce_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  try {
    const connection = await pool.getConnection();
    console.log('✓ Database connected');
    connection.release();
  } catch (err) {
    console.error('✗ Database connection failed:', err.message);
    setTimeout(initializePool, 5000);
  }
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'payment-service' });
});

// Process payment
app.post('/process', async (req, res) => {
  try {
    const { order_id, user_id, amount, payment_method, token } = req.body;

    if (!order_id || !user_id || !amount) {
      return res.status(400).json({ error: 'Order ID, user ID, and amount required' });
    }

    // Process payment with mock Stripe
    const transaction = await stripe.chargeCard(amount, token || 'tok_mock');

    const connection = await pool.getConnection();

    // Record payment
    const [result] = await connection.execute(
      'INSERT INTO payments (order_id, user_id, amount, payment_method, status, transaction_id) VALUES (?, ?, ?, ?, ?, ?)',
      [order_id, user_id, amount, payment_method || 'card', 'COMPLETED', transaction.id]
    );

    // Emit event for outbox pattern
    await connection.execute(
      'INSERT INTO events_outbox (aggregate_id, aggregate_type, event_type, payload) VALUES (?, ?, ?, ?)',
      [
        order_id,
        'Payment',
        'PaymentProcessed',
        JSON.stringify({
          paymentId: result.insertId,
          orderId: order_id,
          userId: user_id,
          amount,
          transactionId: transaction.id,
        }),
      ]
    );

    connection.release();

    res.status(201).json({
      payment_id: result.insertId,
      order_id,
      status: 'COMPLETED',
      transaction_id: transaction.id,
      amount,
    });
  } catch (err) {
    console.error('Process payment error:', err);
    res.status(500).json({ error: 'Payment processing failed' });
  }
});

// Get payment by ID
app.get('/:payment_id', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const [payments] = await connection.execute('SELECT * FROM payments WHERE id = ?', [req.params.payment_id]);
    connection.release();

    if (payments.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    res.json(payments[0]);
  } catch (err) {
    console.error('Get payment error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get payments for order
app.get('/order/:order_id', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const [payments] = await connection.execute('SELECT * FROM payments WHERE order_id = ?', [
      req.params.order_id,
    ]);
    connection.release();

    res.json(payments);
  } catch (err) {
    console.error('Get order payments error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Refund payment
app.post('/:payment_id/refund', async (req, res) => {
  try {
    const connection = await pool.getConnection();

    // Get payment
    const [payments] = await connection.execute('SELECT * FROM payments WHERE id = ?', [req.params.payment_id]);

    if (payments.length === 0) {
      connection.release();
      return res.status(404).json({ error: 'Payment not found' });
    }

    // Update payment status
    await connection.execute('UPDATE payments SET status = ? WHERE id = ?', ['REFUNDED', req.params.payment_id]);

    // Emit event
    await connection.execute(
      'INSERT INTO events_outbox (aggregate_id, aggregate_type, event_type, payload) VALUES (?, ?, ?, ?)',
      [
        payments[0].order_id,
        'Payment',
        'PaymentRefunded',
        JSON.stringify({ paymentId: req.params.payment_id, amount: payments[0].amount }),
      ]
    );

    connection.release();

    res.json({ message: 'Payment refunded', payment_id: req.params.payment_id });
  } catch (err) {
    console.error('Refund payment error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3005;

app.listen(PORT, async () => {
  await initializePool();
  console.log(`Payment Service running on port ${PORT}`);
});
