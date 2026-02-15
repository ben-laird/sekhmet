import { Enum, type Split } from "@sekhmet/enum/core/mini/core";
import { match } from "@sekhmet/enum/core/mini/exit";
import { Err, Ok, type Result } from "@sekhmet/enum/result/mini";
import { getStructParams, Struct } from "@sekhmet/primordials/struct";
import { assertEquals } from "@std/assert";

type EffectFn<I, T, E> = (input: I) => Continuation<Result<T, E>>;

class Effect<I, T, E> extends Struct<EffectFn<I, T, E>> {}

function Success<T>(value: T): Effect<void, T, never> {
	return new Effect(() => Ready(Ok(value)));
}

function Failure<E>(error: E): Effect<void, never, E> {
	return new Effect(() => Ready(Err(error)));
}

function map<I, T, E, U>(
	self: Effect<I, T, E>,
	mapping: (value: T) => U,
): Effect<I, U, E> {
	return new Effect((input) => {
		return loop(getStructParams(self)(input));

		function loop(c: Continuation<Result<T, E>>): Continuation<Result<U, E>> {
			return match(c)({
				Ready: (result) => {
					return match(result)({
						Ok: (value) => Deferred(() => Ready(Ok(mapping(value)))),
						Err: (error) => Ready(Err(error)),
					});
				},
				Async: (continuationFn) => {
					return Async((resolve) => {
						return continuationFn((continuation) => {
							resolve(loop(continuation));
						});
					});
				},
				Deferred: (continuationFn) => Deferred(() => loop(continuationFn())),
			});
		}
	});
}

function mapError<I, T, E, F>(
	self: Effect<I, T, E>,
	mapping: (error: E) => F,
): Effect<I, T, F> {
	return new Effect((input) => {
		return loop(getStructParams(self)(input));

		function loop(c: Continuation<Result<T, E>>): Continuation<Result<T, F>> {
			return match(c)({
				Ready: (result) => {
					return match(result)({
						Ok: (value) => Ready(Ok(value)),
						Err: (error) => Deferred(() => Ready(Err(mapping(error)))),
					});
				},
				Async: (continuationFn) => {
					return Async((resolve) => {
						return continuationFn((continuation) => {
							resolve(loop(continuation));
						});
					});
				},
				Deferred: (continuationFn) => Deferred(() => loop(continuationFn())),
			});
		}
	});
}

function and<I, T, E, U>(
	self: Effect<I, T, E>,
	nextStep: Effect<T, U, E>,
): Effect<I, U, E> {
	return new Effect((input) => {
		return loop(getStructParams(self)(input));

		function loop(c: Continuation<Result<T, E>>): Continuation<Result<U, E>> {
			return match(c)({
				Ready: (result) => {
					return match(result)({
						Ok: (value) => {
							return Deferred(() => {
								return getStructParams(nextStep)(value);
							});
						},
						Err: (error) => Ready(Err(error)),
					});
				},
				Async: (continuationFn) => {
					return Async((resolve) => {
						return continuationFn((continuation) => {
							resolve(loop(continuation));
						});
					});
				},
				Deferred: (continuationFn) => Deferred(() => loop(continuationFn())),
			});
		}
	});
}

function andThen<I, T, E, U>(
	self: Effect<I, T, E>,
	nextStep: (value: T) => Effect<I, U, E>,
): Effect<I, U, E> {
	return new Effect((input) => {
		return loop(getStructParams(self)(input));

		function loop(c: Continuation<Result<T, E>>): Continuation<Result<U, E>> {
			return match(c)({
				Ready: (result) => {
					return match(result)({
						Ok: (value) => {
							return Deferred(() => {
								return getStructParams(nextStep(value))(input);
							});
						},
						Err: (error) => Ready(Err(error)),
					});
				},
				Async: (continuationFn) => {
					return Async((resolve) => {
						return continuationFn((continuation) => {
							resolve(loop(continuation));
						});
					});
				},
				Deferred: (continuationFn) => Deferred(() => loop(continuationFn())),
			});
		}
	});
}

