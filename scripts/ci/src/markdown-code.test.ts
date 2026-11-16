import { assertEquals } from "@std/assert";
import {
	isRunnableInfo,
	parseChangedLines,
	runnableFenceLines,
	touchesRunnableCode,
} from "./markdown-code.ts";

const FENCE = "```";

function md(...lines: string[]): string {
	return `${lines.join("\n")}\n`;
}

const DOC = md(
	"# Title", // 1
	"", // 2
	"Some prose.", // 3
	"", // 4
	`${FENCE}ts`, // 5
	"const a = 1;", // 6
	FENCE, // 7
	"", // 8
	`${FENCE}ts ignore`, // 9
	"const b = 2;", // 10
	FENCE, // 11
);

Deno.test("isRunnableInfo matches what deno test --doc runs", () => {
	// Given: info strings Deno 2.9.8 runs, and ones it skips
	const runs = ["ts", "tsx", "typescript", "mts", "cts", "js", "jsx"];
	const alsoRuns = ["javascript", "mjs", "cjs", "ts no-eval", "ts title=x"];
	const skips = ["", "TS", " ts", "ts,foo", "ts{1}", "json", "bash"];
	const ignored = ["ts ignore", "js  ignore", "typescript ignore"];

	// When: classifying each
	const classify = (infos: string[]) => infos.map(isRunnableInfo);

	// Then: only an exact runnable language without `ignore` runs
	assertEquals(classify([...runs, ...alsoRuns]).includes(false), false);
	assertEquals(classify([...skips, ...ignored]).includes(true), false);
});

Deno.test("runnableFenceLines covers runnable fences with their fence lines, and skips ignored ones", () => {
	// Given: a document with a ts block and an ignored ts block
	// When: finding its runnable lines
	const lines = runnableFenceLines(DOC);

	// Then: only the ts block, fences included
	assertEquals([...lines], [5, 6, 7]);
});

Deno.test("runnableFenceLines follows Deno on nesting: tildes are not fences, longer backtick fences are", () => {
	// Given: a ts block inside a ~~~ fence, and one inside a ````md fence
	const inTilde = md("~~~md", `${FENCE}ts`, "x;", FENCE, "~~~");
	const inLonger = md("````md", `${FENCE}ts`, "x;", FENCE, "````");

	// When: finding their runnable lines
	const tilde = runnableFenceLines(inTilde);
	const longer = runnableFenceLines(inLonger);

	// Then: Deno runs the first and not the second
	assertEquals([...tilde], [2, 3, 4]);
	assertEquals([...longer], []);
});

Deno.test("runnableFenceLines runs an unclosed runnable fence to the end of the file", () => {
	// Given: a ts fence that never closes
	const unclosed = md("# x", `${FENCE}ts`, "x;", "more");

	// When: finding its runnable lines
	const lines = runnableFenceLines(unclosed);

	// Then: everything from the fence on counts, so closing it later is code
	assertEquals([...lines], [2, 3, 4, 5]);
});

Deno.test("parseChangedLines reads zero-context hunk headers", () => {
	// Given: a git diff -U0 with a change, a pure addition and a deletion
	const diff = [
		"diff --git a/README.md b/README.md",
		"--- a/README.md",
		"+++ b/README.md",
		"@@ -3 +3 @@ Title",
		"-Some prose.",
		"+Other prose.",
		"@@ -8,0 +9,2 @@",
		"+x",
		"+y",
		"@@ -20,3 +21,0 @@",
	].join("\n");

	// When: parsing it
	const changed = parseChangedLines(diff);

	// Then: removed lines use old numbers, added lines new ones
	assertEquals(changed, { removed: [3, 20, 21, 22], added: [3, 9, 10] });
});

Deno.test("touchesRunnableCode exempts a prose-only edit", () => {
	// Given: line 3 (prose) changed
	const after = DOC.replace("Some prose.", "Better prose.");

	// When: checking the change
	const touches = touchesRunnableCode({
		before: DOC,
		after,
		changed: { removed: [3], added: [3] },
	});

	// Then: it touches no runnable code
	assertEquals(touches, false);
});

Deno.test("touchesRunnableCode refuses an edit inside a ts fence", () => {
	// Given: line 6 (inside the ts block) changed
	const after = DOC.replace("const a = 1;", "const a = 2;");

	// When: checking the change
	const touches = touchesRunnableCode({
		before: DOC,
		after,
		changed: { removed: [6], added: [6] },
	});

	// Then: it touches runnable code
	assertEquals(touches, true);
});

Deno.test("touchesRunnableCode exempts an edit inside an ignore fence", () => {
	// Given: line 10 (inside the ignored block) changed
	const after = DOC.replace("const b = 2;", "const b = 3;");

	// When: checking the change
	const touches = touchesRunnableCode({
		before: DOC,
		after,
		changed: { removed: [10], added: [10] },
	});

	// Then: Deno never runs it, so it is exempt
	assertEquals(touches, false);
});

Deno.test("touchesRunnableCode refuses adding a ts block, and making an ignored block runnable", () => {
	// Given: a new ts block appended (lines 12-15), and the `ignore` dropped
	const added = `${DOC}\n${FENCE}ts\nconst c = 3;\n${FENCE}\n`;
	const unignored = DOC.replace(`${FENCE}ts ignore`, `${FENCE}ts`);

	// When: checking each change
	const onAdded = touchesRunnableCode({
		before: DOC,
		after: added,
		changed: { removed: [], added: [12, 13, 14, 15] },
	});
	const onUnignored = touchesRunnableCode({
		before: DOC,
		after: unignored,
		changed: { removed: [9], added: [9] },
	});

	// Then: both touch runnable code
	assertEquals(onAdded, true);
	assertEquals(onUnignored, true);
});

Deno.test("touchesRunnableCode refuses a new file with a ts block, and a deleted ts block", () => {
	// Given: a new file holding DOC, and DOC's ts block deleted (lines 5-8)
	const deleted = DOC.replace(`${FENCE}ts\nconst a = 1;\n${FENCE}\n\n`, "");

	// When: checking each change
	const onNewFile = touchesRunnableCode({
		before: "",
		after: DOC,
		changed: { removed: [], added: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
	});
	const onDeleted = touchesRunnableCode({
		before: DOC,
		after: deleted,
		changed: { removed: [5, 6, 7, 8], added: [] },
	});

	// Then: both touch runnable code
	assertEquals(onNewFile, true);
	assertEquals(onDeleted, true);
});
