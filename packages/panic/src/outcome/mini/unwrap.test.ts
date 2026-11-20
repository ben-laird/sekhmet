import { assertEquals, assertStrictEquals, assertThrows } from "@std/assert";
import { Err, Ok, type Outcome, Panicked } from "@/src/outcome/mini/core.ts";
import * as TestSubject from "@/src/outcome/mini/unwrap.ts";

const ok: Outcome<number, string> = Ok(42);
const failed: Outcome<number, string> = Err("abc");

/** Every extractor, each applied to `outcome`. */
function extractors(outcome: Outcome<number, string>): (() => unknown)[] {
	return [
		() => TestSubject.unwrap(outcome),
		() => TestSubject.expect(outcome, "message"),
		() => TestSubject.unwrapErr(outcome),
		() => TestSubject.expectErr(outcome, "message"),
		() => TestSubject.unwrapOr(outcome, 0),
		() => TestSubject.unwrapOrElse(outcome, (e) => e.length),
	];
}

Deno.test("unwrap() and expect() return Ok's value and throw on Err", () => {
	// Given: an Ok and an Err
	// When: unwrapping each
	const value = TestSubject.unwrap(ok);
	const expected = TestSubject.expect(ok, "must be set");

	// Then: Ok yields its value, and Err throws the given message
	assertEquals([value, expected], [42, 42]);
	assertThrows(
		() => TestSubject.unwrap(failed),
		Error,
		"Outcome unwrap failed!",
	);
	assertThrows(
		() => TestSubject.expect(failed, "must be set"),
		Error,
		"must be set",
	);
});

Deno.test("unwrapErr() and expectErr() return Err's error and throw on Ok", () => {
	// Given: an Ok and an Err
	// When: unwrapping the error of each
	const error = TestSubject.unwrapErr(failed);
	const expected = TestSubject.expectErr(failed, "must fail");

	// Then: Err yields its error, and Ok throws the given message
	assertEquals([error, expected], ["abc", "abc"]);
	assertThrows(
		() => TestSubject.unwrapErr(ok),
		Error,
		"Outcome unwrap failed!",
	);
	assertThrows(
		() => TestSubject.expectErr(ok, "must fail"),
		Error,
		"must fail",
	);
});

Deno.test("unwrapOr() and unwrapOrElse() fall back only on Err", () => {
	// Given: an Ok and an Err
	// When: unwrapping each with a fallback
	const subject = [
		TestSubject.unwrapOr(ok, 0),
		TestSubject.unwrapOr(failed, 0),
		TestSubject.unwrapOrElse(ok, (e) => e.length),
		TestSubject.unwrapOrElse(failed, (e) => e.length),
	];

	// Then: Ok yields its value, and Err the fallback
	assertEquals(subject, [42, 0, 42, 3]);
});

Deno.test("every extractor resumes a Panicked: it throws the payload unchanged", () => {
	// Given: a panic holding an Error
	const thrown = new RangeError("too big");
	const bug: Outcome<number, string> = Panicked(thrown);

	// When: extracting with every extractor
	const resumed = extractors(bug).map((extract) => assertThrows(extract));

	// Then: each threw the payload itself; no fallback stood in for the bug
	for (const payload of resumed) {
		assertStrictEquals(payload, thrown);
	}
	assertEquals(resumed.length, 6);
});
