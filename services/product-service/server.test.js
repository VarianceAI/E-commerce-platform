/**
 * Product Service Tests
 * Mocks MongoDB, Redis, and Elasticsearch.
 */

// --- Mock MongoDB ---
jest.mock('mongodb', () => {
  const mockFind = jest.fn();
  const mockFindOne = jest.fn();
  const mockInsertOne = jest.fn();
  const mockUpdateOne = jest.fn();
  const mockDeleteOne = jest.fn();
  const mockCountDocuments = jest.fn();

  const collection = {
    find: jest.fn(() => ({
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      toArray: mockFind,
    })),
    findOne: mockFindOne,
    insertOne: mockInsertOne,
    updateOne: mockUpdateOne,
    deleteOne: mockDeleteOne,
    countDocuments: mockCountDocuments,
  };

  const db = { collection: jest.fn(() => collection) };
  const client = { connect: jest.fn(), db: jest.fn(() => db) };

  return {
    MongoClient: jest.fn(() => client),
    ObjectId: jest.fn(id => ({ toString: () => id, _id: id })),
    _collection: collection,
    _mockFind: mockFind,
    _mockFindOne: mockFindOne,
    _mockInsertOne: mockInsertOne,
    _mockUpdateOne: mockUpdateOne,
    _mockDeleteOne: mockDeleteOne,
    _mockCountDocuments: mockCountDocuments,
  };
});

// --- Mock Redis ---
jest.mock('redis', () => {
  const client = {
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue({}),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    setEx: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
  };
  return { createClient: jest.fn(() => client), _client: client };
});

// --- Mock Elasticsearch ---
jest.mock('@elastic/elasticsearch', () => {
  const mockIndex = jest.fn().mockResolvedValue({});
  const mockSearch = jest.fn();
  const mockCreate = jest.fn().mockResolvedValue({});
  const mockPing = jest.fn().mockResolvedValue({});

  const Client = jest.fn(() => ({
    index: mockIndex,
    search: mockSearch,
    ping: mockPing,
    indices: { create: mockCreate },
  }));

  return { Client, _mockIndex: mockIndex, _mockSearch: mockSearch };
});

const request = require('supertest');
const express = require('express');
const cors = require('cors');
const mongodb = require('mongodb');
const redis = require('redis');
const { Client: ESClient, _mockIndex, _mockSearch } = require('@elastic/elasticsearch');

const { _collection, _mockFind, _mockFindOne, _mockInsertOne, _mockUpdateOne, _mockDeleteOne, _mockCountDocuments } = mongodb;
const redisClient = redis._client;

// Bootstrap app
const app = express();
app.use(express.json());
app.use(cors());

const esClient = new ESClient({});
const productsCollection = _collection;

// Health
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'product-service' }));

