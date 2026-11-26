-- =============================================================================
-- Indexes
-- Enforces referential lookups and ensures single default address per owner.
-- =============================================================================

-- Foreign key lookup index for rapid owner address queries
CREATE INDEX IF NOT EXISTS idx_owner_addresses_owner_id
    ON owner_addresses (owner_id);

-- Partial unique index ensuring at most one default address per owner
CREATE UNIQUE INDEX IF NOT EXISTS uniq_owner_default_address
    ON owner_addresses (owner_id)
    WHERE is_default = TRUE AND deleted_at IS NULL;

-- Partial unique index ensuring at most one active address per type for each owner
CREATE UNIQUE INDEX IF NOT EXISTS uniq_owner_addresses_type_live
    ON owner_addresses (owner_id, type)
    WHERE deleted_at IS NULL;