# PostgreSQL roles for `vet_clinic_dev`

Companion to [`postgres_user_roles.sql`](./postgres_user_roles.sql), which creates and maintains everything described here. The setup as a whole is recorded in [ADR 0001](../docs/adr/0001-dev-database-as-dedicated-compose.md).

## Roles

| Role                        | Used by                                                                  | Connect to the database | `SELECT` | `INSERT` / `UPDATE` / `DELETE` | Use sequences | Create / alter / drop tables and indexes | `TRUNCATE` | Superuser |
|-----------------------------|--------------------------------------------------------------------------|-------------------------|----------|--------------------------------|---------------|------------------------------------------|------------|-----------|
| `root_superuser`            | You: first-time setup, creating roles, emergencies, manual dumps         | Yes                     | Yes      | Yes                            | Yes           | Yes                                      | Yes        | Yes       |
| `dev_user_rw`               | Engineers in DBeaver: debugging data and applying schema and index files | Yes                     | Yes      | Yes                            | Yes           | Yes                                      | Yes        | No        |
| `vet_serverapp_rw`          | Backend, RW pool (`DATABASE_RW_URL`)                                     | Yes                     | Yes      | Yes                            | Yes           | No                                       | No         | No        |
| `vet_serverapp_ro`          | Backend, RO pool (`DATABASE_RO_URL`)                                     | Yes                     | Yes      | No                             | No            | No                                       | No         | No        |
| `test_automation_runner_rw` | Apidog database connection                                               | Yes                     | Yes      | Yes                            | Yes           | No                                       | No         | No        |

Every role can log in with a password. `root_superuser` is created by the Docker image on first start. The other four are created by `postgres_user_roles.sql`.

## Ownership

| Object                                           | Owner         |
|--------------------------------------------------|---------------|
| Database `vet_clinic_dev`                        | `dev_user_rw` |
| Tables, indexes and sequences in schema `public` | `dev_user_rw` |

`dev_user_rw` can change the schema because it owns the objects, not because of a grant. This is why the schema files must be run as `dev_user_rw` and never as `root_superuser`.

## How the three restricted roles get their access

| Setting in `postgres_user_roles.sql`                                 | Effect                                                                                                                                                                                                                 |
|----------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `REVOKE ALL ON DATABASE vet_clinic_dev FROM PUBLIC`                  | Only the four listed roles can connect. Any other login is refused.                                                                                                                                                    |
| `REVOKE ALL ON SCHEMA public FROM PUBLIC`                            | Only `dev_user_rw` may create objects in `public`.                                                                                                                                                                     |
| `ALTER DEFAULT PRIVILEGES FOR ROLE dev_user_rw`                      | Every table `dev_user_rw` creates is automatically readable and writable by `vet_serverapp_rw` and `test_automation_runner_rw`, and readable by `vet_serverapp_ro`. Its sequences are usable by the two writing roles. |
| `ALTER ROLE vet_serverapp_ro SET default_transaction_read_only = on` | A write through the RO role fails with "cannot execute INSERT in a read-only transaction", even if a grant is ever added by mistake.                                                                                   |

## Running the file

| Situation                                  | What to do                                                                                                                    |
|--------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------|
| First setup                                | Connect as `root_superuser` to `vet_clinic_dev` and run the whole file as a script.                                           |
| A role or grant looks wrong                | Run the file again. It is safe to re-run.                                                                                     |
| After a restore made from a Dokploy backup | Run the file again. It hands the tables back to `dev_user_rw` and reapplies the grants.                                       |
| Setting passwords                          | By hand, with one `ALTER ROLE <role> PASSWORD '...'` per role. The four statements are at the end of the file, commented out. |

The file contains no passwords. It must be run as `root_superuser`, because creating roles and changing ownership need that privilege.

## Passwords

| Role                                   | Where the password is kept                                                         |
|----------------------------------------|------------------------------------------------------------------------------------|
| `root_superuser`                       | Password manager, plus the Dokploy compose environment as `POSTGRES_ROOT_PASSWORD` |
| `dev_user_rw`                          | Password manager, plus each engineer's own DBeaver                                 |
| `vet_serverapp_rw`, `vet_serverapp_ro` | Password manager, plus the backend's Dokploy app environment                       |
| `test_automation_runner_rw`            | Password manager, plus Apidog as a vault variable or local-only value              |

Use URL-safe characters only (letters, digits, `-`, `_`), so connection strings need no encoding:

```bash
openssl rand -base64 32 | tr '+/' '-_' | tr -d '='
```

## Backups and restores

| Kind of backup                                       | Keeps ownership and grants | After restoring                  |
|------------------------------------------------------|----------------------------|----------------------------------|
| Dokploy's own backup (`pg_dump --no-acl --no-owner`) | No                         | Re-run `postgres_user_roles.sql` |
| Manual dump, as below                                | Yes                        | Nothing extra                    |

Manual dump on the VPS, then copy the file off the VPS:

```bash
docker exec vet-clinic-postgresdev pg_dump -U root_superuser -Fc vet_clinic_dev > vet_clinic_dev_$(date +%F).dump
```

Restore, which replaces whatever is in `vet_clinic_dev`:

```bash
docker exec -i vet-clinic-postgresdev pg_restore -U root_superuser -d vet_clinic_dev --clean --if-exists < vet_clinic_dev_<date>.dump
```
