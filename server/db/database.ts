/**
 * Database Management Layer — ClipForge AI
 * PostgreSQL Connection Pooling, Automatic Schema Migrations, and Query Abstraction.
 */

import pg from 'pg';
import path from 'node:path';
import fs from 'node:fs';

const { Pool } = pg;

export class Database {
  private static pool: pg.Pool | null = null;
  private static isConnected = false;

  /**
   * Initializes PostgreSQL pool and runs startup migrations
   */
  public static async init(): Promise<boolean> {
    const connectionString =
      process.env.DATABASE_URL ||
      (process.env.PGHOST
        ? `postgresql://${process.env.PGUSER || 'postgres'}:${process.env.PGPASSWORD || ''}@${process.env.PGHOST}:${process.env.PGPORT || 5432}/${process.env.PGDATABASE || 'clipforge'}`
        : null);

    if (!connectionString) {
      console.log('[Database] No DATABASE_URL configured. Operating in high-speed resilient in-memory/file mode.');
      return false;
    }

    try {
      this.pool = new Pool({
        connectionString,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 4000,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
      });

      // Test connection
      const client = await this.pool.connect();
      client.release();
      this.isConnected = true;
      console.log('[Database] PostgreSQL Connection Pool established successfully.');

      // Run automatic schema migrations
      await this.runMigrations();
      return true;
    } catch (err: any) {
      console.warn('[Database] PostgreSQL connection failed. Falling back to local store:', err?.message || err);
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Runs SQL migration scripts on startup
   */
  public static async runMigrations(): Promise<void> {
    if (!this.pool || !this.isConnected) return;

    try {
      const migrationFile = path.join(process.cwd(), 'server', 'db', 'migrations', '001_initial_schema.sql');
      if (fs.existsSync(migrationFile)) {
        const sql = fs.readFileSync(migrationFile, 'utf8');
        await this.pool.query(sql);
        console.log('[Database] Migration 001_initial_schema.sql executed successfully.');
      }
    } catch (err) {
      console.error('[Database] Migration error:', err);
    }
  }

  /**
   * Executes a parameterized query against PostgreSQL
   */
  public static async query<T extends pg.QueryResultRow = any>(
    text: string,
    params?: any[]
  ): Promise<pg.QueryResult<T>> {
    if (!this.pool || !this.isConnected) {
      throw new Error('Database is not connected.');
    }
    return this.pool.query<T>(text, params);
  }

  /**
   * Checks connection health
   */
  public static isReady(): boolean {
    return this.isConnected && Boolean(this.pool);
  }

  /**
   * Gracefully shuts down connection pool
   */
  public static async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.isConnected = false;
      console.log('[Database] Connection pool closed.');
    }
  }
}
