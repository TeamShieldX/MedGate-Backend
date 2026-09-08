const { pool } = require('./index');

async function testConnection() {
  try {
    const res = await pool.query('SELECT NOW() as current_time, current_database() as db_name, version()');
    console.log(' Successfully connected to Neon Postgres database!');
    console.log(`Database Name: ${res.rows[0].db_name}`);
    console.log(`Server Time:   ${res.rows[0].current_time}`);
    console.log(`Postgres Ver:  ${res.rows[0].version.split(',')[0]}`);
  } catch (err) {
    console.error(' Database Connection Failed:');
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

testConnection();
