CREATE TABLE IF NOT EXISTS users (
  id            bigserial PRIMARY KEY,
  phone         text NOT NULL UNIQUE,
  name          text NOT NULL DEFAULT '',
  pin_hash      text NOT NULL,
  recovery_hash text NOT NULL,
  prefs         jsonb NOT NULL DEFAULT '{}'::jsonb,
  failed_count  int NOT NULL DEFAULT 0,
  locked_until  timestamptz,
  session_ver   int NOT NULL DEFAULT 1,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);
CREATE TABLE IF NOT EXISTS scripts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      text NOT NULL DEFAULT 'Untitled script',
  body       text NOT NULL DEFAULT '',
  settings   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scripts_user_updated ON scripts(user_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS backgrounds (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       text NOT NULL DEFAULT 'Background',
  mime       text NOT NULL,
  data_b64   text NOT NULL,
  bytes      int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS backgrounds_user ON backgrounds(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS throttle (
  key          text PRIMARY KEY,
  count        int NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now()
);
