/**
 * The {@linkcode IssueState} class: where an issue stands.
 *
 * @module
 */

import { Enum, type Split } from "@sekhmet/enum/core/mini";

/**
 * The variants of an {@linkcode IssueState}, for type-level work on them.
 *
 * @template T The typed facts about the problem
 * @template R The residue handling yields
 */
type Variants<T, R> = Split<{
	Unhandled: [value: T];
	Handled: [residue: R];
}>;

export type { Variants as IssueStateVariants };

/**
 * Where an issue stands: `Unhandled(value)`, holding the typed facts about
 * the problem, or `Handled(residue)`, holding what handling yielded. Read it
 * from an issue with `state`, and test it with enum's `match` or this
 * feature's predicates.
 *
 * A state is an immutable snapshot: handling never changes one, it gives
 * the issue a new state. Its issue switches states in place, so it is
 * invariant in both type parameters (see #98): a widened view can't write
 * the wrong residue.
 *
 * @template T The typed facts about the problem
 * @template R The residue handling yields
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { match } from "@sekhmet/enum/core/mini";
 * import { issue, state } from "@sekhmet/issue/issue/mini";
 *
 * const notFound = issue<{ readonly path: string }, number>({
 * 	value: { path: "app.json" },
 * 	code: "config/NotFound",
 * 	message: "No config file at `app.json`.",
 * });
 * const line = match(state(notFound))({
 * 	Unhandled: ({ path }) => `missing ${path}`,
 * 	Handled: (port) => `using port ${port}`,
 * });
 *
 * assertEquals(line, "missing app.json");
 * ```
 */
export class IssueState<in out T, in out R> extends Enum<Variants<T, R>> {}
