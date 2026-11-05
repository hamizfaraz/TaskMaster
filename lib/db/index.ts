import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzleNeonHttp } from "drizzle-orm/neon-http";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { createRetryingFetch } from "./retry";

export type DatabaseDriver = "neon-http" | "pg";

const DEFAULT_DRIVER: DatabaseDriver = "neon-http";
const dbDriver: DatabaseDriver =
  process.env.DB_DRIVER === "pg" ? "pg" : DEFAULT_DRIVER;
const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/taskmaster";

if (!process.env.DATABASE_URL && process.env.NODE_ENV === "production") {
  throw new Error("DATABASE_URL is required in production.");
}

type DrizzleDb =
  | ReturnType<typeof drizzleNodePg<typeof schema>>
  | ReturnType<typeof drizzleNeonHttp<typeof schema>>;

declare global {
  var __db: DrizzleDb | undefined;
}

const createDb = (): DrizzleDb => {
  if (dbDriver === "pg") {
    const pool = new Pool({ connectionString: databaseUrl });
    return drizzleNodePg({ client: pool, schema });
  }

  // Neon computes auto-suspend when idle, and a request that arrives while one
  // wakes can fail outright. Retrying reads at the HTTP layer turns that from a
  // hard error into a brief stall. Set on neonConfig because `neon()` takes no
  // per-client fetch override; this is the only place a client is constructed.
  neonConfig.fetchFunction = createRetryingFetch();

  const client = neon(databaseUrl);
  return drizzleNeonHttp({ client, schema });
};

const getDb = (): DrizzleDb => {
  if (process.env.NODE_ENV !== "production") {
    if (!globalThis.__db) {
      globalThis.__db = createDb();
    }
    return globalThis.__db;
  }
  return createDb();
};

export const db = getDb();

export { dbDriver, schema };
