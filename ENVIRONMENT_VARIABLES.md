# Environment Variables Configuration Guide

This document describes all environment variables required for the Fintech Portfolio Dashboard, with special focus on Vercel deployment and error handling configuration.

## Quick Start

1. Copy `.env.example` to `.env` in the root directory
2. Copy `backend/.env.example` to `backend/.env` (if not already present)
3. Copy `frontend/.env.example` to `frontend/.env`
4. Update the values according to your environment

## Required Variables

### Database Configuration

```bash
DB_HOST=localhost                    # PostgreSQL host
DB_PORT=5432                         # PostgreSQL port
DB_NAME=fintech_portfolio            # Database name
DB_USER=postgres                     # Database user
DB_PASSWORD=password                 # Database password
```

### Redis Configuration (Required for Production)

```bash
REDIS_URL=redis://localhost:6379    # Redis connection URL
REDIS_TOKEN=                         # Redis authentication token (for Vercel KV)
SKIP_REDIS=false                     # Set to true for local dev without Redis
```

**Vercel Deployment:** Use Vercel KV (Redis) for production. Get credentials from Vercel dashboard.

### JWT Configuration

```bash
JWT_SECRET=your-secret-key           # Strong secret key for JWT signing
JWT_EXPIRES_IN=24h                   # Access token expiration
REFRESH_TOKEN_EXPIRES_IN=7d          # Refresh token expiration
```

**Security:** Use a strong, random secret in production (min 32 characters).

## Error Handling Configuration

### Timeout Settings

```bash
FUNCTION_TIMEOUT_MS=8000             # Max function execution time (8s for safety)
FUNCTION_WARNING_THRESHOLD_MS=6000   # Log warning when function exceeds this
EXTERNAL_API_TIMEOUT_MS=5000         # Timeout for external API calls
```

**Vercel Limits:**
- Hobby plan: 10s max
- Pro plan: 60s max
- Set to 8000ms (8s) for safety margin

### Payload Size Limits

```bash
MAX_REQUEST_SIZE=4194304             # 4MB max request size
MAX_RESPONSE_SIZE=4194304            # 4MB max response size
MAX_ARRAY_LENGTH=100                 # Max items per paginated response
```

**Vercel Limits:**
- Request: 4.5MB max
- Response: 4.5MB max
- Set to 4MB for safety margin

### Rate Limiting

```bash
RATE_LIMIT_WINDOW_MS=60000           # Rate limit window (60s)
RATE_LIMIT_MAX_REQUESTS=100          # Default max requests per window
RATE_LIMIT_PORTFOLIO_MAX=100         # Portfolio endpoints: 100 req/min
RATE_LIMIT_MARKET_DATA_MAX=300       # Market data endpoints: 300 req/min
RATE_LIMIT_GLOBAL_MAX=10000          # Global limit across all users
```

### Circuit Breaker Configuration

```bash
CIRCUIT_BREAKER_THRESHOLD=5          # Open circuit after 5 consecutive failures
CIRCUIT_BREAKER_RESET_MS=60000       # Try to close circuit after 60s
CIRCUIT_BREAKER_MONITORING_PERIOD_MS=300000  # Monitor failures over 5 minutes
```

### Retry Configuration

```bash
RETRY_MAX_ATTEMPTS=3                 # Max retry attempts for failed requests
RETRY_INITIAL_DELAY=1000             # Initial retry delay (1s)
RETRY_MAX_DELAY=10000                # Max retry delay (10s)
RETRY_BACKOFF_MULTIPLIER=2           # Exponential backoff multiplier
```

### Cache Configuration

```bash
CACHE_TTL_MARKET_DATA=60             # Cache market data for 60s
CACHE_TTL_PORTFOLIO=30               # Cache portfolio data for 30s
CACHE_TTL_STATIC=86400               # Cache static data for 24h
CACHE_STALE_WHILE_REVALIDATE=30      # Serve stale data while revalidating
```

## Monitoring and Alerting

### Error Logging

