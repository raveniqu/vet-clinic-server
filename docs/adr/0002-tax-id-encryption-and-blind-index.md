---
status: accepted
date: 2026-11-28
---

# Encrypt individual tax IDs with versioned AES-256-GCM and a separate HMAC-SHA256 blind index

Individual owners' 13-digit `tax_id` (Thai National ID) is PII stored encrypted in `owners.tax_id` using `AES-256-GCM` with a random 12-byte IV per write, formatted as `v1:<base64(12B-iv || 16B-authTag || ciphertext)>`. Uniqueness and exact-match search on individual `tax_id` use a deterministic `HMAC-SHA256` blind index stored as lowercase 64-char hex in `owners.tax_id_hash` (indexed by `uniq_owners_tax_id_hash_live`). Juristic owners' 13-digit registration number is public corporate data, stored plaintext in `owners.tax_id` with `tax_id_hash = NULL` (indexed by `uniq_owners_tax_id_juristic_live`).

Key material is split into two separate base64 environment secrets validated at startup in `src/shared/config/env.ts`: `TAX_ID_ENCRYPTION_KEY` (exact 32 decoded bytes) and `TAX_ID_HMAC_KEY` (at least 32 decoded bytes).

## Considered options

- **Single master key with HKDF derivation.** Rejected: two explicit env secrets keep key separation obvious and allow rotating the encryption key independently of the blind-index key without changing derivation logic.
- **Unversioned raw base64 ciphertext.** Rejected: without a `v1:` prefix, rotating keys or algorithms later would require a separate schema column or trial-decryption across keys.
- **Deterministic encryption (AES-SIV) for both storage and uniqueness.** Rejected: leaks ciphertext equality without a separate HMAC boundary and lacks native WebCrypto/Node `crypto` support compared to AES-256-GCM + HMAC-SHA256.

## Consequences

- Every environment (`.env.local`, Dokploy DEV, Production) must supply `TAX_ID_ENCRYPTION_KEY` and `TAX_ID_HMAC_KEY` before startup.
- Rotating `TAX_ID_ENCRYPTION_KEY` can introduce a `v2:` prefix and re-encrypt rows lazily or in a batch job.
- Rotating `TAX_ID_HMAC_KEY` requires recomputing `owners.tax_id_hash` across all active individual rows to preserve uniqueness and exact-match search.
