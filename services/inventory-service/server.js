const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

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

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'inventory-service' });
});

// Get inventory for product
app.get('/:product_id', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const [inventory] = await connection.execute('SELECT * FROM inventory WHERE product_id = ?', [
      req.params.product_id,
    ]);
    connection.release();

    if (inventory.length === 0) {
      return res.status(404).json({ error: 'Inventory not found' });
    }

    const inv = inventory[0];
    res.json({
      product_id: inv.product_id,
      quantity_on_hand: inv.quantity_on_hand,
      reserved_quantity: inv.reserved_quantity,
      available_quantity: inv.quantity_on_hand - inv.reserved_quantity,
      warehouse_location: inv.warehouse_location,
    });
  } catch (err) {
    console.error('Get inventory error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reserve inventory
app.post('/:product_id/reserve', async (req, res) => {
  try {
    const { quantity } = req.body;
    const connection = await pool.getConnection();

    // Check availability
    const [inventory] = await connection.execute('SELECT * FROM inventory WHERE product_id = ?', [
      req.params.product_id,
    ]);

    if (inventory.length === 0) {
      connection.release();
      return res.status(404).json({ error: 'Product not found in inventory' });
    }

    const inv = inventory[0];
    const availableQuantity = inv.quantity_on_hand - inv.reserved_quantity;

    if (availableQuantity < quantity) {
      connection.release();
      return res.status(400).json({ error: 'Insufficient inventory' });
    }

    // Reserve inventory
    await connection.execute(
      'UPDATE inventory SET reserved_quantity = reserved_quantity + ? WHERE product_id = ?',
      [quantity, req.params.product_id]
    );

    connection.release();

    res.json({ message: 'Inventory reserved', product_id: req.params.product_id, quantity });
  } catch (err) {
    console.error('Reserve inventory error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Release reserved inventory
app.post('/:product_id/release', async (req, res) => {
  try {
    const { quantity } = req.body;
    const connection = await pool.getConnection();

    await connection.execute(
      'UPDATE inventory SET reserved_quantity = GREATEST(0, reserved_quantity - ?) WHERE product_id = ?',
      [quantity, req.params.product_id]
    );

    connection.release();

    res.json({ message: 'Inventory released' });
  } catch (err) {
    console.error('Release inventory error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Confirm inventory (after payment)
app.post('/:product_id/confirm', async (req, res) => {
  try {
    const { quantity } = req.body;
    const connection = await pool.getConnection();

    // Deduct from on-hand and reserved
    await connection.execute(
      'UPDATE inventory SET quantity_on_hand = quantity_on_hand - ?, reserved_quantity = GREATEST(0, reserved_quantity - ?) WHERE product_id = ?',
      [quantity, quantity, req.params.product_id]
    );

    connection.release();

    res.json({ message: 'Inventory confirmed' });
  } catch (err) {
    console.error('Confirm inventory error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get low stock alerts
app.get('/alerts/low-stock', async (req, res) => {
  try {
    const threshold = req.query.threshold || 10;
    const connection = await pool.getConnection();
    const [lowStockItems] = await connection.execute(
      'SELECT product_id, quantity_on_hand, warehouse_location FROM inventory WHERE quantity_on_hand <= ?',
      [threshold]
    );
    connection.release();

    res.json(lowStockItems);
  } catch (err) {
    console.error('Get low stock alerts error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3004;

app.listen(PORT, async () => {
  await initializePool();
  console.log(`Inventory Service running on port ${PORT}`);
});
