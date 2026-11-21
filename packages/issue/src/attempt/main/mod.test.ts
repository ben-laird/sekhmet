/** The main Attempt, in method form. */

import { Option } from "@sekhmet/enum/option";
import { Result } from "@sekhmet/enum/result";
import { Outcome } from "@sekhmet/panic/outcome";
import {
	assert,
	assertEquals,
	assertInstanceOf,
	assertStrictEquals,
} from "@std/assert";
import * as mini from "../mini/mod.ts";
import { AlreadyHandled, Attempt, Failed, Handled, Panicked } from "./mod.ts";

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

Deno.test("main …And methods keep a narrowed attempt in their false branch", () => {
	// Given: a main attempt already narrowed to AlreadyHandled
	const already: Attempt<number, string> = AlreadyHandled(8080);
	assert(already.isAlreadyHandled());

	// When: isAlreadyHandledAnd's predicate fails on it
	// Then: the false branch still holds the narrowed attempt, not never
	if (!already.isAlreadyHandledAnd((port) => port < 1024)) {
		// @ts-expect-error: the narrowed attempt isn't collapsed to never
		const _gone: never = already;
		assertEquals(already.unwrap(), 8080);
	} else {
		assert(false, "8080 isn't a low port");
	}
});

Deno.test("main Panicked chains its predicates and converts to a main Outcome", () => {
	// Given: a main panicked attempt
	const bug = new Error("bad cache");
	const broken: Attempt<number, string> = Panicked(bug);

	// When: reading it through its methods
	const outcome = broken.map((port) => port + 1).toOutcome();

	// Then: it is Panicked throughout, and the outcome is main
	assert(broken.isPanicked());
	assertEquals(broken.isResolved(), false);
	assertInstanceOf(outcome, Outcome);
	assertStrictEquals(outcome.unwrapPanicked(), bug);
	assertEquals(broken.panicked().unwrap(), bug);
});
