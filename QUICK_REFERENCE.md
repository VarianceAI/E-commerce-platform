# Quick Reference

## Quick Start
```bash
npm run start:local:build      # Start all services with Docker
npm run logs                   # View logs in another terminal
npm run stop:local             # Stop all services
```

## Service Ports
| Service | Port | URL |
|---------|------|-----|
| API Gateway | 80 | `http://localhost` |
| User Service | 3001 | `http://localhost:3001` |
| Product Service | 3002 | `http://localhost:3002` |
| Order Service | 3003 | `http://localhost:3003` |
| Inventory Service | 3004 | `http://localhost:3004` |
| Payment Service | 3005 | `http://localhost:3005` |
| MySQL | 3306 | `localhost:3306` |
| MongoDB | 27017 | `localhost:27017` |
| Redis | 6379 | `localhost:6379` |

## Database Credentials
- **MySQL**: `root` / `root_password`
- **MongoDB**: `admin` / `password`
- **Redis**: No auth (local only)

## API Quick Tests

### User Service
```bash
# Register
curl -X POST http://localhost/api/users/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}'

# Login
curl -X POST http://localhost/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}'
```

### Product Service
```bash
# Create product
curl -X POST http://localhost/api/products \
  -H "Content-Type: application/json" \
  -d '{"name":"Product","price":99.99,"sku":"SKU-001"}'

# List products
curl http://localhost/api/products

# Get product
curl http://localhost/api/products/{id}
```

### Order Service
```bash
# Create order
curl -X POST http://localhost/api/orders \
  -H "Content-Type: application/json" \
  -d '{"user_id":1,"items":[{"product_id":1,"quantity":1,"unit_price":99.99}],"total_amount":99.99}'

# Get order
curl http://localhost/api/orders/{id}
```

### Payment Service
```bash
# Process payment
curl -X POST http://localhost/api/payments/process \
  -H "Content-Type: application/json" \
  -d '{"order_id":1,"user_id":1,"amount":99.99}'
```

## File Structure
```
E-commerce-platform/
├── services/
│   ├── user-service/          # User management
│   ├── product-service/       # Product catalog
│   ├── order-service/         # Order processing
│   ├── inventory-service/     # Stock management
│   └── payment-service/       # Payment processing
├── api-gateway/               # API Gateway
├── docker/                    # Docker config
│   └── mysql-init.sql        # Database schema
├── docs/                      # Documentation
│   ├── GETTING_STARTED.md    # Getting started guide
│   ├── API.md                # API documentation
│   ├── ARCHITECTURE.md       # System design
│   ├── ROADMAP.md            # Development roadmap
│   └── CONTRIBUTING.md       # Contributing guide
├── docker-compose.local.yml  # Local development setup
├── package.json              # Root package.json
└── README.md                 # Project overview
```

## Common Commands

### Docker
```bash
# View running containers
docker ps

# View container logs
docker logs -f {container_name}

# Connect to container
docker exec -it {container_name} bash

# Remove everything
docker system prune -a --volumes
```

### MySQL
```bash
# Connect
docker exec -it e-commerce-platform_mysql_1 \
  mysql -u root -p"root_password" ecommerce_db

# Show tables
SHOW TABLES;

# Query table
SELECT * FROM users;

# Exit
EXIT;
```

### MongoDB
```bash
# Connect
docker exec -it e-commerce-platform_mongodb_1 \
  mongo -u admin -p password --authenticationDatabase admin

# Show databases
show dbs;

# Use database
use ecommerce_catalog

# Show collections
show collections;

# Query collection
db.products.find();

# Exit
exit;
```

### Redis
```bash
# Connect
docker exec -it e-commerce-platform_redis_1 redis-cli

# List keys
KEYS *

# Get value
GET {key}

# Delete key
DEL {key}

# Exit
EXIT;
```

## Troubleshooting

### Port conflicts
```bash
# Kill process on port
lsof -i :80
kill -9 {PID}

# Or use different port in docker-compose.local.yml
```

### Container won't start
```bash
# Check logs
docker logs {container_name}

# Rebuild
npm run start:local:build --no-cache

# Fresh start
npm run stop:local
docker system prune -a --volumes
npm run start:local:build
```

### Database connection failed
```bash
# Wait 30 seconds for database startup
# Check database is running
docker ps | grep mysql

# View database logs
docker logs e-commerce-platform_mysql_1
```

## Documentation Links
- [Getting Started Guide](docs/GETTING_STARTED.md)
- [API Documentation](docs/API.md)
- [Architecture Guide](docs/ARCHITECTURE.md)
- [Development Roadmap](docs/ROADMAP.md)
- [Contributing Guide](docs/CONTRIBUTING.md)

## Key Endpoints
```
GET     /api/services              # List all services
POST    /api/users/register        # Register user
POST    /api/users/login           # Login user
GET     /api/users/profile         # Get profile (auth required)
POST    /api/products              # Create product
GET     /api/products              # List products
GET     /api/products/:id          # Get product
POST    /api/orders                # Create order
GET     /api/orders/:id            # Get order
POST    /api/inventory/:id/reserve # Reserve inventory
POST    /api/payments/process      # Process payment
```

## Performance Tips
- Use `/api/products?limit=50` for pagination
- Products are cached in Redis (1hr TTL)
- Use `/api/products/search/{category}` for category search
- Inventory reservation prevents overselling
- Outbox pattern ensures eventual consistency

## Security
- JWT tokens expire in 24 hours
- Passwords are hashed with bcrypt
- Use HTTPS in production
- Update JWT_SECRET in .env
- Validate all inputs
- Use authorized headers for protected routes

## Monitoring
```bash
# View all logs
npm run logs

# View specific service logs
docker logs -f {service_name}

# Monitor in real-time
watch -n 1 docker stats
```

## Need Help?
1. Check [GETTING_STARTED.md](docs/GETTING_STARTED.md) for setup
2. Review [API.md](docs/API.md) for endpoint details
3. Check [ARCHITECTURE.md](docs/ARCHITECTURE.md) for design
4. View logs with `npm run logs`
5. Test with curl examples above
