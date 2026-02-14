import { Enum, type Split } from "@sekhmet/enum/core/mini/core";
import { match } from "@sekhmet/enum/core/mini/exit";
import type { Result } from "@sekhmet/enum/result/mini";
import { getStructParams, Struct } from "@sekhmet/primordials/struct";
import { assertEquals } from "@std/assert";

type EffectFn<I, T, E> = (input: I) => Result<T, E>;

class Effect<I, T, E> extends Struct<EffectFn<I, T, E>> {}

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

	step(fiber, "init");

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

function step<I, T, E>(self: Fiber<I, T, E>, label = "step"): void {
	const { effect, runtime, fiberState, id: fiberId } = getStructParams(self);

	console.log({ fiberId, label });

	const { input } = getStructParams(runtime);

	const runner = getStructParams(effect);

	match(fiberState)({
		Queued: () => {
			getStructParams(fiberState).variant = ["Complete", runner(input)];
		},
		Running: () => {},
		Suspended: () => {},
		Complete: () => {},
	});
}

Deno.test("Lab test", () => {
	assertEquals(1 + 1, 2);
});
