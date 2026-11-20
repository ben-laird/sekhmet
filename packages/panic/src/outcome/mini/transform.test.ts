import { assertEquals, assertStrictEquals, assertThrows } from "@std/assert";
import { Err, Ok, type Outcome, Panicked } from "@/src/outcome/mini/core.ts";
import * as TestSubject from "@/src/outcome/mini/transform.ts";

const ok: Outcome<number, string> = Ok(2);
const failed: Outcome<number, string> = Err("e");
const bug: Outcome<number, string> = Panicked("p");

Deno.test("map() maps Ok and passes Err and Panicked through", () => {
	// Given: an Outcome of each variant, and a counting mapping
	let calls = 0;
	const double = (n: number): number => {
		calls++;
		return n * 2;
	};

	// When: mapping each
	const subject = [ok, failed, bug].map((o) => TestSubject.map(o, double));

	// Then: only Ok is mapped
	assertEquals(subject, [Ok(4), Err("e"), Panicked("p")]);
	assertEquals(calls, 1);
});

Deno.test("mapErr() maps Err and passes Ok and Panicked through", () => {
	// Given: an Outcome of each variant
	// When: mapping each error
	const subject = [ok, failed, bug].map((o) => {
		return TestSubject.mapErr(o, (e) => e.toUpperCase());
	});

	// Then: only Err is mapped; a panic is never an expected error
	assertEquals(subject, [Ok(2), Err("E"), Panicked("p")]);
});

Deno.test("mapOr() maps Ok, falls back on Err and resumes Panicked", () => {
	// Given: options with a fallback, and a panic holding an Error
	const options = { fallback: 0, mapping: (n: number) => n * 10 };
	const thrown = new RangeError("too big");

	// When: mapping each
	const mapped = TestSubject.mapOr(ok, options);
	const fallback = TestSubject.mapOr(failed, options);

	// Then: Ok maps, Err falls back, and the panic's payload is thrown unchanged
	assertEquals([mapped, fallback], [20, 0]);
	const resumed = assertThrows(() => {
		return TestSubject.mapOr(Panicked(thrown), options);
	});
	assertStrictEquals(resumed, thrown);
});

Deno.test("mapOrElse() handles Ok and Err and resumes Panicked", () => {
	// Given: handlers for both expected channels
	const handlers = {
		onOk: (n: number) => `ok ${n}`,
		onErr: (e: string) => `err ${e}`,
	};

	// When: mapping each expected variant
	const subject = [ok, failed].map((o) => TestSubject.mapOrElse(o, handlers));

	// Then: each goes to its handler, and a panic is thrown again
	assertEquals(subject, ["ok 2", "err e"]);
	assertThrows(() => TestSubject.mapOrElse(bug, handlers));
});

Deno.test("inspect(), inspectErr() see only their own channel and return self", () => {
	// Given: an Outcome of each variant
	const seen: string[] = [];

	// When: inspecting each on both channels
	const returned = [ok, failed, bug].flatMap((o) => {
		return [
			TestSubject.inspect(o, (n) => seen.push(`ok ${n}`)),
			TestSubject.inspectErr(o, (e) => seen.push(`err ${e}`)),
		];
	});

	// Then: each inspector ran once, never for the panic, and self came back
	assertEquals(seen, ["ok 2", "err e"]);
	assertStrictEquals(returned[0], ok);
	assertStrictEquals(returned[3], failed);
	assertStrictEquals(returned[5], bug);
});
