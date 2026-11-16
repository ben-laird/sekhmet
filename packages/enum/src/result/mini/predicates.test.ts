import { assert, assertEquals, assertFalse } from "@std/assert";
import { Err, Ok, type Result } from "@/src/result/mini/core.ts";
import * as TestSubject from "@/src/result/mini/predicates.ts";

Deno.test("isOk() and isErr() are complementary", async (t) => {
	const cases: [string, Result<number, string>, boolean][] = [
		["Ok", Ok(1), true],
		["Err", Err("e"), false],
	];

	for (const [label, result, expectOk] of cases) {
		await t.step(label, () => {
			// Given: a Result of a known variant
			// When: checking both predicates
			const ok = TestSubject.isOk(result);
			const err = TestSubject.isErr(result);

			// Then: exactly one holds
			assertEquals(ok, expectOk);
			assertEquals(err, !expectOk);
		});
	}
});

Deno.test("isOkAnd() requires Ok and a passing predicate", async (t) => {
	await t.step("Ok and predicate passes", () => {
		// Given: Ok(42)
		const result = Ok(42);

		// When: checking with a passing predicate
		const subject = TestSubject.isOkAnd(result, (n) => n > 40);

		// Then: true
		assert(subject);
	});

	await t.step("Ok and predicate fails", () => {
		// Given: Ok(1)
		const result = Ok(1);

		// When: checking with a failing predicate
		const subject = TestSubject.isOkAnd(result, (n) => n > 40);

		// Then: false
		assertFalse(subject);
	});

	await t.step("Err never calls the predicate", () => {
		// Given: an Err and a tracking predicate
		const result: Result<number, string> = Err("e");
		let called = false;

		// When: checking it
		const subject = TestSubject.isOkAnd(result, () => {
			called = true;
			return true;
		});

		// Then: false, and the predicate was not consulted
		assertFalse(subject);
		assertFalse(called);
	});

	await t.step("type guard narrows the value", () => {
		// Given: an Ok of unknown
		const result: Result<unknown, never> = Ok("hello");

		// When: checking with a string guard
		const subject = TestSubject.isOkAnd(
			result,
			(v): v is string => typeof v === "string",
		);

		// Then: true
		assert(subject);
	});
});

Deno.test("isErrAnd() requires Err and a passing predicate", async (t) => {
	await t.step("Err and predicate passes", () => {
		// Given: an Err with a matching message
		const result = Err(new Error("Not found"));

		// When: checking with a passing predicate
		const subject = TestSubject.isErrAnd(result, (e) =>
			e.message.includes("Not found"),
		);

		// Then: true
		assert(subject);
	});

	await t.step("Err and predicate fails", () => {
		// Given: an Err with another message
		const result = Err(new Error("Timeout"));

		// When: checking with the same predicate
		const subject = TestSubject.isErrAnd(result, (e) =>
			e.message.includes("Not found"),
		);

		// Then: false
		assertFalse(subject);
	});

	await t.step("Ok never calls the predicate", () => {
		// Given: an Ok and a tracking predicate
		const result: Result<number, string> = Ok(1);
		let called = false;

		// When: checking it
		const subject = TestSubject.isErrAnd(result, () => {
			called = true;
			return true;
		});

		// Then: false, and the predicate was not consulted
		assertFalse(subject);
		assertFalse(called);
	});
});
