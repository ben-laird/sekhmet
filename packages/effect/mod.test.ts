import { Enum, type Split } from "@sekhmet/enum/core/mini/core";
import { match } from "@sekhmet/enum/core/mini/exit";
import { Err, Ok, type Result } from "@sekhmet/enum/result/mini";
import { getStructParams, Struct } from "@sekhmet/primordials/struct";
import { assertEquals } from "@std/assert";

type EffectFn<I, T, E> = (input: I) => Result<T, E>;

class Effect<I, T, E> extends Struct<EffectFn<I, T, E>> {}

function Success<T>(value: T): Effect<void, T, never> {
	return new Effect(() => Ok(value));
}

function Failure<E>(error: E): Effect<void, never, E> {
	return new Effect(() => Err(error));
}

function map<I, T, E, U>(
	self: Effect<I, T, E>,
	mapping: (value: T) => U,
): Effect<I, U, E> {
	return new Effect((input) => {
		const result = getStructParams(self)(input);

		return match(result)({
			Ok: (value) => Ok(mapping(value)),
			Err,
		});
	});
}

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
	Running: [];
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
	const { effect, runtime, fiberState, id: fiberId } = getStructParams(self);

	console.log({ fiberId, label });

	const { input } = getStructParams(runtime);

	const runner = getStructParams(effect);

	match(fiberState)({
		Queued: () => {
			getStructParams(fiberState).variant = ["Running"];
		},
		Running: () => {
			getStructParams(fiberState).variant = ["Complete", runner(input)];
		},
		Suspended: () => {},
		Complete: () => {},
	});
}

Deno.test("Lab test", () => {
	assertEquals(1 + 1, 2);
});
