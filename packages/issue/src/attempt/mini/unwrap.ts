/**
 * Getting a value out of an attempt: `expect`/`unwrap` return the residue
 * and panic on `Failed`, `expectFailed`/`unwrapFailed` return the error and
 * panic otherwise, and `unwrapOr` and `unwrapOrElse` take a fallback. Each
 * resumes a `Panicked` attempt, as `Outcome`'s unwraps do: the payload is
 * thrown again, since no fallback can stand in for a bug.
 *
 * @module
 */

import { match } from "@sekhmet/enum/core/mini";
import { panic } from "@sekhmet/panic/mini/core";
import type { Attempt } from "./core.ts";

/**
 * Returns the residue, or panics with `message` if the recovery failed.
 *
 * @template R The residue handling yields
 * @template E The error a failed recovery returned
 * @param self The attempt to unwrap
 * @param message The panic's message if the attempt failed
 * @returns The residue of a `Handled` or `AlreadyHandled` attempt
 * @throws {Panic} With `message`, and the attempt as its cause, if it is `Failed`
 * @throws The panic payload, resumed, if it is `Panicked`
 *
 * @example
 * ```ts
 * import { assertEquals, assertThrows } from "@std/assert";
 * import { expect, Failed, Handled } from "@sekhmet/issue/attempt/mini";
 *
 * assertEquals(expect(Handled(8080), "the port must be set"), 8080);
 * assertThrows(() => expect(Failed("offline"), "the port must be set"), Error, "the port must be set");
 * ```
 */
export function expect<R, E>(self: Attempt<R, E>, message: string): R {
	return match(self)({
		AlreadyHandled: (value) => value,
		Handled: (value) => value,
		Failed: () => panic({ message, cause: self }),
		Panicked: (payload): never => {
			throw payload;
		},
	});
}

/**
 * Returns the residue, or panics if the recovery failed. Prefer
 * {@linkcode expect}, whose message says why it should have been handled.
 *
 * @template R The residue handling yields
 * @template E The error a failed recovery returned
 * @param self The attempt to unwrap
 * @returns The residue of a `Handled` or `AlreadyHandled` attempt
 * @throws {Panic} "Attempt unwrap failed!", with the attempt as its cause, if it is `Failed`
 * @throws The panic payload, resumed, if it is `Panicked`
 *
 * @example
 * ```ts
 * import { assertEquals, assertThrows } from "@std/assert";
 * import { AlreadyHandled, Failed, unwrap } from "@sekhmet/issue/attempt/mini";
 *
 * assertEquals(unwrap(AlreadyHandled(8080)), 8080);
 * assertThrows(() => unwrap(Failed("offline")), Error, "Attempt unwrap failed!");
 * ```
 */
export function unwrap<R, E>(self: Attempt<R, E>): R {
	return expect(self, "Attempt unwrap failed!");
}

/**
 * Returns the residue, or `fallback` if the recovery failed. A `Panicked`
 * attempt is resumed: its payload is thrown again.
 *
 * @template R The residue handling yields
 * @template E The error a failed recovery returned
 * @param self The attempt to unwrap
 * @param fallback The value to return if the attempt failed
 * @returns The residue, or `fallback`
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { type Attempt, Failed, Handled, unwrapOr } from "@sekhmet/issue/attempt/mini";
 *
 * const failed: Attempt<number, string> = Failed("offline");
 *
 * assertEquals(unwrapOr(Handled(8080), 80), 8080);
 * assertEquals(unwrapOr(failed, 80), 80);
 * ```
 */
export function unwrapOr<R, E>(self: Attempt<R, E>, fallback: R): R {
	return match(self)({
		AlreadyHandled: (value) => value,
		Handled: (value) => value,
		Failed: () => fallback,
		Panicked: (payload): never => {
			throw payload;
		},
	});
}

/**
 * Returns the residue, or computes one from the error if the recovery failed.
 * A `Panicked` attempt is resumed: its payload is thrown again.
 *
 * @template R The residue handling yields
 * @template E The error a failed recovery returned
 * @param self The attempt to unwrap
 * @param fallback Turns the error into a residue
 * @returns The residue, or `fallback`'s value
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { type Attempt, Failed, unwrapOrElse } from "@sekhmet/issue/attempt/mini";
 *
 * const failed: Attempt<number, string> = Failed("offline");
 *
 * assertEquals(unwrapOrElse(failed, (error) => error.length), 7);
 * ```
 */
export function unwrapOrElse<R, E>(
	self: Attempt<R, E>,
	fallback: (error: E) => R,
): R {
	return match(self)({
		AlreadyHandled: (value) => value,
		Handled: (value) => value,
		Failed: fallback,
		Panicked: (payload): never => {
			throw payload;
		},
	});
}

/**
 * Returns the recovery's error, or panics with `message` if the issue ended
 * up handled.
 *
 * @template R The residue handling yields
 * @template E The error a failed recovery returned
 * @param self The attempt to unwrap
 * @param message The panic's message if the attempt did not fail
 * @returns The error of a `Failed` attempt
 * @throws {Panic} With `message`, and the attempt as its cause, if the issue ended up handled
 * @throws The panic payload, resumed, if it is `Panicked`
 *
 * @example
 * ```ts
 * import { assertEquals, assertThrows } from "@std/assert";
 * import { expectFailed, Failed, Handled } from "@sekhmet/issue/attempt/mini";
 *
 * assertEquals(expectFailed(Failed("offline"), "should have failed"), "offline");
 * assertThrows(() => expectFailed(Handled(1), "should have failed"), Error, "should have failed");
 * ```
 */
export function expectFailed<R, E>(self: Attempt<R, E>, message: string): E {
	return match(self)({
		AlreadyHandled: () => panic({ message, cause: self }),
		Handled: () => panic({ message, cause: self }),
		Failed: (value) => value,
		Panicked: (payload): never => {
			throw payload;
		},
	});
}

/**
 * Returns the recovery's error, or panics if the issue ended up handled.
 *
 * @template R The residue handling yields
 * @template E The error a failed recovery returned
 * @param self The attempt to unwrap
 * @returns The error of a `Failed` attempt
 * @throws {Panic} "Attempt unwrap failed!", with the attempt as its cause, if the issue ended up handled
 * @throws The panic payload, resumed, if it is `Panicked`
 *
 * @example
 * ```ts
 * import { assertEquals, assertThrows } from "@std/assert";
 * import { Failed, Handled, unwrapFailed } from "@sekhmet/issue/attempt/mini";
 *
 * assertEquals(unwrapFailed(Failed("offline")), "offline");
 * assertThrows(() => unwrapFailed(Handled(1)), Error, "Attempt unwrap failed!");
 * ```
 */
export function unwrapFailed<R, E>(self: Attempt<R, E>): E {
	return expectFailed(self, "Attempt unwrap failed!");
}
