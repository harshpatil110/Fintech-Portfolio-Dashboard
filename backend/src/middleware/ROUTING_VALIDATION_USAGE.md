# Routing Validation and Loop Prevention Usage Guide

This guide explains how to use the routing validation and loop prevention middleware to handle routing errors and prevent infinite loops.

## Overview

The routing validation system provides:
- Route parameter validation
- Redirect loop detection
- Enhanced 404 handlers with helpful suggestions
- Request depth tracking
- Circular redirect prevention
- Middleware execution time limits

## Routing Validation Middleware

### 1. Route Parameter Validation

Automatically validates route parameters against predefined patterns:

```typescript
import { validateRouteParams, PARAM_PATTERNS } from './middleware/routingValidator';

// Use default patterns (userId, symbol, id, email, etc.)
router.get('/portfolio/:userId', validateRouteParams(), getPortfolio);

// Custom validation patterns
router.get('/custom/:customId', 
  validateRouteParams({
    customId: {
      pattern: /^[A-Z0-9]{10}$/,
      errorMessage: 'Invalid custom ID format'
    }
  }),
  handleCustom
);
```

**Built-in Patterns:**
- `userId`: UUID format
- `symbol`: 1-5 uppercase letters (stock symbols)
- `id`: UUID format
- `positionId`: UUID format
- `email`: Valid email format

### 2. Validate Specific Parameters

For single parameter validation:

```typescript
import { validateParam } from './middleware/routingValidator';

router.get('/stock/:symbol',
  validateParam('symbol', /^[A-Z]{1,5}$/, 'Invalid stock symbol'),
  getStockData
);
```

### 3. Redirect Loop Detection

Automatically tracks and prevents redirect loops:

```typescript
import { detectRedirectLoop } from './middleware/routingValidator';

// Apply globally (already done in initializeErrorHandling)
app.use(detectRedirectLoop({
  maxRedirects: 5  // Default is 5
}));

// Or apply to specific routes
router.use('/auth', detectRedirectLoop({ maxRedirects: 3 }), authRoutes);
```

**Features:**
- Tracks redirect count via `X-Redirect-Count` header
- Returns 508 error when limit exceeded
- Prevents redirects that would exceed limit

### 4. Enhanced 404 Handler

Provides helpful suggestions for missing routes:

```typescript
import { notFoundHandler } from './middleware/routingValidator';

// Applied automatically in applyErrorHandlingMiddleware
// Returns helpful suggestions like:
// - "Did you mean /api/auth/* ?"
// - "Try without trailing slash: GET /api/users/profile"
// - Available endpoints list
```

**Example Response:**
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Cannot GET /users/profile",
    "suggestions": [
      "Did you mean /api/users/* ?",
      "GET /api/users/profile"
    ],
    "timestamp": "2024-01-01T00:00:00.000Z",
    "requestId": "req_123456"
  }
}
```

## Loop Prevention Middleware

### 1. Request Depth Tracking

Prevents infinite loops by tracking middleware depth:

```typescript
import { requestDepthTracking } from './middleware/loopPrevention';

// Apply globally (already done in initializeErrorHandling)
app.use(requestDepthTracking({
  maxDepth: 10  // Default is 10
}));

// Or apply to specific routes
router.use('/api', requestDepthTracking({ maxDepth: 15 }));
```

**Features:**
- Tracks how many times middleware chain is executed
- Returns 508 error when depth exceeds limit
- Logs warning at 70% of limit

### 2. Circular Redirect Prevention

Detects and prevents circular redirects:

```typescript
import { circularRedirectPrevention } from './middleware/loopPrevention';

// Apply globally (already done in initializeErrorHandling)
app.use(circularRedirectPrevention());

// Tracks visited paths and prevents revisiting
// Example: /login -> /dashboard -> /login (BLOCKED)
```

**Features:**
- Tracks visited paths per request
- Prevents redirecting to already-visited path
- Returns 508 error for circular redirects

### 3. Middleware Execution Time Limit

Prevents middleware from running too long:

```typescript
import { middlewareExecutionTimeLimit } from './middleware/loopPrevention';

// Apply globally (already done in initializeErrorHandling)
app.use(middlewareExecutionTimeLimit({
  maxExecutionTime: 1000  // 1 second, default
}));

// Or apply to specific routes
router.use('/api', middlewareExecutionTimeLimit({ maxExecutionTime: 500 }));
```

**Features:**
- Tracks total middleware execution time
- Returns 508 error when time exceeds limit
- Logs warning at 80% of limit

### 4. Combined Loop Prevention

Apply all loop prevention mechanisms at once:

```typescript
import { loopPreventionMiddleware } from './middleware/loopPrevention';

