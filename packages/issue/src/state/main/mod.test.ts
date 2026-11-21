/** The main IssueState, and the main Issue's `state()`. */

import { union, unionKinds } from "@sekhmet/enum/core/mini";
import {
	assert,
	assertEquals,
	assertInstanceOf,
	assertStrictEquals,
} from "@std/assert";
import { issue } from "@/src/issue/main/mod.ts";
import * as mini from "../mini/mod.ts";
import { IssueState } from "./mod.ts";

Deno.test("main IssueState is a mini one, and fromMini views a mini one", () => {
	// Given: a mini state, its main view, and a main state
	const miniState = new mini.IssueState<string, number>("Handled", 8080);
	const view = IssueState.fromMini(miniState);
	const main = new IssueState<string, number>("Unhandled", "app.json");

	// When: each is checked against both classes
	// Then: both are main and mini, and a main state views as itself
	assertInstanceOf(view, IssueState);
	assertInstanceOf(main, mini.IssueState);
	assertEquals(unionKinds(view), "Handled");
	assertStrictEquals(IssueState.fromMini(main), main);
});

Deno.test("main Issue's state() returns a main IssueState", () => {
	// Given: a main issue
	const notFound = issue<string, number>({
		value: "app.json",
		code: "config/NotFound",
		message: "No config file.",
	});

	// When: its state is read before and after handling
	const before = notFound.state();
	notFound.handle(8080);
	const after = notFound.state();

	// Then: both are main states, and the earlier one is unchanged
	assertInstanceOf(before, IssueState);
	assertInstanceOf(after, IssueState);
	assertEquals(unionKinds(before), "Unhandled");
	assertEquals(unionKinds(after), "Handled");
});

Deno.test("main state methods narrow the snapshot from state()", () => {
	// Given: a main issue and its state, read before handling
	const notFound = issue<string, number>({
		value: "app.json",
		code: "config/NotFound",
		message: "No config file.",
	});
	const before = notFound.state();

	// When: the issue is handled, and both states are asked
	notFound.handle(8080);
	const after = notFound.state();

	// Then: each method narrows its own snapshot, so the value reads directly
	if (before.isUnhandled()) {
		const path: string = union(before);
		assertEquals(path, "app.json");
	} else {
		assert(false, "the earlier snapshot stays Unhandled");
	}
	if (after.isHandled()) {
		const port: number = union(after);
		assertEquals(port, 8080);
	} else {
		assert(false, "the later snapshot is Handled");
	}
	if (before.isUnhandledAnd((path) => path === "app.json")) {
		const path: string = union(before);
		assertEquals(path, "app.json");
	} else {
		assert(false, "the earlier snapshot holds app.json");
	}
	if (after.isHandledAnd((port) => port > 1024)) {
		const port: number = union(after);
		assertEquals(port, 8080);
	} else {
		assert(false, "the later snapshot holds a high port");
	}
});
