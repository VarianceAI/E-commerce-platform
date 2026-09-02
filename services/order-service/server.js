const express = require('express');
const mysql = require('mysql2/promise');
const axios = require('axios');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { Kafka } = require('kafkajs');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// Kafka setup
const kafka = new Kafka({
  clientId: 'order-service',
  brokers: [process.env.KAFKA_BROKERS || 'localhost:9092']
});
const producer = kafka.producer();

let kafkaReady = false;

async function initializeKafka() {
  try {
    await producer.connect();
    kafkaReady = true;
    console.log('✓ Kafka connected');
  } catch (err) {
    console.error('✗ Kafka connection failed, retrying in 5s:', err.message);
    setTimeout(initializeKafka, 5000);
  }
}

let pool;

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

// Initialize services (don't crash if Kafka isn't ready yet)
initializePool();
initializeKafka();

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'order-service' });
});

// Create order
app.post('/', async (req, res) => {
  try {
    const { user_id, items, total_amount } = req.body;

    if (!user_id || !items || items.length === 0) {
      return res.status(400).json({ error: 'User ID and items required' });
    }

    const connection = await pool.getConnection();

    // Create order
    const [orderResult] = await connection.execute(
      'INSERT INTO orders (user_id, total_amount, status) VALUES (?, ?, ?)',
      [user_id, total_amount, 'PENDING']
    );

    const orderId = orderResult.insertId;

    // Insert order items
    for (const item of items) {
      await connection.execute(
        'INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)',
        [orderId, item.product_id, item.quantity, item.unit_price]
      );
    }

    // Emit event to outbox for eventual consistency
    const eventPayload = { orderId, userId: user_id, items, totalAmount: total_amount };
    await connection.execute(
      'INSERT INTO events_outbox (aggregate_id, aggregate_type, event_type, payload) VALUES (?, ?, ?, ?)',
      [
        orderId,
        'Order',
        'OrderCreated',
        JSON.stringify(eventPayload),
      ]
    );

    // Publish to Kafka (best-effort — outbox ensures eventual delivery)
    if (kafkaReady) {
      await producer.send({
        topic: 'order-events',
        messages: [
          { key: orderId.toString(), value: JSON.stringify({ type: 'OrderCreated', ...eventPayload }) },
        ],
      });
    }

    connection.release();

    res.status(201).json({ orderId, status: 'PENDING', total_amount });
  } catch (err) {
    console.error('Create order error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get order by ID
app.get('/:order_id', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const [orders] = await connection.execute('SELECT * FROM orders WHERE id = ?', [req.params.order_id]);

    if (orders.length === 0) {
      connection.release();
      return res.status(404).json({ error: 'Order not found' });
    }

    const [items] = await connection.execute('SELECT * FROM order_items WHERE order_id = ?', [
      req.params.order_id,
    ]);

    connection.release();

    res.json({ ...orders[0], items });
  } catch (err) {
    console.error('Get order error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's orders
app.get('/user/:user_id', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const [orders] = await connection.execute(
      'SELECT id, user_id, order_date, total_amount, status FROM orders WHERE user_id = ? ORDER BY order_date DESC',
      [req.params.user_id]
    );
    connection.release();

    res.json(orders);
  } catch (err) {
    console.error('Get user orders error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update order status
app.patch('/:order_id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const connection = await pool.getConnection();

    await connection.execute('UPDATE orders SET status = ? WHERE id = ?', [status, req.params.order_id]);

    const eventPayload = { orderId: req.params.order_id, newStatus: status };
    await connection.execute(
      'INSERT INTO events_outbox (aggregate_id, aggregate_type, event_type, payload) VALUES (?, ?, ?, ?)',
      [
        req.params.order_id,
        'Order',
        'OrderStatusChanged',
        JSON.stringify(eventPayload),
      ]
    );

    // Publish to Kafka (best-effort)
    if (kafkaReady) {
      await producer.send({
        topic: 'order-events',
        messages: [
          { key: req.params.order_id.toString(), value: JSON.stringify({ type: 'OrderStatusChanged', ...eventPayload }) },
        ],
      });
    }

    connection.release();

    res.json({ message: 'Order status updated' });
  } catch (err) {
    console.error('Update order status error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3003;

app.listen(PORT, () => {
  console.log(`Order Service running on port ${PORT}`);
});
