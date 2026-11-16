import { assertEquals } from "@std/assert";
import {
	type GreenRunDecision,
	greenRunDecision,
	parseStatus,
	parseTreeId,
	type Result,
	type StagedSnapshot,
	type TreeId,
} from "./green-run.ts";
import type { StepResult } from "./types.ts";

function treeId(text: string): TreeId {
	const id = parseTreeId(text);
	if (id === undefined) throw new Error(`not a tree id: ${text}`);
	return id;
}

const TREE = treeId("4b825dc642cb6eb9a060e54bf8d69288fbe4904b");
const OTHER_TREE = treeId("0".repeat(40));

const PASSED: StepResult[] = [
	{ name: "Deno Lint", status: "passed" },
	{ name: "Coverage Summary", status: "skipped" },
];

function clean(tree: TreeId = TREE): Result<StagedSnapshot> {
	return { ok: true, value: { tree, unstaged: [], untracked: [] } };
}

Deno.test("parseTreeId accepts SHA-1 and SHA-256 ids and rejects anything else", () => {
	// Given: command output with a trailing newline, and malformed texts
	const sha1 = "4b825dc642cb6eb9a060e54bf8d69288fbe4904b\n";
	const sha256 = `${"a".repeat(64)}\n`;

	// When: parsing each
	// Then: real ids parse (trimmed); others do not
	assertEquals(parseTreeId(sha1), "4b825dc642cb6eb9a060e54bf8d69288fbe4904b");
	assertEquals(parseTreeId(sha256), "a".repeat(64));
	assertEquals(parseTreeId(""), undefined);
	assertEquals(parseTreeId("not a tree"), undefined);
	assertEquals(parseTreeId("A".repeat(40)), undefined);
	assertEquals(parseTreeId("a".repeat(41)), undefined);
});

Deno.test("parseStatus splits unstaged and untracked paths, and skips rename sources", () => {
	// Given: porcelain v1 -z output with every kind of entry
	const porcelain = [
		"M  staged-only.ts",
		" M edited.ts",
		"MM staged-then-edited.ts",
		" D deleted.ts",
		"R  renamed-to.ts",
		"renamed-from.ts",
		"A  added.ts",
		"?? new file.ts",
		"",
	].join("\0");

	// When: parsing it
	const drift = parseStatus(porcelain);

	// Then: only working-tree changes are unstaged; renames' sources are not
	// mistaken for entries
	assertEquals(drift, {
		unstaged: ["edited.ts", "staged-then-edited.ts", "deleted.ts"],
		untracked: ["new file.ts"],
	});
});

Deno.test("parseStatus of a clean tree finds no drift", () => {
	// Given: empty status output
	// When: parsing it
	const drift = parseStatus("");

	// Then: nothing is unstaged or untracked
	assertEquals(drift, { unstaged: [], untracked: [] });
});

Deno.test("greenRunDecision records the staged tree when every step passed and the tree matched the index throughout", () => {
	// Given: a passing run (skipped steps are fine) on a clean tree
	// When: deciding
	const decision = greenRunDecision({
		steps: PASSED,
		before: clean(),
		after: clean(),
	});

	// Then: the staged tree is recorded
	assertEquals(decision, { kind: "record", tree: TREE });
});

Deno.test("greenRunDecision never records a failed or partial run", () => {
	// Given: a run with a failed step, and one with a blocked step
	const failed: StepResult[] = [
		...PASSED,
		{ name: "Deno Test", status: "failed" },
	];
	const blocked: StepResult[] = [
		...PASSED,
		{ name: "Show coverage report", status: "blocked", blockedBy: ["X"] },
	];

	// When: deciding on each
	const onFailed = greenRunDecision({
		steps: failed,
		before: clean(),
		after: clean(),
	});
	const onBlocked = greenRunDecision({
		steps: blocked,
		before: clean(),
		after: clean(),
	});

	// Then: neither is recorded, and the reason names the step
	assertEquals(onFailed, {
		kind: "skip",
		reason: '"Deno Test" did not pass',
	});
	assertEquals(onBlocked, {
		kind: "skip",
		reason: '"Show coverage report" did not pass',
	});
});

Deno.test("greenRunDecision skips when the working tree held more than the index", async (t) => {
	await t.step("unstaged changes to tracked files", () => {
		// Given: the gate started with tracked files edited but not staged
		const before: Result<StagedSnapshot> = {
			ok: true,
			value: {
				tree: TREE,
				unstaged: ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts"],
				untracked: [],
			},
		};

		// When: deciding
		const decision = greenRunDecision({ steps: PASSED, before, after: before });

		// Then: it is not recorded, and the reason lists a few paths
		assertEquals(decision, {
			kind: "skip",
			reason:
				"the gate checked the working tree, which had unstaged changes to a.ts, b.ts, c.ts and 2 more",
		});
	});

	await t.step("untracked files", () => {
		// Given: the gate started with an untracked, unignored file
		const before: Result<StagedSnapshot> = {
			ok: true,
			value: { tree: TREE, unstaged: [], untracked: ["scratch.ts"] },
		};

		// When: deciding
		const decision = greenRunDecision({ steps: PASSED, before, after: before });

		// Then: it is not recorded
		assertEquals(decision, {
			kind: "skip",
			reason:
				"the gate checked the working tree, which had untracked scratch.ts",
		});
	});
});

Deno.test("greenRunDecision skips when the index or working tree changed during the run", () => {
	// Given: a run during which another tree was staged, and one during which
	// a file was edited
	const restaged = greenRunDecision({
		steps: PASSED,
		before: clean(),
		after: clean(OTHER_TREE),
	});
	const edited = greenRunDecision({
		steps: PASSED,
		before: clean(),
		after: {
			ok: true,
			value: { tree: TREE, unstaged: ["a.ts"], untracked: [] },
		},
	});

	// When: the decisions are made
	// Then: neither is recorded
	const changed: GreenRunDecision = {
		kind: "skip",
		reason: "the index or working tree changed during the run",
	};
	assertEquals(restaged, changed);
	assertEquals(edited, changed);
});

Deno.test("greenRunDecision skips when a snapshot could not be taken", () => {
	// Given: a run outside a repository, and one whose index became unmerged
	const failure: Result<StagedSnapshot> = { ok: false, error: "not a repo" };

	// When: deciding on each
	const noBefore = greenRunDecision({
		steps: PASSED,
		before: failure,
		after: clean(),
	});
	const noAfter = greenRunDecision({
		steps: PASSED,
		before: clean(),
		after: failure,
	});

	// Then: neither is recorded, and the reason carries the error
	assertEquals(noBefore, {
		kind: "skip",
		reason: "no staged tree: not a repo",
	});
	assertEquals(noAfter, { kind: "skip", reason: "no staged tree: not a repo" });
});
