import { Panic } from "@sekhmet/panic/mini/core";
import { assertEquals, assertStrictEquals, assertThrows } from "@std/assert";
import { AlreadyHandled, type Attempt, Failed, Handled } from "./core.ts";
import {
	expect,
	expectFailed,
	unwrap,
	unwrapFailed,
	unwrapOr,
	unwrapOrElse,
} from "./unwrap.ts";

const already: Attempt<number, string> = AlreadyHandled(1);
const handled: Attempt<number, string> = Handled(2);
const failed: Attempt<number, string> = Failed("offline");

Deno.test("expect() and unwrap() return the residue of a handled attempt", () => {
	// Given: both handled variants
	// When: unwrapping them
	// Then: each gives its residue
	assertEquals(expect(already, "must be handled"), 1);
	assertEquals(expect(handled, "must be handled"), 2);
	assertEquals(unwrap(already), 1);
	assertEquals(unwrap(handled), 2);
});

Deno.test("expect() panics with its message on Failed, with the attempt as cause", () => {
	// Given: a failed attempt
	// When: expecting a residue
	const thrown = assertThrows(
		() => expect(failed, "must be handled"),
		Panic,
		"must be handled",
	);

	// Then: the panic carries the attempt
	assertStrictEquals(thrown.cause, failed);
});

Deno.test("unwrap() panics with a fixed message on Failed", () => {
	// Given: a failed attempt
	// When: unwrapping it
	// Then: it panics
	assertThrows(() => unwrap(failed), Panic, "Attempt unwrap failed!");
});

Deno.test("unwrapOr() and unwrapOrElse() fall back only on Failed", () => {
	// Given: a handled and a failed attempt
	// When: unwrapping with fallbacks
	// Then: the residue wins, and the fallback stands in for a failure
	assertEquals(unwrapOr(already, 0), 1);
	assertEquals(unwrapOr(handled, 0), 2);
	assertEquals(unwrapOr(failed, 0), 0);
	assertEquals(
		unwrapOrElse(already, (e) => e.length),
		1,
	);
	assertEquals(
		unwrapOrElse(handled, (e) => e.length),
		2,
	);
	assertEquals(
		unwrapOrElse(failed, (e) => e.length),
		7,
	);
});

Deno.test("expectFailed() and unwrapFailed() return a failed attempt's error", () => {
	// Given: a failed attempt
	// When: unwrapping its error
	// Then: it is the recovery's error
	assertEquals(expectFailed(failed, "must fail"), "offline");
	assertEquals(unwrapFailed(failed), "offline");
});

Deno.test("expectFailed() and unwrapFailed() panic on either handled variant", () => {
	// Given: both handled variants
	for (const attempt of [already, handled]) {
		// When: unwrapping an error
		const thrown = assertThrows(
			() => expectFailed(attempt, "must fail"),
			Panic,
			"must fail",
		);

		// Then: they panic, carrying the attempt
		assertStrictEquals(thrown.cause, attempt);
		assertThrows(() => unwrapFailed(attempt), Panic, "Attempt unwrap failed!");
	}
});