```bash
LOG_LEVEL=info                       # Logging level (debug, info, warn, error)
ERROR_LOGGING_ENABLED=true           # Enable error logging
ERROR_MONITORING_ENABLED=true        # Enable error monitoring
```

### Error Rate Alerting

```bash
ERROR_RATE_THRESHOLD=10              # Alert when error rate exceeds 10 errors/min
ERROR_RATE_WINDOW_MS=60000           # Calculate error rate over 60s window
ENABLE_ERROR_ALERTS=true             # Enable error rate alerting
ALERT_COOLDOWN_MS=300000             # Wait 5 minutes between alerts
ALERT_CHECK_INTERVAL_MS=30000        # Check alert rules every 30s
```

### Alert Rule Configuration

```bash
# Enable/disable specific alert types
ENABLE_CIRCUIT_BREAKER_ALERTS=true   # Alert on circuit breaker state changes
ENABLE_TIMEOUT_ALERTS=true           # Alert on timeout spikes
ENABLE_RATE_LIMIT_ALERTS=true        # Alert on rate limit violations
ENABLE_PERFORMANCE_ALERTS=true       # Alert on high response times
ENABLE_SUCCESS_RATE_ALERTS=true      # Alert on low success rates

# Alert thresholds
HIGH_RESPONSE_TIME_THRESHOLD=2000    # Alert when P95 exceeds 2000ms
TIMEOUT_RATE_THRESHOLD=5             # Alert when timeout rate exceeds 5%
RATE_LIMIT_BLOCK_THRESHOLD=10        # Alert when block rate exceeds 10%
SUCCESS_RATE_THRESHOLD=95            # Alert when success rate below 95%
```

### External Monitoring Services (Optional)

#### Vercel Analytics

```bash
VERCEL_ANALYTICS_ID=                 # Your Vercel Analytics ID
```

Get from: Vercel Dashboard → Project → Analytics

#### Sentry Error Tracking

```bash
SENTRY_DSN=                          # Your Sentry DSN
SENTRY_ENVIRONMENT=production        # Environment name
SENTRY_TRACES_SAMPLE_RATE=0.1        # Sample 10% of transactions
```

Get from: Sentry Dashboard → Project Settings → Client Keys (DSN)

To install Sentry:
```bash
npm install @sentry/node
```

#### Alert Channels

```bash
# Webhook (generic)
ALERT_WEBHOOK_URL=                   # Generic webhook URL for alerts

# Slack
SLACK_WEBHOOK_URL=                   # Slack incoming webhook URL
```

**Slack Setup:**
1. Go to Slack workspace settings
2. Create an incoming webhook
3. Copy webhook URL to `SLACK_WEBHOOK_URL`

**Discord Setup:**
1. Go to Discord channel settings
2. Create webhook
3. Copy webhook URL to `ALERT_WEBHOOK_URL`

**Custom Webhook:**
- Alerts are sent as JSON POST requests
- See `backend/MONITORING_AND_ALERTING.md` for payload format

## Edge Function Configuration

```bash
EDGE_FUNCTION_TIMEOUT_MS=25          # Edge function timeout (25ms limit)
EDGE_AUTH_ENABLED=true               # Enable edge authentication
EDGE_RATE_LIMIT_ENABLED=true         # Enable edge rate limiting
```

**Note:** Edge functions have strict 25ms execution limit on Vercel.

## Market Data Provider

Choose one provider and configure:

### Alpha Vantage

```bash
ALPHA_VANTAGE_API_KEY=your-api-key
```

Get from: https://www.alphavantage.co/support/#api-key

### IEX Cloud

```bash
IEX_CLOUD_API_KEY=your-api-key
IEX_CLOUD_BASE_URL=https://cloud.iexapis.com/stable
```

Get from: https://iexcloud.io/console/tokens

### Polygon.io

```bash
POLYGON_API_KEY=your-api-key
```

Get from: https://polygon.io/dashboard/api-keys

## Service Information

```bash
SERVICE_NAME=fintech-portfolio-api   # Service name for logging/monitoring
SERVICE_VERSION=1.0.0                # Service version
```

## Frontend Configuration

Create `frontend/.env`:

