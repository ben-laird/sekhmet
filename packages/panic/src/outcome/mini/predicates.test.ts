import { union } from "@sekhmet/enum/core/mini/exit";
import { assert, assertEquals, assertFalse } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import { Panic } from "@/src/mini/core.ts";
import { Err, Ok, type Outcome, Panicked } from "@/src/outcome/mini/core.ts";
import * as TestSubject from "@/src/outcome/mini/predicates.ts";

Deno.test("isOk(), isErr() and isPanicked() hold for exactly one variant", async (t) => {
	const cases: [
		string,
		Outcome<number, string>,
		[boolean, boolean, boolean],
	][] = [
		["Ok", Ok(1), [true, false, false]],
		["Err", Err("e"), [false, true, false]],
		["Panicked", Panicked("p"), [false, false, true]],
	];

	for (const [label, outcome, expected] of cases) {
		await t.step(label, () => {
			// Given: an Outcome of a known variant
			// When: checking every predicate
			const subject = [
				TestSubject.isOk(outcome),
				TestSubject.isErr(outcome),
				TestSubject.isPanicked(outcome),
			];

			// Then: exactly the matching one holds
			assertEquals(subject, expected);
		});
	}
});

Deno.test("isOk(), isErr() and isPanicked() narrow variant and type parameters", async (t) => {
	await t.step("isOk", () => {
		// Given: an Outcome typed as any variant
		const outcome: Outcome<number, string> = Ok(1);

		// When: guarding on isOk
		assert(TestSubject.isOk(outcome));

		// Then: the value reads directly, and the other channels are never
		const value = union(outcome);
		assertType<IsExact<typeof value, number>>(true);
		const widened: Outcome<number, boolean, never> = outcome;
		assertEquals(widened, Ok(1));
	});

	await t.step("isErr", () => {
		// Given: an Outcome typed as any variant
		const outcome: Outcome<number, string> = Err("e");

		// When: guarding on isErr
		assert(TestSubject.isErr(outcome));

		// Then: the error reads directly, and the other channels are never
		const error = union(outcome);
		assertType<IsExact<typeof error, string>>(true);
		const widened: Outcome<boolean, string, never> = outcome;
		assertEquals(widened, Err("e"));
	});

	await t.step("isPanicked", () => {
		// Given: an Outcome typed as any variant
		const outcome: Outcome<number, string, Error> = Panicked(new Error("p"));

		// When: guarding on isPanicked
		assert(TestSubject.isPanicked(outcome));

		// Then: the payload reads directly, and the other channels are never
		const payload = union(outcome);
		assertType<IsExact<typeof payload, Error>>(true);
		const widened: Outcome<boolean, boolean, Error> = outcome;
		assertEquals(widened, outcome);
	});
});

Deno.test("isOkAnd() and isErrAnd() require the variant and a passing predicate", async (t) => {
	await t.step("isOkAnd", () => {
		// Given: Ok values and a panic
		const big: Outcome<number, string> = Ok(42);
		const small: Outcome<number, string> = Ok(1);
		const bug: Outcome<number, string> = Panicked("p");
		let calls = 0;
		const isBig = (n: number): boolean => {
			calls++;
			return n > 40;
		};

		// When: checking each
		const subject = [big, small, bug].map((o) => TestSubject.isOkAnd(o, isBig));

		// Then: only the passing Ok holds, and the panic never reaches the predicate
		assertEquals(subject, [true, false, false]);
		assertEquals(calls, 2);
	});

	await t.step("isErrAnd", () => {
		// Given: Err values and a panic
		const notFound: Outcome<number, string> = Err("not found");
		const timeout: Outcome<number, string> = Err("timeout");
		const bug: Outcome<number, string> = Panicked("not a string error");

		// When: checking each
		const subject = [notFound, timeout, bug].map((o) => {
			return TestSubject.isErrAnd(o, (e) => e.startsWith("not"));
		});

		// Then: only the passing Err holds, never the panic
		assertEquals(subject, [true, false, false]);
	});
});

Deno.test("isPanicAnd() narrows the payload with a type guard", () => {
	// Given: an Outcome whose payload is a Panic, typed as unknown
	const outcome: Outcome<number, string> = Panicked(
		new Panic({ message: "bad state", cause: null }),
	);

	// When: guarding with a Panic type guard
	assert(
		TestSubject.isPanicAnd(
			outcome,
			(p): p is Panic<unknown> => p instanceof Panic,
		),
	);

	// Then: the payload is a Panic, and the Outcome fits Outcome<T, E, Panic>
	const payload = union(outcome);
	assertType<IsExact<typeof payload, Panic<unknown>>>(true);
	const narrowed: Outcome<number, string, Panic<unknown>> = outcome;
	assertEquals(payload.message, "bad state");
	assertEquals(narrowed, outcome);
});

Deno.test("isPanicAnd() is false for a failing predicate or another variant", () => {
	// Given: a non-Panic payload, and an Err
	const text: Outcome<number, string> = Panicked("text");
	const failed: Outcome<number, string> = Err("e");
	const isPanic = (p: unknown): boolean => p instanceof Panic;

	// When: checking both
	const subject = [
		TestSubject.isPanicAnd(text, isPanic),
		TestSubject.isPanicAnd(failed, isPanic),
	];

	// Then: neither holds
	assertFalse(subject[0]);
	assertFalse(subject[1]);
});
