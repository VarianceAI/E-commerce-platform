# Architecture Documentation

## System Design

This distributed e-commerce platform uses a **microservices architecture** with the following principles:

### Core Principles

1. **Service Independence**
   - Each microservice owns its database
   - Services communicate via REST APIs or events
   - No shared data stores
   - Independent deployment cycles

2. **Scalability**
   - Services can be scaled independently based on load
   - Stateless design for horizontal scaling
   - Database caching layer (Redis) for hot data
   - Load balancing at API Gateway

3. **Reliability**
   - Outbox pattern for reliable message delivery
   - Circuit breaker pattern ready (Phase 2)
   - Comprehensive error handling
   - Database transactions for consistency

4. **Observability** (Phase 2-3)
   - Structured logging
   - Distributed tracing
   - Metrics collection
   - Real-time dashboards

## Service Interactions

### User Service
```
Request: POST /register
├── Validate email uniqueness
├── Hash password with bcrypt
└── Store in MySQL

Request: POST /login
├── Lookup user by email
├── Verify password
├── Issue JWT token
└── Return token (valid 24h)
```

### Product Service
```
Request: POST /
├── Create document in MongoDB
└── Return product with ID

Request: GET /
├── Check cache (Redis)
├── If miss: Query MongoDB
├── Paginate results
├── Cache for 1 hour
└── Return products

Request: PUT /:id
├── Update MongoDB document
├── Invalidate cache
└── Return confirmation

Pattern: Cache-Aside with TTL
```

### Order Service
```
Request: POST /
├── Create order in MySQL
├── Insert line items
├── Write to events_outbox
└── Return order ID

Request: GET /:order_id
├── Join orders + order_items
└── Return complete order

Pattern: Outbox for eventual consistency
Events emitted:
  - OrderCreated (for inventory & payment)
  - OrderStatusChanged (for user notifications)
```

### Inventory Service
```
Request: POST /:product_id/reserve
├── Check available quantity
│   (on_hand - reserved)
├── If sufficient: increment reserved_quantity
└── Return reservation confirmation

Request: POST /:product_id/confirm
├── Decrement both on_hand and reserved
└── Complete purchase

Pattern: Two-phase reservation
Prevents double-booking and supports cart system
```

### Payment Service
```
Request: POST /process
├── Call Stripe API (mocked initially)
├── Get transaction ID
├── Record payment in MySQL
├── Write to events_outbox
└── Return payment confirmation

Request: POST /:payment_id/refund
├── Update payment status
├── Emit RefundProcessed event
└── Return confirmation

Pattern: Outbox for consistency
```

## Data Flow Examples

### Happy Path: Complete Order

```
1. USER SERVICE
   ├─ User registers/logs in
   └─ Gets JWT token

2. PRODUCT SERVICE
   ├─ Browse products
   └─ Products cached in Redis

3. ORDER SERVICE
   ├─ Create order with items
   ├─ Write to MySQL (orders, order_items)
   ├─ Write event to outbox
   └─ Return orderId

4. INVENTORY SERVICE
   ├─ Listen for OrderCreated event (Phase 2)
   ├─ Reserve items
   └─ Update reserved_quantity

5. PAYMENT SERVICE
   ├─ Receive payment request
   ├─ Process with Stripe
   ├─ Record payment
   ├─ Write PaymentProcessed event
   ├─ Inventory service receives event
   ├─ Confirm inventory (move from reserved to sold)
   └─ Return confirmation
```

## Database Strategy

### Why MySQL + MongoDB + Redis?

**MySQL** (Normalized data)
- User accounts (ACID required)
- Orders and line items (Transactional)
- Payments (Financial data)
- Inventory (Consistency critical)
- Events/Outbox (Log-style)

**MongoDB** (Flexible documents)
- Products (Catalog schema evolves)
- Rich attributes per product type
- Easy to add fields
- Read-heavy workload

**Redis** (In-memory cache)
- Product catalog cache (1hr TTL)
- Session data (future)
- Real-time counters (Phase 3)
- Distributed lock support (future)

### Data Consistency Model

**Immediate Consistency**
- Single service operations (within transaction)
- User authentication
- Inventory reservations

**Eventual Consistency** (via Outbox pattern - Phase 2)
- Order creation → Inventory update
- Payment success → Order fulfillment
- Inventory changes → Analytics updates

## Deployment Architecture

### Local Development
```
Docker Compose (Single machine)
├─ All containers in docker-compose.local.yml
├─ Shared Docker network
├─ Persistent volumes for databases
└─ Service discovery via container names
```