```bash
VITE_API_BASE_URL=http://localhost:5000/api  # Backend API URL
VITE_ENABLE_ERROR_REPORTING=true             # Enable error reporting
VITE_ERROR_RETRY_ATTEMPTS=3                  # Client-side retry attempts
VITE_ERROR_RETRY_DELAY=1000                  # Client-side retry delay

# Optional monitoring
VITE_VERCEL_ANALYTICS_ID=
VITE_SENTRY_DSN=
VITE_SENTRY_ENVIRONMENT=production
```

## Vercel Deployment

### Setting Environment Variables in Vercel

1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add each variable with appropriate values
3. Select environments: Production, Preview, Development
4. Save and redeploy

### Required for Production

**Critical:**
- `REDIS_URL` and `REDIS_TOKEN` (use Vercel KV)
- `JWT_SECRET` (strong random value)
- `DB_*` variables (use Vercel Postgres or external DB)
- Market data provider API key

**Recommended:**
- `SENTRY_DSN` for error tracking
- `VERCEL_ANALYTICS_ID` for analytics
- `ALERT_WEBHOOK_URL` for notifications

### Vercel KV (Redis) Setup

1. Go to Vercel Dashboard → Storage → Create Database → KV
2. Connect to your project
3. Vercel automatically adds these variables:
   - `KV_URL`
   - `KV_REST_API_URL`
   - `KV_REST_API_TOKEN`
4. Set `REDIS_URL` to `KV_URL` value

### Vercel Postgres Setup

1. Go to Vercel Dashboard → Storage → Create Database → Postgres
2. Connect to your project
3. Vercel automatically adds:
   - `POSTGRES_URL`
   - `POSTGRES_PRISMA_URL`
   - `POSTGRES_URL_NON_POOLING`
4. Use these for your `DB_*` variables

## Environment-Specific Configuration

### Development

```bash
NODE_ENV=development
SKIP_REDIS=true                      # Can skip Redis locally
LOG_LEVEL=debug                      # Verbose logging
ERROR_MONITORING_ENABLED=false       # Optional in dev
```

### Production

```bash
NODE_ENV=production
SKIP_REDIS=false                     # Redis required
LOG_LEVEL=info                       # Standard logging
ERROR_MONITORING_ENABLED=true        # Always enable
SENTRY_DSN=your-production-dsn       # Production Sentry project
```

### Preview/Staging

```bash
NODE_ENV=staging
SENTRY_ENVIRONMENT=staging           # Separate Sentry environment
LOG_LEVEL=info
```

## Validation

The application validates required environment variables on startup. Missing critical variables will prevent the application from starting.

### Backend Validation

Check `backend/src/config/errorHandling.ts` for validation logic.

### Frontend Validation

Check `frontend/src/config/` for validation logic.

## Security Best Practices

1. **Never commit `.env` files** - They're in `.gitignore`
2. **Use strong secrets** - Minimum 32 characters for JWT_SECRET
3. **Rotate secrets regularly** - Especially after team member changes
4. **Use different secrets per environment** - Dev, staging, production
5. **Limit Redis access** - Use authentication tokens
6. **Enable HTTPS only** - Set secure cookie flags in production
7. **Monitor access logs** - Watch for suspicious activity

## Troubleshooting

### Redis Connection Issues

```bash
# Test Redis connection
redis-cli -u $REDIS_URL ping
```

Expected: `PONG`

### Database Connection Issues

```bash
# Test database connection
npm run db:test
```

### Missing Variables

Check application logs for messages like:
```
Error: Missing required environment variable: REDIS_URL
```

### Vercel Deployment Issues

1. Check Vercel deployment logs
2. Verify all environment variables are set
3. Ensure `vercel.json` is properly configured
4. Check function timeout settings

## Additional Resources

- [Vercel Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)
- [Vercel KV (Redis)](https://vercel.com/docs/storage/vercel-kv)
- [Vercel Postgres](https://vercel.com/docs/storage/vercel-postgres)
- [Vercel Function Limits](https://vercel.com/docs/concepts/limits/overview)
