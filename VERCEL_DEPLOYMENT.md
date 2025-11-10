# Vercel Deployment Guide

This guide walks you through deploying the Fintech Portfolio Dashboard to Vercel with proper error handling configuration.

## Prerequisites

- Vercel account (sign up at https://vercel.com)
- GitHub/GitLab/Bitbucket repository with your code
- Vercel CLI installed (optional): `npm i -g vercel`

## Quick Deploy

### Option 1: Deploy via Vercel Dashboard

1. Go to https://vercel.com/new
2. Import your Git repository
3. Configure project settings (see below)
4. Deploy

### Option 2: Deploy via CLI

```bash
# Login to Vercel
vercel login

# Deploy to preview
vercel

# Deploy to production
vercel --prod
```

## Project Configuration

### Build Settings

**Framework Preset:** Other

**Build Command:**
```bash
npm run build
```

**Output Directory:**
```
frontend/dist
```

**Install Command:**
```bash
npm run install:all
```

### Root Directory

Leave as `.` (root)

## Environment Variables Setup

### Required Variables

Add these in Vercel Dashboard → Settings → Environment Variables:

#### Database (Vercel Postgres)

```bash
DB_HOST=<from Vercel Postgres>
DB_PORT=5432
DB_NAME=<from Vercel Postgres>
DB_USER=<from Vercel Postgres>
DB_PASSWORD=<from Vercel Postgres>
```

Or use the connection string:
```bash
DATABASE_URL=<from Vercel Postgres>
```

#### Redis (Vercel KV)

```bash
REDIS_URL=<from Vercel KV>
REDIS_TOKEN=<from Vercel KV>
```

#### JWT Configuration

```bash
JWT_SECRET=<generate strong random string>
JWT_EXPIRES_IN=24h
REFRESH_TOKEN_EXPIRES_IN=7d
```

Generate strong secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### API Configuration

```bash
PORT=5000
NODE_ENV=production
FRONTEND_URL=https://your-app.vercel.app
ALLOWED_ORIGINS=https://your-app.vercel.app
```

#### Market Data Provider

Choose one:

```bash
# Alpha Vantage
ALPHA_VANTAGE_API_KEY=<your-key>

# OR IEX Cloud
IEX_CLOUD_API_KEY=<your-key>
IEX_CLOUD_BASE_URL=https://cloud.iexapis.com/stable

# OR Polygon.io
POLYGON_API_KEY=<your-key>
```

#### Error Handling Configuration

```bash
# Timeouts (milliseconds)
FUNCTION_TIMEOUT_MS=8000
FUNCTION_WARNING_THRESHOLD_MS=6000
EXTERNAL_API_TIMEOUT_MS=5000

# Payload Limits (bytes)
MAX_REQUEST_SIZE=4194304
MAX_RESPONSE_SIZE=4194304
MAX_ARRAY_LENGTH=100

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_PORTFOLIO_MAX=100
RATE_LIMIT_MARKET_DATA_MAX=300
RATE_LIMIT_GLOBAL_MAX=10000

# Circuit Breaker
CIRCUIT_BREAKER_THRESHOLD=5
CIRCUIT_BREAKER_RESET_MS=60000
CIRCUIT_BREAKER_MONITORING_PERIOD_MS=300000

# Retry Logic
RETRY_MAX_ATTEMPTS=3
RETRY_INITIAL_DELAY=1000
RETRY_MAX_DELAY=10000
RETRY_BACKOFF_MULTIPLIER=2

# Caching (seconds)
CACHE_TTL_MARKET_DATA=60
CACHE_TTL_PORTFOLIO=30
CACHE_TTL_STATIC=86400
CACHE_STALE_WHILE_REVALIDATE=30

# Logging
LOG_LEVEL=info
ERROR_LOGGING_ENABLED=true
ERROR_MONITORING_ENABLED=true

# Alerting
ERROR_RATE_THRESHOLD=10
ERROR_RATE_WINDOW_MS=60000
ENABLE_ERROR_ALERTS=true
ALERT_COOLDOWN_MS=300000

# Edge Functions
EDGE_FUNCTION_TIMEOUT_MS=25
EDGE_AUTH_ENABLED=true
EDGE_RATE_LIMIT_ENABLED=true

# Service Info
SERVICE_NAME=fintech-portfolio-api
SERVICE_VERSION=1.0.0

# CORS
CORS_ORIGIN=https://your-app.vercel.app
```

### Optional Monitoring Variables

```bash
# Vercel Analytics
VERCEL_ANALYTICS_ID=<from Vercel dashboard>

# Sentry
SENTRY_DSN=<from Sentry dashboard>
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.1

# Alerts
ALERT_WEBHOOK_URL=<Slack/Discord webhook>
```

## Setting Up Vercel Storage

### 1. Vercel KV (Redis)

1. Go to Vercel Dashboard → Storage
2. Click "Create Database" → "KV"
3. Name your database (e.g., "portfolio-cache")
4. Click "Create"
5. Connect to your project
6. Vercel automatically adds environment variables:
   - `KV_URL` → Use as `REDIS_URL`
   - `KV_REST_API_TOKEN` → Use as `REDIS_TOKEN`

### 2. Vercel Postgres

1. Go to Vercel Dashboard → Storage
2. Click "Create Database" → "Postgres"
3. Name your database (e.g., "portfolio-db")
4. Click "Create"
5. Connect to your project
6. Vercel automatically adds:
   - `POSTGRES_URL`
   - `POSTGRES_PRISMA_URL`
   - `POSTGRES_URL_NON_POOLING`
7. Use these for your database connection

### 3. Run Migrations

After setting up Postgres:

```bash
# Using Vercel CLI
vercel env pull .env.local
npm run migrate

# Or connect directly
psql $POSTGRES_URL < backend/src/database/schema.sql
```

## Vercel Configuration File

The `vercel.json` file is already configured with:

- Function timeout: 10s (max for Hobby plan)
- Memory: 1024MB
- Cache headers for API routes
- SPA routing rewrites
- Security headers

### Key Configuration Sections

#### Function Settings

```json
{
  "functions": {
    "backend/src/routes/**/*.ts": {
      "maxDuration": 10,
      "memory": 1024
    }
  }
}
```

**Note:** Hobby plan max is 10s, Pro plan max is 60s.

#### Cache Headers

```json
{
  "headers": [
    {
      "source": "/api/market/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, s-maxage=60, stale-while-revalidate=30"
        }
      ]
    }
  ]
}
```

#### SPA Routing

```json
{
  "rewrites": [
    {
      "source": "/((?!api).*)",
      "destination": "/index.html"
    }
  ]
}
```

## Deployment Checklist

### Pre-Deployment

- [ ] All environment variables configured
- [ ] Vercel KV (Redis) created and connected
- [ ] Vercel Postgres created and connected
- [ ] Database migrations ready
- [ ] Market data API key obtained
- [ ] JWT secret generated (strong random string)
- [ ] `vercel.json` configured
- [ ] `.env.example` files updated

### Post-Deployment

- [ ] Run database migrations
- [ ] Test API endpoints
- [ ] Verify error handling works
- [ ] Check rate limiting
- [ ] Test circuit breaker
- [ ] Verify caching
- [ ] Monitor error logs
- [ ] Set up alerts (Sentry, webhooks)
- [ ] Test timeout handling
- [ ] Verify payload limits

## Testing Deployment

### 1. Health Check

```bash
curl https://your-app.vercel.app/api/health
```

Expected: `{"status": "ok"}`

### 2. Test Authentication

```bash
# Register user
curl -X POST https://your-app.vercel.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!","name":"Test User"}'

# Login
curl -X POST https://your-app.vercel.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!"}'
```

### 3. Test Rate Limiting

```bash
# Make multiple requests quickly
for i in {1..10}; do
  curl https://your-app.vercel.app/api/market/quote/AAPL
done
```

Expected: 429 status after exceeding limit

### 4. Test Error Handling

```bash
# Test with invalid data
curl -X POST https://your-app.vercel.app/api/portfolio \
  -H "Content-Type: application/json" \
  -d '{"invalid": "data"}'
```

Expected: Proper error response with error code and message

## Monitoring Deployment

### Vercel Dashboard

1. Go to your project in Vercel Dashboard
2. Click "Deployments" to see deployment history
3. Click "Analytics" to see performance metrics
4. Click "Logs" to see function logs

### Real-time Logs

```bash
# Using Vercel CLI
vercel logs --follow
```

### Error Tracking

If Sentry is configured:
1. Go to Sentry Dashboard
2. Select your project
3. View errors and performance data

## Common Issues and Solutions

### Issue: Function Timeout

**Symptom:** 504 Gateway Timeout errors

**Solutions:**
1. Check `FUNCTION_TIMEOUT_MS` is set to 8000 or less
2. Optimize slow database queries
3. Implement caching for expensive operations
4. Use background jobs for long-running tasks
5. Upgrade to Pro plan for 60s timeout

### Issue: Payload Too Large

**Symptom:** 413 Payload Too Large errors

**Solutions:**
1. Implement pagination for large datasets
2. Check `MAX_ARRAY_LENGTH` is set to 100
3. Enable response compression
4. Reduce response payload size

### Issue: Rate Limiting Not Working

**Symptom:** No 429 responses when expected

**Solutions:**
1. Verify Redis is connected (`REDIS_URL` set)
2. Check rate limit configuration
3. Ensure rate limiter middleware is applied
4. Check Vercel logs for Redis connection errors

### Issue: Circuit Breaker Not Opening

**Symptom:** Continued failures to external API

**Solutions:**
1. Verify circuit breaker configuration
2. Check failure threshold is appropriate
3. Ensure circuit breaker is applied to external calls
4. Monitor circuit breaker state in logs

### Issue: Cache Not Working

**Symptom:** Slow responses, high function invocations

**Solutions:**
1. Verify Redis connection
2. Check cache TTL settings
3. Ensure cache keys are consistent
4. Monitor cache hit rate in logs

### Issue: Database Connection Errors

**Symptom:** 500 errors, database connection failures

**Solutions:**
1. Verify Postgres environment variables
2. Check connection string format
3. Ensure database is accessible from Vercel
4. Check connection pool settings
5. Run migrations if schema is missing

## Performance Optimization

### 1. Enable Edge Caching

Already configured in `vercel.json`:
- Market data: 60s cache
- Portfolio data: 30s cache

### 2. Use Edge Functions

For lightweight operations:
- Authentication checks
- Rate limiting
- Request validation

### 3. Optimize Database Queries

- Add indexes for frequently queried fields
- Use connection pooling
- Implement query result caching

### 4. Implement CDN Caching

Static assets are automatically cached by Vercel CDN.

## Scaling Considerations

### Hobby Plan Limits

- 10s function timeout
- 100GB bandwidth/month
- 6,000 build minutes/month

### Pro Plan Benefits

- 60s function timeout
- 1TB bandwidth/month
- 24,000 build minutes/month
- Advanced analytics
- Team collaboration

### When to Upgrade

Consider upgrading when:
- Functions consistently approach 10s timeout
- High traffic exceeds bandwidth limits
- Need longer function execution time
- Require team collaboration features

## Security Best Practices

1. **Use Environment Variables** - Never hardcode secrets
2. **Enable HTTPS Only** - Vercel provides automatic HTTPS
3. **Set Security Headers** - Already configured in `vercel.json`
4. **Implement Rate Limiting** - Prevent abuse
5. **Validate All Inputs** - Use payload validator
6. **Sanitize Error Messages** - Don't expose sensitive data
7. **Monitor Access Logs** - Watch for suspicious activity
8. **Rotate Secrets Regularly** - Update JWT secret periodically
9. **Use Strong Passwords** - For database and Redis
10. **Enable 2FA** - On Vercel account

## Rollback Procedure

If deployment has issues:

### Via Dashboard

1. Go to Vercel Dashboard → Deployments
2. Find previous working deployment
3. Click "..." → "Promote to Production"

### Via CLI

```bash
# List deployments
vercel ls

# Rollback to specific deployment
vercel rollback <deployment-url>
```

## Support and Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Vercel Support](https://vercel.com/support)
- [Vercel Community](https://github.com/vercel/vercel/discussions)
- [Vercel Status](https://www.vercel-status.com/)

## Next Steps

After successful deployment:

1. Set up monitoring and alerting
2. Configure custom domain
3. Enable Vercel Analytics
4. Set up CI/CD pipeline
5. Implement automated testing
6. Configure staging environment
7. Document API endpoints
8. Set up backup procedures