function or<I, T, E, F>(
	self: Effect<I, T, E>,
	fallbackStep: Effect<E, T, F>,
): Effect<I, T, F> {
	return new Effect((input) => {
		return loop(getStructParams(self)(input));

		function loop(c: Continuation<Result<T, E>>): Continuation<Result<T, F>> {
			return match(c)({
				Ready: (result) => {
					return match(result)({
						Ok: (value) => Ready(Ok(value)),
						Err: (error) => {
							return Deferred(() => {
								return getStructParams(fallbackStep)(error);
							});
						},
					});
				},
				Async: (continuationFn) => {
					return Async((resolve) => {
						return continuationFn((continuation) => {
							resolve(loop(continuation));
						});
					});
				},
				Deferred: (continuationFn) => Deferred(() => loop(continuationFn())),
			});
		}
	});
}

function orElse<I, T, E, F>(
	self: Effect<I, T, E>,
	fallbackStep: (error: E) => Effect<I, T, F>,
): Effect<I, T, F> {
	return new Effect((input) => {
		return loop(getStructParams(self)(input));

		function loop(c: Continuation<Result<T, E>>): Continuation<Result<T, F>> {
			return match(c)({
				Ready: (result) => {
					return match(result)({
						Ok: (value) => Ready(Ok(value)),
						Err: (error) => {
							return Deferred(() => {
								return getStructParams(fallbackStep(error))(input);
							});
						},
					});
				},
				Async: (continuationFn) => {
					return Async((resolve) => {
						return continuationFn((continuation) => {
							resolve(loop(continuation));
						});
					});
				},
				Deferred: (continuationFn) => Deferred(() => loop(continuationFn())),
			});
		}
	});
}

function Ready<T>(value: T): Continuation<T> {
	return new Continuation<T>("Ready", value);
}

type AsyncContinuation<T> = (
	resolve: (continuation: Continuation<T>) => void,
) => Cancellation;

// biome-ignore lint/suspicious/noConfusingVoidType: necessary for types to work properly
type Cancellation = void | CancellationFn;

type CancellationFn = () => void;

function Async<T>(fn: AsyncContinuation<T>): Continuation<T> {
	return new Continuation<T>("Async", fn);
}

type DeferredContinuation<T> = () => Continuation<T>;

function Deferred<T>(fn: DeferredContinuation<T>): Continuation<T> {
	return new Continuation<T>("Deferred", fn);
}

type ContinuationVariants<T> = Split<{
	Ready: [value: T];
	Async: [fn: AsyncContinuation<T>];
	Deferred: [fn: DeferredContinuation<T>];
}>;

class Continuation<T> extends Enum<ContinuationVariants<T>> {}

interface RuntimeParams<I> {
	input: I;
}

class Runtime<I> extends Struct<RuntimeParams<I>> {}

function fork<I, T, E>(
	self: Runtime<I>,
	effect: Effect<I, T, E>,
): Fiber<I, T, E> {
	const fiber = new Fiber<I, T, E>({
		id: crypto.randomUUID(),
		effect,
		runtime: self,
		fiberState: new FiberState("Queued"),
	});

	runFiber(fiber);

	return fiber;
}

type FiberStateVariants<T, E> = Split<{
	Queued: [];
	Running: [currentContinuation: Continuation<Result<T, E>>];
	Suspended: [cancellation: Cancellation];
	Complete: [result: Result<T, E>];
}>;

class FiberState<T, E> extends Enum<FiberStateVariants<T, E>> {}

interface FiberParams<I, T, E> {
	id: string;
	effect: Effect<I, T, E>;
	fiberState: FiberState<T, E>;
	runtime: Runtime<I>;
}

class Fiber<I, T, E> extends Struct<FiberParams<I, T, E>> {}

