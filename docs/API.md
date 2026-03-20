# API Documentation

Complete API reference for all microservices in the E-commerce platform.

## Base URLs

| Service | URL |
|---------|-----|
| API Gateway | `http://localhost` |
| User Service | `http://localhost:3001` |
| Product Service | `http://localhost:3002` |
| Order Service | `http://localhost:3003` |
| Inventory Service | `http://localhost:3004` |
| Payment Service | `http://localhost:3005` |

## User Service

### Register User
```
POST /register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword",
  "first_name": "John",
  "last_name": "Doe"
}

Response: 201
{
  "message": "User registered successfully"
}

Error: 409
{ "error": "Email already exists" }

Error: 400
{ "error": "Email and password required" }
```

### Login User
```
POST /login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword"
}

Response: 200
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "name": "John"
  }
}

Error: 401
{ "error": "Invalid credentials" }
```

### Get User Profile
```
GET /profile
Authorization: Bearer {JWT_TOKEN}

Response: 200
{
  "id": 1,
  "email": "user@example.com",
  "first_name": "John",
  "last_name": "Doe",
  "phone_number": "555-1234",
  "address": "123 Main St",
  "created_at": "2024-03-19T10:00:00Z"
}

Error: 401
{ "error": "No token provided" | "Invalid token" }

Error: 404
{ "error": "User not found" }
```

### Update User Profile
```
PUT /profile
Authorization: Bearer {JWT_TOKEN}
Content-Type: application/json

{
  "first_name": "John",
  "last_name": "Doe",
  "phone_number": "555-1234",
  "address": "123 Main St"
}

Response: 200
{
  "message": "Profile updated successfully"
}

Error: 401
{ "error": "No token provided" | "Invalid token" }
```

### Get User by ID
```
GET /:id

Response: 200
{
  "id": 1,
  "email": "user@example.com",
  "first_name": "John",
  "last_name": "Doe"
}

Error: 404
{ "error": "User not found" }
```

---

## Product Service

### Create Product
```
POST /
Content-Type: application/json

{
  "name": "MacBook Pro 16\"",
  "description": "High-performance laptop for professionals",
  "price": 2499.99,
  "sku": "APPLE-MBP16-2024",
  "category": "Electronics"
}

Response: 201
{
  "_id": "60d5ec49c1234567890abcde",
  "name": "MacBook Pro 16\"",
  "description": "High-performance laptop for professionals",
  "price": 2499.99,
  "sku": "APPLE-MBP16-2024",
  "category": "Electronics",
  "created_at": "2024-03-19T10:00:00Z",
  "updated_at": "2024-03-19T10:00:00Z"
}

Error: 409
{ "error": "SKU already exists" }

Error: 400
{ "error": "Name, price, and SKU required" }
```

### List All Products
```
GET /?page=1&limit=20

Query Parameters:
- page: Page number (default: 1)
- limit: Items per page (default: 20)

Response: 200
{
  "products": [
    {
      "_id": "60d5ec49c1234567890abcde",
      "name": "Product 1",
      "price": 99.99,
      ...
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "pages": 8
  }
}
```

### Get Product by ID
```
GET /:id

Response: 200
{
  "_id": "60d5ec49c1234567890abcde",
  "name": "MacBook Pro 16\"",
  "price": 2499.99,
  ...
}

Note: This endpoint caches the result in Redis for 1 hour

Error: 404
{ "error": "Product not found" }
```

### Search Products by Category
```
GET /search/:category?page=1&limit=20

Response: 200
{
  "products": [...],
  "pagination": {...}
}

Note: Results are cached in Redis
```

### Update Product
```
PUT /:id
Content-Type: application/json

{
  "name": "Updated name",
  "description": "Updated description",
  "price": 2299.99,
  "category": "Electronics"
}

Response: 200
{
  "message": "Product updated successfully"
}

Note: Cache is invalidated automatically
```

### Delete Product
```
DELETE /:id

Response: 200
{
  "message": "Product deleted successfully"
}

Error: 404
{ "error": "Product not found" }
```

---

## Order Service

### Create Order
```
POST /
Content-Type: application/json

{
  "user_id": 1,
  "items": [
    {
      "product_id": 1,
      "quantity": 2,
      "unit_price": 99.99
    },
    {
      "product_id": 2,
      "quantity": 1,
      "unit_price": 299.99
    }
  ],
  "total_amount": 499.97
}

Response: 201
{
  "orderId": 42,
  "status": "PENDING",
  "total_amount": 499.97
}

Error: 400
{ "error": "User ID and items required" }
```

### Get Order
```
GET /:order_id

Response: 200
{
  "id": 42,
  "user_id": 1,
  "order_date": "2024-03-19T10:00:00Z",
  "total_amount": 499.97,
  "status": "PENDING",
  "items": [
    {
      "id": 1,
      "order_id": 42,
      "product_id": 1,
      "quantity": 2,
      "unit_price": 99.99
    }
  ]
}

Error: 404
{ "error": "Order not found" }
```

### Get User's Orders
```
GET /user/:user_id

Response: 200
[
  {
    "id": 42,
    "user_id": 1,
    "order_date": "2024-03-19T10:00:00Z",
    "total_amount": 499.97,
    "status": "PENDING"
  },
  {
    "id": 43,
    "user_id": 1,
    "order_date": "2024-03-19T11:00:00Z",
    "total_amount": 199.99,
    "status": "COMPLETED"
  }
]
```

### Update Order Status
```
PATCH /:order_id/status
Content-Type: application/json

{
  "status": "SHIPPED"
}

Response: 200
{
  "message": "Order status updated"
}

Valid statuses: PENDING, CONFIRMED, SHIPPED, DELIVERED, CANCELLED
```

