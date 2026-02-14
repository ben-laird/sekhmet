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
				Deferred: (resultFn) => Deferred(() => loop(resultFn())),
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
				Deferred: (resultFn) => Deferred(() => loop(resultFn())),
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
				Deferred: (resultFn) => Deferred(() => loop(resultFn())),
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
				Deferred: (resultFn) => Deferred(() => loop(resultFn())),
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
				Deferred: (resultFn) => Deferred(() => loop(resultFn())),
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
				Deferred: (resultFn) => Deferred(() => loop(resultFn())),
			});
		}
	});
}

function Ready<T>(value: T): Continuation<T> {
	return new Continuation<T>("Ready", value);
}

function Deferred<T>(fn: () => Continuation<T>): Continuation<T> {
	return new Continuation<T>("Deferred", fn);
}

type ContinuationVariants<T> = Split<{
	Ready: [value: T];
	Deferred: [fn: () => Continuation<T>];
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
	Suspended: [];
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
	const fiberParams = getStructParams(self);
	const { effect, runtime, fiberState, id: fiberId } = fiberParams;

	console.log({ fiberId, label });

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

Deno.test("Lab test", () => {
	assertEquals(1 + 1, 2);
});
