/** The main Issue, in method form. */

import { Option } from "@sekhmet/enum/option";
import { Result } from "@sekhmet/enum/result";
import { Err, type Result as MiniResult } from "@sekhmet/enum/result/mini";
import { wait } from "@sekhmet/vow/mini";
import {
	assertEquals,
	assertInstanceOf,
	assertStrictEquals,
} from "@std/assert";
import { Attempt } from "../../attempt/main/mod.ts";
import { fail, succeed } from "../../recovery/mini/mod.ts";
import * as mini from "../mini/mod.ts";
import { Issue, issue, recoverWith } from "./mod.ts";

function notFound(): Issue<string, number> {
	return issue<string, number>({
		value: "app.json",
		code: "config/NotFound",
		message: "No config file.",
	});
}

Deno.test("main Issue is a mini one, and fromMini shares the mini one's state", () => {
	// Given: a mini issue, and its main view
	const original = mini.issue<string, number>({
		value: "app.json",
		code: "config/NotFound",
		message: "No config file.",
	});
	const view = Issue.fromMini(original);

	// When: the view is handled
	view.handle(8080);

	// Then: the mini issue switched too, since both share one state
	assertInstanceOf(view, mini.Issue);
	assertEquals(mini.isHandled(original), true);
	assertStrictEquals(Issue.fromMini(view), view);
});

Deno.test("attempt resolves with a main Attempt and switches the issue", async () => {
	// Given: an unhandled issue
	const subject = notFound();

	// When: a composed recovery is attempted with the method
	const ended = await wait(subject.attempt(succeed(8080)));

	// Then: the attempt is main, and the issue is handled
	assertInstanceOf(ended, Attempt);
	assertEquals(ended.isHandled(), true);
	assertEquals(subject.unwrapResidue(), 8080);
});

Deno.test("readers return main Option and Result, and wrap returns a main Issue", () => {
	// Given: an unhandled issue
	const subject = notFound();

	// When: reading and wrapping it with methods
	const value = subject.value();
	const result = subject.toResult();
	const wrapped = subject.wrap({ code: "config/LoadFailed", message: "No." });

	// Then: each is the main class, so chaining continues
	assertInstanceOf(value, Option);
	assertInstanceOf(result, Result);
	assertInstanceOf(wrapped, Issue);
	assertEquals(value.unwrap(), "app.json");
	assertStrictEquals(result.unwrapErr(), subject);
	assertEquals(
		wrapped.render(),
		"config/LoadFailed: No.\ncaused by config/NotFound: No config file.",
	);
	assertEquals(subject.residueOr(80), 80);
});

Deno.test("recoverWith resolves with a main Result", async () => {
	// Given: an Err holding an issue, and a recovery that fails
	const subject = notFound();
	const loaded: MiniResult<number, Issue<string, number>> = Err(subject);

	// When: it is recovered
	const result = await wait(recoverWith(loaded, fail<string, string>("no")));

	// Then: a main Result whose Err is the same issue, viewed as main
	assertInstanceOf(result, Result);
	assertStrictEquals(result.unwrapErr(), subject);
});
