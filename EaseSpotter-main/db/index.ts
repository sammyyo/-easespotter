import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@db/schema";
import pg from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Create a new postgres client with the connection string
const client = postgres(process.env.DATABASE_URL);

// Create a Pool for session storage and other direct Postgres interactions
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

// Create the Drizzle DB instance with schema
export const db = drizzle(client, { schema });