### Production (Kubernetes - Phase 5)
```
Kubernetes Cluster
├─ Services
│  ├─ Deployment for each microservice
│  ├─ Horizontal Pod Autoscaler
│  ├─ Service for internal DNS
│  └─ Ingress for API Gateway
├─ Databases
│  ├─ StatefulSet for MySQL (primary)
│  ├─ MariaDB Galera cluster (backup)
│  ├─ MongoDB ReplicaSet
│  └─ Redis with Sentinel
├─ Message Queue
│  ├─ Kafka brokers (3+)
│  └─ Zookeeper ensemble
└─ Monitoring
   ├─ Prometheus
   ├─ Grafana
   ├─ ELK Stack (Elasticsearch, Logstash, Kibana)
   └─ Jaeger (Distributed tracing)
```

## API Gateway Pattern

### Responsibilities
```
┌─────────────────────────────────┐
│     Incoming HTTP Request       │
└────────────────┬────────────────┘
                 │
         ┌───────▼────────┐
         │ Route matching │
         └───────┬────────┘
                 │
         ┌───────▼────────┐
         │  Auth/JWT      │ (Future)
         └───────┬────────┘
                 │
         ┌───────▼────────┐
         │  Rate limiting │ (Future)
         └───────┬────────┘
                 │
         ┌───────▼────────┐
         │ Proxy request  │
         │ to service     │
         └───────┬────────┘
                 │
         ┌───────▼────────┐
         │  Response      │
         │  aggregation   │ (Future)
         └────────────────┘
```

## Authentication Flow

```
1. User POST /login
   ├─ Send email + password
   └─ Receive JWT token

2. JWT Structure
   {
     "iat": 1234567890,
     "exp": 1234671490,  // 24 hours later
     "id": 1,            // user_id
     "email": "user@example.com"
   }

3. Protected Routes
   ├─ Extract token from Authorization header
   ├─ Verify signature with JWT_SECRET
   ├─ Check expiration
   ├─ Decode payload
   └─ Attach to req.user

4. Cross-Service Verification
   ├─ Each service validates JWT independently
   ├─ Token can be propagated to other services
   └─ Reduces authentication checks
```

## Error Handling Strategy

### Service-Level
```javascript
// Input validation
if (!required_field) {
  return res.status(400).json({ error: 'Field required' });
}

// Resource not found
const result = await db.find(id);
if (!result) {
  return res.status(404).json({ error: 'Not found' });
}

// Conflict (duplicate key)
try {
  await db.insert(data);
} catch (err) {
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: 'Duplicate entry' });
  }
}

// Server error
catch (err) {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
}
```

### Circuit Breaker Pattern (Phase 2)
```
Service A calls Service B

Closed State (normal)
├─ Request succeeds → remain closed
└─ Request fails → increment counter

Open State (failing)
├─ Fail threshold reached
├─ All requests rejected immediately
└─ Return cached response or error

Half-Open State (recovering)
├─ After timeout, allow test request
├─ If succeeds → return to Closed
└─ If fails → return to Open
```

## Performance Optimization

### Caching Hierarchy
```
L1 Cache (Application)
├─ Product list pages
├─ Product details
├─ Category searches
└─ TTL: 1 hour

L2 Cache (Redis Distributed)
├─ Shared across instances
├─ Automatic cache invalidation
├─ Atomic operations
└─ Persistence for recovery
```

### Database Query Optimization
```
MySQL
├─ Indexes on frequent queries
├─ Foreign key constraints
├─ Connection pooling (10 connections)
├─ Prepared statements

MongoDB
├─ Text indexes for search (Phase 2)
├─ Projection for field selection
├─ Batch operations
└─ Connection pooling
```

### Load Distribution
```
API Gateway (Single entry point)
│
├─ User Service (scale 2-3 instances)
├─ Product Service (scale 3-5 instances)
├─ Order Service (scale 2-3 instances)
├─ Inventory Service (scale 2-3 instances)
└─ Payment Service (scale 2-3 instances)

Load balancing strategy:
- Round robin for stateless services
- Session affinity for payment (if needed)
```

## Future Enhancements (Roadmap Phases 2-5)

### Phase 2: Event-Driven Communication
- Apache Kafka for service-to-service events
- Consumer groups for scaling
- Event sourcing for audit trail

### Phase 3: Real-Time Analytics
- Spark Structured Streaming
- Complex event processing
- Real-time dashboards

### Phase 4: Data Warehouse
- Spark batch ETL
- Change Data Capture (Debezium)
- S3 + Parquet for BI

### Phase 5: Deployment & Operations
- Kubernetes orchestration
- Auto-scaling policies
- Service mesh (Istio)
- Observability stack

## References

- [Microservices Architecture Patterns](https://microservices.io)
- [Outbox Pattern](https://microservices.io/patterns/data/transactional-outbox.html)
- [Saga Pattern](https://microservices.io/patterns/data/saga.html)
- [Circuit Breaker Pattern](https://microservices.io/patterns/reliability/circuit-breaker.html)
