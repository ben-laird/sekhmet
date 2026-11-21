import { None, Some } from "@sekhmet/enum/option/mini";
import { Err, Ok } from "@sekhmet/enum/result/mini";
import { assertEquals } from "@std/assert";
import { error, residue, toResult } from "./accessors.ts";
import { AlreadyHandled, type Attempt, Failed, Handled } from "./core.ts";

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
