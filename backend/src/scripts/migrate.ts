import { runMigrations, testConnection } from '../database/migrations';
import redisClient from '../config/redis';

async function migrate() {
  try {
    console.log('🚀 Starting database setup...');
    
    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected) {
      console.error('❌ Database connection failed. Please check your configuration.');
      process.exit(1);
    }
    
    // Test Redis connection
    try {
      await redisClient.connect();
      console.log('✅ Redis connection successful');
      await redisClient.disconnect();
    } catch (error) {
      console.error('❌ Redis connection failed:', error);
      console.log('⚠️  Continuing without Redis (caching will be disabled)');
    }
    
    // Run migrations
    await runMigrations();
    
    console.log('🎉 Database setup completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrate();