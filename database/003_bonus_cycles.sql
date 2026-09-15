ALTER TABLE benefit_claims ADD COLUMN rank INTEGER NOT NULL DEFAULT 1 CHECK(rank BETWEEN 1 AND 5);
ALTER TABLE benefit_claims ADD COLUMN redeemed_at TEXT;
ALTER TABLE benefit_claims DROP CONSTRAINT benefit_claims_pkey;
ALTER TABLE benefit_claims ADD PRIMARY KEY(profile_id,rank,threshold);
