/**
 * Transforming an outcome: `map`, `mapErr`, `mapOr`, `mapOrElse`, `inspect`
 * and `inspectErr`. Each passes a `Panicked` through untouched; `mapOr` and
 * `mapOrElse`, which return no Outcome, resume it.
 *
 * @module
 */

import { match } from "@sekhmet/enum/core/mini/exit";
import { inspectIsolated } from "@sekhmet/enum/core/mini/isolate";
import { Err, Ok, type Outcome, Panicked } from "./core.ts";
import { resume } from "./panic.ts";

/**
 * Maps an Outcome's success value by applying a function to it. `Err` and
 * `Panicked` pass through unchanged.
 *
 * @template T The type of the original success value
 * @template E The type of the error
 * @template P The type of the panic payload
 * @template U The type of the mapped success value
 * @param self The Outcome to map
 * @param mapping A function that transforms the success value
 * @returns The Outcome with its value mapped if Ok, otherwise unchanged
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Ok, type Outcome, Panicked, map } from "@sekhmet/panic/outcome/mini";
 *
 * const bug: Outcome<number, string> = Panicked("boom");
 *
 * assertEquals(map(Ok(5), (n) => n * 2), Ok(10));
 * assertEquals(map(bug, (n) => n * 2), Panicked("boom"));
 * ```
 */
export function map<T, E, P, U>(
	self: Outcome<T, E, P>,
	mapping: (value: T) => U,
): Outcome<U, E, P> {
	return match(self)({
		Ok: (value) => Ok<U, E, P>(mapping(value)),
		Err: (error) => Err<U, E, P>(error),
		Panicked: (payload) => Panicked<U, E, P>(payload),
	});
}

/**
 * Maps an Outcome's expected error by applying a function to it. `Ok` and
 * `Panicked` pass through unchanged: a panic is never an expected error.
 *
 * @template T The type of the success value
 * @template E The type of the original error
 * @template P The type of the panic payload
 * @template F The type of the mapped error
 * @param self The Outcome to map
 * @param mapping A function that transforms the error
 * @returns The Outcome with its error mapped if Err, otherwise unchanged
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Err, type Outcome, Panicked, mapErr } from "@sekhmet/panic/outcome/mini";
 *
 * const failed: Outcome<number, string> = Err("failed");
 * const bug: Outcome<number, string> = Panicked("boom");
 *
 * assertEquals(mapErr(failed, (e) => e.toUpperCase()), Err("FAILED"));
 * assertEquals(mapErr(bug, (e) => e.toUpperCase()), Panicked("boom"));
 * ```
 */
export function mapErr<T, E, P, F>(
	self: Outcome<T, E, P>,
	mapping: (error: E) => F,
): Outcome<T, F, P> {
	return match(self)({
		Ok: (value) => Ok<T, F, P>(value),
		Err: (error) => Err<T, F, P>(mapping(error)),
		Panicked: (payload) => Panicked<T, F, P>(payload),
	});
}

/**
 * Maps an Outcome's success value, or returns a fallback if it is Err. A
 * `Panicked` is resumed: its payload is thrown again.
 *
 * @template T The type of the success value
 * @template E The type of the error
 * @template P The type of the panic payload
 * @template U The type of the mapped value and the fallback
 * @param self The Outcome to map
 * @param options `mapping` transforms an Ok value; `fallback` is returned for an Err
 * @returns `mapping(value)` if Ok, `fallback` if Err
 * @throws The panic payload, unchanged, if the Outcome is Panicked
 *
 * @example
 * ```ts
 * import { assertEquals, assertThrows } from "@std/assert";
 * import { Err, Ok, type Outcome, Panicked, mapOr } from "@sekhmet/panic/outcome/mini";
 *
 * const options = { fallback: 0, mapping: (n: number) => n * 2 };
 * const failed: Outcome<number, string> = Err("failed");
 * const bug: Outcome<number, string> = Panicked(new RangeError("too big"));
 *
 * assertEquals(mapOr(Ok(5), options), 10);
 * assertEquals(mapOr(failed, options), 0);
 * assertThrows(() => mapOr(bug, options), RangeError, "too big");
 * ```
 */
