import { assertEquals } from "@std/assert";
import { type Issue, issue } from "./core.ts";
import { handle } from "./handling.ts";
import {
	isHandled,
	isHandledAnd,
	isUnhandled,
	isUnhandledAnd,
} from "./predicates.ts";

function notFound(): Issue<string, number> {
	return issue<string, number>({
		value: "app.json",
		code: "config/NotFound",
		message: "No config file.",
	});
}

Deno.test("isUnhandled and isHandled are complements that track the switch", () => {
	// Given: an unhandled issue
	const subject = notFound();

	// When: it is asked before and after handling
	const before = [isUnhandled(subject), isHandled(subject)];
	handle(subject, 8080);
	const after = [isUnhandled(subject), isHandled(subject)];

	// Then: exactly one holds each time, and they swapped
	assertEquals(before, [true, false]);
	assertEquals(after, [false, true]);
});

Deno.test("isUnhandledAnd tests the value while unhandled", () => {
	// Given: an unhandled issue, then the same issue handled
	const subject = notFound();
	const json = (path: string): boolean => path.endsWith(".json");
	const yaml = (path: string): boolean => path.endsWith(".yaml");

	// When: predicates are asked before and after handling
	const before = [isUnhandledAnd(subject, json), isUnhandledAnd(subject, yaml)];
	handle(subject, 8080);
	const after = isUnhandledAnd(subject, json);

	// Then: it holds only while unhandled and the value passes
	assertEquals(before, [true, false]);
	assertEquals(after, false);
});

Deno.test("isHandledAnd tests the residue once handled", () => {
	// Given: an unhandled issue
	const subject = notFound();
	const highPort = (port: number): boolean => port > 1024;

	// When: it is asked before and after handling
	const before = isHandledAnd(subject, highPort);
	handle(subject, 8080);
	const after = [
		isHandledAnd(subject, highPort),
		isHandledAnd(subject, (port) => port < 1024),
	];

	// Then: it holds only once handled and the residue passes
	assertEquals(before, false);
	assertEquals(after, [true, false]);
});
