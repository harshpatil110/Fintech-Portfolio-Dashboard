# Fintech Portfolio Dashboard

A comprehensive web application for managing investment portfolios, tracking stock positions, and monitoring financial performance.

## Features

- 📊 Real-time portfolio tracking
- 📈 Live market data integration
- 👀 Stock watchlist management
- 📱 Responsive design for mobile and desktop
- 🔐 Secure user authentication
- 📊 Performance analytics and charts

## Tech Stack

### Frontend
- React 18 with TypeScript
- Vite for fast development
- Material-UI for components
- Chart.js for data visualization
- React Query for state management

### Backend
- Node.js with Express
- TypeScript
- PostgreSQL database
- Redis for caching
- JWT authentication

## Prerequisites

Before running this application, make sure you have the following installed:

- Node.js (v18 or higher)
- PostgreSQL (v13 or higher)
- Redis (v6 or higher)
- npm or yarn

## Quick Start

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd fintech-portfolio-dashboard
   ```

2. **Install dependencies**
   ```bash
   npm run install:all
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your database and API credentials
   ```

4. **Set up the database**
   - Create a PostgreSQL database named `fintech_portfolio`
   - Update database credentials in `.env`
   - Run migrations:
     ```bash
     npm run setup:db
     ```

5. **Start Redis server**
   ```bash
   redis-server
   ```

6. **Start the development servers**
   ```bash
   npm run dev
   ```

   This will start:
   - Frontend on http://localhost:3000
   - Backend API on http://localhost:5000

## Development Scripts

- `npm run dev` - Start both frontend and backend in development mode
- `npm run dev:frontend` - Start only the frontend
- `npm run dev:backend` - Start only the backend
- `npm run build` - Build both frontend and backend for production
- `npm run test` - Run tests for both frontend and backend
- `npm run lint` - Run linting for both frontend and backend

## Environment Variables

Copy `.env.example` to `.env` and configure the following:

### Database
- `DB_HOST` - PostgreSQL host (default: localhost)
- `DB_PORT` - PostgreSQL port (default: 5432)
- `DB_NAME` - Database name (default: fintech_portfolio)
- `DB_USER` - Database username
- `DB_PASSWORD` - Database password

### Redis
- `REDIS_URL` - Redis connection URL (default: redis://localhost:6379)

### Authentication
- `JWT_SECRET` - Secret key for JWT tokens
- `JWT_EXPIRES_IN` - Token expiration time (default: 24h)

### Market Data
Choose one of the following providers and set the appropriate API key:
- `ALPHA_VANTAGE_API_KEY` - Alpha Vantage API key
- `IEX_CLOUD_API_KEY` - IEX Cloud API key
- `POLYGON_API_KEY` - Polygon.io API key

## API Documentation

The API will be available at `http://localhost:5000/api` when running in development mode.

### Health Check
- `GET /health` - Check API status

## Database Schema

The application uses PostgreSQL with the following main tables:
- `users` - User accounts and authentication
- `portfolios` - User portfolios
- `stock_positions` - Individual stock holdings
- `watchlists` - Stocks users are monitoring
- `market_data` - Cached market data
- `historical_prices` - Historical price data

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.