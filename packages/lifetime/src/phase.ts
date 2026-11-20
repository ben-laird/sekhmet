/**
 * Where a lifetime stands: {@linkcode Phase}, and the
 * {@linkcode EndReport} its teardown ends with.
 *
 * @module
 */

import { Enum, match, type Split } from "@sekhmet/enum/core/mini";
import type { Result } from "@sekhmet/enum/result/mini";
import type { Panic } from "@sekhmet/panic";

/**
 * Why ending wasn't clean: the cause the lifetime ended with, and the panic
 * of every cleanup that threw or rejected, in the order they ran.
 *
 * @template C The type of the cause
 *
 * @example
 * ```ts
 * import { isErr, unwrapErr } from "@sekhmet/enum/result/mini";
 * import { definePanicRuntime } from "@sekhmet/panic";
 * import { type EndFailure, Lifetime } from "@sekhmet/lifetime";
 * import { assert, assertEquals } from "@std/assert";
 *
 * const panics = definePanicRuntime();
 * panics.setHook(() => {}); // keep the example quiet
 * const lifetime = new Lifetime<undefined, string>({ value: undefined, panics });
 * lifetime.defer(() => {
 * 	throw new Error("socket already closed");
 * });
 *
 * const report = await lifetime.end("done").wait();
 * assert(isErr(report));
 * const failure: EndFailure<string> = unwrapErr(report);
 * assertEquals(failure.cause, "done");
 * assertEquals(failure.panics.length, 1);
 * ```
 */
export interface EndFailure<C> {
	/** The cause the lifetime ended with */
	readonly cause: C;
	/** Every cleanup's panic, in the order the cleanups ran */
	readonly panics: readonly Panic<unknown>[];
}

/**
 * How ending went: `Ok(cause)` when every cleanup succeeded, or
 * `Err(failure)` with the cause and each cleanup's panic.
 *
 * @template C The type of the cause
 *
 * @example
 * ```ts
 * import { Ok } from "@sekhmet/enum/result/mini";
 * import { Ready } from "@sekhmet/enum/poll/mini";
 * import { definePanicRuntime } from "@sekhmet/panic";
 * import { type EndReport, Lifetime } from "@sekhmet/lifetime";
 * import { assertEquals } from "@std/assert";
 *
 * const lifetime = new Lifetime<undefined, string>({
 * 	value: undefined,
 * 	panics: definePanicRuntime(),
 * });
 * lifetime.defer(() => {});
 *
 * const polled = lifetime.end("done").poll();
 * const expected: EndReport<string> = Ok("done");
 * assertEquals(polled, Ready(expected));
 * ```
 */
export type EndReport<C> = Result<C, EndFailure<C>>;

/**
 * The variants of {@linkcode Phase}.
 *
 * @template T The type of the value the lifetime holds
 * @template C The type of the cause
 */
type Variants<T, C> = Split<{
	/** It holds its value. */
	Alive: [value: T];
	/** It has started ending, with this cause: its teardown is running. */
	Ending: [cause: C];
	/** Its teardown has finished, with this report. */
	Ended: [report: EndReport<C>];
}>;

export type { Variants as PhaseVariants };

/**
 * A lifetime's phase, `Alive(value) → Ending(cause) → Ended(report)`. It is
 * read from the lifetime's `ending` and `ended` signals, never kept by hand.
 * Read it with `match`.
 *
 * @template T The type of the value the lifetime holds
 * @template C The type of the cause
 *
 * @example
 * ```ts
 * import { match } from "@sekhmet/enum/core/mini";
 * import { definePanicRuntime } from "@sekhmet/panic";
 * import { Lifetime } from "@sekhmet/lifetime";
 * import { assertEquals } from "@std/assert";
 *
 * const lifetime = new Lifetime<number, string>({
 * 	value: 5432,
 * 	panics: definePanicRuntime(),
 * });
 * const describe = (): string => {
 * 	return match(lifetime.phase())({
 * 		Alive: (port) => `serving on ${port}`,
 * 		Ending: (cause) => `stopping: ${cause}`,
 * 		Ended: () => "stopped",
 * 	});
 * };
 *
 * assertEquals(describe(), "serving on 5432");
 * lifetime.end("done");
 * assertEquals(describe(), "stopped");
 * ```
 */
export class Phase<out T, out C> extends Enum<Variants<T, C>> {}

/**
 * The cause a report carries, whether ending went cleanly or not.
 *
 * @internal
 */
export function causeOf<C>(report: EndReport<C>): C {
	return match(report)({
		Ok: (cause) => cause,
		Err: (failure) => failure.cause,
	});
}