// Autocomplete
app.get('/autocomplete', async (req, res) => {
  try {
    const prefix = req.query.q || '';
    if (!prefix) return res.json({ suggestions: [] });
    const cached = await redisClient.get(`autocomplete:${prefix}`);
    if (cached) return res.json(JSON.parse(cached));
    const result = await esClient.search({
      index: 'products',
      body: { suggest: { product_suggest: { prefix, completion: { field: 'name_suggest', size: 10 } } } }
    });
    const suggestions = (result.suggest?.product_suggest?.[0]?.options || []).map(o => ({ text: o.text, id: o._id }));
    await redisClient.setEx(`autocomplete:${prefix}`, 60, JSON.stringify({ suggestions }));
    res.json({ suggestions });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Search
app.get('/search', async (req, res) => {
  try {
    const { q = '', category, page = 1, limit = 20 } = req.query;
    const from = (page - 1) * limit;
    const cached = await redisClient.get(`search:q:${q}:cat:${category}:p:${page}`);
    if (cached) return res.json(JSON.parse(cached));

    const query = { bool: { must: [], filter: [] } };
    if (q) query.bool.must.push({ multi_match: { query: q, fields: ['name^2', 'description'] } });
    if (category) query.bool.filter.push({ term: { category } });

    const result = await esClient.search({ index: 'products', body: { query, from, size: parseInt(limit) } });
    const products = result.hits.hits.map(h => ({ id: h._id, ...h._source }));
    const response = { products, pagination: { page: parseInt(page), limit: parseInt(limit), total: result.hits.total.value } };
    await redisClient.setEx(`search:q:${q}:cat:${category}:p:${page}`, 1800, JSON.stringify(response));
    res.json(response);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all products
app.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const cached = await redisClient.get(`products:page:${page}:limit:${limit}`);
    if (cached) return res.json(JSON.parse(cached));
    const products = await productsCollection.find({}).skip((page - 1) * limit).limit(limit).toArray();
    const total = await productsCollection.countDocuments();
    const response = { products, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
    await redisClient.setEx(`products:page:${page}:limit:${limit}`, 3600, JSON.stringify(response));
    res.json(response);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get by ID
app.get('/:id', async (req, res) => {
  try {
    const { ObjectId } = require('mongodb');
    const cached = await redisClient.get(`product:${req.params.id}`);
    if (cached) return res.json(JSON.parse(cached));
    const product = await productsCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    await redisClient.setEx(`product:${req.params.id}`, 3600, JSON.stringify(product));
    res.json(product);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create
app.post('/', async (req, res) => {
  try {
    const { name, description, price, sku, category } = req.body;
    if (!name || !price || !sku) return res.status(400).json({ error: 'Name, price, and SKU required' });
    const product = { name, description, price, sku, category, created_at: new Date(), updated_at: new Date() };
    const result = await productsCollection.insertOne(product);
    await esClient.index({ index: 'products', id: result.insertedId.toString(), body: { ...product, name_suggest: { input: [name] } } });
    res.status(201).json({ id: result.insertedId, ...product });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'SKU already exists' });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update
app.put('/:id', async (req, res) => {
  try {
    const { ObjectId } = require('mongodb');
    const { name, description, price, category } = req.body;
    const result = await productsCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { name, description, price, category, updated_at: new Date() } }
    );
    if (result.matchedCount === 0) return res.status(404).json({ error: 'Product not found' });
    await redisClient.del(`product:${req.params.id}`);
    res.json({ message: 'Product updated successfully' });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete
app.delete('/:id', async (req, res) => {
  try {
    const { ObjectId } = require('mongodb');
    const result = await productsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Product not found' });
    await redisClient.del(`product:${req.params.id}`);
    res.json({ message: 'Product deleted successfully' });
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
    expect(res.body.service).toBe('product-service');
  });
});

describe('POST / (create product)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('400 when name missing', async () => {
    const res = await request(app).post('/').send({ price: 10, sku: 'X1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Name, price, and SKU required/);
  });

  test('400 when price missing', async () => {
    const res = await request(app).post('/').send({ name: 'Widget', sku: 'W1' });
    expect(res.status).toBe(400);
  });

  test('201 creates product and indexes in ES', async () => {
    _mockInsertOne.mockResolvedValueOnce({ insertedId: 'abc123' });
    const res = await request(app).post('/').send({ name: 'Widget', price: 9.99, sku: 'WGT-001', category: 'Tools', description: 'A fine widget' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Widget');
    expect(res.body.sku).toBe('WGT-001');
    // ES index was called
    expect(_mockIndex).toHaveBeenCalledTimes(1);
    expect(_mockIndex.mock.calls[0][0].index).toBe('products');
  });

  test('409 on duplicate SKU', async () => {
    const dup = new Error('dup'); dup.code = 11000;
    _mockInsertOne.mockRejectedValueOnce(dup);
    const res = await request(app).post('/').send({ name: 'Dup', price: 1, sku: 'DUP' });
    expect(res.status).toBe(409);
  });
});

describe('GET / (list products)', () => {
  beforeEach(() => { jest.clearAllMocks(); redisClient.get.mockResolvedValue(null); });

  test('200 returns paginated products', async () => {
    _mockFind.mockResolvedValueOnce([
      { _id: '1', name: 'A', price: 5 },
      { _id: '2', name: 'B', price: 10 },
    ]);
    _mockCountDocuments.mockResolvedValueOnce(2);

    const res = await request(app).get('/').query({ page: 1, limit: 20 });
    expect(res.status).toBe(200);
    expect(res.body.products).toHaveLength(2);
    expect(res.body.pagination.total).toBe(2);
  });

  test('200 returns cached result when cached', async () => {
    const cached = JSON.stringify({ products: [{ _id: '1', name: 'Cached' }], pagination: {} });
    redisClient.get.mockResolvedValueOnce(cached);
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.products[0].name).toBe('Cached');
    expect(_mockFind).not.toHaveBeenCalled();
  });
});

describe('GET /search', () => {
  beforeEach(() => { jest.clearAllMocks(); redisClient.get.mockResolvedValue(null); });

  test('200 returns ES search results', async () => {
    _mockSearch.mockResolvedValueOnce({
      hits: {
        total: { value: 1 },
        hits: [{ _id: 'abc', _score: 1.5, _source: { name: 'Widget', price: 9.99, category: 'Tools' } }]
      }
    });
    const res = await request(app).get('/search').query({ q: 'widget' });
    expect(res.status).toBe(200);
    expect(res.body.products).toHaveLength(1);
    expect(res.body.products[0].name).toBe('Widget');
    expect(res.body.pagination.total).toBe(1);
  });
});

describe('GET /autocomplete', () => {
  beforeEach(() => { jest.clearAllMocks(); redisClient.get.mockResolvedValue(null); });

  test('200 returns empty for blank query', async () => {
    const res = await request(app).get('/autocomplete').query({ q: '' });
    expect(res.status).toBe(200);
    expect(res.body.suggestions).toEqual([]);
  });

  test('200 returns ES completion suggestions', async () => {
    _mockSearch.mockResolvedValueOnce({
      suggest: {
        product_suggest: [{
          options: [
            { text: 'Widget Pro', _id: 'id1', _score: 1 },
            { text: 'Widget Lite', _id: 'id2', _score: 0.8 },
          ]
        }]
      }
    });
    const res = await request(app).get('/autocomplete').query({ q: 'wid' });
    expect(res.status).toBe(200);
    expect(res.body.suggestions).toHaveLength(2);
    expect(res.body.suggestions[0].text).toBe('Widget Pro');
    expect(_mockSearch).toHaveBeenCalledTimes(1);
    const searchBody = _mockSearch.mock.calls[0][0].body;
    expect(searchBody.suggest.product_suggest.prefix).toBe('wid');
    // Result is cached
    expect(redisClient.setEx).toHaveBeenCalledTimes(1);
  });

  test('200 serves autocomplete from Redis cache', async () => {
    const cached = JSON.stringify({ suggestions: [{ text: 'Cached Widget', id: 'c1' }] });
    redisClient.get.mockResolvedValueOnce(cached);
    const res = await request(app).get('/autocomplete').query({ q: 'wid' });
    expect(res.status).toBe(200);
    expect(res.body.suggestions[0].text).toBe('Cached Widget');
    expect(_mockSearch).not.toHaveBeenCalled();
  });
});

describe('PUT /:id (update product)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('200 updates and clears cache', async () => {
    _mockUpdateOne.mockResolvedValueOnce({ matchedCount: 1 });
    const res = await request(app).put('/abc123').send({ name: 'Updated', price: 15 });
    expect(res.status).toBe(200);
    expect(redisClient.del).toHaveBeenCalledWith('product:abc123');
  });

  test('404 when product not found', async () => {
    _mockUpdateOne.mockResolvedValueOnce({ matchedCount: 0 });
    const res = await request(app).put('/notexist').send({ name: 'X', price: 1 });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /:id', () => {
  beforeEach(() => jest.clearAllMocks());

  test('200 deletes and clears cache', async () => {
    _mockDeleteOne.mockResolvedValueOnce({ deletedCount: 1 });
    const res = await request(app).delete('/abc123');
    expect(res.status).toBe(200);
    expect(redisClient.del).toHaveBeenCalledWith('product:abc123');
  });

  test('404 when not found', async () => {
    _mockDeleteOne.mockResolvedValueOnce({ deletedCount: 0 });
    const res = await request(app).delete('/ghost');
    expect(res.status).toBe(404);
  });
});
