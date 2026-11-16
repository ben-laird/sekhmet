import type { Finding } from "./finding.ts";
import { lineAt, type SourceViews } from "./source.ts";

/** The three comments that structure every test. */
export const MARKERS = ["Given", "When", "Then"] as const;

/** One of {@linkcode MARKERS}. */
export type Marker = (typeof MARKERS)[number];

/**
 * A `Deno.test(…)` or `t.step(…)` call: the span of its argument list and
 * the blocks nested in it.
 */
export interface TestBlock {
	/** Whether this is a test or a step inside one */
	kind: "test" | "step";
	/** The test or step name, when its first argument is a string */
	name?: string;
	/** Index of the call's `(` */
	start: number;
	/** Index of the call's matching `)` */
	end: number;
	/** Steps called directly inside this block */
	children: TestBlock[];
}

const TEST_CALL = /\bDeno\.test(?:\.only|\.ignore)?\s*\(/g;
// A step's first argument is its name or its options object
const STEP_CALL = /\b[A-Za-z_$][\w$]*\.step\s*\(\s*(?=["'`{])/g;
// `// Given:` or a bare `// Given`, not prose such as `// When the queue drains`
const MARKER_COMMENT =
	/\/\/[ \t]*((?:Given|When|Then)(?:[ \t]*(?:\/|&|,|and)[ \t]*(?:Given|When|Then))*)[ \t]*(?::|\n|$)/g;

/**
 * The test and step calls in a test file, as a forest of top-level tests.
 */
export function testBlocks(views: SourceViews): TestBlock[] {
	const calls: TestBlock[] = [];
	for (const [pattern, kind] of [
		[TEST_CALL, "test"],
		[STEP_CALL, "step"],
	] as const) {
		for (const match of views.structure.matchAll(pattern)) {
			const start = views.structure.indexOf("(", match.index);
			const end = matchingParen({ text: views.structure, open: start });
			const name = /^\(\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1/.exec(
				views.code.slice(start),
			)?.[2];
			calls.push({
				kind,
				...(name === undefined ? {} : { name }),
				start,
				end,
				children: [],
			});
		}
	}

	calls.sort((a, b) => a.start - b.start);
	const roots: TestBlock[] = [];
	const open: TestBlock[] = [];
	for (const call of calls) {
		while (open.length > 0 && (open.at(-1)?.end ?? 0) < call.start) open.pop();
		const parent = open.at(-1);
		if (parent) parent.children.push(call);
		else roots.push(call);
		open.push(call);
	}
	return roots;
}

/**
 * The marker comments in a source, by the index of their `//`. A comment
 * may name several (`// When/Then:`).
 */
export function markerComments(
	views: SourceViews,
): { index: number; markers: Marker[] }[] {
	return [...views.comments.matchAll(MARKER_COMMENT)].map((match) => ({
		index: match.index,
		markers: MARKERS.filter((marker) =>
			new RegExp(`\\b${marker}\\b`).test(match[1] ?? ""),
		),
	}));
}

/**
 * Every `Deno.test` and every `t.step` is covered by `// Given`, `// When`
 * and `// Then` comments.
 *
 * The rule for nested steps: a marker covers the block it is written in and
 * every step nested inside it, and a block is also covered by a marker that
 * every one of its steps has. So a test's shared `// Given:` setup covers
 * its steps, a test whose steps each have `// When:` and `// Then:` is
 * covered by them, but a step never borrows a marker from a sibling.
 */
export function checkGivenWhenThen({
	path,
	text,
	views,
}: {
	path: string;
	text: string;
	views: SourceViews;
}): Finding[] {
	const comments = markerComments(views);
	const findings: Finding[] = [];

	const own = (block: TestBlock): Set<Marker> => {
		const markers = new Set<Marker>();
		for (const comment of comments) {
			const inside = comment.index > block.start && comment.index < block.end;
			const inChild = block.children.some(
				(child) => comment.index > child.start && comment.index < child.end,
			);
			if (inside && !inChild) for (const m of comment.markers) markers.add(m);
		}
		return markers;
	};

	const covered = (
		block: TestBlock,
		marker: Marker,
		inherited: ReadonlySet<Marker>,
	): boolean => {
		if (inherited.has(marker)) return true;
		const mine = own(block);
		if (mine.has(marker)) return true;
		const scope = new Set([...inherited, ...mine]);
		return (
			block.children.length > 0 &&
			block.children.every((child) => covered(child, marker, scope))
		);
	};

	// A block with steps is uncovered only if one of its steps is, so findings
	// go on the innermost blocks, where the comments are missing
	const visit = (block: TestBlock, inherited: ReadonlySet<Marker>): void => {
		const missing = MARKERS.filter(
			(marker) => !covered(block, marker, inherited),
		);
		if (missing.length > 0 && block.children.length === 0) {
			const call = block.kind === "test" ? "Deno.test" : "t.step";
			const name = block.name === undefined ? "" : ` "${block.name}"`;
			findings.push({
				check: "given-when-then",
				file: path,
				line: lineAt({ text, index: block.start }),
				message: `${call}${name} is missing ${missing.map((m) => `// ${m}:`).join(", ")} comments`,
			});
		}
		const scope = new Set([...inherited, ...own(block)]);
		for (const child of block.children) visit(child, scope);
	};

	for (const root of testBlocks(views)) visit(root, new Set());
	return findings;
}

/** Index of the `)` matching the `(` at `open`, or the text's end. */
function matchingParen({ text, open }: { text: string; open: number }): number {
	let depth = 0;
	for (let i = open; i < text.length; i++) {
		const c = text.charAt(i);
		if (c === "(") depth++;
		else if (c === ")" && --depth === 0) return i;
	}
	return text.length;
}
