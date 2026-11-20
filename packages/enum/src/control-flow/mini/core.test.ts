import { assertEquals, assertInstanceOf, assertNotEquals } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import { Break, Continue, ControlFlow } from "@/src/control-flow/mini/core.ts";
import { Enum } from "@/src/core/mini/core.ts";
import { union, unionKinds } from "@/src/core/mini/exit.ts";

Deno.test("Continue() builds the Continue variant holding the value", () => {
	// Given: a value to go on with
	const value = { depth: 1 };

	// When: wrapping it with Continue()
	const subject = Continue(value);

	// Then: it is a Continue ControlFlow carrying the value
	assertInstanceOf(subject, ControlFlow);
	assertInstanceOf(subject, Enum);
	assertEquals(unionKinds(subject), "Continue");
	assertEquals(union(subject), value);
});

Deno.test("Break() builds the Break variant holding the value", () => {
	// Given: a value to exit with
	const value = "response";

	// When: wrapping it with Break()
	const subject = Break(value);

	// Then: it is a Break ControlFlow carrying the value
	assertInstanceOf(subject, ControlFlow);
	assertEquals(unionKinds(subject), "Break");
	assertEquals(union(subject), value);
});

Deno.test("ControlFlows are equal by variant and payload", () => {
	// Given: ControlFlows built from equal and differing parts
	const same = [Break(1), Break(1)];
	const differentValue = [Break(1), Break(2)];
	const differentKind = [Break(1), Continue(1)];

	// When: comparing them structurally
	// Then: only matching variant and payload are equal
	assertEquals(same[0], same[1]);
	assertNotEquals(differentValue[0], differentValue[1]);
	assertNotEquals(differentKind[0], differentKind[1]);
});

Deno.test("the constructors' never defaults infer a mixed return", () => {
	// Given: a function that breaks on one path and continues on another
	const step = (n: number) => {
		if (n < 0) return Break(`negative: ${n}`);
		return Continue(n);
	};

	// When: calling it
	const subject = step(-1);

	// Then: its return type is exactly the union of each path, which fits
	// ControlFlow<string, number>
	assertType<
		IsExact<
			typeof subject,
			ControlFlow<string, never> | ControlFlow<never, number>
		>
	>(true);
	const typed: ControlFlow<string, number> = subject;
	assertEquals(union(typed), "negative: -1");
});

Deno.test("ControlFlow's continue type defaults to undefined", () => {
	// Given: a ControlFlow naming only its break type
	const subject: ControlFlow<number> = Continue(undefined);

	// When: reading its type
	// Then: it is a ControlFlow<number, undefined>, Rust's ControlFlow<B, ()>
	assertType<IsExact<typeof subject, ControlFlow<number, undefined>>>(true);
	assertEquals(union(subject), undefined);
});

Deno.test("explicit type parameters name both sides", () => {
	// Given: constructors called with both type parameters
	const going = Continue<string, number>(1);
	const stopped = Break<string, number>("done");

	// When: reading their types
	// Then: each is exactly a ControlFlow<string, number>
	assertType<IsExact<typeof going, ControlFlow<string, number>>>(true);
	assertType<IsExact<typeof stopped, ControlFlow<string, number>>>(true);
	assertEquals([union(going), union(stopped)], [1, "done"]);
});
