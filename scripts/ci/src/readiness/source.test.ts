import { assertEquals } from "@std/assert";
import { lineAt, sourceViews } from "./source.ts";

Deno.test("sourceViews keeps every view the length of the source, newlines in place", () => {
	// Given: a source with comments, strings and a template literal
	const text = 'const a = "x"; // note\n/* block\n */ const b = `t ${a} u`;\n';

	// When: splitting it into views
	const views = sourceViews(text);

	// Then: each view is index-aligned with the source
	for (const view of Object.values(views)) {
		assertEquals(view.length, text.length);
		assertEquals(
			[...view].flatMap((c, i) => (c === "\n" ? [i] : [])),
			[...text].flatMap((c, i) => (c === "\n" ? [i] : [])),
		);
	}
});

Deno.test("sourceViews separates code, comments and string contents", () => {
	// Given: a line of code with a string and a trailing comment
	const text = 'import x from "y"; // from "z"';

	// When: splitting it into views
	const { code, structure, comments } = sourceViews(text);

	// Then: code keeps the string but not the comment, structure drops
	// both, and comments keep only the comment
	assertEquals(code.trimEnd(), 'import x from "y";');
	assertEquals(structure.trimEnd(), 'import x from " ";');
	assertEquals(comments.trim(), '// from "z"');
});

Deno.test("sourceViews reads code inside a template's ${…} and resumes the template after it", () => {
	// Given: a template whose interpolation holds braces and a comment-like string
	const text = "`a ${ {k: 1}.k } // not a comment`; // real";

	// When: splitting it into views
	const { comments, structure } = sourceViews(text);

	// Then: only the trailing comment is a comment, and the object braces stay
	// in the structure while the template text is blanked
	assertEquals(comments.trim(), "// real");
	assertEquals(structure.includes("{k: 1}"), true);
	assertEquals(structure.includes("not a comment"), false);
});

Deno.test("sourceViews treats a quote inside a comment as comment text", () => {
	// Given: a comment containing an unbalanced quote, then code
	const text = "// don't\nconst a = 1;";

	// When: splitting it into views
	const { code } = sourceViews(text);

	// Then: the code after the comment is intact
	assertEquals(code.trim(), "const a = 1;");
});

Deno.test("lineAt counts 1-based lines", () => {
	// Given: a three-line text
	const text = "a\nb\nc";

	// When: locating the first, middle and last characters
	const lines = [0, 2, 4].map((index) => lineAt({ text, index }));

	// Then: they are on lines 1, 2 and 3
	assertEquals(lines, [1, 2, 3]);
});
