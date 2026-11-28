import { describe, expect, test } from "bun:test"
import { err, ok } from "neverthrow"

import { ConflictError, DomainValidationError, UnexpectedError } from "src/core/errors"
import { KyselyUnitOfWork } from "src/shared/db/kysely-uow"

type FakeTx = {
	readonly txId: number
}

type FakeRepos = {
	readonly tx: FakeTx
}

function createFakeTxRunner() {
	let nextTxId = 1
	const state = {
		begun: 0,
		committed: 0,
		rolledBack: 0,
		failWith: null as Error | null,
	}

	const runner = {
		transaction() {
			return {
				async execute<T>(callback: (tx: FakeTx) => Promise<T>): Promise<T> {
					state.begun += 1
					if (state.failWith !== null) {
						state.rolledBack += 1
						throw state.failWith
					}
					const tx: FakeTx = { txId: nextTxId++ }
					try {
						const out = await callback(tx)
						state.committed += 1
						return out
					} catch (thrown) {
						state.rolledBack += 1
						throw thrown
					}
				},
			}
		},
	}

	return { runner: runner, state: state }
}

describe("KyselyUnitOfWork", () => {
	describe("run", () => {
		describe("Happy cases", () => {
			test("commits and returns ok value when work succeeds", async () => {
				const { runner, state } = createFakeTxRunner()
				const uow = new KyselyUnitOfWork<FakeRepos, FakeTx>(runner, (tx) => ({ tx: tx }))

				const result = await uow.run(async (repos) => {
					return ok({ createdId: 42, txId: repos.tx.txId })
				})

				expect(result.isOk()).toBe(true)
				if (result.isOk()) {
					expect(result.value).toEqual({ createdId: 42, txId: 1 })
				}
				expect(state.begun).toBe(1)
				expect(state.committed).toBe(1)
				expect(state.rolledBack).toBe(0)
			})

			test("provisions fresh per-transaction repositories for each run", async () => {
				const { runner } = createFakeTxRunner()
				const seenTxIds: number[] = []
				const uow = new KyselyUnitOfWork<FakeRepos, FakeTx>(runner, (tx) => ({ tx: tx }))

				await uow.run(async (repos) => {
					seenTxIds.push(repos.tx.txId)
					return ok(undefined)
				})
				await uow.run(async (repos) => {
					seenTxIds.push(repos.tx.txId)
					return ok(undefined)
				})

				expect(seenTxIds).toEqual([1, 2])
			})
		})

		describe("Unhappy cases", () => {
			test("rolls back and returns expected err without throwing when work returns err", async () => {
				const { runner, state } = createFakeTxRunner()
				const uow = new KyselyUnitOfWork<FakeRepos, FakeTx>(runner, (tx) => ({ tx: tx }))
				const conflict = new ConflictError("Duplicate phone", "uniq_owners_phone_no_live")

				const result = await uow.run(async () => {
					return err(conflict)
				})

				expect(result.isErr()).toBe(true)
				if (result.isErr()) {
					expect(result.error).toBe(conflict)
				}
				expect(state.begun).toBe(1)
				expect(state.committed).toBe(0)
				expect(state.rolledBack).toBe(1)
			})

			test("rolls back and returns DomainValidationError when work returns domain err", async () => {
				const { runner, state } = createFakeTxRunner()
				const uow = new KyselyUnitOfWork<FakeRepos, FakeTx>(runner, (tx) => ({ tx: tx }))
				const validationErr = new DomainValidationError("privacy_policy must be true")

				const result = await uow.run(async () => {
					return err(validationErr)
				})

				expect(result.isErr()).toBe(true)
				if (result.isErr()) {
					expect(result.error).toBe(validationErr)
				}
				expect(state.committed).toBe(0)
				expect(state.rolledBack).toBe(1)
			})

			test("rolls back and wraps thrown exception as UnexpectedError", async () => {
				const { runner, state } = createFakeTxRunner()
				const uow = new KyselyUnitOfWork<FakeRepos, FakeTx>(runner, (tx) => ({ tx: tx }))
				const boom = new Error("unexpected panic")

				const result = await uow.run(async () => {
					throw boom
				})

				expect(result.isErr()).toBe(true)
				if (result.isErr()) {
					expect(result.error).toBeInstanceOf(UnexpectedError)
					if (result.error instanceof UnexpectedError) {
						expect(result.error.message).toBe("unexpected panic")
						expect(result.error.cause).toBe(boom)
					}
				}
				expect(state.committed).toBe(0)
				expect(state.rolledBack).toBe(1)
			})

			test("wraps transaction runner failure as UnexpectedError", async () => {
				const { runner, state } = createFakeTxRunner()
				const connErr = new Error("connection refused")
				state.failWith = connErr
				const uow = new KyselyUnitOfWork<FakeRepos, FakeTx>(runner, (tx) => ({ tx: tx }))

				const result = await uow.run(async () => {
					return ok(1)
				})

				expect(result.isErr()).toBe(true)
				if (result.isErr()) {
					expect(result.error).toBeInstanceOf(UnexpectedError)
					if (result.error instanceof UnexpectedError) {
						expect(result.error.message).toBe("connection refused")
						expect(result.error.cause).toBe(connErr)
					}
				}
				expect(state.committed).toBe(0)
				expect(state.rolledBack).toBe(1)
			})
		})
	})
})
