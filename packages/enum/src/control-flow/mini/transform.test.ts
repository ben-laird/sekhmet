import { assertEquals } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import {
	Break,
	Continue,
	type ControlFlow,
} from "@/src/control-flow/mini/core.ts";
import * as TestSubject from "@/src/control-flow/mini/transform.ts";

Deno.test("mapBreak() maps only the break value", async (t) => {
	await t.step("Break is mapped", () => {
		// Given: a Break holding a number
		const flow: ControlFlow<number, string> = Break(2);

		// When: mapping its break value to a string
		const subject = TestSubject.mapBreak(flow, (n) => `#${n}`);

		// Then: it is a Break holding the mapped value
		assertType<IsExact<typeof subject, ControlFlow<string, string>>>(true);
		assertEquals(subject, Break("#2"));
	});

	await t.step("Continue passes through without calling the mapping", () => {
		// Given: a Continue
		const flow: ControlFlow<number, string> = Continue("next");
		let calls = 0;

		// When: mapping its break value
		const subject = TestSubject.mapBreak(flow, (n) => {
			calls += 1;
			return n * 10;
		});

		// Then: the Continue is unchanged and the mapping never ran
		assertEquals(subject, Continue("next"));
		assertEquals(calls, 0);
	});
});

Deno.test("mapContinue() maps only the continue value", async (t) => {
	await t.step("Continue is mapped", () => {
		// Given: a Continue holding a number
		const flow: ControlFlow<string, number> = Continue(2);

		// When: mapping its continue value to a boolean
		const subject = TestSubject.mapContinue(flow, (n) => n > 1);

		// Then: it is a Continue holding the mapped value
		assertType<IsExact<typeof subject, ControlFlow<string, boolean>>>(true);
		assertEquals(subject, Continue(true));
	});

	await t.step("Break passes through without calling the mapping", () => {
		// Given: a Break
		const flow: ControlFlow<string, number> = Break("done");
		let calls = 0;

		// When: mapping its continue value
		const subject = TestSubject.mapContinue(flow, (n) => {
			calls += 1;
			return n * 10;
		});

		// Then: the Break is unchanged and the mapping never ran
		assertEquals(subject, Break("done"));
		assertEquals(calls, 0);
	});
});
