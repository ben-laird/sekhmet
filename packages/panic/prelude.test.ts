import { assertStrictEquals } from "@std/assert";
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
