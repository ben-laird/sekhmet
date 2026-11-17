/**
 * `unreachable`: a panic for code the type system proves cannot run, such as
 * the default branch of an exhaustive `switch`. Passing the narrowed value
 * makes the exhaustiveness a compile-time check.
 *
 * @module
 */

import type { Panic } from "@sekhmet/panic/mini/core";
import { describeValue } from "../workflow-panic/describe.ts";
import {
	issueLine,
	messageLines,
	WorkflowPanic,
} from "../workflow-panic/workflow-panic.ts";

/** What {@linkcode unreachable} is given without an impossible value. */
export interface UnreachableOptions {
	/** Where to report the bug, such as the repository's issue tracker */
	readonly issueUrl?: URL;
}

/**
 * What {@linkcode unreachable} is given with the impossible value. `value` is
 * required and typed `never`, so only a value narrowed to `never` compiles,
 * which is what makes a `switch` exhaustive. Being required, it rejects
 * `undefined` and `any` whether or not `exactOptionalPropertyTypes` is on.
 */
export interface UnreachableValueOptions extends UnreachableOptions {
	/** The value that should be impossible here, narrowed to `never` */
	readonly value: never;
}

/**
 * The cause of the panic {@linkcode unreachable} throws. `value` is present
 * exactly when the call passed one: the impossible value that arrived anyway.
 */
export interface UnreachableCause {
	/** The impossible value, when one was passed */
	readonly value?: unknown;
	/** Where to report the bug, if given */
	readonly issueUrl: URL | undefined;
}

/**
 * Panics as `Panic (Unreachable)`: code the program's types rule out ran
 * anyway. Pass the narrowed value as `value` to make the call compile only
 * when every case is handled; at runtime the value that slipped through
 * (from untyped input, say) is kept in the cause and rendered in the message
 * without ever throwing, whatever it is:
 *
 * ```txt
 * an unreachable code path was executed
 * Impossible value: { kind: "triangle" }
 * Please file an issue at https://example.com/issues
 * ```
 *
 * @param options An issue URL, optional; the overload taking
 *   {@linkcode UnreachableValueOptions} also takes the impossible value
 * @returns Never; it always panics
 *
 * @example
 * ```ts
 * import {
 *   isUnreachablePanic,
 *   unreachable,
 * } from "@sekhmet/workflow/unreachable";
 * import { assert, assertEquals, assertThrows } from "@std/assert";
 *
 * type Shape = { kind: "circle"; r: number } | { kind: "square"; side: number };
 *
 * function area(shape: Shape): number {
 *   switch (shape.kind) {
 *     case "circle":
 *       return Math.PI * shape.r ** 2;
 *     case "square":
 *       return shape.side ** 2;
 *     default:
 *       // Adding a third kind of Shape makes this line a compile error
 *       return unreachable({ value: shape });
 *   }
 * }
 *
 * const fromUntypedInput = JSON.parse('{ "kind": "triangle" }');
 * const thrown = assertThrows(() => area(fromUntypedInput));
 *
 * assert(isUnreachablePanic(thrown));
 * assertEquals(thrown.cause.value, { kind: "triangle" });
 * ```
 */
export function unreachable(options?: UnreachableOptions): never;
/**
 * Panics as `Panic (Unreachable)`, keeping the impossible `value` in the
 * cause and rendering it in the message. The call compiles only where
 * `value` has been narrowed to `never`.
 *
 * @param options The impossible value, and an optional issue URL
 * @returns Never; it always panics
 */
export function unreachable(options: UnreachableValueOptions): never;
export function unreachable(
	options: UnreachableOptions | UnreachableValueOptions = {},
): never {
	const { issueUrl } = options;
	if (!("value" in options)) {
		throw new WorkflowPanic<UnreachableCause>({
			kind: "Unreachable",
			message: messageLines([HEADER, issueLine(issueUrl)]),
			cause: { issueUrl },
		});
	}
	const { value } = options;
	throw new WorkflowPanic<UnreachableCause>({
		kind: "Unreachable",
		message: messageLines([
			HEADER,
			`Impossible value: ${describeValue(value)}`,
			issueLine(issueUrl),
		]),
		cause: { value, issueUrl },
	});
}

/**
 * Whether `value` is the panic {@linkcode unreachable} throws. It runs no
 * Proxy trap, and a `Panic` built by hand with the same name is not one.
 *
 * @param value Any caught value
 * @returns True if `unreachable` threw `value`, narrowing it to
 *   `Panic<UnreachableCause>`
 *
 * @example
 * ```ts
 * import { definePanicRuntime } from "@sekhmet/panic";
 * import {
 *   isUnreachablePanic,
 *   unreachable,
 * } from "@sekhmet/workflow/unreachable";
 * import { assertEquals } from "@std/assert";
 *
 * const runtime = definePanicRuntime();
 * let bugs = 0;
 * runtime.setHook(({ payload }) => {
 *   if (isUnreachablePanic(payload)) bugs++;
 * });
 *
 * runtime.catchUnwind(() => unreachable());
 *
 * assertEquals(bugs, 1);
 * ```
 */
export function isUnreachablePanic(
	value: unknown,
): value is Panic<UnreachableCause> {
	return WorkflowPanic.kindOf(value) === "Unreachable";
}

const HEADER = "an unreachable code path was executed";
