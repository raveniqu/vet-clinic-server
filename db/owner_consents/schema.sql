-- =============================================================================
-- Table: owner_consents
-- Description: Stores PDPA consent tracking and immutable audit history for pet owners.
-- =============================================================================

CREATE TABLE owner_consents (
    id BIGSERIAL PRIMARY KEY,

    -- Foreign Key to owners table
    owner_id BIGINT NOT NULL REFERENCES owners (id) ON DELETE CASCADE,

    -- Consent Classification & Status
    type VARCHAR(50) NOT NULL,
    is_granted BOOLEAN NOT NULL DEFAULT FALSE,

    -- Capture Metadata & Audit
    consented_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Named CHECK constraints for ENUM-like fields
    CONSTRAINT chk_owner_consents_type CHECK (
        type IN ('PRIVACY_POLICY', 'MARKETING', 'APPOINTMENT', 'MEDIA', 'RESEARCH')
    )
);