// Apply all loop prevention (already done in initializeErrorHandling)
app.use(loopPreventionMiddleware({
  maxDepth: 10,
  maxExecutionTime: 1000
}));
```

## Error Responses

### Route Parameter Validation Error (400)
```json
{
  "error": {
    "code": "INVALID_PARAMETER",
    "message": "Invalid user ID format. Expected UUID.",
    "parameter": "userId",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "requestId": "req_123456"
  }
}
```

### Redirect Loop Detected (508)
```json
{
  "error": {
    "code": "REDIRECT_LOOP_DETECTED",
    "message": "Too many redirects (5). Possible infinite loop detected.",
    "maxRedirects": 5,
    "timestamp": "2024-01-01T00:00:00.000Z",
    "requestId": "req_123456"
  }
}
```

### Infinite Loop Detected (508)
```json
{
  "error": {
    "code": "INFINITE_LOOP_DETECTED",
    "message": "Request processing depth limit exceeded. Possible infinite loop in middleware.",
    "depth": 11,
    "maxDepth": 10,
    "timestamp": "2024-01-01T00:00:00.000Z",
    "requestId": "req_123456"
  }
}
```

### Circular Redirect (508)
```json
{
  "error": {
    "code": "CIRCULAR_REDIRECT",
    "message": "Circular redirect detected. The same path was visited multiple times.",
    "path": "GET:/login",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "requestId": "req_123456"
  }
}
```

### Middleware Timeout (508)
```json
{
  "error": {
    "code": "MIDDLEWARE_TIMEOUT",
    "message": "Middleware execution time limit exceeded. Possible infinite loop.",
    "elapsed": 1050,
    "maxExecutionTime": 1000,
    "timestamp": "2024-01-01T00:00:00.000Z",
    "requestId": "req_123456"
  }
}
```

## Best Practices

1. **Apply Early**: Loop prevention middleware should be applied early in the middleware chain
2. **Configure Limits**: Adjust limits based on your application's needs
3. **Monitor Logs**: Watch for warnings about approaching limits
4. **Test Redirects**: Test redirect flows to ensure they don't create loops
5. **Validate Parameters**: Always validate route parameters for security
6. **Use Helpful 404s**: The enhanced 404 handler helps users find correct endpoints

## Integration with Error Handling

All routing validation and loop prevention middleware is automatically integrated in `initializeErrorHandling()`:

```typescript
// In backend/src/config/initializeErrorHandling.ts
await initializeErrorHandling(app);  // Sets up all middleware
applyErrorHandlingMiddleware(app);   // Applies 404 and error handlers
```

## Testing

Test routing validation and loop prevention:

```typescript
// Test parameter validation
const response = await request(app)
  .get('/api/portfolio/invalid-uuid')
  .expect(400);

expect(response.body.error.code).toBe('INVALID_PARAMETER');

// Test redirect loop detection
const response = await request(app)
  .get('/redirect-loop')
  .set('X-Redirect-Count', '5')
  .expect(508);

expect(response.body.error.code).toBe('REDIRECT_LOOP_DETECTED');

// Test 404 with suggestions
const response = await request(app)
  .get('/users/profile')  // Missing /api prefix
  .expect(404);

expect(response.body.error.suggestions).toContain('Did you mean /api/users/* ?');
```

## Configuration

All configuration is centralized in `backend/src/config/initializeErrorHandling.ts`:

```typescript
// Loop prevention
loopPreventionMiddleware({
  maxDepth: 10,              // Maximum middleware depth
  maxExecutionTime: 1000     // Maximum middleware execution time (ms)
})

// Redirect loop detection
detectRedirectLoop({
  maxRedirects: 5            // Maximum redirects allowed
})
```

## Monitoring

All routing errors and loop detections are logged with structured data:

```typescript
logger.warn('Route parameter validation failed', undefined, {
  param: 'userId',
  value: 'invalid',
  path: '/api/portfolio/invalid',
  requestId: 'req_123456'
});

logger.error('Redirect loop detected', new Error('Too many redirects'), {
  path: '/login',
  redirectCount: 5,
  maxRedirects: 5,
  requestId: 'req_123456'
});
```

Monitor these logs to identify:
- Common parameter validation failures
- Redirect loop patterns
- Middleware depth issues
- Execution time problems
