import type { Kysely } from "kysely"

import type { DB } from "src/shared/db/generated/db"
import { KyselyUnitOfWork } from "src/shared/db/kysely-uow"
import type { OwnerUnitOfWorkRepos } from "./domain/owner.repo"
import { PgOwnerRepository } from "./repository/pg-owner.repo"
import { PgRunningNumberSequenceRepository } from "./repository/pg-running-number-sequence.repo"
import { type OwnerRoutes, createOwnerRoutes } from "./routes"
import { type Clock, RegisterOwnerService } from "./use-case/command/register-owner/register-owner.service"

export type OwnerModuleDeps = {
	readonly rwDb: Kysely<DB>
	readonly clock: Clock
}

export function createOwnerModule(deps: OwnerModuleDeps) {
	const uow = new KyselyUnitOfWork<OwnerUnitOfWorkRepos>(deps.rwDb, (tx) => ({
		owners: new PgOwnerRepository(tx),
		sequences: new PgRunningNumberSequenceRepository(tx),
	}))
	const registerOwnerService = new RegisterOwnerService(uow, deps.clock)
	const routes = createOwnerRoutes({ registerOwnerService: registerOwnerService })

	return { routes: routes }
}

export type { Clock, OwnerRoutes }
