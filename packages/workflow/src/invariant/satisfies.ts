/**
 * `satisfies`: an invariant check that a value passes a predicate, returning
 * it narrowed when the predicate is a type guard.
 *
 * @module
 */

import { readField } from "../workflow-panic/read.ts";
import type { InvariantOptions } from "./invariant.ts";
import { violated } from "./violation.ts";

/** What {@linkcode satisfies} is given with a plain predicate. */
export interface SatisfiesOptions<T> extends InvariantOptions {
	/** Whether the value is as the program expects */
	readonly predicate: (value: T) => boolean;
}

/** What {@linkcode satisfies} is given with a type guard. */
export interface SatisfiesGuardOptions<T, S extends T>
	extends InvariantOptions {
	/** Whether the value is as the program expects, narrowing it to `S` */
	readonly predicate: (value: T) => value is S;
}

/**
 * Returns `value` when `predicate` accepts it, narrowed to `S` when the
 * predicate is a type guard `(value: T) => value is S`, and otherwise panics
 * as `Panic (Invariant)`. Use it where a rejected value means the program has
 * a bug, never to check input. `T` is inferred from the value, so a guard
 * over a wider type (say, `unknown`) still narrows. The predicate is called
 * as a method of the options; to reuse a check, wrap the call in a function.
 *
 * A predicate need not be written as a guard to narrow: TypeScript 5.5 and
 * later infer a function like `(v) => typeof v === "string"` or
 * `(v) => v !== undefined` as one. A discriminant check such as
 * `(s) => s.kind === "circle"` written inline in the options is not
 * inferred, so it leaves `T` as it is; declare it on its own
 * (`const isCircle = (s: Shape) => s.kind === "circle"`), where TypeScript
 * infers the guard, or annotate its return type (`s is Circle`).
 *
 * A predicate that throws is not caught: its error propagates unchanged, as
 * from `Array.prototype.filter`, and only a rejection panics.
 *
 * The message shows the rejected value:
 *
 * ```txt
 * an invariant was violated
 * Expected behavior: a quantity should be a positive integer
 * Rejected value: -1
 * ```
 *
 * @param value The value to check
 * @param options The predicate, the expected behavior, and an optional issue
 *   URL
 * @returns `value`, narrowed to the guard's `S`
 *
 * @example
 * ```ts
 * import { isInvariantPanic, satisfies } from "@sekhmet/workflow/invariant";
 * import { assert, assertEquals, assertThrows } from "@std/assert";
 *
 * type Shape = { kind: "circle"; r: number } | { kind: "square"; side: number };
 * const isCircle = (shape: Shape): shape is Extract<Shape, { kind: "circle" }> => {
 *   return shape.kind === "circle";
 * };
 *
 * const radius = (shape: Shape): number => {
 *   return satisfies(shape, {
 *     predicate: isCircle,
 *     expectedBehavior: "a wheel should be a circle",
 *   }).r;
 * };
 *
 * assertEquals(radius({ kind: "circle", r: 2 }), 2);
 *
 * const thrown = assertThrows(() => radius({ kind: "square", side: 2 }));
 * assert(isInvariantPanic(thrown));
 * assertEquals(thrown.cause.check, {
 *   kind: "satisfies",
 *   value: { kind: "square", side: 2 },
 * });
 * ```
 */
export function satisfies<T, S extends T>(
	value: T,
	options: SatisfiesGuardOptions<NoInfer<T>, S>,
): S;
/**
 * Returns `value` when `predicate` accepts it, and otherwise panics as
 * `Panic (Invariant)`, showing the rejected value.
 *
 * @param value The value to check
 * @param options The predicate, the expected behavior, and an optional issue
 *   URL
 * @returns `value`, unchanged
 */
export function satisfies<T>(
	value: T,
	options: SatisfiesOptions<NoInfer<T>>,
): T;
export function satisfies(
	value: unknown,
	options: SatisfiesOptions<unknown>,
): unknown {
	if (accepts({ value, options })) {
		return value;
	}
	violated({ check: { kind: "satisfies", value }, options });
}

/**
 * Whether the caller's predicate accepts `value`, called as a method of
 * `options`; a predicate that is missing or not a function accepts nothing.
 */
function accepts({
	value,
	options,
}: {
	value: unknown;
	options: unknown;
}): boolean {
	const read = readField({ from: options, key: "predicate" });
	if (read.kind !== "present" || typeof read.value !== "function") {
		return false;
	}
	return Boolean(Reflect.apply(read.value, options, [value]));
}
