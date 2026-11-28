# Vet Clinic Server

Backend for a veterinary clinic. This glossary fixes the words the team uses, so each environment and domain concept has exactly one name.

## Language

**DEV**:
The shared development environment hosted on the VPS, used by engineers and by the automated regression tests alike. It holds development data only.
_Avoid_: dev server, the server, staging

**Owner**:
An individual person (`INDIVIDUAL`) or juristic organization (`JURISTIC`) registered as a pet's owner.
_Avoid_: Client, Customer

**Owner Code**:
The daily sequential business identifier (`OWN-YYYYMMDD-NNNN` in `Asia/Bangkok`) assigned to an **Owner**.
_Avoid_: Code, Running Number

**Tax ID**:
The 13-digit identifier of an **Owner** — a Thai National ID for `INDIVIDUAL` owners, or a juristic registration number for `JURISTIC` owners.
_Avoid_: National ID, Citizen ID

**PDPA Consent**:
An immutable append-only opt-in or opt-out record for an **Owner** across five categories; `PRIVACY_POLICY` must be granted at registration.
_Avoid_: Consent Flag
