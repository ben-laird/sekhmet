import { Panic } from "@sekhmet/panic/mini/core";
import { assertEquals, assertInstanceOf } from "@std/assert";
import {
	issueLine,
	messageLines,
	WorkflowPanic,
} from "@/src/workflow-panic/workflow-panic.ts";

Deno.test("WorkflowPanic is a Panic named after its kind", () => {
	// Given: a workflow panic of kind Todo
	const subject = new WorkflowPanic({
		kind: "Todo",
		message: "later",
		cause: { n: 1 },
	});

	// When: reading it as a Panic
	const { name, message, cause } = subject;

	// Then: it is a Panic that surfaces as `Panic (Todo)`
	assertInstanceOf(subject, Panic);
	assertEquals([name, message, cause], ["Panic (Todo)", "later", { n: 1 }]);
});

Deno.test("WorkflowPanic.kindOf reads the brand, never a name", () => {
	// Given: a workflow panic, a hand-built Panic with the same name, and
	// values that are not objects or are hostile Proxies
	const branded = new WorkflowPanic({
		kind: "Invariant",
		message: "",
		cause: null,
	});
	const forged = new Panic({ name: "Invariant", message: "", cause: null });
	const trap = (): never => {
		throw new Error("trap ran");
	};
	const hostile = new Proxy(branded, {
		getPrototypeOf: trap,
		get: trap,
		has: trap,
	});

	// When: asking each for its kind
	const kinds = [branded, forged, hostile, "Invariant", null, undefined].map(
		(value) => {
			return WorkflowPanic.kindOf(value);
		},
	);

	// Then: only the branded panic has one, and no Proxy trap ran
	assertEquals(kinds, [
		"Invariant",
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
	]);
});

Deno.test("messageLines leaves out absent lines", () => {
	// Given: lines with gaps
	const lines = ["header", undefined, "body", undefined];

	// When: joining them
	const message = messageLines(lines);

	// Then: only the present lines remain
	assertEquals(message, "header\nbody");
});

Deno.test("issueLine names the issue URL, if there is one", () => {
	// Given: an issue URL, and none
	const url = new URL("https://example.com/issues");

	// When: rendering each
	const lines = [issueLine(url), issueLine(undefined)];

	// Then: a URL makes a line; no URL makes none
	assertEquals(lines, [
		"Please file an issue at https://example.com/issues",
		undefined,
	]);
});
