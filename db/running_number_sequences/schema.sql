-- =============================================================================
-- Table: running_number_sequences
-- Description: Stores daily running sequence counters for formatted business codes (e.g., OWN-YYYYMMDD-NNNN).
-- =============================================================================
CREATE TABLE running_number_sequences (
    prefix VARCHAR(20) NOT NULL,
    sequence_date DATE NOT NULL,
    last_number BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT pk_running_number_sequences PRIMARY KEY (prefix, sequence_date)
);