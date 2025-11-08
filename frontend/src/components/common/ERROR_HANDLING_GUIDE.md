# Error Handling and Loading States Guide

This guide explains how to use the comprehensive error handling and loading state components in the application.

## Components

### 1. ErrorBoundary
Catches React component errors and displays a fallback UI.

**Usage:**
```tsx
import { ErrorBoundary } from './components/common';

<ErrorBoundary onReset={() => console.log('Reset')}>
  <YourComponent />
</ErrorBoundary>
```

**Props:**
- `children`: React components to wrap
- `fallback?`: Custom fallback UI (optional)
- `onReset?`: Callback when user clicks "Try Again" (optional)

### 2. LoadingSpinner
Displays a loading spinner with optional message.

**Usage:**
```tsx
import { LoadingSpinner } from './components/common';

<LoadingSpinner message="Loading data..." size={40} fullScreen={false} />
```

**Props:**
- `message?`: Loading message (default: "Loading...")
- `size?`: Spinner size in pixels (default: 40)
- `fullScreen?`: Whether to center in full viewport (default: false)

### 3. SkeletonLoader
Displays skeleton screens for different content types.

**Usage:**
```tsx
import { SkeletonLoader } from './components/common';

<SkeletonLoader variant="dashboard" />
<SkeletonLoader variant="portfolio" count={3} />
<SkeletonLoader variant="watchlist" count={5} />
<SkeletonLoader variant="chart" />
<SkeletonLoader variant="card" />
```

**Props:**
- `variant?`: Type of skeleton ('dashboard' | 'portfolio' | 'watchlist' | 'chart' | 'card')
- `count?`: Number of items to show (default: 1)

### 4. ErrorDisplay
Displays error messages with retry functionality.

**Usage:**
```tsx
import { ErrorDisplay } from './components/common';

<ErrorDisplay 
  error={error}
  title="Failed to load data"
  onRetry={() => refetch()}
  showDetails={true}
  severity="error"
/>
```

**Props:**
- `error`: Error object or string
- `title?`: Error title (default: "Error")
- `onRetry?`: Retry callback (optional)
- `showDetails?`: Show error stack trace (default: false)
- `severity?`: Alert severity ('error' | 'warning' | 'info')

### 5. OfflineIndicator
Automatically detects and displays offline status.

**Usage:**
```tsx
import { OfflineIndicator } from './components/common';

// Add once at app level (already added in App.tsx)
<OfflineIndicator />
```

## Hooks

### 1. useRetry
Provides retry logic for async operations with exponential backoff.

**Usage:**
```tsx
import { useRetry } from '../../hooks/useRetry';

const { execute, isRetrying, attemptCount, error, reset } = useRetry(
  async () => await fetchData(),
  { maxAttempts: 3, delayMs: 1000, backoffMultiplier: 2 }
);

// Execute with retry
const result = await execute();
```

**Options:**
- `maxAttempts?`: Maximum retry attempts (default: 3)
- `delayMs?`: Initial delay in milliseconds (default: 1000)
- `backoffMultiplier?`: Backoff multiplier (default: 2)

**Returns:**
- `execute()`: Execute the async function with retry
- `reset()`: Reset retry state
- `isRetrying`: Whether currently retrying
- `attemptCount`: Current attempt number
- `error`: Last error encountered

### 2. useOnlineStatus
Detects online/offline status.

**Usage:**
```tsx
import { useOnlineStatus } from '../../hooks/useOnlineStatus';

const { isOnline, wasOffline } = useOnlineStatus();

if (!isOnline) {
  return <div>You are offline</div>;
}
```

**Returns:**
- `isOnline`: Current online status
- `wasOffline`: Whether user was previously offline

### 3. useToast
Displays toast notifications for user feedback.

**Usage:**
```tsx
import { useToast } from '../../contexts/ToastContext';

const { showSuccess, showError, showWarning, showInfo } = useToast();

// Show notifications
showSuccess('Position added successfully!');
showError('Failed to load data');
showWarning('Connection unstable');
showInfo('Market is closed');
```

**Methods:**
- `showToast(message, severity?, duration?)`: Generic toast
- `showSuccess(message)`: Success toast
- `showError(message)`: Error toast (8s duration)
- `showWarning(message)`: Warning toast
- `showInfo(message)`: Info toast

## Utilities

### getErrorMessage
Converts errors to user-friendly messages.

**Usage:**
```tsx
import { getErrorMessage } from '../../utils/errorMessages';

try {
  await apiCall();
} catch (error) {
  const message = getErrorMessage(error);
  showError(message);
}
```

### ErrorMessages & SuccessMessages
Predefined messages for common scenarios.

**Usage:**
```tsx
import { ErrorMessages, SuccessMessages } from '../../utils/errorMessages';

showError(ErrorMessages.portfolio.addPositionFailed);
showSuccess(SuccessMessages.portfolio.positionAdded);
```

## Best Practices

1. **Always wrap async operations with try-catch**
   ```tsx
   try {
     const data = await fetchData();
   } catch (error) {
     showError(getErrorMessage(error));
   }
   ```

2. **Use skeleton loaders for better UX**
   ```tsx
   if (isLoading) {
     return <SkeletonLoader variant="portfolio" count={3} />;
   }
   ```

3. **Provide retry functionality for failed operations**
   ```tsx
   <ErrorDisplay 
     error={error}
     onRetry={() => refetch()}
   />
   ```

4. **Show success feedback for user actions**
   ```tsx
   const handleAddPosition = async () => {
     try {
       await addPosition(data);
       showSuccess(SuccessMessages.portfolio.positionAdded);
     } catch (error) {
       showError(getErrorMessage(error));
     }
   };
   ```

5. **Use ErrorBoundary for component-level error isolation**
   ```tsx
   <ErrorBoundary>
     <ComplexComponent />
   </ErrorBoundary>
   ```

## Example: Complete Component with Error Handling

```tsx
import React from 'react';
import { ErrorDisplay, SkeletonLoader } from '../common';
import { useToast } from '../../contexts/ToastContext';
import { getErrorMessage, SuccessMessages } from '../../utils/errorMessages';

const MyComponent: React.FC = () => {
  const { data, isLoading, error, refetch } = useData();
  const { showSuccess, showError } = useToast();

  const handleAction = async () => {
    try {
      await performAction();
      showSuccess(SuccessMessages.portfolio.positionAdded);
    } catch (error) {
      showError(getErrorMessage(error));
    }
  };

  if (isLoading) {
    return <SkeletonLoader variant="portfolio" count={3} />;
  }

  if (error) {
    return (
      <ErrorDisplay 
        error={error}
        title="Failed to load data"
        onRetry={() => refetch()}
      />
    );
  }

  return <div>{/* Your component content */}</div>;
};
```
