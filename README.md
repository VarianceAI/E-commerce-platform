# Distributed E-commerce Platform

A cloud-native microservices-based e-commerce platform built with Node.js, demonstrating scalability, reliability, and production-ready patterns.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                   API Gateway (Nginx)                   │
│                    Port: 80 / 8000                       │
└──────────┬──────────┬──────────┬──────────┬──────────────┘
           │          │          │          │
    ┌──────▼──┐ ┌────▼───┐ ┌───▼────┐ ┌──▼──────┐ ┌───▼────┐
    │  User   │ │Product │ │ Order  │ │Inventory│ │Payment │
    │Service  │ │Service │ │Service │ │Service  │ │Service │
    │:3001    │ │:3002   │ │:3003   │ │:3004    │ │:3005   │
    └────┬────┘ └───┬────┘ └────┬───┘ └────┬────┘ └───┬────┘
         │          │           │         │          │
    ┌────▼──────┬──▼────┬──────▼─────┬──▼─────┬────▼────┐
    │   MySQL   │MongoDB│  Redis     │ MySQL  │  MySQL  │
    │  (Users)  │(Catalog)│(Cache)   │(Orders)│(Payments)
    └───────────┴───────┴────────────┴────────┴─────────┘
```

## Services

### 1. User Service (Port 3001)
- **Database**: MySQL
- **Endpoints**:
  - `POST /register` - Register new user
  - `POST /login` - User login
  - `GET /profile` - Get user profile (requires JWT)
  - `PUT /profile` - Update profile (requires JWT)
  - `GET /:id` - Get user by ID

### 2. Product Service (Port 3002)
- **Database**: MongoDB (for flexible catalog schema)
- **Cache**: Redis (for high-performance reads)
- **Endpoints**:
  - `POST /` - Create product
  - `GET /` - List all products (paginated, cached)
  - `GET /:id` - Get product by ID (cached)
  - `GET /search/:category` - Search by category (cached)
  - `PUT /:id` - Update product
  - `DELETE /:id` - Delete product

### 3. Order Service (Port 3003)
- **Database**: MySQL
- **Features**: Outbox pattern for eventual consistency
- **Endpoints**:
  - `POST /` - Create order
  - `GET /:order_id` - Get order details
  - `GET /user/:user_id` - Get user's orders
  - `PATCH /:order_id/status` - Update order status

### 4. Inventory Service (Port 3004)
- **Database**: MySQL
- **Features**: Reservation-based inventory management
- **Endpoints**:
  - `GET /:product_id` - Get inventory status
  - `POST /:product_id/reserve` - Reserve inventory
  - `POST /:product_id/release` - Release reserved inventory
  - `POST /:product_id/confirm` - Confirm purchase
  - `GET /alerts/low-stock` - Get low stock items

### 5. Payment Service (Port 3005)
- **Database**: MySQL
- **Features**: Mock Stripe integration (ready for real Stripe)
- **Endpoints**:
  - `POST /process` - Process payment
  - `GET /:payment_id` - Get payment details
  - `GET /order/:order_id` - Get payments for order
  - `POST /:payment_id/refund` - Refund payment

## Getting Started

### Prerequisites
- Docker & Docker Compose
- Node.js 18+ (for local development without Docker)
- macOS/Linux (or WSL on Windows)

### Quick Start (Docker)

```bash
# Clone and navigate to project
cd E-commerce-platform

# Start all services with Docker Compose
npm run start:local:build

# Wait for all services to be ready (~30 seconds)
# Check gateway health
curl http://localhost/api/services
```

### Service URLs (when running via Docker Compose)
- API Gateway: `http://localhost`
- User Service: `http://localhost:3001`
- Product Service: `http://localhost:3002`
- Order Service: `http://localhost:3003`
- Inventory Service: `http://localhost:3004`
- Payment Service: `http://localhost:3005`

### Local Development (without Docker)

```bash
# Install dependencies for all services
npm run install:all

# In separate terminals, start each service:

# Terminal 1: User Service
cd services/user-service
npm run dev

# Terminal 2: Product Service
cd services/product-service
npm run dev

# Terminal 3: Order Service
cd services/order-service
npm run dev

# Terminal 4: Inventory Service
cd services/inventory-service
npm run dev

# Terminal 5: Payment Service
cd services/payment-service
npm run dev

# Terminal 6: API Gateway
cd api-gateway
npm run dev
```

## API Examples

### 1. Register & Login

```bash
# Register
curl -X POST http://localhost/api/users/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123",
    "first_name": "John",
    "last_name": "Doe"
  }'

# Login
curl -X POST http://localhost/api/users/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123"
  }'

# Response includes JWT token
```

### 2. Create & Browse Products

```bash
# Create product
curl -X POST http://localhost/api/products \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Laptop",
    "description": "High-performance laptop",
    "price": 999.99,
    "sku": "LAPTOP-001",
    "category": "Electronics"
  }'

# Get all products
curl http://localhost/api/products?page=1&limit=20

# Search by category
curl http://localhost/api/products/search/Electronics
```

### 3. Place an Order

```bash
# Create order
curl -X POST http://localhost/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": 1,
    "items": [
      {"product_id": 1, "quantity": 2, "unit_price": 999.99}
    ],
    "total_amount": 1999.98
  }'

# Get order
curl http://localhost/api/orders/1

# Get user's orders
curl http://localhost/api/orders/user/1
```

### 4. Manage Inventory

