import { isNone, unwrap as unwrapOption } from "@sekhmet/enum/option/mini";
import {
	type Result,
	Err as ResultErr,
	Ok as ResultOk,
} from "@sekhmet/enum/result/mini/core";
import { assertEquals, assertStrictEquals, assertThrows } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import { Err, Ok, type Outcome, Panicked } from "@/src/outcome/mini/core.ts";
import * as TestSubject from "@/src/outcome/mini/panic.ts";

const ok: Outcome<number, string> = Ok(1);
const failed: Outcome<number, string> = Err("e");
const bug: Outcome<number, string> = Panicked(404);

Deno.test("mapPanic() maps Panicked and passes Ok and Err through", () => {
	// Given: an Outcome of each variant
	// When: mapping each payload
	const subject = [ok, failed, bug].map((o) => {
		return TestSubject.mapPanic(o, (p) => `payload ${String(p)}`);
	});

	// Then: only the panic is mapped
	assertEquals(subject, [Ok(1), Err("e"), Panicked("payload 404")]);
	assertType<
		IsExact<(typeof subject)[number], Outcome<number, string, string>>
	>(true);
});

Deno.test("inspectPanic() sees only a panic and returns self", () => {
	// Given: an Outcome of each variant
	const seen: unknown[] = [];

	// When: inspecting each payload
	const returned = [ok, failed, bug].map((o) => {
		return TestSubject.inspectPanic(o, (p) => seen.push(p));
	});

	// Then: only the panic was seen, and each Outcome came back itself
	assertEquals(seen, [404]);
	assertStrictEquals(returned[2], bug);
});

Deno.test("panicked() is Some of a panic's payload and None otherwise", () => {
	// Given: an Outcome of each variant
	// When: converting each
	const fromOk = TestSubject.panicked(ok);
	const fromErr = TestSubject.panicked(failed);
	const fromPanic = TestSubject.panicked(bug);

	// Then: only the panic is Some
	assertEquals([isNone(fromOk), isNone(fromErr)], [true, true]);
	assertEquals(unwrapOption(fromPanic), 404);
});

Deno.test("unwrapPanicked() and expectPanicked() return a payload or throw", () => {
	// Given: a panic and an Ok
	// When: unwrapping the payload of each
	const payload = TestSubject.unwrapPanicked(bug);
	const expected = TestSubject.expectPanicked(bug, "should have thrown");

	// Then: the panic yields its payload, and the others throw
	assertEquals([payload, expected], [404, 404]);
	assertThrows(
		() => TestSubject.unwrapPanicked(ok),
		Error,
		"Outcome unwrap failed!",
	);
	assertThrows(
		() => TestSubject.expectPanicked(failed, "should have thrown"),
		Error,
		"should have thrown",
	);
});

Deno.test("recover() turns a panic into the handler's Ok or Err", async (t) => {
	await t.step("into Ok", () => {
		// Given: a panic, and a handler that recovers with a value
		const handler = (p: unknown): Result<number, string> => ResultOk(Number(p));

		// When: recovering
		const subject = TestSubject.recover(bug, handler);

		// Then: it is Ok, and its type has no panic left
		assertEquals(subject, Ok(404));
		assertType<IsExact<typeof subject, Outcome<number, string, never>>>(true);
	});

	await t.step("into Err", () => {
		// Given: a panic, and a handler that recovers with an error
		const handler = (p: unknown): Result<number, string> => {
			return ResultErr(`bug: ${String(p)}`);
		};

		// When: recovering
		const subject = TestSubject.recover(bug, handler);

		// Then: it is Err
		assertEquals(subject, Err("bug: 404"));
	});

	await t.step("Ok and Err pass through without calling the handler", () => {
		// Given: an Ok and an Err, and a counting handler
		let calls = 0;
		const handler = (): Result<number, string> => {
			calls++;
			return ResultOk(0);
		};

		// When: recovering each
		const subject = [ok, failed].map((o) => TestSubject.recover(o, handler));

		// Then: both are unchanged, and the handler never ran
		assertEquals(subject, [Ok(1), Err("e")]);
		assertEquals(calls, 0);
	});
});

Deno.test("resume() returns Ok or Err as a Result and rethrows a payload", () => {
	// Given: an Ok, an Err, and a panic holding an Error
	const thrown = new TypeError("x is undefined");

	// When: resuming each
	const fromOk = TestSubject.resume(ok);
	const fromErr = TestSubject.resume(failed);
	const resumed = assertThrows(() => TestSubject.resume(Panicked(thrown)));

	// Then: Ok and Err become a Result, and the payload is thrown unchanged
	assertEquals([fromOk, fromErr], [ResultOk(1), ResultErr("e")]);
	assertStrictEquals(resumed, thrown);
});

Deno.test("resume() rethrows a primitive payload unchanged", () => {
	// Given: a panic holding a string, which JavaScript can throw too
	const outcome: Outcome<number, string> = Panicked("plain string");

	// When: resuming it
	let caught: unknown;
	try {
		TestSubject.resume(outcome);
	} catch (thrown: unknown) {
		caught = thrown;
	}

	// Then: the string itself was thrown, not wrapped in an Error
	assertStrictEquals(caught, "plain string");
});
