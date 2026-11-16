import { assert, assertEquals, assertFalse, unreachable } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import { match, union } from "@/src/core/mini/exit.ts";
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

Deno.test("isOk() narrows to the Ok variant and to Result<T, never>", async (t) => {
	await t.step("a match after the guard needs only the Ok arm", () => {
		// Given: a Result typed as either variant
		const result: Result<number, string> = Ok(42);

		// When: guarding it with isOk()
		if (TestSubject.isOk(result)) {
			// Then: only the Ok arm is required, and the payload is exactly T
			const value = union(result);
			assertType<IsExact<typeof value, number>>(true);
			assertEquals(match(result)({ Ok: (n) => n + 1 }), 43);
		} else {
			unreachable();
		}
	});

	await t.step("an unguarded match needs the Err arm too", () => {
		// Given: a Result typed as either variant
		const result: Result<number, string> = Ok(42);

		// When: matching it with only an Ok arm
		// @ts-expect-error: the Err arm is missing
		const value = match(result)({ Ok: (n: number) => n });

		// Then: the match is rejected at compile time
		assertEquals(value, 42);
	});

	await t.step("the guarded result fits a Result with any error type", () => {
		// Given: a Result typed as either variant
		const result: Result<number, string> = Ok(42);

		// When: guarding it with isOk()
		if (TestSubject.isOk(result)) {
			// Then: it is assignable to a Result with an unrelated error type
			const other: Result<number, Error> = result;
			assertEquals(other, Ok(42));
		} else {
			unreachable();
		}
	});

	await t.step("the else-branch is not narrowed", () => {
		// Given: a Result typed as either variant
		const result: Result<number, string> = Err("bad");

		// When: the guard fails
		if (TestSubject.isOk(result)) {
			unreachable();
		} else {
			// Then: the result keeps its declared type
			assertType<IsExact<typeof result, Result<number, string>>>(true);
		}
	});
});

Deno.test("isOkAnd() narrows to Ok and the value to the guarded type", async (t) => {
	await t.step("a type-guard predicate narrows the value", () => {
		// Given: a Result whose value may be a string or a number
		const result: Result<string | number, Error> = Ok("hello");

		// When: guarding it with a guard for strings
		if (
			TestSubject.isOkAnd(result, (v): v is string => typeof v === "string")
		) {
			// Then: only the Ok arm is required, and the value is a string
			const value = union(result);
			assertType<IsExact<typeof value, string>>(true);
			assertEquals(match(result)({ Ok: (v) => v.toUpperCase() }), "HELLO");
		} else {
			unreachable();
		}
	});

	await t.step("a boolean predicate keeps the value type", () => {
		// Given: a Result whose value may be a string or a number
		const result: Result<string | number, Error> = Ok(42);

		// When: guarding it with a boolean predicate
		if (TestSubject.isOkAnd(result, (v) => v !== "")) {
			// Then: the value type is unchanged
			const value = union(result);
			assertType<IsExact<typeof value, string | number>>(true);
		} else {
			unreachable();
		}
	});

	await t.step("an unguarded match needs the Err arm too", () => {
		// Given: a Result typed as either variant
		const result: Result<string | number, Error> = Ok("hello");

		// When: matching it with only an Ok arm
		// @ts-expect-error: the Err arm is missing
		const value = match(result)({ Ok: () => 0 });

		// Then: the match is rejected at compile time
		assertEquals(value, 0);
	});

	await t.step("the guarded result is a Result<U, never>", () => {
		// Given: a Result whose value may be a string or a number
		const result: Result<string | number, Error> = Ok("hello");

		// When: guarding it with a guard for strings
		if (
			TestSubject.isOkAnd(result, (v): v is string => typeof v === "string")
		) {
			// Then: it fits a Result of the guarded value and any error type
			const narrowed: Result<string, boolean> = result;
			assertEquals(narrowed, Ok("hello"));
		} else {
			unreachable();
		}
	});

	await t.step("the else-branch is not narrowed", () => {
		// Given: a Result holding a number
		const result: Result<string | number, Error> = Ok(42);

		// When: the string guard fails
		if (
			TestSubject.isOkAnd(result, (v): v is string => typeof v === "string")
		) {
			unreachable();
		} else {
			// Then: the result keeps its declared type
			assertType<IsExact<typeof result, Result<string | number, Error>>>(true);
		}
	});
});

