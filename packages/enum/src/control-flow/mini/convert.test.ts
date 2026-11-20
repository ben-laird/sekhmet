import { assertEquals } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import * as TestSubject from "@/src/control-flow/mini/convert.ts";
import {
	Break,
	Continue,
	type ControlFlow,
} from "@/src/control-flow/mini/core.ts";
import { None, type Option, Some } from "@/src/option/mini/core.ts";
import { Err, Ok, type Result } from "@/src/result/mini/core.ts";

const stopped: ControlFlow<string, number> = Break("stop");
const going: ControlFlow<string, number> = Continue(1);

Deno.test("breakValue() is Some of a break value and None otherwise", () => {
	// Given: a Break and a Continue
	// When: taking each one's break value
	const fromBreak = TestSubject.breakValue(stopped);
	const fromContinue = TestSubject.breakValue(going);

	// Then: only the Break yields Some
	assertType<IsExact<typeof fromBreak, Option<string>>>(true);
	assertEquals(fromBreak, Some("stop"));
	assertEquals(fromContinue, None());
});

Deno.test("continueValue() is Some of a continue value and None otherwise", () => {
	// Given: a Break and a Continue
	// When: taking each one's continue value
	const fromBreak = TestSubject.continueValue(stopped);
	const fromContinue = TestSubject.continueValue(going);

	// Then: only the Continue yields Some
	assertType<IsExact<typeof fromContinue, Option<number>>>(true);
	assertEquals(fromBreak, None());
	assertEquals(fromContinue, Some(1));
});

Deno.test("breakOk() makes Break the Ok side", () => {
	// Given: a Break and a Continue
	// When: converting each with breakOk()
	const fromBreak = TestSubject.breakOk(stopped);
	const fromContinue = TestSubject.breakOk(going);

	// Then: Break becomes Ok and Continue becomes Err
	assertType<IsExact<typeof fromBreak, Result<string, number>>>(true);
	assertEquals(fromBreak, Ok("stop"));
	assertEquals(fromContinue, Err(1));
});

Deno.test("continueOk() makes Continue the Ok side", () => {
	// Given: a Break and a Continue
	// When: converting each with continueOk()
	const fromBreak = TestSubject.continueOk(stopped);
	const fromContinue = TestSubject.continueOk(going);

	// Then: Continue becomes Ok and Break becomes Err
	assertType<IsExact<typeof fromContinue, Result<number, string>>>(true);
	assertEquals(fromBreak, Err("stop"));
	assertEquals(fromContinue, Ok(1));
});

Deno.test("intoValue() returns either variant's value", async (t) => {
	await t.step("from Break", () => {
		// Given: a Break of a ControlFlow<number, number>
		const flow: ControlFlow<number, number> = Break(1);

		// When: extracting its value
		const subject = TestSubject.intoValue(flow);

		// Then: it is the break value, typed as the shared type
		assertType<IsExact<typeof subject, number>>(true);
		assertEquals(subject, 1);
	});

	await t.step("from Continue", () => {
		// Given: a Continue of a ControlFlow<number, number>
		const flow: ControlFlow<number, number> = Continue(2);

		// When: extracting its value
		const subject = TestSubject.intoValue(flow);

		// Then: it is the continue value
		assertEquals(subject, 2);
	});
});

Deno.test("intoValue() rejects a ControlFlow whose types differ", () => {
	// Given: a ControlFlow whose break and continue types differ
	const mixed: ControlFlow<string, number> = Continue(1);
	const swapped: ControlFlow<number, string> = Break(1);

	// When: writing an intoValue on each
	// @ts-expect-error: break and continue must share one type
	const onMixed = (): unknown => TestSubject.intoValue(mixed);
	// @ts-expect-error: break and continue must share one type
	const onSwapped = (): unknown => TestSubject.intoValue(swapped);

	// Then: neither compiles, so neither is called
	assertEquals([typeof onMixed, typeof onSwapped], ["function", "function"]);
});

Deno.test("intoValue() takes a bare constructor's never side as the other", () => {
	// Given: constructors whose other side defaults to never
	const going = Continue(1);
	const stopped = Break("stop");

	// When: extracting their values
	const fromContinue = TestSubject.intoValue(going);
	const fromBreak = TestSubject.intoValue(stopped);

	// Then: each is typed as its one non-never side
	assertType<IsExact<typeof fromContinue, number>>(true);
	assertType<IsExact<typeof fromBreak, string>>(true);
	assertEquals([fromContinue, fromBreak], [1, "stop"]);
});

Deno.test("intoValue() widens a nullable side soundly", () => {
	// Given: a ControlFlow whose continue type is the default, undefined
	const flow: ControlFlow<number> = Continue(undefined);

	// When: extracting its value
	const subject = TestSubject.intoValue(flow);

	// Then: TypeScript infers number | undefined, which holds either value
	assertType<IsExact<typeof subject, number | undefined>>(true);
	assertEquals(subject, undefined);
});

Deno.test("intoValue() takes the common type of related sides", () => {
	// Given: ControlFlows whose two sides are related but not equal
	const literals: ControlFlow<"a", "b"> = Break("a");
	const widened: ControlFlow<"a", string> = Continue("z");

	// When: extracting their values
	const fromLiterals = TestSubject.intoValue(literals);
	const fromWidened = TestSubject.intoValue(widened);

	// Then: T is the common type TypeScript infers for both sides
	assertType<IsExact<typeof fromLiterals, "a" | "b">>(true);
	assertType<IsExact<typeof fromWidened, string>>(true);
	assertEquals([fromLiterals, fromWidened], ["a", "z"]);
});
