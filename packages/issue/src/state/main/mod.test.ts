/** The main IssueState, and the main Issue's `state()`. */

import { unionKinds } from "@sekhmet/enum/core/mini";
import {
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