Deno.test("isErr() narrows to the Err variant and to Result<never, E>", async (t) => {
	await t.step("a match after the guard needs only the Err arm", () => {
		// Given: a Result typed as either variant
		const result: Result<number, string> = Err("bad");

		// When: guarding it with isErr()
		if (TestSubject.isErr(result)) {
			// Then: only the Err arm is required, and the error is exactly E
			const error = union(result);
			assertType<IsExact<typeof error, string>>(true);
			assertEquals(match(result)({ Err: (e) => e.length }), 3);
		} else {
			unreachable();
		}
	});

	await t.step("an unguarded match needs the Ok arm too", () => {
		// Given: a Result typed as either variant
		const result: Result<number, string> = Err("bad");

		// When: matching it with only an Err arm
		// @ts-expect-error: the Ok arm is missing
		const value = match(result)({ Err: (e: string) => e.length });

		// Then: the match is rejected at compile time
		assertEquals(value, 3);
	});

	await t.step("the guarded result fits a Result with any value type", () => {
		// Given: a Result typed as either variant
		const result: Result<number, string> = Err("bad");

		// When: guarding it with isErr()
		if (TestSubject.isErr(result)) {
			// Then: it is assignable to a Result with an unrelated value type
			const other: Result<boolean, string> = result;
			assertEquals(other, Err("bad"));
		} else {
			unreachable();
		}
	});

	await t.step("the else-branch is not narrowed", () => {
		// Given: a Result typed as either variant
		const result: Result<number, string> = Ok(42);

		// When: the guard fails
		if (TestSubject.isErr(result)) {
			unreachable();
		} else {
			// Then: the result keeps its declared type
			assertType<IsExact<typeof result, Result<number, string>>>(true);
		}
	});
});

Deno.test("isErrAnd() narrows to Err and the error to the guarded type", async (t) => {
	type NetworkError = { code: number };
	const isNetworkError = (e: Error | NetworkError): e is NetworkError =>
		"code" in e;

	await t.step("a type-guard predicate narrows the error", () => {
		// Given: a Result whose error is a union
		const result: Result<string, Error | NetworkError> = Err({ code: 404 });

		// When: guarding it with a type-guard predicate
		if (TestSubject.isErrAnd(result, isNetworkError)) {
			// Then: only the Err arm is required, and the error is a NetworkError
			const error = union(result);
			assertType<IsExact<typeof error, NetworkError>>(true);
			assertEquals(match(result)({ Err: (e) => e.code }), 404);
		} else {
			unreachable();
		}
	});

	await t.step("a boolean predicate keeps the error type", () => {
		// Given: a Result with a non-union error
		const result: Result<number, Error> = Err(new Error("Not found"));

		// When: guarding it with a plain boolean predicate
		if (TestSubject.isErrAnd(result, (e) => e.message === "Not found")) {
			// Then: it narrows to Err, keeping the error type
			const error = union(result);
			assertType<IsExact<typeof error, Error>>(true);
		} else {
			unreachable();
		}
	});

	await t.step("an unguarded match needs the Ok arm too", () => {
		// Given: a Result whose error is a union
		const result: Result<string, Error | NetworkError> = Err({ code: 404 });

		// When: matching it with only an Err arm
		// @ts-expect-error: the Ok arm is missing
		const value = match(result)({ Err: () => 0 });

		// Then: the match is rejected at compile time
		assertEquals(value, 0);
	});

	await t.step("the guarded result is a Result<never, F>", () => {
		// Given: a Result whose error is a union
		const result: Result<string, Error | NetworkError> = Err({ code: 404 });

		// When: guarding it with a type-guard predicate
		if (TestSubject.isErrAnd(result, isNetworkError)) {
			// Then: it fits a Result of any value type and the guarded error
			const narrowed: Result<boolean, NetworkError> = result;
			assertEquals(narrowed, Err({ code: 404 }));
		} else {
			unreachable();
		}
	});

	await t.step("the else-branch is not narrowed", () => {
		// Given: a Result holding an Error
		const result: Result<string, Error | NetworkError> = Err(new Error("x"));

		// When: the NetworkError guard fails
		if (TestSubject.isErrAnd(result, isNetworkError)) {
			unreachable();
		} else {
			// Then: the result keeps its declared type
			assertType<IsExact<typeof result, Result<string, Error | NetworkError>>>(
				true,
			);
		}
	});
});
