# Security Implementation Guide

This document outlines the security measures implemented in the Fintech Portfolio Dashboard backend API.

## Table of Contents

1. [Input Validation](#input-validation)
2. [Rate Limiting](#rate-limiting)
3. [CSRF Protection](#csrf-protection)
4. [Security Headers](#security-headers)
5. [Request Logging](#request-logging)
6. [Error Handling](#error-handling)
7. [Best Practices](#best-practices)

## Input Validation

### Comprehensive Validation Middleware

All API endpoints implement comprehensive input validation using `express-validator`:

#### Stock Symbol Validation
- Length: 1-10 characters
- Format: Alphanumeric with dots and hyphens
- Automatically converted to uppercase

#### Financial Amount Validation
- Range: 0.01 to 999,999,999.99
- Maximum 2 decimal places
- Prevents overflow and precision issues

#### Quantity Validation
- Range: 0.000001 to 999,999,999
- Maximum 6 decimal places (supports fractional shares)
- Prevents negative quantities

#### Date Validation
- Must be valid ISO 8601 format
- Cannot be in the future (for purchase dates)
- Cannot be before 1900
- Validates date logic

#### XSS Prevention
- All string inputs are sanitized
- Script tags, iframes, and event handlers are removed
- JavaScript protocols are blocked

### Usage Example

```typescript
import {
  validateStockSymbol,
  validateFinancialAmount,
  validateQuantity,
  handleValidationErrors,
  sanitizeInput
} from '../middleware/validation';

router.post('/position',
  sanitizeInput,
  validateStockSymbol(),
  validateFinancialAmount('averageCost'),
  validateQuantity(),
  handleValidationErrors,
  async (req, res) => {
    // Handler code
  }
);
```

## Rate Limiting

### Rate Limiter Configurations

Different endpoints have different rate limits based on their sensitivity and usage patterns:

| Endpoint Type | Window | Max Requests | Purpose |
|--------------|--------|--------------|---------|
| General API | 15 min | 100 | Default protection |
| Authentication | 15 min | 5 | Prevent brute force |
| Registration | 1 hour | 3 | Prevent spam accounts |
| Password Reset | 1 hour | 3 | Prevent abuse |
| Market Data | 1 min | 200 | Real-time data access |
| Portfolio Ops | 1 min | 50 | Normal operations |
| Watchlist Ops | 1 min | 30 | Normal operations |
| Bulk Operations | 5 min | 10 | Resource-intensive ops |

### Rate Limit Headers

All responses include rate limit information:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Requests remaining
- `X-RateLimit-Reset`: Time when limit resets

### Usage Example

```typescript
import { authLimiter, portfolioLimiter } from '../middleware/rateLimiter';

// Apply to specific routes
router.post('/login', authLimiter, loginHandler);
router.get('/portfolio/:userId', portfolioLimiter, getPortfolio);
```

## CSRF Protection

### How It Works

1. Client requests CSRF token: `GET /api/csrf-token`
2. Server generates and stores token (1-hour expiration)
3. Client includes token in `X-CSRF-Token` header for state-changing requests
4. Server validates token before processing request

### Protected Methods

CSRF protection is applied to:
- POST
- PUT
- DELETE
- PATCH

### Exemptions

- GET, HEAD, OPTIONS (safe methods)
- `/api/auth/*` endpoints (use other protection mechanisms)

### Usage Example

```typescript
// Client-side
const response = await fetch('/api/csrf-token');
const { csrfToken } = await response.json();

// Include in subsequent requests
await fetch('/api/portfolio/position', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`,
    'X-CSRF-Token': csrfToken
  },
  body: JSON.stringify(positionData)
});
```

## Security Headers

### Implemented Headers

#### Content Security Policy (CSP)
```
default-src 'self';
script-src 'self' 'unsafe-inline' 'unsafe-eval';
style-src 'self' 'unsafe-inline';
img-src 'self' data: https:;
font-src 'self' data:;
connect-src 'self' wss: ws:;
frame-ancestors 'none';
```

#### Other Security Headers
- `X-Frame-Options: DENY` - Prevents clickjacking
- `X-Content-Type-Options: nosniff` - Prevents MIME sniffing
- `X-XSS-Protection: 1; mode=block` - Enables XSS filter
- `Referrer-Policy: strict-origin-when-cross-origin` - Controls referrer information
- `Permissions-Policy` - Restricts browser features
- `Strict-Transport-Security` (production only) - Enforces HTTPS

### CORS Configuration

```typescript
cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining']
})
```

## Request Logging

### What Gets Logged

#### Request Logs
- Request ID (UUID)
- Timestamp
- HTTP method
- Path
- IP address
- User agent
- User ID (if authenticated)

#### Response Logs
- Request ID (for correlation)
- Timestamp
- HTTP method
- Path
- Status code
- Duration
- User ID

#### Error Logs
- Full error details (development)
- Sanitized errors (production)
- Stack traces (development only)
- Request context

### Log Format

```json
{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "method": "POST",
  "path": "/api/portfolio/position",
  "statusCode": 201,
  "duration": "45ms",
  "userId": "user-uuid",
  "ip": "192.168.1.1"
}
```

## Error Handling

### Error Response Format

All errors follow a consistent format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": [...], // Optional validation details
    "requestId": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

### Error Codes

| Code | Status | Description |
|------|--------|-------------|
| VALIDATION_ERROR | 400 | Invalid input data |
| UNAUTHORIZED_ACCESS | 403 | Insufficient permissions |
| RATE_LIMIT_EXCEEDED | 429 | Too many requests |
| CSRF_TOKEN_INVALID | 403 | Invalid CSRF token |
| INTERNAL_SERVER_ERROR | 500 | Server error |

### Production vs Development

**Development:**
- Full error messages
- Stack traces included
- Detailed validation errors

**Production:**
- Sanitized error messages
- No stack traces
- Generic messages for 5xx errors

## Best Practices

### 1. Environment Variables

Always set these environment variables:

```env
# Security
JWT_SECRET=your-strong-secret-key
NODE_ENV=production

# CORS
FRONTEND_URL=https://your-frontend.com
ALLOWED_ORIGINS=https://your-frontend.com,https://www.your-frontend.com

# Rate Limiting
TRUST_PROXY=1
```

### 2. HTTPS Only

In production, always use HTTPS:
- Strict-Transport-Security header enforced
- Secure cookies
- No mixed content

### 3. Regular Updates

- Keep dependencies updated
- Monitor security advisories
- Run `npm audit` regularly

### 4. Input Validation

- Never trust client input
- Validate on both client and server
- Sanitize all user input
- Use parameterized queries

### 5. Authentication

- Use strong JWT secrets
- Implement token rotation
- Short token expiration times
- Secure password hashing (bcrypt)

### 6. Monitoring

- Monitor rate limit violations
- Track failed authentication attempts
- Alert on suspicious patterns
- Regular security audits

### 7. Database Security

- Use parameterized queries
- Implement least privilege access
- Regular backups
- Encrypt sensitive data

### 8. API Security

- Implement API versioning
- Use API keys for external services
- Rate limit per user and IP
- Validate all API responses

## Testing Security

### Manual Testing

```bash
# Test rate limiting
for i in {1..10}; do curl http://localhost:5000/api/auth/login; done

# Test CSRF protection
curl -X POST http://localhost:5000/api/portfolio/position \
  -H "Content-Type: application/json" \
  -d '{"symbol":"AAPL"}'

# Test input validation
curl -X POST http://localhost:5000/api/portfolio/position \
  -H "Content-Type: application/json" \
  -d '{"symbol":"<script>alert(1)</script>"}'
```

### Automated Testing

Run security tests:
```bash
npm run test:security
npm audit
npm audit fix
```

## Incident Response

### If a Security Issue is Discovered

1. **Immediate Actions:**
   - Assess the severity
   - Contain the issue
   - Document everything

2. **Investigation:**
   - Review logs
   - Identify affected users
   - Determine scope

3. **Remediation:**
   - Apply fixes
   - Update dependencies
   - Deploy patches

4. **Communication:**
   - Notify affected users
   - Update security documentation
   - Post-mortem analysis

## Security Checklist

- [ ] All endpoints have input validation
- [ ] Rate limiting is configured
- [ ] CSRF protection is enabled
- [ ] Security headers are set
- [ ] HTTPS is enforced (production)
- [ ] Logging is comprehensive
- [ ] Error messages are sanitized
- [ ] Dependencies are up to date
- [ ] Environment variables are secure
- [ ] Regular security audits scheduled

## Contact

For security concerns or to report vulnerabilities, please contact:
- Email: security@example.com
- Create a private security advisory on GitHub

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [Node.js Security Checklist](https://blog.risingstack.com/node-js-security-checklist/)
