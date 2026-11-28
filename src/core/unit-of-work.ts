import type { Result } from "neverthrow"

import type { UnexpectedError } from "src/core/errors"

export interface UnitOfWork<TRepos> {
	run<T, E>(work: (repos: TRepos) => Promise<Result<T, E>>): Promise<Result<T, E | UnexpectedError>>
}
