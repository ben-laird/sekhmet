/**
 * The {@linkcode Issue} class, its {@linkcode IssueState}, and the
 * {@linkcode issue} constructor.
 *
 * @module
 */

import { Enum, type Split } from "@sekhmet/enum/core/mini";
import { Struct } from "@sekhmet/primordials/struct";

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
 * with {@linkcode state}'s result and enum's `match`.
 *
 * Its issue switches it in place, so it is invariant in both type
 * parameters (see #98): a widened view can't write the wrong residue.
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

/**
 * The words that describe an issue to a person: a permanent `code`, a
 * `message`, and an optional `hint` and `docs` link.
 */
export interface IssueWording {
	/** The issue's permanent name, such as `config/NotFound` */
	readonly code: string;
	/** What went wrong, in a sentence */
	readonly message: string;
	/** What to do about it */
	readonly hint?: string;
	/** A link to more about it */
	readonly docs?: string;
}

/**
 * What {@linkcode issue} takes: the issue's value and its wording.
 *
 * @template T The typed facts about the problem
 */
export interface IssueInput<T> extends IssueWording {
	/** The typed facts about the problem */
	readonly value: T;
}

/**
 * What an {@linkcode Issue} holds: its wording, and its state, which
 * handling replaces in place.
 *
 * @template T The typed facts about the problem
 * @template R The residue handling yields
 */
export interface IssueParams<T, R> extends IssueWording {
	/** Where the issue stands now; replaced, once, when it is handled */
	state: IssueState<T, R>;
}

/**
 * One occurrence of something going wrong. It has a permanent `code`, a
 * `message`, an optional `hint` and `docs` link, and a state: `Unhandled`
 * with its value, the typed facts about the problem, or `Handled` with its
 * residue, what handling yielded (for "config not found", the default
 * config).
 *
 * Handling switches the state in place, once, and it never switches back:
 * see `attempt` and `handle`. That makes an issue invariant in `T` and `R`
 * (see #98), since a widened view could otherwise write the wrong residue.
 *
 * A cause is not a field: an issue caused by another holds it in its value,
 * as in `Issue<{ readonly cause: Issue<Path, Config> }, Config>`. `wrap`
 * builds that shape, and `render` follows it.
 *
 * @template T The typed facts about the problem
 * @template R The residue handling yields
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { code, isUnhandled, issue } from "@sekhmet/issue/issue/mini";
 *
 * const notFound = issue<{ readonly path: string }, { readonly port: number }>({
 * 	value: { path: "app.json" },
 * 	code: "config/NotFound",
 * 	message: "No config file at `app.json`.",
 * 	hint: "Create one, or run with the default config.",
 * });
 *
 * assertEquals(code(notFound), "config/NotFound");
 * assertEquals(isUnhandled(notFound), true);
 * ```
 */
export class Issue<in out T, in out R> extends Struct<IssueParams<T, R>> {}

/**
 * Creates an unhandled issue holding `value`, with the given wording.
 *
 * @template T The typed facts about the problem
 * @template R The residue handling yields
 * @param input The issue's value and wording
 * @returns A new, unhandled issue
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { unwrap } from "@sekhmet/enum/option/mini";
 * import { hint, issue, value } from "@sekhmet/issue/issue/mini";
 *
 * const notFound = issue<{ readonly path: string }, number>({
 * 	value: { path: "app.json" },
 * 	code: "config/NotFound",
 * 	message: "No config file at `app.json`.",
 * });
 *
 * assertEquals(unwrap(value(notFound)), { path: "app.json" });
 * assertEquals(hint(notFound), undefined);
 * ```
 */
export function issue<T, R>(input: IssueInput<T>): Issue<T, R> {
	const { value, ...wording } = input;

	return new Issue<T, R>({
		state: new IssueState<T, R>("Unhandled", value),
		...wording,
	});
}
