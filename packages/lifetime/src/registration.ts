/**
 * What registering a cleanup did: {@linkcode Registration}.
 *
 * @module
 */

import type { Unsubscribe } from "@sekhmet/dispatch";
import { Enum, type Split } from "@sekhmet/enum/core/mini";
import type { Result } from "@sekhmet/enum/result/mini";
import type { Panic } from "@sekhmet/panic";
import type { Vow } from "@sekhmet/vow/mini";

/** The variants of {@linkcode Registration}. */
type Variants = Split<{
	/** It runs when the lifetime ends, unless `unregister` removes it first. */
	Registered: [unregister: Unsubscribe];
	/** The lifetime is ending: it runs in this teardown. */
	DuringEnd: [];
	/** The lifetime had ended: it ran at once, and `ran` says how it went. */
	AfterEnd: [ran: Vow<Result<void, Panic<unknown>>>];
}>;

export type { Variants as RegistrationVariants };

/**
 * What `defer` did with a cleanup. A cleanup is never dropped and never
 * fails silently: registered while the lifetime is alive, joined to the
 * teardown while it ends, or run at once once it has ended. Read it with
 * `match`.
 *
 * @example
 * ```ts
 * import { isolate, match } from "@sekhmet/enum/core/mini";
 * import { definePanicRuntime } from "@sekhmet/panic";
 * import { Lifetime } from "@sekhmet/lifetime";
 * import { assert, assertEquals } from "@std/assert";
 *
 * const lifetime = new Lifetime<undefined, string>({
 * 	value: undefined,
 * 	panics: definePanicRuntime(),
 * });
 * const ran: string[] = [];
 *
 * const early = lifetime.defer(() => {
 * 	ran.push("early");
 * });
 * const removed = match(early)({
 * 	Registered: (unregister) => unregister(),
 * 	DuringEnd: () => false,
 * 	AfterEnd: () => false,
 * });
 * lifetime.end("done");
 * const late = lifetime.defer((cause) => {
 * 	ran.push(`late: ${cause}`);
 * });
 *
 * assert(removed);
 * assert(isolate(late, "AfterEnd"));
 * assertEquals(ran, ["late: done"]);
 * ```
 */
export class Registration extends Enum<Variants> {}
