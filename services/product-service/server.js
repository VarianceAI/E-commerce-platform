const express = require('express');
const { MongoClient } = require('mongodb');
const redis = require('redis');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

let mongoClient;
let productsCollection;
let redisClient;

// Initialize MongoDB and Redis
async function initialize() {
  try {
    // MongoDB connection
    mongoClient = new MongoClient(process.env.MONGO_URL || 'mongodb://localhost:27017/ecommerce_catalog');
    await mongoClient.connect();
    const db = mongoClient.db('ecommerce_catalog');
    productsCollection = db.collection('products');
    console.log('✓ MongoDB connected');

    // Redis connection
    redisClient = redis.createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    });
    redisClient.on('error', (err) => console.error('Redis error:', err));
    await redisClient.connect();
    console.log('✓ Redis connected');
  } catch (err) {
    console.error('Connection error:', err.message);
    setTimeout(initialize, 5000);
  }
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'product-service' });
});

// Create product
app.post('/', async (req, res) => {
  try {
    const { name, description, price, sku, category } = req.body;

    if (!name || !price || !sku) {
      return res.status(400).json({ error: 'Name, price, and SKU required' });
    }

    const product = {
      name,
      description,
      price,
      sku,
      category,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const result = await productsCollection.insertOne(product);

    res.status(201).json({ id: result.insertedId, ...product });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'SKU already exists' });
    }
    console.error('Create product error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all products with pagination
app.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const cacheKey = `products:page:${page}:limit:${limit}`;
    const cached = await redisClient.get(cacheKey);

    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const products = await productsCollection
      .find({})
      .skip(skip)
      .limit(limit)
      .toArray();

    const total = await productsCollection.countDocuments();

    const response = {
      products,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };

    await redisClient.setEx(cacheKey, 3600, JSON.stringify(response));

    res.json(response);
  } catch (err) {
    console.error('Get products error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get product by ID
app.get('/:id', async (req, res) => {
  try {
    const { ObjectId } = require('mongodb');
    const cacheKey = `product:${req.params.id}`;
    const cached = await redisClient.get(cacheKey);

    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const product = await productsCollection.findOne({ _id: new ObjectId(req.params.id) });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    await redisClient.setEx(cacheKey, 3600, JSON.stringify(product));

    res.json(product);
  } catch (err) {
    console.error('Get product error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Search products by category
app.get('/search/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const cacheKey = `products:category:${category}:page:${page}`;
    const cached = await redisClient.get(cacheKey);

    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const products = await productsCollection
      .find({ category })
      .skip(skip)
      .limit(limit)
      .toArray();

    const total = await productsCollection.countDocuments({ category });

    const response = {
      products,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };

    await redisClient.setEx(cacheKey, 3600, JSON.stringify(response));

    res.json(response);
  } catch (err) {
    console.error('Search products error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update product
app.put('/:id', async (req, res) => {
  try {
    const { ObjectId } = require('mongodb');
    const { name, description, price, category } = req.body;

    const result = await productsCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      {
        $set: {
          name,
          description,
          price,
          category,
          updated_at: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    await redisClient.del(`product:${req.params.id}`);

    res.json({ message: 'Product updated successfully' });
  } catch (err) {
    console.error('Update product error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete product
app.delete('/:id', async (req, res) => {
  try {
    const { ObjectId } = require('mongodb');

    const result = await productsCollection.deleteOne({ _id: new ObjectId(req.params.id) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    await redisClient.del(`product:${req.params.id}`);

    res.json({ message: 'Product deleted successfully' });
  } catch (err) {
    console.error('Delete product error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3002;

app.listen(PORT, async () => {
  await initialize();
  console.log(`Product Service running on port ${PORT}`);
});
