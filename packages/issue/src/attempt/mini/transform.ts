/**
 * Transforming an attempt: `map` and `mapErr` change what it holds, keeping
 * its variant; `inspect` and `inspectErr` look at it on the way through.
 *
 * @module
 */

import { inspectIsolated, match } from "@sekhmet/enum/core/mini";
import {
	AlreadyHandled,
	type Attempt,
	Failed,
	Handled,
	Panicked,
} from "./core.ts";

/**
 * Maps the residue of a handled attempt, keeping whether it was `Handled` or
 * `AlreadyHandled`. A `Failed` attempt passes through.
 *
 * @template R The residue handling yields
 * @template E The error a failed recovery returned
 * @template U The mapped residue
 * @param self The attempt to map
 * @param mapping Turns the residue into another
 * @returns The attempt with its residue mapped
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { AlreadyHandled, map } from "@sekhmet/issue/attempt/mini";
 *
 * assertEquals(map(AlreadyHandled(8080), String), AlreadyHandled("8080"));
 * ```
 */
export function map<R, E, U>(
	self: Attempt<R, E>,
	mapping: (residue: R) => U,
): Attempt<U, E> {
	return match(self)({
		AlreadyHandled: (value) => AlreadyHandled<U, E>(mapping(value)),
		Handled: (value) => Handled<U, E>(mapping(value)),
		Failed: (value) => Failed<U, E>(value),
		Panicked: (payload) => Panicked<U, E>(payload),
	});
}

/**
 * Maps the error of a failed attempt. A handled attempt passes through.
 *
 * @template R The residue handling yields
 * @template E The error a failed recovery returned
 * @template F The mapped error
 * @param self The attempt to map
 * @param mapping Turns the error into another
 * @returns The attempt with its error mapped
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Failed, mapErr } from "@sekhmet/issue/attempt/mini";
 *
 * assertEquals(mapErr(Failed("offline"), (e) => e.length), Failed(7));
 * ```
 */
export function mapErr<R, E, F>(
	self: Attempt<R, E>,
	mapping: (error: E) => F,
): Attempt<R, F> {
	return match(self)({
		AlreadyHandled: (value) => AlreadyHandled<R, F>(value),
		Handled: (value) => Handled<R, F>(value),
		Failed: (value) => Failed<R, F>(mapping(value)),
		Panicked: (payload) => Panicked<R, F>(payload),
	});
}

/**
 * Calls `inspector` with the residue if the issue ended up handled (by this
 * attempt or before it), then returns the attempt unchanged.
 *
 * @template R The residue handling yields
 * @template E The error a failed recovery returned
 * @param self The attempt to inspect
 * @param inspector Looks at the residue
 * @returns `self`
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Handled, inspect } from "@sekhmet/issue/attempt/mini";
 *
 * const seen: number[] = [];
 * inspect(Handled(8080), (port) => seen.push(port));
 *
 * assertEquals(seen, [8080]);
 * ```
 */
export function inspect<R, E>(
	self: Attempt<R, E>,
	inspector: (residue: R) => void,
): Attempt<R, E> {
	inspectIsolated(self, "AlreadyHandled", inspector);
	inspectIsolated(self, "Handled", inspector);

	return self;
}

/**
 * Calls `inspector` with the error if the recovery failed, then returns the
 * attempt unchanged.
 *
 * @template R The residue handling yields
 * @template E The error a failed recovery returned
 * @param self The attempt to inspect
 * @param inspector Looks at the error
 * @returns `self`
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Failed, inspectErr } from "@sekhmet/issue/attempt/mini";
 *
 * const seen: string[] = [];
 * inspectErr(Failed("offline"), (error) => seen.push(error));
 *
 * assertEquals(seen, ["offline"]);
 * ```
 */
export function inspectErr<R, E>(
	self: Attempt<R, E>,
	inspector: (error: E) => void,
): Attempt<R, E> {
	inspectIsolated(self, "Failed", inspector);

	return self;
}