```bash
# Check inventory
curl http://localhost/api/inventory/1

# Reserve inventory
curl -X POST http://localhost/api/inventory/1/reserve \
  -H "Content-Type: application/json" \
  -d '{"quantity": 5}'

# Confirm purchase
curl -X POST http://localhost/api/inventory/1/confirm \
  -H "Content-Type: application/json" \
  -d '{"quantity": 5}'

# Get low stock alerts
curl http://localhost/api/inventory/alerts/low-stock
```

### 5. Process Payment

```bash
# Process payment
curl -X POST http://localhost/api/payments/process \
  -H "Content-Type: application/json" \
  -d '{
    "order_id": 1,
    "user_id": 1,
    "amount": 1999.98,
    "payment_method": "card",
    "token": "tok_mock"
  }'

# Get payment details
curl http://localhost/api/payments/1

# Refund payment
curl -X POST http://localhost/api/payments/1/refund
```

## Database Schema

### MySQL Tables
- `users` - User account information
- `products` - Product catalog (also in MongoDB)
- `orders` - Order records
- `order_items` - Line items for orders
- `inventory` - Stock levels and reservations
- `payments` - Payment transactions
- `events_outbox` - Data for eventual consistency (Kafka integration)

### MongoDB Collections
- `products` - Flexible product catalog documents

## Key Design Patterns

### 1. **Microservices Architecture**
- Each service is independently deployable
- Owns its own database
- Communicates via REST APIs
- Can be scaled independently

### 2. **Outbox Pattern (for Kafka)**
- Events are written to MySQL `events_outbox` table
- Later, a Kafka producer will poll this table
- Ensures reliable event delivery without message loss
- Foundation for eventual consistency

### 3. **Caching Strategy**
- Product Service uses Redis for frequently accessed data
- 1-hour TTL for cache entries
- Automatic cache invalidation on updates

### 4. **JWT Authentication**
- User Service issues tokens on login
- Tokens contain user ID and email
- Valid for 24 hours
- Other services can verify tokens

### 5. **Reservation-Based Inventory**
- Separates `quantity_on_hand` from `reserved_quantity`
- Supports cart-like behavior without immediate deduction
- Prevents double-booking

## Development Roadmap

### Phase 1: ✅ Complete (Current)
- [x] Core microservices (User, Product, Order, Inventory, Payment)
- [x] API Gateway with routing
- [x] MySQL + MongoDB databases
- [x] JWT authentication
- [x] Redis caching
- [x] Docker Compose setup
- [x] Outbox pattern foundation

### Phase 2: (Next - 1-2 weeks)
- [ ] Apache Kafka integration
- [ ] Event streaming from Outbox table
- [ ] Inter-service event-driven communication
- [ ] Saga pattern for distributed transactions
- [ ] Elasticsearch for product search
- [ ] Structured logging (Winston/Bunyan)

### Phase 3: (After Phase 2 - 2-3 weeks)
- [ ] Apache Spark Structured Streaming
- [ ] Real-time analytics pipeline
- [ ] GMV, order-per-minute metrics
- [ ] Inventory alerts based on events
- [ ] Grafana dashboards
- [ ] Prometheus metrics

### Phase 4: (After Phase 3 - 2-3 weeks)
- [ ] Change Data Capture (CDC) with Debezium
- [ ] Spark batch ETL jobs
- [ ] Parquet file export to cloud storage (AWS S3)
- [ ] BI reporting layer
- [ ] Data warehouse setup

### Phase 5: (Final - 1-2 weeks)
- [ ] Kubernetes deployment
- [ ] Helm charts for each service
- [ ] Auto-scaling policies
- [ ] Service mesh (Istio) optional
- [ ] Production configuration
- [ ] CI/CD pipeline (GitHub Actions)

## Deployment

### Docker Compose (Local/Development)
```bash
npm run start:local:build
```

### Kubernetes (Future)
```bash
# After Phase 5
kubectl apply -f k8s/
```

## Monitoring & Debugging

### View logs
```bash
npm run logs
```

### Stop services
```bash
npm run stop:local
```

### Database connections
- **MySQL**: `localhost:3306` (user: root, password: root_password)
- **MongoDB**: `localhost:27017` (user: admin, password: password)
- **Redis**: `localhost:6379`

## Environment Variables

### User Service (.env)
```env
DB_HOST=mysql
DB_USER=root
DB_PASSWORD=root_password
DB_NAME=ecommerce_db
JWT_SECRET=your_jwt_secret_key_change_in_production
```

### Product Service (.env)
```env
MONGO_URL=mongodb://admin:password@localhost:27017/ecommerce_catalog
REDIS_URL=redis://localhost:6379
```

### Payment Service (.env)
```env
STRIPE_API_KEY=sk_test_placeholder
```

## Next Steps

1. Start the system: `npm run start:local:build`
2. Wait for all services to be healthy
3. Test API endpoints using the examples above
4. Explore individual service code in `services/*/`
5. Plan Phase 2 implementation (Kafka + Events)
6. Add monitoring and structured logging

## Troubleshooting

### Services not starting
```bash
# Check Docker status
docker ps -a

# Rebuild without cache
npm run start:local:build

# View logs
npm run logs
```

### Database connection errors
```bash
# Wait a bit longer for MySQL/MongoDB to initialize (30-60 seconds)
# Check database is running:
docker ps | grep mysql
docker ps | grep mongo
```

### Port already in use
```bash
# Kill existing container
docker-compose -f docker-compose.local.yml down -v

# Restart
npm run start:local:build
```

## Additional Resources

- [Microservices Architecture](docs/ARCHITECTURE.md)
- [API Documentation](docs/API.md)
- [Contributing Guide](docs/CONTRIBUTING.md)

## License

ISC

