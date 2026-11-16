/**
 * Concurrent operations bridging Effect and Fiber.
 *
 * This module owns the functions that require knowledge of both the Effect
 * and Fiber abstractions. Keeping them here breaks the circular dependency
 * that would otherwise exist between `effect/mini` and `fiber/mini`.
 *
 * @module
 */

import { match } from "@sekhmet/enum/core/mini/exit";
import { None, type Option } from "@sekhmet/enum/option/mini/core";
import { insert } from "@sekhmet/enum/option/mini/mutation";
import { inspect as inspectOption } from "@sekhmet/enum/option/mini/transform";
import { Err, Ok } from "@sekhmet/enum/result/mini";
import { Async, Deferred, Ready } from "../continuation/continuation.ts";
import { Effect, ExceptionOccurred, Failed } from "../effect/mini/effect.ts";
import { cancel, type Fiber, join } from "../fiber/mini/fiber.ts";
import type { FiberError } from "../fiber/mini/fiber-error.ts";

/**
 * Runs two effects concurrently using fibers and combines their results into a tuple.
 * If either effect fails, the other is cancelled and the error is propagated.
 *
 * @template I - Input type
 * @template T - First effect success type
 * @template E - Error type (shared by both effects)
 * @template U - Second effect success type
 * @param self - The first effect
 * @param other - The second effect to run in parallel
 * @returns A new effect that succeeds with a tuple of both results
 *
 * @example
 * ```ts ignore
 * const both = zip(fetchUser, fetchPosts);
 * ```
 */
export function zip<I, T, E, U>(
	self: Effect<I, T, E>,
	other: Effect<I, U, E>,
): Effect<I, [left: T, right: U], E> {
	return new Effect((input, ctx) => {
		return Deferred(() => {
			const selfFiber = ctx.fork(self, input);
			const otherFiber = ctx.fork(other, input);

			return Async((resolve) => {
				const left: Option<T> = None();
				const right: Option<U> = None();
				let settled = false;

				join(selfFiber, (result) => {
					match(result)({
						Ok: (leftValue) => {
							insert(left, leftValue);

							inspectOption(right, (rightValue) => {
								if (settled) return;
								settled = true;

								resolve(Ready(Ok([leftValue, rightValue])));
							});
						},
						Err: fail,
					});
				});
				join(otherFiber, (result) => {
					match(result)({
						Ok: (rightValue) => {
							insert(right, rightValue);

							inspectOption(left, (leftValue) => {
								if (settled) return;
								settled = true;

								resolve(Ready(Ok([leftValue, rightValue])));
							});
						},
						Err: fail,
					});
				});

				return () => {
					cancel(selfFiber);
					cancel(otherFiber);
				};

				function fail(fiberError: FiberError<E>): void {
					if (settled) return;
					settled = true;

					cancel(selfFiber);
					cancel(otherFiber);

					match(fiberError)({
						Failed: (error) => resolve(Ready(Err(Failed(error)))),
						Cancelled: () => {
							resolve(
								Ready(Err(ExceptionOccurred(new Error("Fiber was cancelled")))),
							);
						},
						Panicked: (exception) => {
							resolve(Ready(Err(ExceptionOccurred(exception))));
						},
					});
				}
			});
		});
	});
}

/**
 * Returns an effect that completes when the fiber completes, propagating the
 * fiber's result as the effect's result.
 *
 * @template I - Input type
 * @template T - Success value type
 * @template E - Error type
 * @param self - The fiber to await
 * @returns An effect that resolves with the fiber's result
 *
 * @example
 * ```ts ignore
 * const awaited = joinEffect(fiber);
 * ```
 */
export function joinEffect<I, T, E>(
	self: Fiber<I, T, E>,
): Effect<void, T, FiberError<E>> {
	return new Effect(() => {
		return Async((resolve) => {
			join(self, (result) => {
				match(result)({
					Ok: (value) => {
						resolve(Ready(Ok(value)));
					},
					Err: (fiberError) => {
						resolve(Ready(Err(Failed(fiberError))));
					},
				});
			});
		});
	});
}
