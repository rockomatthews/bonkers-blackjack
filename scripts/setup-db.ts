import { readFileSync } from "node:fs";
import { Pool } from "pg";
const url = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!url)
  throw Error("Set POSTGRES_URL to the dedicated Bonkers Blackjack database.");
const pool = new Pool({ connectionString: url, max: 1 });
try {
  await pool.query(readFileSync("database/schema.sql", "utf8"));
  const result = await pool.query(
    "select relrowsecurity from pg_class where oid='bonkers_private.demo_state'::regclass",
  );
  if (!result.rows[0]?.relrowsecurity) throw Error("RLS is not enabled");
  console.log("Schema applied; RLS enabled.");
} finally {
  await pool.end();
}
