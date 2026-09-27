import { Database } from '../db/database.ts';
import { UserItem } from '../db/store.ts';

export class UserRepository {
  public static mapRow(row: any): UserItem {
    return {
      id: row.id,
      email: row.email,
      fullName: row.full_name || '',
      avatarUrl: row.avatar_url || undefined,
      role: row.role || 'creator',
      planTier: row.plan_tier || 'free',
      passwordHash: row.password_hash || undefined,
    };
  }

  public static async findById(id: string): Promise<UserItem | null> {
    const res = await Database.query('SELECT * FROM users WHERE id = $1 LIMIT 1;', [id]);
    if (res.rows.length === 0) return null;
    return this.mapRow(res.rows[0]);
  }

  public static async findByEmail(email: string): Promise<UserItem | null> {
    const res = await Database.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1;', [email]);
    if (res.rows.length === 0) return null;
    return this.mapRow(res.rows[0]);
  }

  public static async create(user: UserItem): Promise<UserItem> {
    const sql = `
      INSERT INTO users (
        id, email, password_hash, full_name, avatar_url, role, plan_tier, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        password_hash = COALESCE(EXCLUDED.password_hash, users.password_hash),
        full_name = EXCLUDED.full_name,
        avatar_url = EXCLUDED.avatar_url,
        role = EXCLUDED.role,
        plan_tier = EXCLUDED.plan_tier,
        updated_at = NOW()
      RETURNING *;
    `;
    const params = [
      user.id,
      user.email.toLowerCase(),
      user.passwordHash || null,
      user.fullName || '',
      user.avatarUrl || null,
      user.role || 'creator',
      user.planTier || 'free',
    ];
    const res = await Database.query(sql, params);
    return this.mapRow(res.rows[0]);
  }

  public static async list(): Promise<UserItem[]> {
    const res = await Database.query('SELECT * FROM users ORDER BY created_at ASC;');
    return res.rows.map(this.mapRow);
  }
}
