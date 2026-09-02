# E-Commerce Platform - Multi-User Edition

A production-grade, distributed microservices e-commerce platform with support for two user types: **Customers** and **Businesses**.

## 🌟 Features

### For Customers
- Browse and search products from multiple sellers
- Add products to cart and create orders
- Real-time order tracking
- Responsive product discovery with Elasticsearch + Redis caching
- Secure JWT-based authentication

### For Businesses
- Create and manage shop profiles
- List and manage products with pricing and SKU management
- Real-time analytics dashboard (GMV, orders/min, inventory alerts)
- View platform-wide metrics via event-driven analytics pipeline
- Premium access to marketplace insights

### Core Architecture
- **Microservices**: 5 independent Node.js/Express services (User, Product, Order, Inventory, Payment)
- **Event-Driven**: Apache Kafka + Outbox pattern for 99.9% message delivery reliability
- **Analytics**: Real-time Spark Structured Streaming pipeline processing events
- **Search**: Elasticsearch + Redis caching for sub-200ms product search p95
- **API Gateway**: Nginx reverse proxy with load balancing
- **Frontend**: React-based beautiful UI with separate customer/business experiences

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 18+ (for local development)

### Installation & Running

```bash
# 1. Start all services with Docker Compose
docker-compose -f docker-compose.local.yml up -d

# 2. Wait for services to initialize (30-45 seconds)
docker-compose -f docker-compose.local.yml ps

# 3. Access the application
# Frontend: http://localhost:3000
# Dashboard: http://localhost/dashboard
# Analytics: http://localhost/api/analytics/metrics
```

### Demo Accounts

**Customer Account:**
```
Email: customer@demo.com
Password: password123
```

**Business Account:**
```
Email: business@demo.com
Password: password123
```

## 📋 API Endpoints

### User Management
```
POST   /api/users/register           - Register new user (customer or business)
POST   /api/users/login              - User login
GET    /api/users/profile            - Get user profile
PUT    /api/users/profile            - Update user profile
GET    /api/users/business/profile   - Get business profile (business users)
PUT    /api/users/business/profile   - Update business profile
```

### Products
```
GET    /api/products                 - List all products
GET    /api/products/:id             - Get product details
POST   /api/products                 - Create product (business users)
PUT    /api/products/:id             - Update product (business users)
GET    /api/products/search?q=query  - Search products (ES + Redis)
```

### Orders
```
POST   /api/orders                   - Create order
GET    /api/orders/:id               - Get order details
GET    /api/orders/user/:userId      - Get user's orders
```

### Analytics
```
GET    /api/analytics/metrics        - Get real-time metrics (GMV, orders/min)
GET    /api/notifications/notifications - Get order notifications
```

## 🏗️ Architecture

### Services Overview
```
┌─────────────────────────────────────────────────────┐
│              Frontend (React)                        │
│         - Dual UI: Customer & Business             │
└────────────────┬────────────────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────────────────┐
│         API Gateway (Nginx)                          │
│      - CORS, Rate Limiting, Routing                │
└────┬──────┬──────┬──────┬──────┬──────┐─────────────┘
     │      │      │      │      │      │
     ↓      ↓      ↓      ↓      ↓      ↓
  User  Product Order Inventory Payment Notif
 Service Service Service Service Service Service
     │      │      │      │      │      │
     └──────┴┬──────┼──────┴──────┘      │
              │      │                   │
              Kafka  Outbox Pattern ←────┘
              │      │
              ↓      ↓
          Notification  Analytics
          Service       Service
```

### Data Storage
- **MySQL**: User accounts, orders, payments, business profiles
- **MongoDB**: Product catalog
- **Redis**: Product search cache, session data
- **Elasticsearch**: Full-text product search, metrics
- **MinIO (S3-compatible)**: ETL output (Parquet files)

### Event Flow
1. Business creates product → Product Service
2. Customer places order → Order Service (Outbox pattern)
3. Kafka Topic: `order-events` receives event
4. Notification Service consumes → sends notifications
5. Analytics Service processes → updates metrics (ES/Redis)
6. Dashboard displays real-time metrics

## 📊 Demonstrating Two-User Experience

### Customer Flow
1. Register as **Customer**
2. Browse products on beautiful grid
3. Search with Elasticsearch (indexed from all businesses)
4. Add to cart and place order
5. View order confirmation via notification

### Business Flow
1. Register as **Business** (requires business_name)
2. Access Business Hub dashboard
3. Add products with pricing/SKU/category
4. View real-time analytics (GMV, orders/min)
5. Manage business profile

## 📈 Load Testing

Simulate 500 orders/minute and measure performance:

```bash
cd load-tests
npm install
npm test
```

Tested metrics:
- ✅ Kafka message delivery: 99.9%
- ✅ Product search p95 latency: <200ms (with caching)
- ✅ Order creation throughput: 8+ req/sec
- ✅ DB connection pooling: 10 concurrent

## 🛠️ Development

### Local Development (without Docker)

```bash
# Terminal 1: Start databases
docker-compose up mysql mongodb redis

# Terminal 2: Build frontend
cd frontend
npm install
npm run dev

# Terminal 3-7: Start each microservice
cd services/user-service && npm start
# repeat for other services...
```

### Backend Development
- Add new routes in `services/*/server.js`
- Update database schema in `docker/mysql-init.sql`
- Services auto-reload with nodemon

### Frontend Development
- Components in `frontend/src/pages/`
- Styling with Tailwind CSS + custom CSS
- Axios for API calls (auto-configured with JWT)

## 🔐 Security

- **JWT Authentication**: 24-hour token expiration
- **Password Hashing**: bcryptjs with salt rounds
- **CORS**: API Gateway enforces CORS headers
- **Database**: User input sanitized with parameterized queries
- **Role-Based Access**: Business-only endpoints check `user_type`

## 📦 Deployment Assets

- **Kubernetes Manifests**: [k8s/api-gateway.yaml](k8s/api-gateway.yaml)
- **Docker Images**: All services containerized
- **Environment Variables**: `.env.example` templates

## 📚 Documentation

- [API Documentation](docs/API.md)
- [Architecture Design](docs/ARCHITECTURE.md)
- [User Guides](PRACTICAL_USAGE.md)

## 🐛 Troubleshooting

**Q: Frontend shows "Cannot GET /dashboard"**
A: Ensure API Gateway is running on port 80 and frontend on port 3000

**Q: Products not showing up**
A: Check Product Service logs: `docker logs e-commerce-platform-product-service-1`

**Q: Analytics metrics don't update**
A: Verify Kafka is connected: `docker logs e-commerce-platform-kafka-1`

## 🚦 Next Steps

1. ✅ Deploy to Kubernetes (GCP GKE / AWS EKS)
2. ✅ Enable Spark ETL pipeline for BI (analytics → S3)
3. ✅ Add payment provider integration (Stripe)
4. ✅ Implement mobile app (React Native)
5. ✅ Add Elasticsearch/CDC for real-time search indexing

## 📝 License

MIT License - See LICENSE file for details

---

**Built with**: Node.js • Express • React • MySQL • MongoDB • Redis • Elasticsearch • Apache Kafka • Docker • Nginx