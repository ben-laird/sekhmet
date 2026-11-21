/** The main Attempt, in method form. */

import { Option } from "@sekhmet/enum/option";
import { Result } from "@sekhmet/enum/result";
import { assertEquals, assertInstanceOf } from "@std/assert";
import * as mini from "../mini/mod.ts";
import { AlreadyHandled, Attempt, Failed, Handled } from "./mod.ts";

Deno.test("main Attempt is a mini one, and fromMini views a mini one", () => {
	// Given: a mini attempt and a main one
	const fromMini = Attempt.fromMini(mini.Handled(1));
	const main = Handled(1);

	// When: each is checked against both classes
	// Then: both are main and mini, so either API accepts them
	assertInstanceOf(fromMini, Attempt);
	assertInstanceOf(main, mini.Attempt);
	assertEquals(mini.isHandled(main), true);
	assertEquals(fromMini.isHandled(), true);
});

Deno.test("methods chain, and convert to main Option and Result", () => {
	// Given: one attempt of each variant
	const failed: Attempt<number, string> = Failed("offline");

	// When: chaining methods on them
	const residue = AlreadyHandled(1)
		.map((n) => n + 1)
		.residue();
	// {}
	const error = failed.mapErr((e) => e.length).error();
	const result = Handled(2).toResult();

	// Then: the readers return main classes, so chaining continues
	assertInstanceOf(residue, Option);
	assertInstanceOf(result, Result);
	assertEquals(residue.unwrap(), 2);
	assertEquals(error.unwrap(), 7);
	assertEquals(result.unwrap(), 2);
	assertEquals(failed.unwrapOr(0), 0);
	assertEquals(failed.isResolved(), false);
});
