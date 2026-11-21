import { getStructParams } from "@sekhmet/primordials/struct";
import { assertEquals } from "@std/assert";
import { IssueState } from "@/src/state/mini/core.ts";
import { type Issue, issue } from "./core.ts";
import { handle } from "./handling.ts";
import { render } from "./render.ts";
import { wrap } from "./transform.ts";

function notFound(): Issue<string, number> {
	return issue<string, number>({
		value: "app.json",
		code: "config/NotFound",
		message: "No config file at `app.json`.",
		hint: "Create one.",
		docs: "https://example.com/config",
	});
}

Deno.test("render() prints the code, message, hint and docs", () => {
	// Given: an issue with all its wording
	const subject = notFound();

	// When: it is rendered
	const text = render(subject);

	// Then: a heading, then the hint and docs indented
	assertEquals(
		text,
		[
			"config/NotFound: No config file at `app.json`.",
			"  hint: Create one.",
			"  docs: https://example.com/config",
		].join("\n"),
	);
});

Deno.test("render() leaves out a missing hint or docs, and marks a handled issue", () => {
	// Given: a bare issue, handled
	const subject = issue<string, number>({
		value: "x",
		code: "a/B",
		message: "Bad.",
	});
	handle(subject, 1);

	// When: it is rendered
	const text = render(subject);

	// Then: one heading line, marked handled
	assertEquals(text, "a/B (handled): Bad.");
});

Deno.test("render() follows a wrapped chain, each cause once", () => {
	// Given: a cause wrapped twice
	const cause = notFound();
	const middle = wrap(cause, {
		code: "config/LoadFailed",
		message: "Couldn't load.",
	});
	const top = wrap(middle, {
		code: "app/StartFailed",
		message: "Couldn't start.",
		hint: "See below.",
	});

	// When: the top is rendered
	const text = render(top);

	// Then: every issue in the chain, outermost first
	assertEquals(
		text,
		[
			"app/StartFailed: Couldn't start.",
			"  hint: See below.",
			"caused by config/LoadFailed: Couldn't load.",
			"caused by config/NotFound: No config file at `app.json`.",
			"  hint: Create one.",
			"  docs: https://example.com/config",
		].join("\n"),
	);
});

Deno.test("render() stops at a handled issue, whose value is gone", () => {
	// Given: a chain whose middle issue is handled
	const cause = notFound();
	const middle = wrap(cause, {
		code: "config/LoadFailed",
		message: "Couldn't load.",
	});
	const top = wrap(middle, {
		code: "app/StartFailed",
		message: "Couldn't start.",
	});
	handle(middle, 8080);

	// When: the top is rendered
	const text = render(top);

	// Then: the middle is marked handled, and its cause isn't reachable
	assertEquals(
		text,
		[
			"app/StartFailed: Couldn't start.",
			"caused by config/LoadFailed (handled): Couldn't load.",
		].join("\n"),
	);
});

Deno.test("render() ignores a cause that isn't an issue", () => {
	// Given: an issue whose value has a non-issue cause
	const subject = issue<{ readonly cause: string }, number>({
		value: { cause: "disk full" },
		code: "io/WriteFailed",
		message: "Couldn't write.",
	});

	// When: it is rendered
	const text = render(subject);

	// Then: only the issue itself
	assertEquals(text, "io/WriteFailed: Couldn't write.");
});

Deno.test("render() prints each issue once, even in a cycle", () => {
	// Given: two issues whose values name each other as cause
	interface Cyclic {
		cause: Issue<Cyclic, number> | undefined;
	}
	const first = issue<Cyclic, number>({
		value: { cause: undefined },
		code: "a/First",
		message: "First.",
	});
	const second = issue<Cyclic, number>({
		value: { cause: first },
		code: "a/Second",
		message: "Second.",
	});
	getStructParams(first).state = new IssueState<Cyclic, number>("Unhandled", {
		cause: second,
	});

	// When: one of them is rendered
	const text = render(first);

	// Then: each is printed once, and the chain stops
	assertEquals(
		text,
		["a/First: First.", "caused by a/Second: Second."].join("\n"),
	);
});
