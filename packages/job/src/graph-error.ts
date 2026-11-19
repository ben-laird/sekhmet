/**
 * {@linkcode GraphError}: why a set of jobs is not a graph that can run.
 *
 * @module
 */

import { Enum } from "@sekhmet/enum/core/mini";

/**
 * The variants of a {@linkcode GraphError}, for type-level work on them.
 */
type Variants =
	| [kind: "DuplicateName", duplicate: { readonly name: string }]
	| [kind: "DuplicateKey", duplicate: DuplicateKeyCause]
	| [kind: "UndeclaredGuardRead", read: UndeclaredGuardReadCause]
	| [kind: "Cycle", cycle: { readonly path: readonly string[] }];

export type { Variants as GraphErrorVariants };

/**
 * Why the jobs reachable from a run's roots don't form a graph. It is an
 * `Err`, never a throw and never a hang.
 *
 * - `DuplicateName`: two different jobs (two identities) share this name.
 * - `DuplicateKey`: a `family` built two different jobs (two names) for one
 *   key, so the key doesn't identify them; the runner would otherwise run
 *   only the first.
 * - `UndeclaredGuardRead`: a `needsIf` guard reads a need that isn't an
 *   unconditional need of the same plan (one left out of the plan, or one
 *   that is itself guarded), as GitHub Actions' `if:` sees only `needs:`.
 * - `Cycle`: these jobs need each other; the path starts and ends with the
 *   same job.
 *
 * Every plan is called before any job starts, so each is found before
 * anything runs.
 */
export class GraphError extends Enum<Variants> {}

/**
 * Two different jobs share `name`.
 *
 * @param name The shared name
 * @returns The `DuplicateName` error
 */
export function DuplicateName(name: string): GraphError {
	return new GraphError("DuplicateName", { name });
}

/**
 * What a `DuplicateKey` error names.
 */
export interface DuplicateKeyCause {
	/** The family key both jobs were built for */
	readonly key: string;
	/** The two jobs' names: the one planned first, then the other */
	readonly names: readonly [first: string, second: string];
}

/**
 * A `family` built two different jobs, named `names`, for one `key`.
 *
 * @param duplicate The key, and the two jobs' names
 * @returns The `DuplicateKey` error
 */
export function DuplicateKey(duplicate: DuplicateKeyCause): GraphError {
	return new GraphError("DuplicateKey", duplicate);
}

/**
 * What an `UndeclaredGuardRead` error (or the panic of the same name, for a
 * guard that reads outside its declared `reads` at run time) names.
 */
export interface UndeclaredGuardReadCause {
	/** The job whose plan holds the guard */
	readonly job: string;
	/** The guard, as it describes itself (`version succeeded`) */
	readonly guard: string;
	/** The name of the job the guard reads, which the plan doesn't need unconditionally */
	readonly read: string;
}

/**
 * A `needsIf` guard in `job`'s plan reads `read`, which isn't one of that
 * plan's unconditional needs.
 *
 * @param read The job, the guard, and the undeclared read
 * @returns The `UndeclaredGuardRead` error
 */
export function UndeclaredGuardRead(
	read: UndeclaredGuardReadCause,
): GraphError {
	return new GraphError("UndeclaredGuardRead", read);
}

/**
 * The jobs along `path` need each other.
 *
 * @param path The cycle, starting and ending with the same job
 * @returns The `Cycle` error
 */
export function Cycle(path: readonly string[]): GraphError {
	return new GraphError("Cycle", { path });
}
