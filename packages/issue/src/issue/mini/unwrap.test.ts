import { Panic } from "@sekhmet/panic/mini/core";
import { assertEquals, assertStrictEquals, assertThrows } from "@std/assert";
import { type Issue, issue } from "./core.ts";
import { handle } from "./handling.ts";
import { isUnhandled } from "./predicates.ts";
import {
	expectResidue,
	residueOr,
	residueOrElse,
	unwrapResidue,
} from "./unwrap.ts";

function notFound(): Issue<string, number> {
	return issue<string, number>({
		value: "dev.json",
		code: "config/NotFound",
		message: "No config file.",
	});
}

Deno.test("expectResidue() and unwrapResidue() return a handled issue's residue", () => {
	// Given: a handled issue
	const subject = notFound();
	handle(subject, 8080);

	// When: unwrapping it
	// Then: both give the residue
	assertEquals(expectResidue(subject, "must be loaded"), 8080);
	assertEquals(unwrapResidue(subject), 8080);
});

Deno.test("expectResidue() panics with its message while unhandled, with the issue as cause", () => {
	// Given: an unhandled issue
	const subject = notFound();

	// When: expecting a residue
	const thrown = assertThrows(
		() => expectResidue(subject, "must be loaded"),
		Panic,
		"must be loaded",
	);

	// Then: the panic carries the issue, which stays unhandled
	assertStrictEquals(thrown.cause, subject);
	assertEquals(isUnhandled(subject), true);
});

Deno.test("unwrapResidue() panics with a fixed message while unhandled", () => {
	// Given: an unhandled issue
	const subject = notFound();

	// When: unwrapping it
	// Then: it panics
	assertThrows(() => unwrapResidue(subject), Panic, "Issue unwrap failed!");
});

Deno.test("residueOr() falls back while unhandled, without handling the issue", () => {
	// Given: an unhandled issue
	const subject = notFound();

	// When: reading with a fallback, before and after handling
	const before = residueOr(subject, 80);
	const stillUnhandled = isUnhandled(subject);
	handle(subject, 8080);
	const after = residueOr(subject, 80);

	// Then: the fallback stood in only while unhandled, and handled nothing
	assertEquals(before, 80);
	assertEquals(stillUnhandled, true);
	assertEquals(after, 8080);
});

Deno.test("residueOrElse() computes from the value while unhandled", () => {
	// Given: an unhandled issue, and a fallback that counts its calls
	const subject = notFound();
	let calls = 0;
	const byPath = (path: string): number => {
		calls += 1;
		return path === "dev.json" ? 3000 : 80;
	};

	// When: reading with it, before and after handling
	const before = residueOrElse(subject, byPath);
	handle(subject, 8080);
	const after = residueOrElse(subject, byPath);

	// Then: it ran once, on the value, and not once handled
	assertEquals([before, after], [3000, 8080]);
	assertEquals(calls, 1);
});
