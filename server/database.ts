import {
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
} from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";
import { postgresConfig } from "./postgres";
import type { Store } from "./store";
const globals = globalThis as unknown as {
  bonkersPool?: Pool;
  bonkersQueue?: Promise<unknown>;
};
export const emptyStore = (): Store => ({
  version: 1,
  accounts: {},
  tables: {},
  house: 100_000_000,
  initialSupply: 100_000_000,
  presence: {},
});
export async function transaction<T>(
  fn: (data: Store) => Promise<T> | T,
): Promise<T> {
  if ((process.env.APP_MODE ?? "demo") !== "demo")
    throw Error("Real-money mode is unavailable in this release.");
  const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
  if (connectionString) {
    globals.bonkersPool ??= new Pool({
      ...postgresConfig(connectionString),
      max: 1,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
    });
    const client = await globals.bonkersPool.connect();
    try {
      await client.query("begin");
      await client.query(
        "insert into bonkers_private.demo_state(id,state) values (1,$1) on conflict do nothing",
        [JSON.stringify(emptyStore())],
      );
      const result = await client.query(
        "select state from bonkers_private.demo_state where id=1 for update",
      );
      const data = result.rows[0].state as Store;
      const value = await fn(data);
      await client.query(
        "update bonkers_private.demo_state set state=$1,updated_at=now() where id=1",
        [JSON.stringify(data)],
      );
      await client.query("commit");
      return value;
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }
  }
  if (process.env.VERCEL)
    throw Error(
      "Connect a dedicated Supabase database and set POSTGRES_URL before using the shared demo.",
    );
  // Local fallback is only for a single Next.js process. Production requires Postgres.
  const task = (globals.bonkersQueue ?? Promise.resolve()).then(async () => {
    const dir = resolve(
      /* turbopackIgnore: true */ process.env.DATA_DIR ?? ".data",
    );
    mkdirSync(dir, { recursive: true });
    const path = resolve(dir, "state.json");
    const data: Store = existsSync(path)
      ? JSON.parse(readFileSync(path, "utf8"))
      : emptyStore();
    const value = await fn(data);
    writeFileSync(path + ".tmp", JSON.stringify(data), { mode: 0o600 });
    renameSync(path + ".tmp", path);
    return value;
  });
  globals.bonkersQueue = task.catch(() => {});
  return task;
}
