-- =============================================================================
-- Indexes
-- Enforces business uniqueness across live records while allowing re-registration
-- if an existing record has been soft-deleted (deleted_at IS NOT NULL).
-- =============================================================================

-- Unique business identifier for active owners
CREATE UNIQUE INDEX IF NOT EXISTS uniq_owners_code_live
    ON owners (code)
    WHERE deleted_at IS NULL;

-- Unique 13-digit National ID blind index hash for active individual owners
CREATE UNIQUE INDEX IF NOT EXISTS uniq_owners_tax_id_hash_live
    ON owners (tax_id_hash)
    WHERE deleted_at IS NULL;

-- Unique 13-digit Tax ID for active juristic owners
CREATE UNIQUE INDEX IF NOT EXISTS uniq_owners_tax_id_juristic_live
    ON owners (tax_id)
    WHERE deleted_at IS NULL AND type = 'JURISTIC';

-- Unique primary contact number for active owners
CREATE UNIQUE INDEX IF NOT EXISTS uniq_owners_phone_no_live
    ON owners (phone_no)
    WHERE deleted_at IS NULL;

-- Unique email for active owners (NULL values automatically skipped by B-tree)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_owners_email_live
    ON owners (email)
    WHERE deleted_at IS NULL;

-- Unique LINE ID for active owners
CREATE UNIQUE INDEX IF NOT EXISTS uniq_owners_line_id_live
    ON owners (line_id)
    WHERE deleted_at IS NULL;


-- Frequent search/filter columns
CREATE INDEX IF NOT EXISTS idx_owners_type
    ON owners (type);

CREATE INDEX IF NOT EXISTS idx_owners_acquisition_channel
    ON owners (acquisition_channel);

CREATE INDEX IF NOT EXISTS idx_owners_created_at
    ON owners (created_at DESC);