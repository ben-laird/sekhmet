import { assert, assertEquals, assertFalse, unreachable } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
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

Deno.test("isErrAnd() narrows to Err with the guarded error type", async (t) => {
	type NetworkError = { code: number };
	const isNetworkError = (e: Error | NetworkError): e is NetworkError =>
		"code" in e;

	await t.step("a type-guard predicate narrows the error type", () => {
		// Given: a Result whose error is a union
		const result: Result<string, Error | NetworkError> = Err({ code: 404 });

		// When: guarding it with a type-guard predicate
		if (TestSubject.isErrAnd(result, isNetworkError)) {
			// Then: it narrows to an Err holding only NetworkError
			assertType<IsExact<typeof result, Result<never, NetworkError>>>(true);
			const narrowed: Result<never, NetworkError> = result;
			assertEquals(narrowed, Err({ code: 404 }));
		} else {
			unreachable();
		}
	});

	await t.step("without the guard the error type stays wide", () => {
		// Given: the same Result, unguarded
		const result: Result<string, Error | NetworkError> = Err({ code: 404 });

		// When: assigning it to the narrowed type
		// @ts-expect-error: an unguarded Result may be Ok or hold an Error
		const narrowed: Result<never, NetworkError> = result;

		// Then: the assignment is rejected at compile time
		assertEquals(narrowed, result);
	});

	await t.step("a boolean predicate narrows only the variant", () => {
		// Given: a Result with a non-union error
		const result: Result<number, Error> = Err(new Error("Not found"));

		// When: guarding it with a plain boolean predicate
		if (TestSubject.isErrAnd(result, (e) => e.message === "Not found")) {
			// Then: it narrows to Err, keeping the error type
			assertType<IsExact<typeof result, Result<never, Error>>>(true);
		} else {
			unreachable();
		}
	});
});
