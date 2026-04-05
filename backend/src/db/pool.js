const { Pool } = require('pg');
require('dotenv').config();

// Parse DATABASE_URL into explicit fields so the OTel pg instrumentation
// correctly reports host/port in APM spans instead of defaulting to localhost
function parseDbUrl(url) {
  if (!url) return {};
  try {
    const u = new URL(url);
    return {
      host:     u.hostname,
      port:     parseInt(u.port || '5432', 10),
      database: u.pathname.replace(/^\//, ''),
      user:     u.username,
      password: decodeURIComponent(u.password),
    };
  } catch {
    return { connectionString: url };
  }
}

const pool = new Pool({
  ...parseDbUrl(process.env.DATABASE_URL || 'postgresql://careconnect:careconnect_dev@localhost:5432/careconnect'),
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

module.exports = pool;
