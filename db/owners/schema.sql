-- =============================================================================
-- Table: owners
-- Description: Stores individual and juristic pet owners / clients.
-- =============================================================================

CREATE TABLE owners (
    id BIGSERIAL PRIMARY KEY,

    -- Business Identifier
    code VARCHAR(30) NOT NULL,

    -- Entity Classification
    type VARCHAR(50) NOT NULL,
    prefix VARCHAR(50) NOT NULL,

    -- Owner / Organization Name
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(100),

    -- Identification
    tax_id TEXT NOT NULL,
    tax_id_hash TEXT,
    date_of_birth DATE,
    gender VARCHAR(50),

    -- Contact Information
    -- Uniqueness enforced on active (live) records via partial indexes below
    phone_no VARCHAR(30) NOT NULL,
    email VARCHAR(255),
    line_id VARCHAR(100),

    -- Marketing & Acquisition
    acquisition_channel VARCHAR(50) NOT NULL,

    -- Audit Fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,

    -- Named CHECK constraints for ENUM-like fields
    CONSTRAINT chk_owners_type CHECK (
        type IN ('INDIVIDUAL', 'JURISTIC')
    ),
    CONSTRAINT chk_owners_prefix CHECK (
        prefix IN ('MR', 'MS', 'MRS', 'COMMERCIAL', 'NON_PROFIT', 'OTHER')
    ),
    CONSTRAINT chk_owners_gender CHECK (
        gender IN ('MALE', 'FEMALE', 'OTHER')
    ),
    CONSTRAINT chk_owners_acquisition_channel CHECK (
        acquisition_channel IN ('WALK_IN', 'LINE_OA', 'WEB_PORTAL', 'REFERRAL', 'SOCIAL_MEDIA', 'CAMPAIGN')
    ),
    CONSTRAINT chk_owners_individual_fields CHECK (type <> 'INDIVIDUAL' OR (prefix IN ('MR', 'MS', 'MRS') AND tax_id_hash IS NOT NULL)),
    CONSTRAINT chk_owners_juristic_fields CHECK (type <> 'JURISTIC' OR (prefix IN ('COMMERCIAL', 'NON_PROFIT', 'OTHER') AND last_name IS NULL AND tax_id_hash IS NULL AND date_of_birth IS NULL AND gender IS NULL))
);