function runFiber<I, T, E>(self: Fiber<I, T, E>): void {
	const { fiberState } = getStructParams(self);

	const loopState: LoopState = {
		continueExecution: true,
		index: 0,
	};

	while (loopState.continueExecution) {
		step(self, `step ${loopState.index++}`);

		loopState.continueExecution = match(fiberState)({
			Queued: () => true,
			Running: () => true,
			Suspended: () => false,
			Complete: () => false,
		});
	}
}

interface LoopState {
	continueExecution: boolean;
	index: number;
}

function step<I, T, E>(self: Fiber<I, T, E>, label = "step"): void {
	const { effect, runtime, fiberState, id: fiberId } = getStructParams(self);

	console.log({ fiberId, label, variant: getStructParams(fiberState).variant });

	const { input } = getStructParams(runtime);

	match(fiberState)({
		Queued: () => {
			// Initialize: start the effect and store the initial continuation
			const runner = getStructParams(effect);
			getStructParams(fiberState).variant = ["Running", runner(input)];
		},
		Running: (currentContinuation) => {
			// Process one step: unwrap one Deferred or complete with Ready
			match(currentContinuation)({
				Ready: (result) => {
					getStructParams(fiberState).variant = ["Complete", result];
				},
				Async: (asyncFn) => {
					// Suspend the fiber and set up async callback
					getStructParams(fiberState).variant = [
						"Suspended",
						asyncFn((continuation) => {
							getStructParams(fiberState).variant = ["Running", continuation];

							runFiber(self);
						}),
					];
				},
				Deferred: (fn) => {
					// Unwrap one level and store the next continuation
					getStructParams(fiberState).variant = ["Running", fn()];
				},
			});
		},
		Suspended: () => {},
		Complete: () => {},
	});
}

Deno.test("simple success effect with map", () => {
	// Given: a success effect with value 10
	const effect = Success(10);
	const runtime = new Runtime({ input: undefined });

	// When: we map the value to double it
	const mapped = map(effect, (x) => x * 2);

	// Then: the fiber should complete with value 20
	const fiber = fork(runtime, mapped);
	const { fiberState } = getStructParams(fiber);

	match(fiberState)({
		Complete: (result) => {
			match(result)({
				Ok: (value) => assertEquals(value, 20),
				Err: () => {
					throw new Error("Expected Ok, got Err");
				},
			});
		},
		Queued: () => {
			throw new Error("Fiber still queued");
		},
		Running: () => {
			throw new Error("Fiber still running");
		},
		Suspended: () => {
			throw new Error("Fiber suspended");
		},
	});
});

Deno.test("chaining effects with andThen", () => {
	// Given: an initial success effect and a chained effect
	const initial = Success(5);
	const runtime = new Runtime({ input: undefined });

	// When: we chain multiple operations
	const chained = andThen(
		map(initial, (x) => x + 3),
		(value) => Success(value * 2),
	);

	// Then: the fiber should complete with (5 + 3) * 2 = 16
	const fiber = fork(runtime, chained);
	const { fiberState } = getStructParams(fiber);

	match(fiberState)({
		Complete: (result) => {
			match(result)({
				Ok: (value) => assertEquals(value, 16),
				Err: () => {
					throw new Error("Expected Ok, got Err");
				},
			});
		},
		Queued: () => {
			throw new Error("Fiber still queued");
		},
		Running: () => {
			throw new Error("Fiber still running");
		},
		Suspended: () => {
			throw new Error("Fiber suspended");
		},
	});
});

Deno.test("error handling with mapError and orElse", () => {
	// Given: a failure effect with error "not found"
	const effect = Failure("not found");
	const runtime = new Runtime({ input: undefined });

	// When: we map the error to a number and provide fallback
	const handled = orElse(
		mapError(effect, (err: string) => err.length),
		(_errorLength) => Success(0),
	);

	// Then: the fiber should complete with success value 0 (fallback)
	const fiber = fork(runtime, handled);
	const { fiberState } = getStructParams(fiber);

	match(fiberState)({
		Complete: (result) => {
			match(result)({
				Ok: (value) => assertEquals(value, 0),
				Err: () => {
					throw new Error("Expected Ok, got Err");
				},
			});
		},
		Queued: () => {
			throw new Error("Fiber still queued");
		},
		Running: () => {
			throw new Error("Fiber still running");
		},
		Suspended: () => {
			throw new Error("Fiber suspended");
		},
	});
});

