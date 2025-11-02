import { testConnection } from '../database/migrations';
import redisClient from '../config/redis';

async function testDatabaseConnections() {
  console.log('🔍 Testing database connections...');
  
  // Test PostgreSQL
  const pgConnected = await testConnection();
  
  // Test Redis
  let redisConnected = false;
  try {
    await redisClient.connect();
    await redisClient.ping();
    redisConnected = true;
    console.log('✅ Redis connection successful');
    await redisClient.disconnect();
  } catch (error) {
    console.error('❌ Redis connection failed:', error);
  }
  
  console.log('\n📊 Connection Summary:');
  console.log(`PostgreSQL: ${pgConnected ? '✅ Connected' : '❌ Failed'}`);
  console.log(`Redis: ${redisConnected ? '✅ Connected' : '❌ Failed'}`);
  
  if (pgConnected && redisConnected) {
    console.log('\n🎉 All database connections successful!');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some connections failed. Check your configuration.');
    process.exit(1);
  }
}

testDatabaseConnections();