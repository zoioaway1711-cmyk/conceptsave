CREATE TABLE IF NOT EXISTS rank_codes (
 profile_id TEXT NOT NULL REFERENCES customer_profiles(id),
 rank INTEGER NOT NULL CHECK(rank BETWEEN 2 AND 5),
 code TEXT NOT NULL UNIQUE,
 created_at TEXT NOT NULL,
 PRIMARY KEY(profile_id,rank)
);
