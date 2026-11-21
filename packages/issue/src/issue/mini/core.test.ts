import { isolate, union } from "@sekhmet/enum/core/mini";
import { Ok } from "@sekhmet/enum/result/mini";
import { getStructParams, Struct } from "@sekhmet/primordials/struct";
import { resolved } from "@sekhmet/vow/mini";
import {
	assert,
	assertEquals,
	assertFalse,
	assertInstanceOf,
} from "@std/assert";
import { Recovery } from "@/src/recovery/mini/core.ts";
import { state } from "./accessors.ts";
import { Issue, IssueState, issue } from "./core.ts";
import { attempt } from "./handling.ts";

interface Config {
	readonly port: number;
}
interface Path {
	readonly path: string;
}

function notFound(path: string): Issue<Path, Config> {
	return issue<Path, Config>({
		value: { path },
		code: "config/NotFound",
		message: `No config file at \`${path}\`.`,
		hint: "Create one, or run with the default config.",
	});
}

Deno.test("a new issue is unhandled and holds its value", () => {
	// Given: a NotFound issue
	const notFoundIssue = notFound("app.json");

	// When: it is read
	const { code, hint, docs } = getStructParams(notFoundIssue);
	const current = state(notFoundIssue);

	// Then: it is unhandled, holding the path, with only the wording given
	assert(isolate(current, "Unhandled"));
	assertEquals(union(current), { path: "app.json" });
	assertEquals(code, "config/NotFound");
	assertEquals(hint, "Create one, or run with the default config.");
	assertEquals(docs, undefined);
});

Deno.test("issue() builds a Struct whose state is an IssueState", () => {
	// Given: an issue with every field of wording
	const subject = issue<string, number>({
		value: "app.json",
		code: "config/NotFound",
		message: "No config file.",
		hint: "Create one.",
		docs: "https://example.com/config",
	});

	// When: its params are read
	const params = getStructParams(subject);

	// Then: it is an Issue and a Struct, holding the wording and an IssueState
	assertInstanceOf(subject, Issue);
	assertInstanceOf(subject, Struct);
	assertInstanceOf(params.state, IssueState);
	assertEquals(params.message, "No config file.");
	assertEquals(params.docs, "https://example.com/config");
});

Deno.test("issue() leaves out the optional wording it wasn't given", () => {
	// Given: an issue with no hint or docs
	const subject = issue<string, number>({
		value: "app.json",
		code: "config/NotFound",
		message: "No config file.",
	});

	// When: its params are read
	const params = getStructParams(subject);

	// Then: the keys are absent, not set to undefined
	assertFalse("hint" in params);
	assertFalse("docs" in params);
});

Deno.test("an issue can't be widened, so nothing writes the wrong residue", () => {
	// Given: a NotFound issue, and a recovery producing a number
	const notFoundIssue = notFound("app.json");
	const toNumber = new Recovery((_: Path) => resolved(Ok<number, never>(7)));

	// When: widening it, or recovering it with a number, is written (never run)
	const misuses = (): void => {
		// @ts-expect-error: Issue is invariant in its residue type
		const _widened: Issue<Path, unknown> = notFoundIssue;
		// @ts-expect-error: NotFound's residue is a Config, not a number
		attempt(notFoundIssue, toNumber);
	};

	// Then: it doesn't type-check, and the issue is untouched
	assert(typeof misuses === "function");
	assert(isolate(state(notFoundIssue), "Unhandled"));
});

Deno.test("an issue can't be narrowed either: it is invariant in its value", () => {
	// Given: an issue whose value is a string or a number
	const wide = issue<string | number, Config>({
		value: 1,
		code: "config/Bad",
		message: "Bad value.",
	});

	// When: narrowing its value type is written (never run)
	const misuse = (): void => {
		// @ts-expect-error: Issue is invariant in its value type
		const _narrowed: Issue<string, Config> = wide;
		// @ts-expect-error: and widening the value is rejected too
		const _widened: Issue<unknown, Config> = wide;
	};

	// Then: it doesn't type-check
	assert(typeof misuse === "function");
});
