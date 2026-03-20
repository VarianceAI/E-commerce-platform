const express = require('express');
const httpProxy = require('http-proxy');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Service URLs from environment
const services = {
  users: process.env.USER_SERVICE_URL || 'http://localhost:3001',
  products: process.env.PRODUCT_SERVICE_URL || 'http://localhost:3002',
  orders: process.env.ORDER_SERVICE_URL || 'http://localhost:3003',
  inventory: process.env.INVENTORY_SERVICE_URL || 'http://localhost:3004',
  payments: process.env.PAYMENT_SERVICE_URL || 'http://localhost:3005',
};

// Create proxies for each service
const createProxy = (target) => {
  const proxy = httpProxy.createProxyServer({ changeOrigin: true });
  proxy.on('error', (err, req, res) => {
    console.error('Proxy error:', err);
    res.status(503).json({ error: 'Service unavailable' });
  });
  return proxy;
};

const userProxy = createProxy(services.users);
const productProxy = createProxy(services.products);
const orderProxy = createProxy(services.orders);
const inventoryProxy = createProxy(services.inventory);
const paymentProxy = createProxy(services.payments);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/users', (req, res) => userProxy.web(req, res, { target: services.users }));
app.use('/api/products', (req, res) => productProxy.web(req, res, { target: services.products }));
app.use('/api/orders', (req, res) => orderProxy.web(req, res, { target: services.orders }));
app.use('/api/inventory', (req, res) => inventoryProxy.web(req, res, { target: services.inventory }));
app.use('/api/payments', (req, res) => paymentProxy.web(req, res, { target: services.payments }));

// Service discovery endpoint
app.get('/api/services', (req, res) => {
  res.json({
    services: services,
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`API Gateway running on port ${PORT}`);
  console.log('Services:');
  Object.entries(services).forEach(([name, url]) => {
    console.log(`  ${name}: ${url}`);
  });
});
