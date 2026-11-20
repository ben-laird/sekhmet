/**
 * Getting a value out of an outcome: `unwrap`/`expect` (and their `Err`
 * forms) throw on the other variant; `unwrapOr` and `unwrapOrElse` take a
 * fallback for an `Err`. Each resumes a `Panicked`: it throws the payload
 * again, unchanged, since a fallback for an expected error must never stand
 * in for a bug.
 *
 * @module
 */

import {
	expectErr as expectResultErr,
	expect as expectResultOk,
	unwrapOr as unwrapResultOr,
	unwrapOrElse as unwrapResultOrElse,
} from "@sekhmet/enum/result/mini/unwrap";
import type { Outcome } from "./core.ts";
import { resume } from "./panic.ts";

/**
 * Returns the success value, or throws with a custom message if Err. A
 * `Panicked` is resumed: its payload is thrown again.
 *
 * @template T The type of the success value
 * @template E The type of the error
 * @template P The type of the panic payload
 * @param self The Outcome to unwrap
 * @param message The message to throw if the Outcome is Err
 * @returns The success value
 * @throws Error with the provided message if the Outcome is Err, or the panic payload if Panicked
 *
 * @example
 * ```ts
 * import { assertEquals, assertThrows } from "@std/assert";
 * import { Err, Ok, expect } from "@sekhmet/panic/outcome/mini";
 *
 * assertEquals(expect(Ok(8080), "the port must be set"), 8080);
 * assertThrows(() => expect(Err("unset"), "the port must be set"), Error, "the port must be set");
 * ```
 */
export function expect<T, E, P>(self: Outcome<T, E, P>, message: string): T {
	return expectResultOk(resume(self), message);
}

/**
 * Returns the success value, or throws if Err. A `Panicked` is resumed: its
 * payload is thrown again.
 *
 * @template T The type of the success value
 * @template E The type of the error
 * @template P The type of the panic payload
 * @param self The Outcome to unwrap
 * @returns The success value
 * @throws Error if the Outcome is Err, or the panic payload if Panicked
 *
 * @example
 * ```ts
 * import { assertEquals, assertThrows } from "@std/assert";
 * import { Err, Ok, Panicked, unwrap } from "@sekhmet/panic/outcome/mini";
 *
 * assertEquals(unwrap(Ok(42)), 42);
 * assertThrows(() => unwrap(Err("failed")), Error, "Outcome unwrap failed!");
 * assertThrows(() => unwrap(Panicked(new RangeError("too big"))), RangeError, "too big");
 * ```
 */
export function unwrap<T, E, P>(self: Outcome<T, E, P>): T {
	return expect(self, "Outcome unwrap failed!");
}

/**
 * Returns the expected error, or throws with a custom message if Ok. A
 * `Panicked` is resumed: its payload is thrown again.
 *
 * @template T The type of the success value
 * @template E The type of the error
 * @template P The type of the panic payload
 * @param self The Outcome to unwrap
 * @param message The message to throw if the Outcome is Ok
 * @returns The error
 * @throws Error with the provided message if the Outcome is Ok, or the panic payload if Panicked
 *
 * @example
 * ```ts
 * import { assertEquals, assertThrows } from "@std/assert";
 * import { Err, Ok, expectErr } from "@sekhmet/panic/outcome/mini";
 *
 * assertEquals(expectErr(Err("unset"), "should have failed"), "unset");
 * assertThrows(() => expectErr(Ok(1), "should have failed"), Error, "should have failed");
 * ```
 */
export function expectErr<T, E, P>(self: Outcome<T, E, P>, message: string): E {
	return expectResultErr(resume(self), message);
}

/**
 * Returns the expected error, or throws if Ok. A `Panicked` is resumed: its
 * payload is thrown again.
 *
 * @template T The type of the success value
 * @template E The type of the error
 * @template P The type of the panic payload
 * @param self The Outcome to unwrap
 * @returns The error
 * @throws Error if the Outcome is Ok, or the panic payload if Panicked
 *
 * @example
 * ```ts
 * import { assertEquals, assertThrows } from "@std/assert";
 * import { Err, Ok, unwrapErr } from "@sekhmet/panic/outcome/mini";
 *
 * assertEquals(unwrapErr(Err("failed")), "failed");
 * assertThrows(() => unwrapErr(Ok(42)), Error, "Outcome unwrap failed!");
 * ```
 */
export function unwrapErr<T, E, P>(self: Outcome<T, E, P>): E {
	return expectErr(self, "Outcome unwrap failed!");
}

/**
 * Returns the success value, or a fallback if Err. A `Panicked` is resumed:
 * its payload is thrown again, since the fallback stands in for an expected
 * error, never for a bug.
 *
 * @template T The type of the success value and the fallback
 * @template E The type of the error
 * @template P The type of the panic payload
 * @param self The Outcome to unwrap
 * @param fallback The value to return if the Outcome is Err
 * @returns The success value if Ok, otherwise the fallback
 * @throws The panic payload, unchanged, if the Outcome is Panicked
 *
 * @example
 * ```ts
 * import { assertEquals, assertThrows } from "@std/assert";
 * import { Err, Ok, type Outcome, Panicked, unwrapOr } from "@sekhmet/panic/outcome/mini";
 *
 * const failed: Outcome<number, string> = Err("failed");
 * const bug: Outcome<number, string> = Panicked(new RangeError("too big"));
 *
 * assertEquals(unwrapOr(Ok(42), 0), 42);
 * assertEquals(unwrapOr(failed, 0), 0);
 * assertThrows(() => unwrapOr(bug, 0), RangeError, "too big");
 * ```
 */
export function unwrapOr<T, E, P>(self: Outcome<T, E, P>, fallback: T): T {
	return unwrapResultOr(resume(self), fallback);
}

/**
 * Returns the success value, or computes a fallback from the error if Err. A
 * `Panicked` is resumed: its payload is thrown again.
 *
 * @template T The type of the success value
 * @template E The type of the error
 * @template P The type of the panic payload
 * @param self The Outcome to unwrap
 * @param fallback A function that turns the error into a value
 * @returns The success value if Ok, otherwise the fallback's value
 * @throws The panic payload, unchanged, if the Outcome is Panicked
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Err, Ok, type Outcome, unwrapOrElse } from "@sekhmet/panic/outcome/mini";
 *
 * const failed: Outcome<number, string> = Err("abc");
 *
 * assertEquals(unwrapOrElse(Ok(42), (e: string) => e.length), 42);
 * assertEquals(unwrapOrElse(failed, (e) => e.length), 3);
 * ```
 */
export function unwrapOrElse<T, E, P>(
	self: Outcome<T, E, P>,
	fallback: (error: E) => T,
): T {
	return unwrapResultOrElse(resume(self), fallback);
}
