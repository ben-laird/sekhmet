/**
 * The {@linkcode Recovery} class, the `succeed`, `fail` and `sync`
 * constructors, and `run`.
 *
 * @module
 */

import type { Result } from "@sekhmet/enum/result/mini";
import { Err, fromResult, Ok, type Outcome } from "@sekhmet/panic/outcome/mini";
import { getStructParams, Struct } from "@sekhmet/primordials/struct";
import { resolved, type Vow } from "@sekhmet/vow/mini";

/**
 * A typed repair: `(value: T) => Vow<Outcome<R, E, unknown>>`. Given an
 * issue's value, it yields `Ok` with the residue that handles the issue,
 * `Err` with the error it failed with, or `Panicked` with the payload of a
 * bug it hit (only `fromPromise` makes one: the panic runtime's hook reports
 * it, and every combinator stops there). It can be sync or async; a sync one
 * returns an already-resolved vow.
 *
 * Its type decides which issues it fits (their value type `T` and residue
 * type `R`), so it never needs to decline at runtime. Build one with
 * `new Recovery(fn)`, or with {@linkcode succeed}, {@linkcode fail},
 * {@linkcode sync} or `fromPromise`.
 *
 * @template T The value of the issues it repairs
 * @template R The residue it yields
 * @template E The error it fails with
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Ok, unwrap } from "@sekhmet/panic/outcome/mini";
 * import { Recovery, run } from "@sekhmet/issue/recovery/mini";
 * import { resolved, wait } from "@sekhmet/vow/mini";
 *
 * const byName = new Recovery(({ path }: { readonly path: string }) => {
 * 	return resolved(Ok<number, never, never>(path === "dev.json" ? 3000 : 80));
 * });
 *
 * assertEquals(unwrap(await wait(run(byName, { path: "dev.json" }))), 3000);
 * ```
 */
export class Recovery<T, out R, out E> extends Struct<
	(value: T) => Vow<Outcome<R, E, unknown>>
> {}

/**
 * Runs a recovery on a value.
 *
 * @template T The value of the issues it repairs
 * @template R The residue it yields
 * @template E The error it fails with
 * @param self The recovery to run
 * @param value The value to repair
 * @returns A vow of the residue as `Ok`, the error as `Err`, or a panic as
 *   `Panicked`
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { unwrap } from "@sekhmet/panic/outcome/mini";
 * import { run, succeed } from "@sekhmet/issue/recovery/mini";
 * import { wait } from "@sekhmet/vow/mini";
 *
 * assertEquals(unwrap(await wait(run(succeed(8080), "ignored"))), 8080);
 * ```
 */
export function run<T, R, E>(
	self: Recovery<T, R, E>,
	value: T,
): Vow<Outcome<R, E, unknown>> {
	return getStructParams(self)(value);
}

/**
 * A recovery that always succeeds with `residue`, whatever the value.
 *
 * @template T The value of the issues it repairs
 * @template R The residue it yields
 * @param residue The residue it yields
 * @returns A recovery that resolves `Ok(residue)` at once
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { unwrap } from "@sekhmet/panic/outcome/mini";
 * import { run, succeed } from "@sekhmet/issue/recovery/mini";
 * import { wait } from "@sekhmet/vow/mini";
 *
 * const useDefault = succeed({ port: 8080 });
 *
 * assertEquals(unwrap(await wait(run(useDefault, "app.json"))), { port: 8080 });
 * ```
 */
export function succeed<T, R>(residue: R): Recovery<T, R, never> {
	return new Recovery<T, R, never>(() => {
		return resolved(Ok<R, never, unknown>(residue));
	});
}

/**
 * A recovery that always fails with `error`, whatever the value.
 *
 * @template T The value of the issues it repairs
 * @template E The error it fails with
 * @param error The error it fails with
 * @returns A recovery that resolves `Err(error)` at once
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { unwrapErr } from "@sekhmet/panic/outcome/mini";
 * import { fail, run } from "@sekhmet/issue/recovery/mini";
 * import { wait } from "@sekhmet/vow/mini";
 *
 * assertEquals(unwrapErr(await wait(run(fail("read-only"), "app.json"))), "read-only");
 * ```
 */
export function fail<T, E>(error: E): Recovery<T, never, E> {
	return new Recovery<T, never, E>(() => {
		return resolved(Err<never, E, unknown>(error));
	});
}

/**
 * A recovery from a synchronous repair: its `Result` becomes the `Ok` or
 * `Err` outcome of an already-resolved vow. A throw from `repair` is a bug
 * and propagates to whoever ran the recovery; no panic runtime catches it.
 *
 * @template T The value of the issues it repairs
 * @template R The residue it yields
 * @template E The error it fails with
 * @param repair Turns the value into the residue, or the error
 * @returns A recovery that resolves at once with `repair`'s result
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Err, Ok } from "@sekhmet/enum/result/mini";
 * import { unwrap } from "@sekhmet/panic/outcome/mini";
 * import { run, sync } from "@sekhmet/issue/recovery/mini";
 * import { wait } from "@sekhmet/vow/mini";
 *
 * const parsePort = sync((text: string) => {
 * 	const port = Number(text);
 * 	return Number.isInteger(port) ? Ok(port) : Err(`not a port: ${text}`);
 * });
 *
 * assertEquals(unwrap(await wait(run(parsePort, "8080"))), 8080);
 * ```
 */
export function sync<T, R, E>(
	repair: (value: T) => Result<R, E>,
): Recovery<T, R, E> {
	return new Recovery<T, R, E>((value) => resolved(fromResult(repair(value))));
}