Deno.test("async effect with setTimeout", async () => {
	// Given: an async effect that resolves after a delay
	const asyncEffect = new Effect<void, string, never>(() => {
		return Async((resolve) => {
			const timerId = setTimeout(() => {
				resolve(Ready(Ok("async result")));
			}, 10);

			// Return cleanup function
			return () => clearTimeout(timerId);
		});
	});

	const runtime = new Runtime({ input: undefined });

	// When: we fork the async effect
	const fiber = fork(runtime, asyncEffect);

	// Then: initially the fiber should be suspended
	let { fiberState } = getStructParams(fiber);

	match(fiberState)({
		Suspended: () => {
			/* Expected state */
		},
		Complete: () => {
			throw new Error("Should not complete immediately");
		},
		Queued: () => {
			throw new Error("Should not be queued");
		},
		Running: () => {
			throw new Error("Should not be running");
		},
	});

	// Wait for async operation to complete
	await new Promise((resolve) => setTimeout(resolve, 20));

	// Then: after waiting, the fiber should be complete
	({ fiberState } = getStructParams(fiber));

	match(fiberState)({
		Complete: (result) => {
			match(result)({
				Ok: (value) => assertEquals(value, "async result"),
				Err: () => {
					throw new Error("Expected Ok, got Err");
				},
			});
		},
		Queued: () => {
			throw new Error("Fiber should be complete");
		},
		Running: () => {
			throw new Error("Fiber should be complete");
		},
		Suspended: () => {
			throw new Error("Fiber should be complete");
		},
	});
});

Deno.test("combining success paths with and", () => {
	// Given: two effects that take specific inputs
	const parseNumber = new Effect<string, number, string>((input) => {
		const num = Number(input);
		return Ready(Number.isNaN(num) ? Err("not a number") : Ok(num));
	});

	const doubleIt = new Effect<number, number, never>((input) => {
		return Ready(Ok(input * 2));
	});

	const runtime = new Runtime({ input: "42" });

	// When: we chain them with 'and'
	const combined = and(parseNumber, doubleIt);

	// Then: the fiber should parse "42" and double it to 84
	const fiber = fork(runtime, combined);
	const { fiberState } = getStructParams(fiber);

	match(fiberState)({
		Complete: (result) => {
			match(result)({
				Ok: (value) => assertEquals(value, 84),
				Err: () => {
					throw new Error("Expected Ok, got Err");
				},
			});
		},
		Queued: () => {
			throw new Error("Fiber still queued");
		},
		Running: () => {
			throw new Error("Fiber still running");
		},
		Suspended: () => {
			throw new Error("Fiber suspended");
		},
	});
});

Deno.test("deeply nested deferred continuations", () => {
	// Given: an effect with many deferred steps
	let effect = Success(1);
	for (let i = 0; i < 100; i++) {
		effect = map(effect, (x) => x + 1);
	}

	const runtime = new Runtime({ input: undefined });

	// When: we run the deeply nested effect
	const fiber = fork(runtime, effect);

	// Then: it should complete with the correct value despite deep nesting
	const { fiberState } = getStructParams(fiber);

	match(fiberState)({
		Complete: (result) => {
			match(result)({
				Ok: (value) => assertEquals(value, 101),
				Err: () => {
					throw new Error("Expected Ok, got Err");
				},
			});
		},
		Queued: () => {
			throw new Error("Fiber still queued");
		},
		Running: () => {
			throw new Error("Fiber still running");
		},
		Suspended: () => {
			throw new Error("Fiber suspended");
		},
	});
});