export function mapOr<T, E, P, U>(
	self: Outcome<T, E, P>,
	options: { readonly fallback: U; readonly mapping: (value: T) => U },
): U {
	return match(resume(self))({
		Ok: options.mapping,
		Err: () => options.fallback,
	});
}

/**
 * Maps an Outcome by applying one function to a success value and another
 * to an error. A `Panicked` is resumed: its payload is thrown again.
 *
 * @template T The type of the success value
 * @template E The type of the error
 * @template P The type of the panic payload
 * @template U The type both functions return
 * @param self The Outcome to map
 * @param handlers `onOk` handles a success value, `onErr` an error
 * @returns `onOk(value)` if Ok, `onErr(error)` if Err
 * @throws The panic payload, unchanged, if the Outcome is Panicked
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Err, Ok, type Outcome, mapOrElse } from "@sekhmet/panic/outcome/mini";
 *
 * const describe = (outcome: Outcome<number, string>): string => {
 *   return mapOrElse(outcome, {
 *     onOk: (n) => `got ${n}`,
 *     onErr: (e) => `failed: ${e}`,
 *   });
 * };
 *
 * assertEquals(describe(Ok(5)), "got 5");
 * assertEquals(describe(Err("timeout")), "failed: timeout");
 * ```
 */
export function mapOrElse<T, E, P, U>(
	self: Outcome<T, E, P>,
	handlers: {
		readonly onOk: (value: T) => U;
		readonly onErr: (error: E) => U;
	},
): U {
	return match(resume(self))({
		Ok: handlers.onOk,
		Err: handlers.onErr,
	});
}

/**
 * Calls a function with the success value, if Ok, and returns the Outcome
 * itself, so calls chain.
 *
 * @template T The type of the success value
 * @template E The type of the error
 * @template P The type of the panic payload
 * @param self The Outcome to inspect
 * @param inspector A function that receives the success value
 * @returns `self`, unchanged
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Ok, type Outcome, Panicked, inspect } from "@sekhmet/panic/outcome/mini";
 *
 * const seen: number[] = [];
 * const bug: Outcome<number, string> = Panicked("boom");
 *
 * assertEquals(inspect(Ok(42), (n) => seen.push(n)), Ok(42));
 * inspect(bug, (n) => seen.push(n)); // does nothing
 * assertEquals(seen, [42]);
 * ```
 */
export function inspect<T, E, P>(
	self: Outcome<T, E, P>,
	inspector: (value: T) => void,
): Outcome<T, E, P> {
	inspectIsolated(self, "Ok", inspector);

	return self;
}

/**
 * Calls a function with the expected error, if Err, and returns the Outcome
 * itself, so calls chain. A panic is not an error: it is never inspected
 * here (see `inspectPanic`).
 *
 * @template T The type of the success value
 * @template E The type of the error
 * @template P The type of the panic payload
 * @param self The Outcome to inspect
 * @param inspector A function that receives the error
 * @returns `self`, unchanged
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Err, type Outcome, Panicked, inspectErr } from "@sekhmet/panic/outcome/mini";
 *
 * const seen: string[] = [];
 * const bug: Outcome<number, string> = Panicked("boom");
 *
 * inspectErr(Err("failed"), (e) => seen.push(e));
 * inspectErr(bug, (e) => seen.push(e)); // does nothing
 * assertEquals(seen, ["failed"]);
 * ```
 */
export function inspectErr<T, E, P>(
	self: Outcome<T, E, P>,
	inspector: (error: E) => void,
): Outcome<T, E, P> {
	inspectIsolated(self, "Err", inspector);

	return self;
}
