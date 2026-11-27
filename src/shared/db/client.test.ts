import { describe, expect, test } from "bun:test"
import { ResultAsync, errAsync, okAsync } from "neverthrow"
import { type RetryOptions, retryUntilReady } from "src/shared/db/client"

function fakeClock(): Pick<RetryOptions, "now" | "sleep"> & { slept: number[] } {
	let t = 0
	const slept: number[] = []
	return {
		slept: slept,
		now: () => t,
		sleep: async (ms) => {
			slept.push(ms)
			t += ms
		},
	}
}

function opts(clock: ReturnType<typeof fakeClock>, deadlineMs = 30_000): RetryOptions {
	return { deadlineMs: deadlineMs, initialBackoffMs: 250, maxBackoffMs: 2000, now: clock.now, sleep: clock.sleep }
}

describe("retryUntilReady", () => {
	describe("Happy cases", () => {
		test("returns ok immediately when probe succeeds", async () => {
			const clock = fakeClock()

			const res = await retryUntilReady(() => okAsync(undefined), opts(clock))

			expect(res.isOk()).toBe(true)
			expect(clock.slept).toEqual([])
		})

		test("retries with doubling backoff capped at max, then succeeds", async () => {
			const clock = fakeClock()
			let calls = 0
			const probe = () => {
				calls++
				return calls < 6 ? errAsync(new Error("down")) : okAsync(undefined)
			}

			const res = await retryUntilReady(probe, opts(clock))

			expect(res.isOk()).toBe(true)
			expect(clock.slept).toEqual([250, 500, 1000, 2000, 2000])
		})
	})

	describe("Unhappy cases", () => {
		test("returns err once the deadline would be exceeded", async () => {
			const clock = fakeClock()

			const res = await retryUntilReady(() => errAsync(new Error("down")), opts(clock, 5000))

			expect(res.isErr()).toBe(true)
			expect(res._unsafeUnwrapErr().message).toContain("Database not ready after 5000ms: down")
			expect(clock.slept.reduce((a, b) => a + b, 0)).toBeLessThan(5000)
		})

		test("caps a hanging probe at the remaining time", async () => {
			const hang = () => ResultAsync.fromSafePromise(new Promise<void>(() => {}))

			const start = Date.now()
			const res = await retryUntilReady(hang, { deadlineMs: 200, initialBackoffMs: 50, maxBackoffMs: 50, now: Date.now, sleep: Bun.sleep })

			expect(res.isErr()).toBe(true)
			expect(Date.now() - start).toBeLessThan(1000)
		})
	})
})
