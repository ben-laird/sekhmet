import { assertEquals, assertStrictEquals } from "@std/assert";
import * as prelude from "@/prelude.ts";
import * as core from "@/src/mini/core.ts";

Deno.test("prelude re-exports the core panic primitives", () => {
	// Given: the core module and the prelude
	const expected = {
		Panic: core.Panic,
		panic: core.panic,
		panicWithoutCause: core.panicWithoutCause,
	};

	// When: reading the prelude's runtime exports
	const actual = {
		Panic: prelude.Panic,
		panic: prelude.panic,
		panicWithoutCause: prelude.panicWithoutCause,
	};

	// Then: each is the very same binding as in core
	assertStrictEquals(actual.Panic, expected.Panic);
	assertStrictEquals(actual.panic, expected.panic);
	assertStrictEquals(actual.panicWithoutCause, expected.panicWithoutCause);
});

Deno.test("prelude holds the panic primitives and nothing else", () => {
	// Given: the prelude module
	// When: listing its runtime exports
	const names = Object.keys(prelude).sort();

	// Then: only the primitives are there; the runtime lives in the main entrypoint
	assertEquals(names, ["Panic", "panic", "panicWithoutCause"]);
});
