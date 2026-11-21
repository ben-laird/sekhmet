import { match, union } from "@sekhmet/enum/core/mini";
import { assert, assertEquals, assertFalse } from "@std/assert";
import { IssueState } from "./core.ts";
import {
	isHandled,
	isHandledAnd,
	isUnhandled,
	isUnhandledAnd,
} from "./predicates.ts";

const unhandled = new IssueState<string, number>("Unhandled", "app.json");
const handled = new IssueState<string, number>("Handled", 8080);

Deno.test("isUnhandled and isHandled hold for their own variant only", () => {
	// Given: one state of each variant
	// When: each predicate is asked of each
	// Then: it holds for its own variant only
	assertEquals([unhandled, handled].map(isUnhandled), [true, false]);
	assertEquals([unhandled, handled].map(isHandled), [false, true]);
});

Deno.test("the …And forms also test the value held", () => {
	// Given: a predicate on the value and one on the residue
	const isJson = (path: string): boolean => path.endsWith(".json");
	const highPort = (port: number): boolean => port > 1024;

	// When: each …And form is asked of each state
	// Then: it holds only for its variant with a value that passes
	assert(isUnhandledAnd(unhandled, isJson));
	assertFalse(
		isUnhandledAnd(
			new IssueState<string, number>("Unhandled", "app.toml"),
			isJson,
		),
	);
	assertFalse(isUnhandledAnd(handled, isJson));
	assert(isHandledAnd(handled, highPort));
	assertFalse(
		isHandledAnd(new IssueState<string, number>("Handled", 80), highPort),
	);
	assertFalse(isHandledAnd(unhandled, highPort));
});

Deno.test("the …And forms narrow a state to their variant", () => {
	// Given: states typed as either variant
	const unhandledState: IssueState<string, number> = unhandled;
	const handledState: IssueState<string, number> = handled;

	// When: each is narrowed with its …And form
	// Then: the value reads directly, typed as the variant's, and the type
	// parameters stay as they were
	if (isUnhandledAnd(unhandledState, (path) => path.endsWith(".json"))) {
		const path: string = union(unhandledState);
		const same: IssueState<string, number> = unhandledState;
		assertEquals(path, "app.json");
		assertEquals(same, unhandledState);
	} else {
		assert(false, "an Unhandled state with a .json path narrows");
	}
	if (isHandledAnd(handledState, (port) => port > 1024)) {
		const port: number = union(handledState);
		const line = match(handledState)({ Handled: (held) => `port ${held}` });
		assertEquals(port, 8080);
		assertEquals(line, "port 8080");
	} else {
		assert(false, "a Handled state with a high port narrows");
	}
});

Deno.test("isUnhandled narrows a state to its Unhandled variant", () => {
	// Given: a state typed as either variant
	const current: IssueState<string, number> = unhandled;

	// When: it is narrowed with isUnhandled
	// Then: its value reads directly, and match needs only the Unhandled arm
	if (isUnhandled(current)) {
		const path: string = union(current);
		const same: IssueState<string, number> = current;
		const line = match(current)({ Unhandled: (held) => `missing ${held}` });
		assertEquals(path, "app.json");
		assertEquals(same, current);
		assertEquals(line, "missing app.json");
	} else {
		assert(false, "an Unhandled state narrows");
	}
});

Deno.test("isHandled narrows a state to its Handled variant", () => {
	// Given: a state typed as either variant
	const current: IssueState<string, number> = handled;

	// When: it is narrowed with isHandled
	// Then: its residue reads directly, and match needs only the Handled arm
	if (isHandled(current)) {
		const port: number = union(current);
		const line = match(current)({ Handled: (held) => `port ${held}` });
		assertEquals(port, 8080);
		assertEquals(line, "port 8080");
	} else {
		assert(false, "a Handled state narrows");
	}
});

Deno.test("the …And forms keep a narrowed state in their false branch", () => {
	// Given: states already narrowed to their variant
	const unhandledState: IssueState<string, number> = unhandled;
	const handledState: IssueState<string, number> = handled;
	assert(isUnhandled(unhandledState));
	assert(isHandled(handledState));

	// When: an …And form's predicate fails on each
	// Then: the false branch still holds the narrowed state, not never
	if (!isUnhandledAnd(unhandledState, (path) => path.endsWith(".toml"))) {
		const path: string = union(unhandledState);
		// @ts-expect-error: the narrowed state isn't collapsed to never
		const _gone: never = unhandledState;
		assertEquals(path, "app.json");
	} else {
		assert(false, "app.json isn't a .toml path");
	}
	if (!isHandledAnd(handledState, (port) => port < 1024)) {
		const port: number = union(handledState);
		// @ts-expect-error: the narrowed state isn't collapsed to never
		const _gone: never = handledState;
		assertEquals(port, 8080);
	} else {
		assert(false, "8080 isn't a low port");
	}
});
