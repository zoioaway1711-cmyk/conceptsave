CREATE TABLE IF NOT EXISTS admin_login_limits (
  id TEXT PRIMARY KEY NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS admin_login_limits_expiry_idx ON admin_login_limits (expires_at);
