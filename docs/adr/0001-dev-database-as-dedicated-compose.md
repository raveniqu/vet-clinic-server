---
status: accepted
date: 2026-11-27
---

# The DEV database is a dedicated Postgres compose, shared by engineers, the backend and Apidog

The vet-clinic DEV database runs as its own PostgreSQL 18 instance in Dokploy (`vet-clinic-postgresdev`), defined as a Docker compose rather than as a Dokploy database, and it holds one database (`vet_clinic_dev`) that engineers, the deployed backend and the Apidog regression suite all use. It is separate from the other project's instance because Dokploy manages exactly one database and one user per instance, its backup dumps a single database and strips the grants, and it has no major-version upgrade path. It is a compose because only a compose can bind the published port to one address (the VPS's Tailscale address, port 5433) instead of every interface.

Engineers own the schema: they connect as `dev_user_rw` and run the per-table `schema.sql` and `index.sql` files by hand in DBeaver, with no apply script and no migration tool. The backend (`vet_serverapp_rw`, `vet_serverapp_ro`) and Apidog (`test_automation_runner_rw`) connect as roles that cannot create or drop tables; their grants come from default privileges, so tables created by hand work for them without extra grants. The instance is created with ICU and the Thai locale as the default collation (`POSTGRES_INITDB_ARGS="--locale-provider=icu --icu-locale=th"`), which can only be chosen on first start.

## Considered options

- **A database inside the existing `yec-lamphun-postgresdev` instance.** Rejected: it would share the superuser, the port, the version, the connection budget and the failure domain with another project, and the extra database would be invisible to Dokploy.
- **A native Dokploy database.** Rejected: its port is published on every interface, with no way to pick one.
- **A disposable test database for Apidog, with a second backend deployment.** Declined: the Apidog suite manages its own test data in the shared database.
- **A repo script that applies the schema files in a fixed order.** Declined in favour of running them by hand. The dependency order is written as a `-- Requires:` line in each dependent file.
- **Loopback with SSH tunnels, or with Tailscale's TCP forwarder.** Rejected in favour of binding the Tailscale address directly: one hop, and Postgres sees each client's tailnet address.

## Consequences

- **Production must be created with the same collation choice.** The collation is fixed when the instance first starts, and changing it means recreating the database. Production should also keep an owner role separate from humans.
- **Roles and grants exist only inside the data volume.** `db/postgres_user_roles.sql` is their record. Re-run it after a Dokploy restore, which recreates the tables owned by the superuser and without grants.
- **The compose exists only in Dokploy.** No copy is kept in this repo.
- **Backups are manual dumps.** There is no scheduled backup and no bucket for DEV data.
