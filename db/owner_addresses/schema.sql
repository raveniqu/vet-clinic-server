-- =============================================================================
-- Table: owner_addresses
-- Description: Stores physical, residential, and billing addresses for pet owners.
-- =============================================================================

CREATE TABLE owner_addresses (
    id BIGSERIAL PRIMARY KEY,

    -- Foreign Key to owners table
    owner_id BIGINT NOT NULL REFERENCES owners (id) ON DELETE CASCADE,

    -- Address Classification & Preferences
    type VARCHAR(50) NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,

    -- Street Address Information
    address_line VARCHAR(255) NOT NULL,

    -- Administrative Area Hierarchy (Thailand)
    subdistrict VARCHAR(100) NOT NULL,
    district VARCHAR(100) NOT NULL,
    province VARCHAR(100) NOT NULL,
    postal_code VARCHAR(10) NOT NULL,

    -- Audit Fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,

    -- Named CHECK constraints for ENUM-like fields
    CONSTRAINT chk_owner_addresses_type CHECK (
        type IN ('RESIDENTIAL', 'BILLING')
    )
);