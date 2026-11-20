import { assertEquals, assertInstanceOf, unreachable } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import * as coreMini from "@/src/core/mini/mod.ts";
import { None, Option, Some } from "@/src/option/main/mod.ts";
import * as mini from "../mini/mod.ts";
import {
	Err,
	fallible,
	fallibleAsync,
	Ok,
	promiseResult,
	Result,
} from "./mod.ts";

Deno.test("Result methods chain on main constructors", () => {
	// Given: a main Ok and a main Err
	const ok = Ok<number, string>(2);
	const err = Err<number, string>("bad");

	// When: chaining transformations on each
	const fromOk = ok
		.map((n) => n + 1)
		.andThen((n) => (n > 2 ? Ok(n * 2) : Err("small")))
		.unwrapOr(0);
	const fromErr = err.mapErr((e) => e.toUpperCase()).unwrapErr();

	// Then: every step ran
	assertEquals(fromOk, 6);
	assertEquals(fromErr, "BAD");
});

Deno.test("main Result is an instance of mini Result and mini Enum", () => {
	// Given: a main Ok
	const result = Ok(1);

	// When: checking it against the mini classes
	const classes = [
		result instanceof Result,
		result instanceof mini.Result,
		result instanceof coreMini.Enum,
	];

	// Then: it is all of them, so mini functions accept it
	assertEquals(classes, [true, true, true]);
	assertEquals(mini.unwrap(result), 1);
});

Deno.test("Result.ok and Result.err return main Options", () => {
	// Given: a main Ok and a main Err
	const ok = Ok<number, string>(3);
	const err = Err<number, string>("nope");

	// When: projecting them to Options and chaining Option methods
	const value = ok.ok().map((n) => n * 2);
	const error = err.err().map((e) => e.length);

	// Then: the projections chain as main Options
	assertInstanceOf(value, Option);
	assertEquals(value.unwrap(), 6);
	assertEquals(error.unwrap(), 4);
});

Deno.test("main isOk() narrows to Ok and to a main Result<T, never>", async (t) => {
	await t.step(
		"the guarded result matches on Ok alone and keeps its methods",
		() => {
			// Given: a main Result typed as either variant
			const result: Result<number, string> = Ok(42);

			// When: guarding it with isOk()
			if (result.isOk()) {
				// Then: only the Ok arm is required, the payload is a number,
				// and it is a main Result with any error type
				const value = coreMini.match(result)({ Ok: (n) => n });
				assertType<IsExact<typeof value, number>>(true);
				const other: Result<number, Error> = result;
				assertEquals(other.map((n) => n + 1).unwrap(), 43);
			} else {
				unreachable();
			}
		},
	);

	await t.step("an unguarded result needs the Err arm too", () => {
		// Given: a main Result typed as either variant
		const result: Result<number, string> = Ok(42);

		// When: matching it with only an Ok arm
		// @ts-expect-error: the Err arm is missing
		const value = coreMini.match(result)({ Ok: (n: number) => n });

		// Then: the match is rejected at compile time
		assertEquals(value, 42);
	});

	await t.step("the else-branch is not narrowed", () => {
		// Given: a main Result typed as either variant
		const result: Result<number, string> = Err("bad");

		// When: the guard fails
		if (result.isOk()) {
			unreachable();
		} else {
			// Then: the result keeps its declared type
			assertType<IsExact<typeof result, Result<number, string>>>(true);
		}
	});
});

Deno.test("main isOkAnd() narrows to Ok and a main Result<U, never>", async (t) => {
	await t.step("a type-guard predicate narrows the value", () => {
		// Given: a main Result whose value may be a string or a number
		const result: Result<string | number, Error> = Ok("hi");

		// When: guarding it with a guard for strings
		if (result.isOkAnd((v): v is string => typeof v === "string")) {
			// Then: only the Ok arm is required, and it is a main Result<string, never>
			const value = coreMini.match(result)({ Ok: (v) => v });
			assertType<IsExact<typeof value, string>>(true);
			const narrowed: Result<string, boolean> = result;
			assertEquals(narrowed.map((s) => s.length).unwrap(), 2);
		} else {
			unreachable();
		}
	});

	await t.step("the else-branch is not narrowed", () => {
		// Given: a main Result holding a number
		const result: Result<string | number, Error> = Ok(42);

		// When: the string guard fails
		if (result.isOkAnd((v): v is string => typeof v === "string")) {
			unreachable();
		} else {
			// Then: the result keeps its declared type
			assertType<IsExact<typeof result, Result<string | number, Error>>>(true);
		}
	});
});

Deno.test("main isErr() narrows to Err and to a main Result<never, E>", async (t) => {
	await t.step(
		"the guarded result matches on Err alone and keeps its methods",
		() => {
			// Given: a main Result typed as either variant
			const result: Result<number, string> = Err("bad");

			// When: guarding it with isErr()
			if (result.isErr()) {
				// Then: only the Err arm is required, the error is a string,
				// and it is a main Result with any value type
				const error = coreMini.match(result)({ Err: (e) => e });
				assertType<IsExact<typeof error, string>>(true);
				const other: Result<boolean, string> = result;
				assertEquals(other.mapErr((e) => e.length).unwrapErr(), 3);
			} else {
				unreachable();
			}
		},
	);

	await t.step("an unguarded result needs the Ok arm too", () => {
		// Given: a main Result typed as either variant
		const result: Result<number, string> = Err("bad");

		// When: matching it with only an Err arm
		// @ts-expect-error: the Ok arm is missing
		const value = coreMini.match(result)({ Err: (e: string) => e.length });

		// Then: the match is rejected at compile time
		assertEquals(value, 3);
	});

	await t.step("the else-branch is not narrowed", () => {
		// Given: a main Result typed as either variant
		const result: Result<number, string> = Ok(42);

		// When: the guard fails
		if (result.isErr()) {
			unreachable();
		} else {
			// Then: the result keeps its declared type
			assertType<IsExact<typeof result, Result<number, string>>>(true);
		}
	});
});

