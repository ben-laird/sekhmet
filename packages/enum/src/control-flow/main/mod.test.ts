import { assertEquals, assertInstanceOf, unreachable } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import * as coreMini from "@/src/core/mini/mod.ts";
import { Option } from "@/src/option/main/mod.ts";
import { Result } from "@/src/result/main/mod.ts";
import * as mini from "../mini/mod.ts";
import { Break, Continue, ControlFlow } from "./mod.ts";

Deno.test("ControlFlow methods chain on main constructors", () => {
	// Given: a main Break and a main Continue
	const stopped: ControlFlow<number, string> = Break(2);
	const going: ControlFlow<number, string> = Continue("a");

	// When: mapping both sides
	const mappedBreak = stopped
		.mapBreak((n) => n * 10)
		.mapContinue((s) => s.length);
	// {}
	const mappedContinue = going
		.mapBreak((n) => n * 10)
		.mapContinue((s) => s.length);
	// {}

	// Then: the results are main ControlFlows holding the mapped values
	assertInstanceOf(mappedBreak, ControlFlow);
	assertType<IsExact<typeof mappedBreak, ControlFlow<number, number>>>(true);
	assertEquals(coreMini.union(mappedBreak), 20);
	assertEquals(coreMini.union(mappedContinue), 1);
});

Deno.test("main ControlFlow is an instance of mini ControlFlow and mini Enum", () => {
	// Given: a main Break
	const flow = Break(1);

	// When: checking it against the mini classes
	const classes = [
		flow instanceof ControlFlow,
		flow instanceof mini.ControlFlow,
		flow instanceof coreMini.Enum,
	];

	// Then: it is all of them, so mini functions accept it
	assertEquals(classes, [true, true, true]);
	assertEquals(mini.isBreak(flow), true);
});

Deno.test("fromMini() views a mini ControlFlow as a main one", () => {
	// Given: a mini Continue
	const flow = mini.Continue<string, number>(3);

	// When: converting it to main
	const subject = ControlFlow.fromMini(flow);

	// Then: it is a main ControlFlow holding the same value
	assertInstanceOf(subject, ControlFlow);
	assertEquals(subject.continueValue().unwrap(), 3);
});

Deno.test("main isBreak() narrows and keeps a main ControlFlow", () => {
	// Given: a main ControlFlow typed as either variant
	const flow: ControlFlow<string, number> = Break("stop");

	// When: guarding it with isBreak()
	if (flow.isBreak()) {
		// Then: only the Break arm is needed, and main methods still chain
		const value = coreMini.match(flow)({ Break: (b) => b });
		assertType<IsExact<typeof value, string>>(true);
		assertEquals(value, "stop");
		assertEquals(flow.mapBreak((s) => s.length).intoValue(), 4);
	} else {
		unreachable();
	}
});

Deno.test("main isContinue() narrows and keeps a main ControlFlow", () => {
	// Given: a main ControlFlow typed as either variant
	const flow: ControlFlow<string, number> = Continue(5);

	// When: guarding it with isContinue()
	if (flow.isContinue()) {
		// Then: only the Continue arm is needed, and main methods still chain
		const value = coreMini.match(flow)({ Continue: (c) => c });
		assertType<IsExact<typeof value, number>>(true);
		assertEquals(value, 5);
		assertEquals(flow.mapContinue((n) => n + 1).intoValue(), 6);
	} else {
		unreachable();
	}
});

Deno.test("breakValue() and continueValue() return main Options", () => {
	// Given: a main Break
	const flow: ControlFlow<string, number> = Break("stop");

	// When: reading each side as an Option
	const onBreak = flow.breakValue();
	const onContinue = flow.continueValue();

	// Then: both are main Options, so they chain
	assertInstanceOf(onBreak, Option);
	assertInstanceOf(onContinue, Option);
	assertType<IsExact<typeof onBreak, Option<string>>>(true);
	assertEquals(onBreak.map((s) => s.toUpperCase()).unwrapOr(""), "STOP");
	assertEquals(onContinue.isNone(), true);
});

Deno.test("breakOk() and continueOk() return main Results", () => {
	// Given: a main Continue
	const flow: ControlFlow<string, number> = Continue(1);

	// When: reading it as a Result each way
	const asBreakOk = flow.breakOk();
	const asContinueOk = flow.continueOk();

	// Then: both are main Results with the matching sides
	assertInstanceOf(asBreakOk, Result);
	assertInstanceOf(asContinueOk, Result);
	assertType<IsExact<typeof asBreakOk, Result<string, number>>>(true);
	assertType<IsExact<typeof asContinueOk, Result<number, string>>>(true);
	assertEquals(asBreakOk.unwrapErr(), 1);
	assertEquals(asContinueOk.map((n) => n + 1).unwrap(), 2);
});

Deno.test("ControlFlow.intoValue returns either variant's value", () => {
	// Given: a Break and a Continue sharing one type
	const stopped: ControlFlow<number, number> = Break(1);
	const going: ControlFlow<number, number> = Continue(2);

	// When: extracting their values
	const values = [stopped.intoValue(), going.intoValue()];

	// Then: each is its variant's value
	assertEquals(values, [1, 2]);
});

Deno.test("ControlFlow.intoValue exists only when break and continue share a type", () => {
	// Given: ControlFlows whose break and continue types differ
	const mixed: ControlFlow<string, number> = Break("stop");
	const swapped: ControlFlow<number, string> = Continue("next");

	// When: writing an intoValue on each
	// @ts-expect-error: intoValue's this is a ControlFlow<T, T>
	const onMixed = (): unknown => mixed.intoValue();
	// @ts-expect-error: intoValue's this is a ControlFlow<T, T>
	const onSwapped = (): unknown => swapped.intoValue();

	// Then: neither compiles, so neither is called
	assertEquals([typeof onMixed, typeof onSwapped], ["function", "function"]);
});
