/**
 * Database Management Layer — ClipForge AI
 * Authoritative PostgreSQL Connection Pooling, Automatic Schema Migrations,
 * Transaction Support, and Query Abstraction for Cloud SQL / PostgreSQL.
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
    if (this.pool && this.isConnected) {
      return true;
    }

    try {
      let poolConfig: pg.PoolConfig;

      if (process.env.SQL_HOST) {
        // Google Cloud SQL configuration via Unix socket
        poolConfig = {
          host: process.env.SQL_HOST,
          user: process.env.SQL_USER,
          password: process.env.SQL_PASSWORD,
          database: process.env.SQL_DB_NAME,
          max: 20,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 10000,
          ssl: false,
        };
      } else if (process.env.DATABASE_URL) {
        poolConfig = {
          connectionString: process.env.DATABASE_URL,
          max: 20,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 10000,
          ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
        };
      } else if (process.env.PGHOST) {
        poolConfig = {
          host: process.env.PGHOST,
          port: parseInt(process.env.PGPORT || '5432', 10),
          user: process.env.PGUSER || 'postgres',
          password: process.env.PGPASSWORD || '',
          database: process.env.PGDATABASE || 'clipforge',
          max: 20,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 10000,
        };
      } else {
        console.warn('[Database] No PostgreSQL / Cloud SQL connection details configured in environment.');
        this.isConnected = false;
        return false;
      }

      this.pool = new Pool(poolConfig);

      this.pool.on('error', (err) => {
        console.error('[Database] Unexpected error on idle PostgreSQL pool client:', err);
      });

      // Verify connection with light query
      const client = await this.pool.connect();
      try {
        await client.query('SELECT 1;');
        this.isConnected = true;
        console.log('[Database] Authoritative PostgreSQL connection pool established successfully.');
      } finally {
        client.release();
      }

      // Run automatic schema migrations if directory exists and not on managed Cloud SQL
      if (!process.env.SQL_HOST) {
        await this.runMigrations();
      }
      return true;
    } catch (err: any) {
      console.error('[Database] PostgreSQL connection failed:', err?.message || err);
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
      const migrationsDir = path.join(process.cwd(), 'server', 'db', 'migrations');
      if (!fs.existsSync(migrationsDir)) return;

      const files = fs
        .readdirSync(migrationsDir)
        .filter((f) => f.endsWith('.sql'))
        .sort();

      for (const file of files) {
        const filePath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(filePath, 'utf8');
        await this.pool.query(sql);
        console.log(`[Database] Migration ${file} executed successfully.`);
      }
    } catch (err) {
      console.error('[Database] Migration error:', err);
      throw err;
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
      // Lazy attempt to initialize if not yet connected
      const ready = await this.init();
      if (!ready || !this.pool) {
        throw new Error('Database is not connected to PostgreSQL.');
      }
    }
    return this.pool.query<T>(text, params);
  }

  /**
   * Retrieves a client from the pool for manual transaction management
   */
  public static async getClient(): Promise<pg.PoolClient> {
    if (!this.pool || !this.isConnected) {
      const ready = await this.init();
      if (!ready || !this.pool) {
        throw new Error('Database is not connected to PostgreSQL.');
      }
    }
    return this.pool.connect();
  }

  /**
   * Executes a callback within a managed database transaction
   */
  public static async withTransaction<T>(
    callback: (client: pg.PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.getClient();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Checks connection health with a live query
   */
  public static async checkHealth(): Promise<boolean> {
    if (!this.pool || !this.isConnected) {
      return false;
    }
    try {
      await this.pool.query('SELECT 1;');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Synchronous ready flag
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
      this.pool = null;
      this.isConnected = false;
      console.log('[Database] Connection pool closed.');
    }
  }
}
