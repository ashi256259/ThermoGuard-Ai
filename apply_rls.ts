import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
  });
  try {
    await pool.query(`
      ALTER TABLE industrial_facilities ENABLE ROW LEVEL SECURITY;
      ALTER TABLE thermal_events ENABLE ROW LEVEL SECURITY;
      ALTER TABLE geo_context ENABLE ROW LEVEL SECURITY;
      ALTER TABLE temporal_profiles ENABLE ROW LEVEL SECURITY;
      ALTER TABLE classifications ENABLE ROW LEVEL SECURITY;
      ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
    `);
    
    const tables = ['industrial_facilities', 'thermal_events', 'geo_context', 'temporal_profiles', 'classifications', 'alerts'];
    for (const t of tables) {
      await pool.query(`DROP POLICY IF EXISTS "Allow all for backend" ON ${t}`);
      await pool.query(`CREATE POLICY "Allow all for backend" ON ${t} FOR ALL USING (true) WITH CHECK (true)`);
    }
    console.log("RLS applied successfully.");
  } catch(e: any) {
    console.error("Error applying RLS:", e.message);
  } finally {
    await pool.end();
  }
}
run();
