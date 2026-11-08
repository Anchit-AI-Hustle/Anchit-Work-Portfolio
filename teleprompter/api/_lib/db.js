// Neon serverless (HTTP) driver. One query per call; no pooled connections to leak on serverless.
import { neon } from '@neondatabase/serverless';

let _sql = null;
export function sql() {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw Object.assign(new Error('DATABASE_URL not set'), { status: 500, public: 'Server is not configured' });
    _sql = neon(url, { fetchOptions: globalThis.__neonFetchOptions || {} });
  }
  return _sql;
}

// q('select ... where id=$1', [id]) -> rows
export async function q(text, params = []) {
  return sql()(text, params);
}
export async function one(text, params = []) {
  const rows = await q(text, params);
  return rows[0] || null;
}
