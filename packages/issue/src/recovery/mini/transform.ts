/**
 * Transforming a recovery: `map`, `mapErr` and `andThen` change what it
 * yields, `mapInput` changes what it repairs, and `inspect` and `inspectErr`
 * look at its result on the way through. A `Panicked` outcome passes
 * through each of them untouched.
 *
 * @module
 */

import { match } from "@sekhmet/enum/core/mini";
import {
	Err,
	inspect as inspectOutcome,
	inspectErr as inspectOutcomeErr,
	map as mapOutcome,
	mapErr as mapOutcomeErr,
	type Outcome,
	Panicked,
} from "@sekhmet/panic/outcome/mini";
import {
	andThen as andThenVow,
	map as mapVow,
	resolved,
	type Vow,
} from "@sekhmet/vow/mini";
import { Recovery, run } from "./core.ts";

/**
 * Maps the residue a recovery yields. A failure passes through.
 *
 * A throw from `mapping` is a bug, and follows {@linkcode Recovery}'s rule for
 * throws: it propagates in a sync chain, and reaches the panic hook in an
 * async one, where the attempt never settles.
 *
 * @template T The value of the issues it repairs
 * @template R The residue it yields
 * @template E The error it fails with
 * @template U The mapped residue
 * @param self The recovery to map
 * @param mapping Turns the residue into another
 * @returns A recovery that yields the mapped residue
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { unwrap } from "@sekhmet/panic/outcome/mini";
 * import { map, type Recovery, run, succeed } from "@sekhmet/issue/recovery/mini";
 * import { wait } from "@sekhmet/vow/mini";
 *
 * const useDefault: Recovery<string, number, never> = succeed(8080);
 * const port = map(useDefault, (n) => ({ port: n }));
 *
 * assertEquals(unwrap(await wait(run(port, "app.json"))), { port: 8080 });
 * ```
 */
export function map<T, R, E, U>(
	self: Recovery<T, R, E>,
	mapping: (residue: R) => U,
): Recovery<T, U, E> {
	return new Recovery<T, U, E>((value) => {
		return mapVow(run(self, value), (result) => mapOutcome(result, mapping));
	});
}

/**
 * Maps the error a recovery fails with. A success passes through.
 *
 * A throw from `mapping` is a bug, and follows {@linkcode Recovery}'s rule for
 * throws: it propagates in a sync chain, and reaches the panic hook in an
 * async one, where the attempt never settles.
 *
 * @template T The value of the issues it repairs
 * @template R The residue it yields
 * @template E The error it fails with
 * @template F The mapped error
 * @param self The recovery to map
 * @param mapping Turns the error into another
 * @returns A recovery that fails with the mapped error
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { unwrapErr } from "@sekhmet/panic/outcome/mini";
 * import { fail, mapErr, type Recovery, run } from "@sekhmet/issue/recovery/mini";
 * import { wait } from "@sekhmet/vow/mini";
 *
 * const fetchRemote: Recovery<string, number, string> = fail("offline");
 * const coded = mapErr(fetchRemote, (e) => ({ reason: e }));
 *
 * assertEquals(unwrapErr(await wait(run(coded, "app.json"))), { reason: "offline" });
 * ```
 */
export function mapErr<T, R, E, F>(
	self: Recovery<T, R, E>,
	mapping: (error: E) => F,
): Recovery<T, R, F> {
	return new Recovery<T, R, F>((value) => {
		return mapVow(run(self, value), (result) => {
			return mapOutcomeErr(result, mapping);
		});
	});
}

/**
 * Chains a step that can fail onto a recovery's residue: when the recovery
 * succeeds, `next` runs on its residue, and its outcome is the composite's.
 * `next` returns a vow of an `Outcome`, as a recovery does (`run` of another
 * recovery, say). A failure or a panic passes through without running
 * `next`.
 *
 * A throw from `next` is a bug, and follows {@linkcode Recovery}'s rule for
 * throws: it propagates in a sync chain, and reaches the panic hook in an
 * async one, where the attempt never settles.
 *
 * @template T The value of the issues it repairs
 * @template R The residue it yields
 * @template E The error it, or `next`, fails with
 * @template U The residue `next` yields
 * @param self The recovery to run first
 * @param next The step to run on its residue, sync or async
 * @returns A recovery that yields `next`'s residue
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Err, Ok, type Outcome, unwrapErr } from "@sekhmet/panic/outcome/mini";
 * import { andThen, type Recovery, run, succeed } from "@sekhmet/issue/recovery/mini";
 * import { resolved, wait } from "@sekhmet/vow/mini";
 *
 * const useDefault: Recovery<string, number, string> = succeed(80);
 * const checked = andThen(useDefault, (port) => {
 * 	return resolved<Outcome<number, string>>(port > 1024 ? Ok(port) : Err("privileged port"));
 * });
 *
 * assertEquals(unwrapErr(await wait(run(checked, "app.json"))), "privileged port");
 * ```
 */
