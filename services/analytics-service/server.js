const express = require('express');
const { Kafka } = require('kafkajs');
const redis = require('redis');
const { Client } = require('@elastic/elasticsearch');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// Kafka setup (must come before consumer)
const kafka = new Kafka({
  clientId: 'analytics-service',
  brokers: [process.env.KAFKA_BROKERS || 'localhost:9092']
});
const consumer = kafka.consumer({ groupId: 'analytics-group' });

let redisClient;
let esClient;

// Initialize connections
async function initialize() {
  try {
    // Redis
    redisClient = redis.createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    });
    redisClient.on('error', (err) => console.error('Redis error:', err));
    await redisClient.connect();
    console.log('✓ Redis connected');

    // Elasticsearch
    esClient = new Client({ node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200' });
    await esClient.ping();
    console.log('✓ Elasticsearch connected');

    // Create metrics index
    await esClient.indices.create({
      index: 'metrics',
      body: {
        mappings: {
          properties: {
            type: { type: 'keyword' },
            value: { type: 'float' },
            timestamp: { type: 'date' },
            period: { type: 'keyword' }
          }
        }
      }
    }, { ignore: [400] });

    await consumer.connect();
    await consumer.subscribe({ topics: ['order-events', 'inventory-alerts'], fromBeginning: true });
    console.log('✓ Kafka connected');
  } catch (err) {
    console.error('Initialization error:', err.message);
    setTimeout(initialize, 5000);
  }
}

// Process events and compute metrics
async function processEvent(event) {
  const { type, totalAmount, orderId, productId, quantity } = event;
  const now = new Date();
  const minute = Math.floor(now.getTime() / 60000) * 60000;

  if (type === 'OrderCreated') {
    // Update GMV
    const currentGMV = parseFloat(await redisClient.get('gmv') || '0');
    const newGMV = currentGMV + (totalAmount || 0);
    await redisClient.set('gmv', newGMV);

    // Update total orders counter
    await redisClient.incr('total_orders');

    // Update orders per minute
    const ordersKey = `orders:${minute}`;
    await redisClient.incr(ordersKey);
    await redisClient.expire(ordersKey, 3600);

    // Index in Elasticsearch
    await esClient.index({
      index: 'metrics',
      body: {
        type: 'order_created',
        value: totalAmount || 0,
        orderId,
        timestamp: now.toISOString(),
        period: 'total'
      }
    });

    await esClient.index({
      index: 'metrics',
      body: {
        type: 'orders_per_minute',
        value: 1,
        timestamp: new Date(minute).toISOString(),
        period: 'minute'
      }
    });
  }

  if (type === 'InventoryLow') {
    // Store inventory alert in Redis (sorted set by timestamp)
    const alertData = JSON.stringify({ productId, quantity, timestamp: now.toISOString() });
    await redisClient.lPush('inventory:alerts', alertData);
    await redisClient.lTrim('inventory:alerts', 0, 99); // Keep last 100 alerts

    // Index alert in Elasticsearch
    await esClient.index({
      index: 'metrics',
      body: {
        type: 'inventory_alert',
        productId,
        value: quantity || 0,
        timestamp: now.toISOString(),
        period: 'event'
      }
    });
  }
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'analytics-service' });
});

// Get metrics
app.get('/metrics', async (req, res) => {
  try {
    const gmv = await redisClient.get('gmv') || '0';
    const totalOrders = await redisClient.get('total_orders') || '0';
    const now = new Date();
    const minute = Math.floor(now.getTime() / 60000) * 60000;
    const ordersPerMinute = await redisClient.get(`orders:${minute}`) || '0';

    // Fetch inventory alerts from Redis
    const alertsRaw = await redisClient.lRange('inventory:alerts', 0, 9);
    const inventoryAlerts = alertsRaw.map(a => {
      try { return JSON.parse(a); } catch { return null; }
    }).filter(Boolean);

    res.json({
      gmv: parseFloat(gmv),
      totalOrders: parseInt(totalOrders),
      ordersPerMinute: parseInt(ordersPerMinute),
      inventoryAlerts,
      timestamp: now.toISOString()
    });
  } catch (err) {
    console.error('Get metrics error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get historical metrics from Elasticsearch
app.get('/metrics/history', async (req, res) => {
  try {
    const hours = parseInt(req.query.hours) || 1;
    const from = new Date(Date.now() - hours * 3600 * 1000).toISOString();

    const result = await esClient.search({
      index: 'metrics',
      body: {
        query: {
          bool: {
            must: [
              { term: { type: 'orders_per_minute' } },
              { range: { timestamp: { gte: from } } }
            ]
          }
        },
        sort: [{ timestamp: 'asc' }],
        size: 100
      }
    });

    const history = result.hits.hits.map(hit => hit._source);
    res.json({ history });
  } catch (err) {
    console.error('Get metrics history error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start consumer
async function startConsumer() {
  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        const event = JSON.parse(message.value.toString());
        await processEvent(event);
      } catch (error) {
        console.error('Error processing message', { error: error.message });
      }
    },
  });
}

// Start server
const PORT = process.env.PORT || 3007;
app.listen(PORT, async () => {
  console.log(`Analytics Service running on port ${PORT}`);
  await initialize();
  await startConsumer();
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await consumer.disconnect();
  await redisClient.disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await consumer.disconnect();
  await redisClient.disconnect();
  process.exit(0);
});