---

## Inventory Service

### Get Inventory Status
```
GET /:product_id

Response: 200
{
  "product_id": 1,
  "quantity_on_hand": 100,
  "reserved_quantity": 25,
  "available_quantity": 75,
  "warehouse_location": "A-10"
}

Error: 404
{ "error": "Inventory not found" }
```

### Reserve Inventory
```
POST /:product_id/reserve
Content-Type: application/json

{
  "quantity": 5
}

Response: 201
{
  "message": "Inventory reserved",
  "product_id": 1,
  "quantity": 5
}

Error: 400
{ "error": "Insufficient inventory" }
```

### Release Reserved Inventory
```
POST /:product_id/release
Content-Type: application/json

{
  "quantity": 5
}

Response: 200
{
  "message": "Inventory released"
}

Use case: User cancels order/cart
```

### Confirm Inventory (Complete Purchase)
```
POST /:product_id/confirm
Content-Type: application/json

{
  "quantity": 5
}

Response: 200
{
  "message": "Inventory confirmed"
}

Deducts from both on_hand and reserved_quantity
Use case: Order payment successful
```

### Get Low Stock Alerts
```
GET /alerts/low-stock?threshold=10

Query Parameters:
- threshold: Stock level threshold (default: 10)

Response: 200
[
  {
    "product_id": 1,
    "quantity_on_hand": 5,
    "warehouse_location": "A-10"
  },
  {
    "product_id": 3,
    "quantity_on_hand": 8,
    "warehouse_location": "B-5"
  }
]
```

---

## Payment Service

### Process Payment
```
POST /process
Content-Type: application/json

{
  "order_id": 42,
  "user_id": 1,
  "amount": 499.97,
  "payment_method": "card",
  "token": "tok_visa"
}

Response: 201
{
  "payment_id": 1,
  "order_id": 42,
  "status": "COMPLETED",
  "transaction_id": "txn_abc123def456",
  "amount": 499.97
}

Error: 400
{ "error": "Order ID, user ID, and amount required" }

Payment Methods: card, bank_transfer, wallet
In mock mode, token parameter is optional
```

### Get Payment Details
```
GET /:payment_id

Response: 200
{
  "id": 1,
  "order_id": 42,
  "user_id": 1,
  "amount": 499.97,
  "payment_method": "card",
  "status": "COMPLETED",
  "transaction_id": "txn_abc123def456",
  "created_at": "2024-03-19T10:00:00Z",
  "updated_at": "2024-03-19T10:00:00Z"
}

Error: 404
{ "error": "Payment not found" }
```

### Get Payments for Order
```
GET /order/:order_id

Response: 200
[
  {
    "id": 1,
    "order_id": 42,
    "amount": 499.97,
    "status": "COMPLETED",
    ...
  }
]
```

### Refund Payment
```
POST /:payment_id/refund

Response: 200
{
  "message": "Payment refunded",
  "payment_id": 1
}

Error: 404
{ "error": "Payment not found" }

Updates payment status to REFUNDED
Emits PaymentRefunded event
```

---

## API Gateway

### Health Check
```
GET /health

Response: 200
{
  "status": "ok",
  "timestamp": "2024-03-19T10:00:00Z"
}
```

### Service Discovery
```
GET /api/services

Response: 200
{
  "services": {
    "users": "http://user-service:3001",
    "products": "http://product-service:3002",
    "orders": "http://order-service:3003",
    "inventory": "http://inventory-service:3004",
    "payments": "http://payment-service:3005"
  },
  "timestamp": "2024-03-19T10:00:00Z"
}
```

---

## HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | OK - Success |
| 201 | Created - Resource created |
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Missing/invalid token |
| 404 | Not Found - Resource not found |
| 409 | Conflict - Duplicate/constraint violation |
| 500 | Server Error - Internal error |
| 503 | Service Unavailable - Service down |

---

## Response Format

All responses follow this format:

**Success Response:**
```json
{
  "field1": "value1",
  "field2": "value2"
}
```

**Error Response:**
```json
{
  "error": "Error message"
}
```

---

## Authentication

Protected endpoints require JWT token in Authorization header:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Token obtained from User Service `/login` endpoint.
Valid for 24 hours.

---

## Rate Limiting (Future)

Phase 2 will add rate limiting:
- 100 requests per minute per IP
- 1000 requests per minute per authenticated user

---

## Examples with cURL

### Register and Login
```bash
# Register
curl -X POST http://localhost/api/users/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123",
    "first_name": "John"
  }'

# Login
curl -X POST http://localhost/api/users/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123"
  }'

# Save token from response
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Complete Order Flow
```bash
# 1. Create product
curl -X POST http://localhost/api/products \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Laptop",
    "price": 999.99,
    "sku": "LAPTOP-001",
    "category": "Electronics"
  }'

# 2. Place order
curl -X POST http://localhost/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": 1,
    "items": [{"product_id": 1, "quantity": 1, "unit_price": 999.99}],
    "total_amount": 999.99
  }'

# 3. Reserve inventory
curl -X POST http://localhost/api/inventory/1/reserve \
  -H "Content-Type: application/json" \
  -d '{"quantity": 1}'

# 4. Process payment
curl -X POST http://localhost/api/payments/process \
  -H "Content-Type: application/json" \
  -d '{
    "order_id": 1,
    "user_id": 1,
    "amount": 999.99,
    "payment_method": "card"
  }'

# 5. Confirm inventory
curl -X POST http://localhost/api/inventory/1/confirm \
  -H "Content-Type: application/json" \
  -d '{"quantity": 1}'
```
