/**
 * The runner's type erasure, in one place.
 *
 * @module
 */

/**
 * Restores a type the runner erased. A cast, and the package's only one
 * outside `all`: the runner handles every job as a `BoundJob<unknown>` and
 * every plan as `unknown`, since a graph's jobs differ in type. It pairs
 * each need, guard and root with that same job's outcome by construction,
 * so each typed view it hands back (a resolved plan, a need's outcome, the
 * report's outcomes) holds exactly the type its job declared.
 *
 * @template R The type the value had before it was erased
 * @param value The erased value
 * @returns The same value, typed as it was
 */
export function unerased<R>(value: unknown): R {
	return value as R;
}
