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
	| [kind: "Cycle", cycle: { readonly path: readonly string[] }];

export type { Variants as GraphErrorVariants };

/**
 * Why the jobs reachable from a run's roots don't form a graph. It is an
 * `Err`, never a throw and never a hang.
 *
 * - `DuplicateName`: two different jobs share this name.
 * - `Cycle`: these jobs need or await each other; the path starts and ends
 *   with the same job.
 *
 * Both are found when a plan reaches the offending job, so a run can find one
 * after other jobs started. The run then cancels them and returns the error.
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
 * The jobs along `path` need or await each other.
 *
 * @param path The cycle, starting and ending with the same job
 * @returns The `Cycle` error
 */
export function Cycle(path: readonly string[]): GraphError {
	return new GraphError("Cycle", { path });
}