Deno.test("main isErrAnd() narrows to Err and a main Result<never, F>", async (t) => {
	type NetworkError = { code: number };
	const isNetworkError = (e: Error | NetworkError): e is NetworkError =>
		"code" in e;

	await t.step("a type-guard predicate narrows the error", () => {
		// Given: a main Result whose error is a union
		const result: Result<string, Error | NetworkError> = Err({ code: 404 });

		// When: guarding it with a type-guard predicate
		if (result.isErrAnd(isNetworkError)) {
			// Then: only the Err arm is required, and it is a main Result<never, NetworkError>
			const error = coreMini.match(result)({ Err: (e) => e });
			assertType<IsExact<typeof error, NetworkError>>(true);
			const narrowed: Result<boolean, NetworkError> = result;
			assertEquals(narrowed.mapErr((e) => e.code).unwrapErr(), 404);
		} else {
			unreachable();
		}
	});

	await t.step("the else-branch is not narrowed", () => {
		// Given: a main Result holding an Error
		const result: Result<string, Error | NetworkError> = Err(new Error("x"));

		// When: the NetworkError guard fails
		if (result.isErrAnd(isNetworkError)) {
			unreachable();
		} else {
			// Then: the result keeps its declared type
			assertType<IsExact<typeof result, Result<string, Error | NetworkError>>>(
				true,
			);
		}
	});
});

Deno.test("fallible's wrapper returns main Results that chain", () => {
	// Given: a main fallible wrapper
	const parse = fallible({
		fn: (text: string) => {
			const parsed = Number(text);
			if (Number.isNaN(parsed)) throw new Error(`not a number: ${text}`);
			return parsed;
		},
		parseErr: ({ args: [text] }) => `bad: ${text}`,
	});

	// When: calling it and chaining on each outcome
	const ok = parse("21");
	const err = parse("x");

	// Then: both are main Results whose methods chain
	assertInstanceOf(ok, Result);
	assertInstanceOf(err, Result);
	assertEquals(ok.map((n) => n * 2).unwrapOr(0), 42);
	assertEquals(err.mapErr((e) => e.toUpperCase()).unwrapErr(), "BAD: X");
	assertType<IsExact<typeof parse, (text: string) => Result<number, string>>>(
		true,
	);
});

Deno.test("fallibleAsync's wrapper resolves to main Results that chain", async () => {
	// Given: a main fallibleAsync wrapper
	const load = fallibleAsync({
		fn: (id: number): Promise<string> => {
			if (id !== 1) return Promise.reject(new Error(`no user ${id}`));
			return Promise.resolve("Ada");
		},
		parseErr: ({ args: [id] }) => id,
	});

	// When: awaiting each outcome
	const found = await load(1);
	const missing = await load(2);

	// Then: both are main Results whose methods chain
	assertInstanceOf(found, Result);
	assertInstanceOf(missing, Result);
	assertEquals(found.map((name) => name.length).unwrapOr(0), 3);
	assertEquals(missing.mapErr((id) => id * 10).unwrapErr(), 20);
	assertType<
		IsExact<typeof load, (id: number) => Promise<Result<string, number>>>
	>(true);
});

Deno.test("promiseResult resolves to a main Result that chains", async () => {
	// Given: an executor that resolves and one that rejects
	const resolved = promiseResult<number, string>((resolve) => {
		resolve(21);
	});
	const rejected = promiseResult<number, string>((_resolve, reject) => {
		reject("bad");
	});

	// When: awaiting each
	const ok = await resolved;
	const err = await rejected;

	// Then: both are main Results whose methods chain
	assertInstanceOf(ok, Result);
	assertInstanceOf(err, Result);
	assertEquals(ok.map((n) => n * 2).unwrapOr(0), 42);
	assertEquals(err.mapErr((e) => e.toUpperCase()).unwrapErr(), "BAD");
	assertType<IsExact<typeof resolved, Promise<Result<number, string>>>>(true);
});

Deno.test("Result.transpose returns a main Option holding a main Result", () => {
	// Given: an Ok holding a Some, an Ok holding a None, and an Err
	const okSome = Ok<Option<number>, string>(Some(5));
	const okNone = Ok<Option<number>, string>(None());
	const err = Err<Option<number>, string>("bad");

	// When: transposing them and chaining through both layers
	const transposed = okSome.transpose();
	const inner = transposed.unwrap();

	// Then: the Option and the Result inside it are both main
	assertInstanceOf(transposed, Option);
	assertInstanceOf(inner, Result);
	assertType<IsExact<typeof transposed, Option<Result<number, string>>>>(true);
	assertEquals(inner.map((n) => n * 2).unwrap(), 10);
	assertEquals(okNone.transpose().isNone(), true);
	assertEquals(err.transpose().unwrap().unwrapErr(), "bad");
});

Deno.test("Result.transpose exists only for a Result of an Option", () => {
	// Given: a Result of a number
	const plain = Ok<number, string>(1);

	// When: writing a transpose on it
	// @ts-expect-error: transpose's this is a Result of an Option
	const misuse = (): unknown => plain.transpose();

	// Then: it doesn't compile, so it is never called
	assertEquals(typeof misuse, "function");
});
