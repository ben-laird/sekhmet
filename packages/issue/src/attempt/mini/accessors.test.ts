import { None, Some } from "@sekhmet/enum/option/mini";
import { Err, Ok } from "@sekhmet/enum/result/mini";
import {
	Err as OutcomeErr,
	Ok as OutcomeOk,
	Panicked as OutcomePanicked,
} from "@sekhmet/panic/outcome/mini";
import { assertEquals, assertStrictEquals, assertThrows } from "@std/assert";
import { error, panicked, residue, toOutcome, toResult } from "./accessors.ts";
import {
	AlreadyHandled,
	type Attempt,
	Failed,
	Handled,
	Panicked,
} from "./core.ts";

const already: Attempt<number, string> = AlreadyHandled(1);
const handled: Attempt<number, string> = Handled(2);
const failed: Attempt<number, string> = Failed("offline");

Deno.test("residue() is Some for either handled variant, None for Failed", () => {
	// Given: one attempt of each variant
	// When: reading each one's residue
	const residues = [already, handled, failed].map(residue);

	// Then: the handled ones hold theirs
	assertEquals(residues, [Some(1), Some(2), None()]);
});

Deno.test("error() is Some for Failed only", () => {
	// Given: one attempt of each variant
	// When: reading each one's error
	const errors = [already, handled, failed].map(error);

	// Then: only Failed holds one
	assertEquals(errors, [None(), None(), Some("offline")]);
});

Deno.test("toResult() is Ok for either handled variant, Err for Failed", () => {
	// Given: one attempt of each variant
	// When: converting each to a Result
	const results = [already, handled, failed].map(toResult);

	// Then: the residues are Ok and the error is Err
	assertEquals(results, [Ok(1), Ok(2), Err("offline")]);
});

Deno.test("a Panicked attempt has no residue or error, and panicked() reads its payload", () => {
	// Given: a panicked attempt and the other variants
	const bug = new Error("bad cache");
	const broken: Attempt<number, string> = Panicked(bug);

	// When: reading each one's residue, error and payload
	// Then: only Panicked holds a payload, and it holds nothing else
	assertEquals(residue(broken), None());
	assertEquals(error(broken), None());
	assertEquals([already, handled, failed, broken].map(panicked), [
		None(),
		None(),
		None(),
		Some(bug),
	]);
});

Deno.test("toOutcome() keeps a panic, and toResult() resumes it", () => {
	// Given: one attempt of each variant
	const bug = new Error("bad cache");
	const broken: Attempt<number, string> = Panicked(bug);

	// When: converting each
	const outcomes = [already, handled, failed, broken].map(toOutcome);

	// Then: Ok for both handled, Err for Failed, Panicked for Panicked; and
	// toResult throws the payload again
	assertEquals(outcomes, [
		OutcomeOk(1),
		OutcomeOk(2),
		OutcomeErr("offline"),
		OutcomePanicked(bug),
	]);
	const thrown = assertThrows(() => toResult(broken));
	assertStrictEquals(thrown, bug);
});
