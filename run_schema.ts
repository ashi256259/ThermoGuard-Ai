import { Pool } from 'pg';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
  });
  try {
    const schema = fs.readFileSync('database/schema.sql', 'utf8');
    await pool.query(schema);
    console.log("Schema applied successfully.");
  } catch(e: any) {
    console.error("Error applying schema:", e.message);
  } finally {
    await pool.end();
  }
}
run();
