import type { Transaction } from "kysely"
import { type Result, err, ok } from "neverthrow"

import { UnexpectedError } from "src/core/errors"
import type { UnitOfWork } from "src/core/unit-of-work"
import type { DB } from "src/shared/db/generated/db"

type TransactionRunner<TTx> = {
	transaction(): {
		execute<T>(callback: (tx: TTx) => Promise<T>): Promise<T>
	}
}

class RollbackSignal {
	readonly error: unknown

	constructor(error: unknown) {
		this.error = error
	}
}

export class KyselyUnitOfWork<TRepos, TTx = Transaction<DB>> implements UnitOfWork<TRepos> {
	private readonly db: TransactionRunner<TTx>
	private readonly makeRepos: (tx: TTx) => TRepos

	constructor(db: TransactionRunner<TTx>, makeRepos: (tx: TTx) => TRepos) {
		this.db = db
		this.makeRepos = makeRepos
	}

	async run<T, E>(work: (repos: TRepos) => Promise<Result<T, E>>): Promise<Result<T, E | UnexpectedError>> {
		try {
			const value = await this.db.transaction().execute(async (tx) => {
				const repos = this.makeRepos(tx)
				const result = await work(repos)
				if (result.isErr()) {
					throw new RollbackSignal(result.error)
				}
				return result.value
			})
			return ok(value)
		} catch (thrown: unknown) {
			if (thrown instanceof RollbackSignal) {
				return err(thrown.error as E)
			}
			const message = thrown instanceof Error ? thrown.message : String(thrown)
			return err(new UnexpectedError(message, thrown))
		}
	}
}
