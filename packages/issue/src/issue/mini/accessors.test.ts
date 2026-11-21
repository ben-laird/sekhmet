import { isolate, union, unionKinds } from "@sekhmet/enum/core/mini";
import { None, Some } from "@sekhmet/enum/option/mini";
import { assert, assertEquals } from "@std/assert";
import {
	code,
	docs,
	hint,
	message,
	residue,
	state,
	value,
} from "./accessors.ts";
import { type Issue, issue } from "./core.ts";
import { handle } from "./handling.ts";

function notFound(): Issue<string, number> {
	return issue<string, number>({
		value: "app.json",
		code: "config/NotFound",
		message: "No config file.",
		hint: "Create one.",
		docs: "https://example.com/config",
	});
}

Deno.test("the wording accessors read what the issue was given", () => {
	// Given: an issue with all its wording
	const subject = notFound();

	// When: each accessor reads it
	// Then: each returns its field
	assertEquals(code(subject), "config/NotFound");
	assertEquals(message(subject), "No config file.");
	assertEquals(hint(subject), "Create one.");
	assertEquals(docs(subject), "https://example.com/config");
});

Deno.test("hint() and docs() are undefined when not given", () => {
	// Given: an issue with no hint or docs
	const subject = issue<string, number>({
		value: "app.json",
		code: "config/NotFound",
		message: "No config file.",
	});

	// When: they are read
	// Then: both are undefined
	assertEquals(hint(subject), undefined);
	assertEquals(docs(subject), undefined);
});

Deno.test("state() is a snapshot: handling later leaves it as it was", () => {
	// Given: an unhandled issue and its state
	const subject = notFound();
	const before = state(subject);

	// When: the issue is handled
	handle(subject, 8080);
	const after = state(subject);

	// Then: the old snapshot is still Unhandled, and the new one Handled
	assert(isolate(before, "Unhandled"));
	assertEquals(union(before), "app.json");
	assertEquals(unionKinds(after), "Handled");
	assertEquals(union(after), 8080);
});

Deno.test("value() is Some while unhandled, then None", () => {
	// Given: an unhandled issue
	const subject = notFound();

	// When: its value is read before and after handling
	const before = value(subject);
	handle(subject, 8080);
	const after = value(subject);

	// Then: handling dropped the value
	assertEquals(before, Some("app.json"));
	assertEquals(after, None());
});

Deno.test("residue() is None while unhandled, then Some", () => {
	// Given: an unhandled issue
	const subject = notFound();

	// When: its residue is read before and after handling
	const before = residue(subject);
	handle(subject, 8080);
	const after = residue(subject);

	// Then: handling gave it the residue
	assertEquals(before, None());
	assertEquals(after, Some(8080));
});
