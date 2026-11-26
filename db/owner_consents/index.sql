-- =============================================================================
-- Indexes
-- Optimizes audit log retrieval, latest consent lookups, and owner queries.
-- =============================================================================

-- Foreign key lookup index for querying consents by owner
CREATE INDEX IF NOT EXISTS idx_owner_consents_owner_id
    ON owner_consents (owner_id);

-- Composite index to rapidly retrieve the latest consent status per owner and type
CREATE INDEX IF NOT EXISTS idx_owner_consents_lookup_latest
    ON owner_consents (owner_id, type, consented_at DESC);

-- Index for filtering active granted consents by type (e.g. for marketing campaigns)
CREATE INDEX IF NOT EXISTS idx_owner_consents_type_granted
    ON owner_consents (type, is_granted)
    WHERE is_granted = TRUE;