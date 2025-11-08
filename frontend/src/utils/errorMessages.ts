/**
 * Maps common error scenarios to user-friendly messages
 */
export const getErrorMessage = (error: any): string => {
  // Handle axios errors
  if (error.response) {
    const status = error.response.status;
    const message = error.response.data?.error?.message;

    switch (status) {
      case 400:
        return message || 'Invalid request. Please check your input and try again.';
      case 401:
        return 'Your session has expired. Please log in again.';
      case 403:
        return 'You do not have permission to perform this action.';
      case 404:
        return message || 'The requested resource was not found.';
      case 409:
        return message || 'This action conflicts with existing data.';
      case 422:
        return message || 'The data provided is invalid.';
      case 429:
        return 'Too many requests. Please wait a moment and try again.';
      case 500:
        return 'A server error occurred. Please try again later.';
      case 503:
        return 'The service is temporarily unavailable. Please try again later.';
      default:
        return message || `An error occurred (${status}). Please try again.`;
    }
  }

  // Handle network errors
  if (error.request) {
    if (!navigator.onLine) {
      return 'You appear to be offline. Please check your internet connection.';
    }
    return 'Unable to connect to the server. Please check your connection and try again.';
  }

  // Handle validation errors
  if (error.message) {
    const msg = error.message.toLowerCase();
    
    if (msg.includes('invalid stock symbol')) {
      return 'The stock symbol you entered is invalid. Please check and try again.';
    }
    if (msg.includes('duplicate')) {
      return 'This item already exists in your portfolio or watchlist.';
    }
    if (msg.includes('limit exceeded')) {
      return 'You have reached the maximum limit for this feature.';
    }
    if (msg.includes('required')) {
      return 'Please fill in all required fields.';
    }
    
    return error.message;
  }

  return 'An unexpected error occurred. Please try again.';
};

/**
 * Error messages for specific features
 */
export const ErrorMessages = {
  portfolio: {
    loadFailed: 'Failed to load your portfolio. Please refresh the page.',
    addPositionFailed: 'Failed to add stock position. Please try again.',
    updatePositionFailed: 'Failed to update stock position. Please try again.',
    removePositionFailed: 'Failed to remove stock position. Please try again.',
    invalidSymbol: 'Invalid stock symbol. Please enter a valid ticker symbol.',
    duplicatePosition: 'This stock is already in your portfolio.',
  },
  watchlist: {
    loadFailed: 'Failed to load your watchlist. Please refresh the page.',
    addFailed: 'Failed to add stock to watchlist. Please try again.',
    removeFailed: 'Failed to remove stock from watchlist. Please try again.',
    limitExceeded: 'You have reached the maximum of 50 stocks in your watchlist.',
    duplicateStock: 'This stock is already in your watchlist.',
  },
  market: {
    quoteFailed: 'Failed to fetch stock quote. Please try again.',
    searchFailed: 'Failed to search for stocks. Please try again.',
    historyFailed: 'Failed to load historical data. Please try again.',
    rateLimitExceeded: 'Too many requests to market data provider. Please wait a moment.',
  },
  auth: {
    loginFailed: 'Login failed. Please check your credentials and try again.',
    registerFailed: 'Registration failed. Please try again.',
    sessionExpired: 'Your session has expired. Please log in again.',
    unauthorized: 'You are not authorized to perform this action.',
  },
  network: {
    offline: 'You are currently offline. Please check your internet connection.',
    timeout: 'The request timed out. Please try again.',
    serverError: 'A server error occurred. Please try again later.',
  },
};

/**
 * Success messages for user actions
 */
export const SuccessMessages = {
  portfolio: {
    positionAdded: 'Stock position added successfully!',
    positionUpdated: 'Stock position updated successfully!',
    positionRemoved: 'Stock position removed successfully!',
  },
  watchlist: {
    stockAdded: 'Stock added to watchlist!',
    stockRemoved: 'Stock removed from watchlist!',
  },
  auth: {
    loginSuccess: 'Welcome back!',
    registerSuccess: 'Account created successfully!',
    logoutSuccess: 'You have been logged out.',
    profileUpdated: 'Profile updated successfully!',
  },
};
