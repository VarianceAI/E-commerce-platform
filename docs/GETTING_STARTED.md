# Getting Started Guide

This guide will help you get the e-commerce platform running in minutes.

## Prerequisites Checklist

- [ ] Docker Desktop installed ([Download](https://www.docker.com/products/docker-desktop))
- [ ] Docker Compose version 1.29+ (`docker-compose --version`)
- [ ] ~5GB free disk space for containers
- [ ] ~30 seconds for first startup

**Optional (for local development without Docker)**
- [ ] Node.js 18+ ([Download](https://nodejs.org/))
- [ ] MySQL 8.0 client
- [ ] MongoDB client
- [ ] Redis CLI

## Option 1: Quick Start with Docker (Recommended)

### Step 1: Clone and Navigate
```bash
cd E-commerce-platform
```

### Step 2: Start All Services
```bash
npm run start:local:build
```

This single command will:
- Build all Docker images
- Start 5 microservices
- Start MySQL, MongoDB, Redis
- Start API Gateway
- Set up networking

**First startup takes 1-2 minutes.** You'll see logs streaming past—this is normal.

### Step 3: Verify Services Are Running
```bash
# Check in another terminal
curl http://localhost/api/services
```

You should see all 5 services listed with their URLs.

### Step 4: Test a Simple Request
```bash
# Register a user
curl -X POST http://localhost/api/users/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "demo@example.com",
    "password": "demo123",
    "first_name": "Demo",
    "last_name": "User"
  }'

# Login
curl -X POST http://localhost/api/users/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "demo@example.com",
    "password": "demo123"
  }'
```

✅ You're ready! See **Next Steps** section below.

---

## Option 2: Local Development (without Docker)

Only use this if you prefer running services individually.

### Prerequisites
- Node.js 18+
- MySQL running locally on port 3306
- MongoDB running locally on port 27017
- Redis running locally on port 6379

### Step 1: Install Dependencies
```bash
npm run install:all
```

### Step 2: Start MySQL
```bash
# If using Homebrew on macOS
brew services start mysql@8.0

# Or Docker
docker run -p 3306:3306 \
  -e MYSQL_ROOT_PASSWORD=root_password \
  -e MYSQL_DATABASE=ecommerce_db \
  -v $(pwd)/docker/mysql-init.sql:/docker-entrypoint-initdb.d/init.sql \
  mysql:8.0
```

### Step 3: Start MongoDB
```bash
# If using Homebrew on macOS
brew services start mongodb-community

# Or Docker
docker run -p 27017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME=admin \
  -e MONGO_INITDB_ROOT_PASSWORD=password \
  mongo:5.0
```

### Step 4: Start Redis
```bash
# If using Homebrew on macOS
brew services start redis

# Or Docker
docker run -p 6379:6379 redis:7-alpine
```

### Step 5: Start Each Service in Separate Terminals

```bash
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

---

## Next Steps

Once services are running, try these actions:

### 1. Create Some Products
```bash
curl -X POST http://localhost/api/products \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Wireless Mouse",
    "description": "Bluetooth enabled mouse",
    "price": 29.99,
    "sku": "MOUSE-BT-001",
    "category": "Accessories"
  }'

curl -X POST http://localhost/api/products \
  -H "Content-Type: application/json" \
  -d '{
    "name": "USB-C Cable",
    "description": "Fast charging cable",
    "price": 9.99,
    "sku": "CABLE-USB-001",
    "category": "Accessories"
  }'
```

### 2. Browse Products
```bash
curl http://localhost/api/products

# Display results nicely (requires jq)
curl http://localhost/api/products | jq .
```

### 3. Place an Order
```bash
curl -X POST http://localhost/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": 1,
    "items": [
      {"product_id": 1, "quantity": 2, "unit_price": 29.99},
      {"product_id": 2, "quantity": 5, "unit_price": 9.99}
    ],
    "total_amount": 109.95
  }'
```

### 4. Check Order
```bash
curl http://localhost/api/orders/1
```

### 5. Process Payment
```bash
curl -X POST http://localhost/api/payments/process \
  -H "Content-Type: application/json" \
  -d '{
    "order_id": 1,
    "user_id": 1,
    "amount": 109.95,
    "payment_method": "card"
  }'
```

### 6. View Service Logs
```bash
# If using Docker (in another terminal)
npm run logs

# Ctrl+C to exit logs
```

---

## Common Commands

### View running containers
```bash
docker ps
```

### Stop all services
```bash
npm run stop:local
```

### Clean up everything (including databases)
```bash
npm run stop:local
docker system prune -a --volumes
```

### Rebuild images
```bash
npm run start:local:build
```

### View database contents

**MySQL:**
```bash
docker exec -it e-commerce-platform_mysql_1 \
  mysql -u root -p"root_password" ecommerce_db

# Inside mysql:
SHOW TABLES;
SELECT * FROM users;
SELECT * FROM products;
```

**MongoDB:**
```bash
docker exec -it e-commerce-platform_mongodb_1 \
  mongo -u admin -p password --authenticationDatabase admin

# Inside mongo:
use ecommerce_catalog
db.products.find()
```

**Redis:**
```bash
docker exec -it e-commerce-platform_redis_1 redis-cli

# Inside redis:
KEYS *
GET product:1
```

---

## Troubleshooting

### "Port 80 already in use"
```bash
# Find what's using port 80
lsof -i :80

# Kill the process
kill -9 <PID>

# Or use a different port in docker-compose.local.yml
# Change "80:8000" to "8080:8000"
```

### "Cannot connect to Docker daemon"
```bash
# Make sure Docker Desktop is running
# On macOS: Open Docker.app from Applications
```

### Services not starting, need to wait
```bash
# Databases take 20-30 seconds to initialize
# Wait for "✓ Database connected" message
```

### "Duplicate entry" error on second registration
```bash
# Use a different email
curl -X POST http://localhost/api/users/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user2@example.com",
    "password": "demo123"
  }'
```

### Want to see all logs
```bash
npm run logs
# Ctrl+C to exit
```

---

## What's Running?

### Services
- **User Service** (Port 3001) - User registration & authentication
- **Product Service** (Port 3002) - Product catalog with caching
- **Order Service** (Port 3003) - Order management
- **Inventory Service** (Port 3004) - Stock management
- **Payment Service** (Port 3005) - Payment processing

### Databases
- **MySQL** (Port 3306) - User, Order, Inventory, Payment data
- **MongoDB** (Port 27017) - Product catalog
- **Redis** (Port 6379) - Product cache

### Gateway
- **API Gateway** (Port 80) - Unified API endpoint

---

## Next Phase: Kafka Integration

Once you're comfortable with the current system, Phase 2 adds:

- **Apache Kafka** - Event streaming between services
- **Consumer groups** - Parallel processing
- **Elasticsearch** - Advanced search
- **Structured logging** - Better debugging

See [ROADMAP.md](docs/ROADMAP.md) for details.

---

## Need Help?

1. Check [API.md](docs/API.md) for endpoint documentation
2. Review [ARCHITECTURE.md](docs/ARCHITECTURE.md) for system design
3. Check logs: `npm run logs`
4. Verify databases are running: `docker ps`
5. Test health: `curl http://localhost/api/services`

---

## Success! 🎉

You're now running a production-ready microservices architecture with:
- ✅ 5 independent microservices
- ✅ Multiple database technologies
- ✅ Caching layer
- ✅ API Gateway
- ✅ JWT authentication
- ✅ Outbox pattern for reliability

**Next:** Explore the code in `services/*/server.js` to understand the implementation.
