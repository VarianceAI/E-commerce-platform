# Contributing Guide

## Development Workflow

### Setting Up Your Development Environment

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd E-commerce-platform
   ```

2. **Install dependencies**
   ```bash
   npm run install:all
   ```

3. **Create a feature branch**
   ```bash
   git checkout -b feature/my-feature
   ```

### Code Standards

#### File Structure
Each microservice follows this structure:
```
services/service-name/
├── server.js          # Main application entry
├── package.json       # Dependencies
├── Dockerfile         # Container configuration
└── .env.example       # Environment variables template
```

#### Naming Conventions
- Files: `camelCase.js` or `PascalCase.js` for classes
- Functions: `camelCase()`
- Constants: `CONSTANT_CASE`
- Database tables: `snake_case`
- API endpoints: `/api/resource` with HTTP verbs

#### Code Style
- Use 2-space indentation
- Use `const` by default, `let` when needed, avoid `var`
- Add JSDoc comments for complex functions
- Keep functions < 50 lines when possible
- Use meaningful variable names

#### Error Handling
```javascript
// ✓ Good: Descriptive error messages
if (!email) {
  return res.status(400).json({ error: 'Email required' });
}

// ✗ Bad: Vague error messages
if (!email) {
  return res.status(400).json({ error: 'Bad request' });
}
```

#### Database Queries
```javascript
// ✓ Good: Use parameterized queries to prevent SQL injection
const [users] = await connection.execute(
  'SELECT * FROM users WHERE email = ?',
  [email]
);

// ✗ Bad: String concatenation
const users = await connection.execute(
  `SELECT * FROM users WHERE email = '${email}'`
);
```

### Testing

#### Unit Tests (Coming in Phase 2)
```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

#### Integration Tests (Coming in Phase 2)
```bash
# Test service API
npm run test:integration
```

#### Manual Testing
```bash
# Start services
npm run start:local:build

# Test endpoints
curl http://localhost/api/users/register
```

### Git Workflow

#### Commit Messages
Follow conventional commits:
```
feature: Add new endpoint for product search
fix: Resolve JWT token validation issue
docs: Update API documentation
test: Add unit tests for payment service
chore: Update dependencies
```

#### PR Process
1. Push to feature branch
2. Create Pull Request
3. Request code review (2+ approvals)
4. Ensure CI/CD passes
5. Merge to main
6. Delete feature branch

### Adding a New Endpoint

#### Example: Add GET /products/top-selling

1. **Update server.js**
```javascript
// Add route
app.get('/top-selling', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    // Implementation
    const topProducts = await getTopSellingProducts(limit);

    res.json(topProducts);
  } catch (err) {
    console.error('Get top selling error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

2. **Document in API.md**
```markdown
### Get Top Selling Products
GET /products/top-selling?limit=10

Response: 200
[...]
```

3. **Test locally**
```bash
curl http://localhost/api/products/top-selling
```

4. **Commit and PR**
```bash
git add services/product-service/
git commit -m "feature: Add top-selling products endpoint"
git push origin feature/top-selling
```

### Modifying Database Schema

#### Adding a New Column

1. **Create migration file**
   ```
   db/migrations/001_add_discount_to_products.sql
   ```

2. **Add to mysql-init.sql**
   ```sql
   ALTER TABLE products ADD COLUMN discount DECIMAL(5,2) DEFAULT 0;
   ```

3. **Update service code** (if needed)

4. **Test with docker-compose**
   ```bash
   npm run stop:local
   npm run start:local:build # Runs migrations
   ```

### Performance Optimization

#### When to Cache
- Product catalog (rarely changes)
- Aggregate statistics
- Search results
- User preferences

#### When NOT to cache
- Real-time inventory
- Payment information
- User passwords
- Real-time order status

#### Caching Strategy
```javascript
// Always use cache-aside pattern
// 1. Check cache
// 2. If miss, query database
// 3. Store in cache with TTL
// 4. Return to client

const cacheKey = `product:${id}`;
const cached = await redis.get(cacheKey);
if (cached) return cached;

const data = await db.query(id);
await redis.setEx(cacheKey, 3600, JSON.stringify(data));
return data;
```

### Debugging

#### Enable Debug Logging
```javascript
// Add to server.js
const DEBUG = process.env.DEBUG === 'true';

if (DEBUG) {
  console.log('Database query:', query);
  console.log('Response:', data);
}
```

#### View Docker Logs
```bash
# All services
npm run logs

# Specific service
docker logs e-commerce-platform_user-service_1

# Follow logs
docker logs -f e-commerce-platform_user-service_1
```

#### Database Debugging
```bash
# Connect to MySQL
docker exec -it e-commerce-platform_mysql_1 \
  mysql -u root -p"root_password" ecommerce_db

# View tables
SHOW TABLES;
SELECT * FROM users LIMIT 5;

# View recent errors_outbox
SELECT * FROM events_outbox WHERE processed = FALSE;
```

### Dependency Management

#### Adding a New Package
```bash
cd services/service-name
npm install express-validator

# Commit package-lock.json
git add package.json package-lock.json
```

#### Updating Packages
```bash
# Check for updates
npm outdated

# Update specific package
npm update package-name

# Update all packages
npm update

# Test thoroughly after updates
npm test
```

### Security Checklist

Before pushing code:
- [ ] No hardcoded secrets (use .env)
- [ ] No SQL injection vulnerabilities
- [ ] JWT tokens validated
- [ ] Input validation on all endpoints
- [ ] Error messages don't leak sensitive info
- [ ] Dependencies scanned for vulnerabilities

#### Scan for Vulnerabilities
```bash
npm audit
npm audit fix
```

### Documentation Updates

When you change functionality:

1. **Update API.md** - Document endpoints
2. **Update ARCHITECTURE.md** - Update design docs
3. **Add comments** - Explain complex logic
4. **Update README** - If behavior changes

### Release Process (Future)

```bash
# Create release branch
git checkout -b release/v1.1.0

# Update version
npm version minor

# Create changelog
echo "## v1.1.0\n- Feature X\n- Fix Y" > CHANGELOG.md

# Merge to main and tag
git tag v1.1.0
git push origin --tags
```

### Common Issues & Solutions

#### "ENOENT: no such file or directory"
```bash
# Reinstall dependencies
npm install

# Or for all services
npm run install:all
```

#### "Port already in use"
```bash
# Kill process using port
lsof -i :3001
kill -9 <PID>
```

#### "MySQL connection refused"
```bash
# Ensure MySQL container is running
docker ps | grep mysql

# Restart containers
npm run stop:local
npm run start:local:build
```

### Going Further

- Review microservices best practices
- Study distributed system patterns
- Learn about horizontal scaling
- Understand CQRS pattern
- Explore event sourcing

### Need Help?

1. Check documentation in `/docs`
2. Review similar code in other services
3. Ask in team Slack/Discord
4. Check GitHub issues
5. Review referenced architecture patterns

---

## Code Review Checklist

When reviewing PRs:
- [ ] Code follows style guide
- [ ] Tests are included
- [ ] Documentation is updated
- [ ] No security issues
- [ ] Error handling is appropriate
- [ ] Database queries are optimized
- [ ] Comments explain the "why"
- [ ] CI/CD passes

---

## Questions?

Refer to:
- [ARCHITECTURE.md](ARCHITECTURE.md) - System design
- [API.md](API.md) - Endpoint documentation
- [ROADMAP.md](ROADMAP.md) - Future plans
