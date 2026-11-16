import { assertEquals } from "@std/assert";
import { type AllowlistEntry, triage } from "./allowlist.ts";
import type { CheckId, Finding } from "./finding.ts";

const README: Finding = {
	check: "package-files",
	file: "packages/a/README.md",
	message: "published package @sekhmet/a has no README.md",
};
const DOC: Finding = {
	check: "doc-lint",
	file: "packages/a/mod.ts",
	line: 4,
	message: "private-type-ref: public type 'A' references private type 'B'",
};
const STATIC = new Set<CheckId>(["package-files"]);
const PATH = "allowlisted.ts";

Deno.test("triage allowlists a finding its entry matches and fails the rest", () => {
	// Given: a README finding with a file-wide entry, and an unlisted finding
	const allowlist: AllowlistEntry[] = [
		{ check: "package-files", file: README.file, until: "#8" },
	];
	const other = { ...README, file: "packages/b/README.md" };

	// When: triaging both
	const result = triage({
		findings: [README, other],
		allowlist,
		checks: STATIC,
		allowlistPath: PATH,
	});

	// Then: the listed one is a warning until #8, the other an error
	assertEquals(result.allowlisted, [{ finding: README, until: "#8" }]);
	assertEquals(result.errors, [other]);
});

Deno.test("triage matches an entry with a message only on that exact message", () => {
	// Given: an entry for one doc-lint message at a file
	const allowlist: AllowlistEntry[] = [
		{ check: "doc-lint", file: DOC.file, message: DOC.message, until: "#5" },
	];
	const newError = { ...DOC, message: "private-type-ref: something new" };

	// When: a new message appears at the same file
	const result = triage({
		findings: [DOC, newError],
		allowlist,
		checks: new Set(["doc-lint"]),
		allowlistPath: PATH,
	});

	// Then: only the listed message is held back; the new one fails
	assertEquals(result.allowlisted.length, 1);
	assertEquals(result.errors, [newError]);
});

Deno.test("triage fails on a stale entry for a check it ran, and ignores other checks' entries", () => {
	// Given: entries for a fixed README and for doc-lint, in a static run
	const allowlist: AllowlistEntry[] = [
		{ check: "package-files", file: README.file, until: "#8" },
		{ check: "doc-lint", file: DOC.file, until: "#5" },
	];

	// When: triaging a run that found nothing
	const result = triage({
		findings: [],
		allowlist,
		checks: STATIC,
		allowlistPath: PATH,
	});

	// Then: the README entry is reported stale; the doc-lint one is not judged
	assertEquals(result.errors, [
		{
			check: "allowlist",
			file: PATH,
			message:
				"stale entry: no package-files finding at packages/a/README.md; remove it (it was waiting on #8)",
		},
	]);
});
