import { assertEquals, unreachable } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import {
	Break,
	Continue,
	type ControlFlow,
} from "@/src/control-flow/mini/core.ts";
import * as TestSubject from "@/src/control-flow/mini/predicates.ts";
import { match, union } from "@/src/core/mini/exit.ts";

Deno.test("isBreak() and isContinue() are complementary", async (t) => {
	const cases: [string, ControlFlow<string, number>, boolean][] = [
		["Break", Break("stop"), true],
		["Continue", Continue(1), false],
	];

	for (const [label, flow, expectBreak] of cases) {
		await t.step(label, () => {
			// Given: a ControlFlow of a known variant
			// When: checking both predicates
			const isBreak = TestSubject.isBreak(flow);
			const isContinue = TestSubject.isContinue(flow);

			// Then: exactly one holds
			assertEquals(isBreak, expectBreak);
			assertEquals(isContinue, !expectBreak);
		});
	}
});

Deno.test("isBreak() narrows to the Break variant", () => {
	// Given: a ControlFlow typed as either variant
	const flow: ControlFlow<string, number> = Break("stop");

	// When: guarding it with isBreak()
	if (TestSubject.isBreak(flow)) {
		// Then: only the Break arm is needed, and it fits any continue type
		const value = match(flow)({ Break: (b) => b });
		const other: ControlFlow<string, boolean> = flow;
		assertType<IsExact<typeof value, string>>(true);
		assertEquals(value, "stop");
		assertEquals(union(other), "stop");
	} else {
		unreachable();
	}
});

Deno.test("isContinue() narrows to the Continue variant", () => {
	// Given: a ControlFlow typed as either variant
	const flow: ControlFlow<string, number> = Continue(7);

	// When: guarding it with isContinue()
	if (TestSubject.isContinue(flow)) {
		// Then: only the Continue arm is needed, and it fits any break type
		const value = match(flow)({ Continue: (c) => c });
		const other: ControlFlow<boolean, number> = flow;
		assertType<IsExact<typeof value, number>>(true);
		assertEquals(value, 7);
		assertEquals(union(other), 7);
	} else {
		unreachable();
	}
});

Deno.test("an unguarded ControlFlow needs both arms", () => {
	// Given: a ControlFlow typed as either variant
	const flow: ControlFlow<string, number> = Break("stop");

	// When: matching it with only a Break arm
	// @ts-expect-error: the Continue arm is missing
	const value = match(flow)({ Break: (b: string) => b });

	// Then: the match is rejected at compile time
	assertEquals(value, "stop");
});