export function andThen<T, R, E, U>(
	self: Recovery<T, R, E>,
	next: (residue: R) => Vow<Outcome<U, E, unknown>>,
): Recovery<T, U, E> {
	return new Recovery<T, U, E>((value) => {
		return andThenVow(run(self, value), (result) => {
			return match(result)({
				Ok: next,
				Err: (error) => resolved(Err<U, E, unknown>(error)),
				Panicked: (payload) => resolved(Panicked<U, E, unknown>(payload)),
			});
		});
	});
}

/**
 * Adapts a recovery to another value type: `adapt` turns the new value into
 * the one the recovery repairs. Use it, for example, to recover a wrapped
 * issue from the value of its cause.
 *
 * A throw from `adapt` is a bug, and follows {@linkcode Recovery}'s rule for
 * throws: it propagates in a sync chain, and reaches the panic hook in an
 * async one, where the attempt never settles.
 *
 * @template T The value the recovery repairs
 * @template R The residue it yields
 * @template E The error it fails with
 * @template U The value the adapted recovery repairs
 * @param self The recovery to adapt
 * @param adapt Turns the new value into the one `self` repairs
 * @returns A recovery of `U` values
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Ok } from "@sekhmet/enum/result/mini";
 * import { unwrap } from "@sekhmet/panic/outcome/mini";
 * import { mapInput, run, sync } from "@sekhmet/issue/recovery/mini";
 * import { wait } from "@sekhmet/vow/mini";
 *
 * const byPath = sync((path: string) => Ok<number, never>(path.length));
 * const byFile = mapInput(byPath, (file: { readonly path: string }) => file.path);
 *
 * assertEquals(unwrap(await wait(run(byFile, { path: "app.json" }))), 8);
 * ```
 */
export function mapInput<T, R, E, U>(
	self: Recovery<T, R, E>,
	adapt: (value: U) => T,
): Recovery<U, R, E> {
	return new Recovery<U, R, E>((value) => run(self, adapt(value)));
}

/**
 * Calls `inspector` with the residue each time the recovery succeeds, then
 * passes its result on unchanged.
 *
 * A throw from `inspector` is a bug, and follows {@linkcode Recovery}'s rule for
 * throws: it propagates in a sync chain, and reaches the panic hook in an
 * async one, where the attempt never settles.
 *
 * @template T The value of the issues it repairs
 * @template R The residue it yields
 * @template E The error it fails with
 * @param self The recovery to inspect
 * @param inspector Looks at the residue
 * @returns A recovery with the same results
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { inspect, type Recovery, run, succeed } from "@sekhmet/issue/recovery/mini";
 * import { wait } from "@sekhmet/vow/mini";
 *
 * const seen: number[] = [];
 * const useDefault: Recovery<string, number, never> = succeed(8080);
 * await wait(run(inspect(useDefault, (port) => seen.push(port)), "app.json"));
 *
 * assertEquals(seen, [8080]);
 * ```
 */
export function inspect<T, R, E>(
	self: Recovery<T, R, E>,
	inspector: (residue: R) => void,
): Recovery<T, R, E> {
	return new Recovery<T, R, E>((value) => {
		return mapVow(run(self, value), (result) => {
			inspectOutcome(result, inspector);
			return result;
		});
	});
}

/**
 * Calls `inspector` with the error each time the recovery fails, then
 * passes its result on unchanged.
 *
 * A throw from `inspector` is a bug, and follows {@linkcode Recovery}'s rule for
 * throws: it propagates in a sync chain, and reaches the panic hook in an
 * async one, where the attempt never settles.
 *
 * @template T The value of the issues it repairs
 * @template R The residue it yields
 * @template E The error it fails with
 * @param self The recovery to inspect
 * @param inspector Looks at the error
 * @returns A recovery with the same results
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { fail, inspectErr, type Recovery, run } from "@sekhmet/issue/recovery/mini";
 * import { wait } from "@sekhmet/vow/mini";
 *
 * const seen: string[] = [];
 * const fetchRemote: Recovery<string, number, string> = fail("offline");
 * await wait(run(inspectErr(fetchRemote, (e) => seen.push(e)), "app.json"));
 *
 * assertEquals(seen, ["offline"]);
 * ```
 */
export function inspectErr<T, R, E>(
	self: Recovery<T, R, E>,
	inspector: (error: E) => void,
): Recovery<T, R, E> {
	return new Recovery<T, R, E>((value) => {
		return mapVow(run(self, value), (result) => {
			inspectOutcomeErr(result, inspector);
			return result;
		});
	});
}
