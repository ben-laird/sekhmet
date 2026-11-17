/**
 * Capturing a function's throw as a `Result`: `fallible` and `fallibleAsync`.
 *
 * Both mirror a plain `try`/`catch`/`finally`. A throw from `fn` becomes
 * `Err(parseErr(…))`, and `cleanup` runs last on every path. A throw from
 * `parseErr` or `cleanup` is not captured: the thrown value propagates
 * uncaught (it is a bug, not an `E`), and a throw from `cleanup` replaces
 * whatever `fn` or `parseErr` produced, just as a throw in a `finally` block
 * does.
 *
 * The wrapper passes `fn` its arguments but not its `this`: wrap a method as
 * `fn: (...args) => object.method(...args)` or bind it first. `parseErr` and
 * `cleanup` see the same arguments as `Readonly`, so `parseErr` can't change
 * what `cleanup` sees.
 *
 * @module
 */

import { Err, Ok, type Result } from "./core.ts";
import type { NotPromise } from "./promise.ts";

/**
 * Options for {@linkcode fallible}. Every callback is synchronous: an async
 * one does not compile (use {@linkcode fallibleAsync}).
 *
 * @template A - The wrapped function's parameter list
 * @template U - The wrapped function's return type
 * @template E - The error type `parseErr` produces
 * @template C - What `cleanup` returns, which is ignored unless it's a promise
 */
export type FallibleOptions<A extends unknown[], U, E, C = void> = {
	/** The function that may throw. */
	fn: (...args: A) => NotPromise<U>;
	/** Turns what `fn` threw, and the arguments it got, into the error. */
	parseErr: (caught: {
		error: unknown;
		args: Readonly<NoInfer<A>>;
	}) => NotPromise<E>;
	/**
	 * Runs after every call, whether `fn` returned or threw. Its return value
	 * is ignored, but it must not be a promise, which nothing would await.
	 */
	cleanup?: (call: { args: Readonly<NoInfer<A>> }) => NotPromise<C>;
};

/**
 * Wraps a function that may throw so that it returns a `Result` instead.
 *
 * A return from `fn` becomes `Ok`, and a throw becomes `Err` of what
 * `parseErr` makes of it. `cleanup`, when given, runs in a `finally` block
 * after either. A throw from `parseErr` or `cleanup` propagates (a throw
 * from `cleanup` replaces the outcome), as in a plain `try`/`catch`/`finally`.
 *
 * The callbacks must be synchronous, so an async `fn`, `parseErr` or
 * `cleanup` is a compile error rather than an `Ok(promise)`, an
 * `Err(promise)` or a cleanup nobody awaits; use {@linkcode fallibleAsync}.
 * The check can't see through a caller's own type parameter, so a function
 * generic in its return type, such as `<T>(g: () => T) => fallible({ fn: g,
 * … })`, doesn't compile, since its `T` might be a promise (see
 * {@linkcode NotPromise}).
 *
 * @template A - The wrapped function's parameter list
 * @template U - The wrapped function's return type
 * @template E - The error type `parseErr` produces
 * @template C - What `cleanup` returns, which is ignored unless it's a promise
 * @param options - The function, its error parser and an optional cleanup
 * @returns A function taking `fn`'s arguments and returning its outcome as a `Result`
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Err, fallible, Ok } from "@sekhmet/enum/result/mini";
 *
 * const parseJson = fallible({
 * 	fn: (text: string): unknown => JSON.parse(text),
 * 	parseErr: ({ args: [text] }) => `not JSON: ${text}`,
 * });
 *
 * assertEquals(parseJson('{"a":1}'), Ok({ a: 1 }));
 * assertEquals(parseJson("{"), Err("not JSON: {"));
 * ```
 */
export function fallible<A extends unknown[], U, E, C = void>(
	options: FallibleOptions<A, U, E, C>,
): (...args: A) => Result<U, E> {
	const { fn, parseErr, cleanup } = options;

	return (...args) => {
		try {
			return Ok(fn(...args));
		} catch (error: unknown) {
			return Err(parseErr({ error, args }));
		} finally {
			cleanup?.({ args });
		}
	};
}

/**
 * Options for {@linkcode fallibleAsync}. Each callback may be async.
 *
 * @template A - The wrapped function's parameter list
 * @template U - The value the wrapped function returns or resolves to
 * @template E - The error type `parseErr` produces or resolves to
 */
export type FallibleAsyncOptions<A extends unknown[], U, E> = {
	/** The function that may throw or reject. */
	fn: (...args: A) => U | PromiseLike<U>;
	/** Turns what `fn` threw or rejected with, and its arguments, into the error. */
	parseErr: (caught: {
		error: unknown;
		args: Readonly<NoInfer<A>>;
	}) => E | PromiseLike<E>;
	/** Runs, and is awaited, after every call, whether `fn` settled or threw. */
	cleanup?: (call: { args: Readonly<NoInfer<A>> }) => void | PromiseLike<void>;
};

/**
 * Wraps a function that may throw or reject so that it resolves to a
 * `Result` instead.
 *
 * `fn`, `parseErr` and `cleanup` may each be sync or async. A value from
 * `fn` (returned or resolved) becomes `Ok`, and a throw or rejection becomes
 * `Err` of what `parseErr` makes of it. `cleanup`, when given, is awaited in
 * a `finally` block before the promise settles. A throw or rejection from
 * `parseErr` or `cleanup` rejects the returned promise (one from `cleanup`
 * replaces the outcome), as in an `async` `try`/`catch`/`finally`.
 *
 * @template A - The wrapped function's parameter list
 * @template U - The value the wrapped function returns or resolves to
 * @template E - The error type `parseErr` produces or resolves to
 * @param options - The function, its error parser and an optional cleanup
 * @returns A function taking `fn`'s arguments and resolving to its outcome as a `Result`
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Err, fallibleAsync, Ok } from "@sekhmet/enum/result/mini";
 *
 * const load = fallibleAsync({
 * 	fn: async (id: number): Promise<string> => {
 * 		if (id !== 1) throw new Error(`no user ${id}`);
 * 		return "Ada";
 * 	},
 * 	parseErr: ({ error }) => String(error),
 * });
 *
 * assertEquals(await load(1), Ok("Ada"));
 * assertEquals(await load(2), Err("Error: no user 2"));
 * ```
 */
export function fallibleAsync<A extends unknown[], U, E>(
	options: FallibleAsyncOptions<A, U, E>,
): (...args: A) => Promise<Result<U, E>> {
	const { fn, parseErr, cleanup } = options;

	return async (...args) => {
		try {
			return Ok(await fn(...args));
		} catch (error: unknown) {
			return Err(await parseErr({ error, args }));
		} finally {
			await cleanup?.({ args });
		}
	};
}
