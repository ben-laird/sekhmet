import { assertEquals, assertFalse, assertThrows } from "@std/assert";
import { Err, Ok, type Result } from "@/src/result/mini/core.ts";
import * as TestSubject from "@/src/result/mini/unwrap.ts";

Deno.test("expect() returns the Ok value", () => {
	// Given: Ok(1)
	// When: expecting it
	const subject = TestSubject.expect(Ok(1), "must be ok");

	// Then: the value
	assertEquals(subject, 1);
});

Deno.test("expect() throws the custom message on Err, with the Result as cause", () => {
	// Given: an Err
	const result: Result<number, string> = Err("e");

	// When: expecting it
	const thrown = assertThrows(
		() => TestSubject.expect(result, "must be ok"),
		Error,
		"must be ok",
	);

	// Then: the Result is attached as the cause
	assertEquals(thrown.cause, result);
});

Deno.test("unwrap() returns Ok and throws a fixed message on Err", async (t) => {
	await t.step("Ok", () => {
		// Given: Ok("v")
		// When: unwrapping
		const subject = TestSubject.unwrap(Ok("v"));

		// Then: the value
		assertEquals(subject, "v");
	});

	await t.step("Err", () => {
		// Given: an Err
		const result: Result<number, string> = Err("e");

		// When: unwrapping
		// Then: it throws the default message
		assertThrows(
			() => TestSubject.unwrap(result),
			Error,
			"Result unwrap failed!",
		);
	});
});

Deno.test("expectErr() returns the Err value and throws on Ok", async (t) => {
	await t.step("Err", () => {
		// Given: Err("e")
		// When: expecting the error
		const subject = TestSubject.expectErr(Err("e"), "must fail");

		// Then: the error
		assertEquals(subject, "e");
	});

	await t.step("Ok", () => {
		// Given: an Ok
		const result: Result<number, string> = Ok(1);

		// When: expecting the error
		// Then: it throws the custom message
		assertThrows(
			() => TestSubject.expectErr(result, "must fail"),
			Error,
			"must fail",
		);
	});
});

Deno.test("unwrapErr() returns Err and throws a fixed message on Ok", async (t) => {
	await t.step("Err", () => {
		// Given: Err(5)
		// When: unwrapping the error
		const subject = TestSubject.unwrapErr(Err(5));

		// Then: the error
		assertEquals(subject, 5);
	});

	await t.step("Ok", () => {
		// Given: an Ok
		const result: Result<number, string> = Ok(1);

		// When: unwrapping the error
		// Then: it throws the default message
		assertThrows(
			() => TestSubject.unwrapErr(result),
			Error,
			"Result unwrap failed!",
		);
	});
});

Deno.test("unwrapOr() laws", async (t) => {
	for (const value of [0, 1, -1, 42]) {
		await t.step(`unwrapOr(Ok(${value}), d) ≡ ${value}`, () => {
			// Given: an Ok and a default
			// When: unwrapping with the default
			const subject = TestSubject.unwrapOr(Ok(value), 99);

			// Then: the Ok value wins
			assertEquals(subject, value);
		});
	}

	for (const fallback of [0, 1, -1, 42]) {
		await t.step(`unwrapOr(Err(e), ${fallback}) ≡ ${fallback}`, () => {
			// Given: an Err and a default
			const result: Result<number, string> = Err("e");

			// When: unwrapping with the default
			const subject = TestSubject.unwrapOr(result, fallback);

			// Then: the default wins
			assertEquals(subject, fallback);
		});
	}
});

Deno.test("unwrapOrElse() computes the fallback from the error lazily", async (t) => {
	await t.step("Err", () => {
		// Given: Err("abc")
		const result: Result<number, string> = Err("abc");

		// When: unwrapping with a fallback
		const subject = TestSubject.unwrapOrElse(result, (e) => e.length);

		// Then: the fallback derived from the error
		assertEquals(subject, 3);
	});

	await t.step("Ok never calls the fallback", () => {
		// Given: an Ok and a tracking fallback
		let called = false;

		// When: unwrapping with a fallback
		const subject = TestSubject.unwrapOrElse(Ok(7), () => {
			called = true;
			return 0;
		});

		// Then: the Ok value, without consulting the fallback
		assertEquals(subject, 7);
		assertFalse(called);
	});
});
