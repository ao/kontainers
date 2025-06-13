import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'path';
import fs from 'fs';

// Ensure data directory exists
const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Create SQLite database connection
const sqlite = new Database(path.join(DATA_DIR, 'kontainers.db'));
export const db = drizzle(sqlite, { schema });

// Run migrations on startup
export function initializeDatabase() {
  try {
    const MIGRATIONS_DIR = path.join(process.cwd(), 'drizzle');
    
    // Check if migrations directory exists
    if (fs.existsSync(MIGRATIONS_DIR)) {
      console.log('Running database migrations...');
      migrate(db, { migrationsFolder: MIGRATIONS_DIR });
      console.log('Database migrations completed successfully');
    } else {
      console.log('No migrations directory found. Skipping migrations.');
    }
    
    // Create admin user if no users exist
    const userCount = db.select().from(schema.users).all().length;
    if (userCount === 0) {
      console.log('Creating default admin user...');
      createDefaultAdminUser();
    }
  } catch (error) {
    console.error('Database initialization failed:', error);
    throw error;
  }
}

// Create default admin user
function createDefaultAdminUser() {
  // This will be implemented in the auth service
  // We'll just reference it here for now
}