import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { userStoreSessions, userBookmarks } from './db/schema';
import { sql } from 'drizzle-orm';

async function createQrCodeTables() {
  console.log('Starting QR code tables creation...');
  
  // Connection string from environment variables
  const connectionString = process.env.DATABASE_URL!;
  if (!connectionString) {
    console.error('DATABASE_URL environment variable is required');
    process.exit(1);
  }

  // Create a client for running SQL queries
  const client = postgres(connectionString);
  const db = drizzle(client);

  try {
    // Check if the user store sessions table exists
    const userStoreSessionsCheck = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'user_store_sessions'
      );
    `);

    const userBookmarksCheck = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'user_bookmarks'
      );
    `);

    // Create user store sessions table if it doesn't exist
    if (!userStoreSessionsCheck[0].exists) {
      console.log('Creating user_store_sessions table...');
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS user_store_sessions (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id),
          store_id INTEGER NOT NULL REFERENCES vendors(id),
          visit_date TIMESTAMP NOT NULL DEFAULT NOW(),
          visit_count INTEGER NOT NULL DEFAULT 1,
          last_visit TIMESTAMP NOT NULL DEFAULT NOW()
        );
      `);
      console.log('Successfully created user_store_sessions table');
    } else {
      console.log('user_store_sessions table already exists');
    }

    // Create user bookmarks table if it doesn't exist
    if (!userBookmarksCheck[0].exists) {
      console.log('Creating user_bookmarks table...');
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS user_bookmarks (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id),
          product_id INTEGER NOT NULL REFERENCES products(id),
          vendor_id INTEGER NOT NULL REFERENCES vendors(id),
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          notes TEXT,
          metadata JSONB
        );
      `);
      console.log('Successfully created user_bookmarks table');
    } else {
      console.log('user_bookmarks table already exists');
    }

    console.log('QR code tables creation completed successfully');
  } catch (error) {
    console.error('Error creating QR code tables:', error);
  } finally {
    // Close the client connection
    await client.end();
  }
}

// Execute the function
createQrCodeTables().catch(console.error);

Would you like me to draft similar prompts for **bookmark syncing**, **store scan history**, or **authentication for store owners** next?
