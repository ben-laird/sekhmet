import { isolate, union } from "@sekhmet/enum/core/mini";
import { Ok } from "@sekhmet/enum/result/mini";
import { assert, assertEquals, assertStrictEquals } from "@std/assert";
import { code, docs, hint, message, value } from "./accessors.ts";
import { type Issue, issue } from "./core.ts";
import { handle } from "./handling.ts";
import { isHandled, isUnhandled } from "./predicates.ts";
import { inspect, inspectResidue, toResult, wrap } from "./transform.ts";

function notFound(): Issue<string, number> {
	return issue<string, number>({
		value: "app.json",
		code: "config/NotFound",
		message: "No config file.",
	});
}

Deno.test("toResult() is Err with the issue itself while unhandled", () => {
	// Given: an unhandled issue
	const subject = notFound();

	// When: converting it
	const result = toResult(subject);

	// Then: the Err holds that very issue
	assert(isolate(result, "Err"));
	assertStrictEquals(union(result), subject);
});

Deno.test("toResult() is Ok with the residue once handled", () => {
	// Given: a handled issue
	const subject = notFound();
	handle(subject, 8080);

	// When: converting it
	const result = toResult(subject);

	// Then: it is Ok with the residue
	assertEquals(result, Ok(8080));
});

Deno.test("wrap() makes a new unhandled issue whose value holds the cause", () => {
	// Given: an issue
	const cause = notFound();

	// When: it is wrapped with new wording
	const wrapped = wrap(cause, {
		code: "config/LoadFailed",
		message: "Couldn't load the config.",
		hint: "Check the path.",
		docs: "https://example.com/load",
	});

	// Then: the new issue has that wording, holds the cause, and is unhandled
	assertEquals(code(wrapped), "config/LoadFailed");
	assertEquals(message(wrapped), "Couldn't load the config.");
	assertEquals(hint(wrapped), "Check the path.");
	assertEquals(docs(wrapped), "https://example.com/load");
	const held = value(wrapped);
	assert(isolate(held, "Some"));
	assertStrictEquals(union(held).cause, cause);
	assert(isUnhandled(wrapped));
});

Deno.test("wrap() starts unhandled even when its cause is handled, and they stay separate", () => {
	// Given: a handled cause, wrapped
	const cause = notFound();
	handle(cause, 1);
	const wrapped = wrap(cause, { code: "config/LoadFailed", message: "No." });

	// When: the wrapper is handled with another residue
	handle(wrapped, 2);

	// Then: each kept its own residue
	assertEquals(isHandled(wrapped), true);
	assertEquals(toResult(cause), Ok(1));
	assertEquals(toResult(wrapped), Ok(2));
});

Deno.test("inspect() sees the value while unhandled and returns the issue", () => {
	// Given: an issue, and a log
	const subject = notFound();
	const seen: string[] = [];

	// When: it is inspected before and after handling
	const returned = inspect(subject, (path) => seen.push(path));
	handle(subject, 8080);
	inspect(subject, (path) => seen.push(path));

	// Then: it saw the value once, and returned the issue itself
	assertEquals(seen, ["app.json"]);
	assertStrictEquals(returned, subject);
});

Deno.test("inspectResidue() sees the residue once handled and returns the issue", () => {
	// Given: an issue, and a log
	const subject = notFound();
	const seen: number[] = [];

	// When: it is inspected before and after handling
	inspectResidue(subject, (port) => seen.push(port));
	handle(subject, 8080);
	const returned = inspectResidue(subject, (port) => seen.push(port));

	// Then: it saw the residue once, and returned the issue itself
	assertEquals(seen, [8080]);
	assertStrictEquals(returned, subject);
});
