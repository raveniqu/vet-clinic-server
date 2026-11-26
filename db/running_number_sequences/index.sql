-- Index on sequence_date for date-based sequence queries and maintenance
CREATE INDEX IF NOT EXISTS idx_running_number_sequences_date
    ON running_number_sequences (sequence_date);