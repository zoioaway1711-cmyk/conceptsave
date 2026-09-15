CREATE TABLE IF NOT EXISTS customer_profiles (
 id TEXT PRIMARY KEY, first_seen TEXT NOT NULL, last_active TEXT NOT NULL,
 preferred_language TEXT NOT NULL DEFAULT 'pt', points INTEGER NOT NULL DEFAULT 0 CHECK(points>=0),
 level INTEGER NOT NULL DEFAULT 1 CHECK(level BETWEEN 1 AND 5), level_name TEXT NOT NULL DEFAULT 'Essencial',
 benefits_json TEXT NOT NULL DEFAULT '[]', consent_json TEXT NOT NULL DEFAULT '{}',
 serials_json TEXT NOT NULL DEFAULT '[]', revoked_serials_json TEXT NOT NULL DEFAULT '[]', verified_at_json TEXT NOT NULL DEFAULT '{}',
 rank_override INTEGER NOT NULL DEFAULT 0 CHECK(rank_override BETWEEN 0 AND 5), blocked INTEGER NOT NULL DEFAULT 0 CHECK(blocked IN(0,1))
);
CREATE TABLE IF NOT EXISTS product_serials (
 serial TEXT PRIMARY KEY CHECK(serial ~ '^(\d{5}|\d{6}|\d{8})$'), name TEXT NOT NULL, maker TEXT NOT NULL DEFAULT '',
 brand TEXT NOT NULL DEFAULT '', lot TEXT NOT NULL DEFAULT '', expiry TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL CHECK(status IN('authentic','invalid')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL DEFAULT 'admin'
);
CREATE TABLE IF NOT EXISTS serial_claims (
 serial TEXT PRIMARY KEY REFERENCES product_serials(serial), profile_id TEXT NOT NULL REFERENCES customer_profiles(id), activated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS serial_claims_profile_idx ON serial_claims(profile_id);
CREATE TABLE IF NOT EXISTS verification_events (
 id BIGSERIAL PRIMARY KEY, profile_id TEXT NOT NULL DEFAULT 'anonymous', serial TEXT NOT NULL DEFAULT '',
 product TEXT NOT NULL DEFAULT '', maker TEXT NOT NULL DEFAULT '', lot TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL, credited INTEGER NOT NULL DEFAULT 0, action TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'manual',
 ip TEXT NOT NULL DEFAULT '', country TEXT NOT NULL DEFAULT '', region TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '',
 latitude DOUBLE PRECISION, longitude DOUBLE PRECISION, geo_source TEXT NOT NULL DEFAULT 'unavailable',
 user_agent TEXT NOT NULL DEFAULT '', browser TEXT NOT NULL DEFAULT '', os TEXT NOT NULL DEFAULT '', device TEXT NOT NULL DEFAULT '',
 request_id TEXT NOT NULL DEFAULT '', host TEXT NOT NULL DEFAULT '', request_path TEXT NOT NULL DEFAULT '', referrer TEXT NOT NULL DEFAULT '',
 metadata_json TEXT NOT NULL DEFAULT '{}', activated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS verification_date_idx ON verification_events(activated_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS verification_profile_date_idx ON verification_events(profile_id,activated_at DESC);
CREATE INDEX IF NOT EXISTS verification_serial_date_idx ON verification_events(serial,activated_at DESC);
CREATE INDEX IF NOT EXISTS verification_ip_date_idx ON verification_events(ip,activated_at DESC);
CREATE INDEX IF NOT EXISTS verification_location_idx ON verification_events(country,region,city);
CREATE TABLE IF NOT EXISTS admin_audit_events (
 id BIGSERIAL PRIMARY KEY, action TEXT NOT NULL, target_type TEXT NOT NULL DEFAULT 'system', target_id TEXT NOT NULL DEFAULT '',
 details_json TEXT NOT NULL DEFAULT '{}', ip TEXT NOT NULL DEFAULT '', user_agent TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS admin_audit_date_idx ON admin_audit_events(created_at DESC);
CREATE TABLE IF NOT EXISTS admin_login_limits (id TEXT PRIMARY KEY, attempts INTEGER NOT NULL DEFAULT 0, expires_at BIGINT NOT NULL);
CREATE INDEX IF NOT EXISTS admin_login_limits_expiry_idx ON admin_login_limits(expires_at);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, role TEXT NOT NULL CHECK(role IN('admin','customer')), profile_id TEXT,
 expires_at BIGINT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS benefit_claims (
 profile_id TEXT NOT NULL REFERENCES customer_profiles(id), threshold INTEGER NOT NULL CHECK(threshold IN(3,5,10)),
 code TEXT NOT NULL UNIQUE, title TEXT NOT NULL, activated_at TEXT NOT NULL, PRIMARY KEY(profile_id,threshold)
);
