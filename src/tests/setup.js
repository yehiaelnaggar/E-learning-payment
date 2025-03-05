// Initialize test environment
require('dotenv').config({ path: '.env.test' });

const { execSync } = require('child_process');
const { v4: uuid } = require('uuid');

// Generate unique schema for test isolation
const schema = `test_${uuid().replace(/-/g, '_')}`;
process.env.DATABASE_URL = `${process.env.DATABASE_URL}?schema=${schema}`;

module.exports = async () => {
  // Create schema and run migrations
  execSync(`npx prisma migrate deploy`, { stdio: 'inherit' });
};
