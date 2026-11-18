import { assertEquals } from "@std/assert";
import {
	describeFrontmatterError,
	type FrontmatterError,
	splitFrontmatter,
} from "./frontmatter.ts";
import { err, ok } from "./result.ts";

Deno.test("splitFrontmatter reads flat key: value lines", () => {
	// Given: a page with a frontmatter block, a comment, a blank line and a quoted value
	const text =
		'---\nkind: tutorial\n# a comment\n\noutline: "deep"\n---\n# Title\n\nBody';

	// When: splitting it
	const page = splitFrontmatter(text);

	// Then: the fields are read, quotes dropped, and the body follows the block
	assertEquals(
		page,
		ok({
			fields: { kind: "tutorial", outline: "deep" },
			body: "# Title\n\nBody",
		}),
	);
});

Deno.test("splitFrontmatter leaves a page without frontmatter whole", () => {
	// Given: a page that starts with its heading and later has a rule
	const text = "# Title\n\n---\n\nAfter a rule";

	// When: splitting it
	const page = splitFrontmatter(text);

	// Then: there are no fields and the body is the whole page
	assertEquals(page, ok({ fields: {}, body: text }));
});

Deno.test("splitFrontmatter rejects blocks it cannot read exactly", () => {
	// Given: an unclosed block, a nested value and a repeated key
	const pages = [
		"---\nkind: tutorial\n# Title",
		"---\nhead:\n  - meta\n---\n",
		"---\nkind: tutorial\nkind: how-to\n---\n",
	];

	// When: splitting each
	const errors = pages.map(splitFrontmatter);

	// Then: each error names what is wrong and where
	assertEquals(errors, [
		err({ kind: "unclosed" }),
		err({ kind: "not-flat", line: 3, text: "  - meta" }),
		err({ kind: "repeated-key", line: 3, key: "kind" }),
	]);
});

Deno.test("describeFrontmatterError says what is wrong and where", () => {
	// Given: one error of each kind
	const errors: FrontmatterError[] = [
		{ kind: "unclosed" },
		{ kind: "not-flat", line: 3, text: "  - meta" },
		{ kind: "repeated-key", line: 4, key: "kind" },
	];

	// When: describing each
	const messages = errors.map(describeFrontmatterError);

	// Then: each message is a sentence for the build log
	assertEquals(messages, [
		"frontmatter has no closing `---` line",
		"frontmatter line 3 is not a flat `key: value` line:   - meta",
		"frontmatter line 4 repeats the key `kind`",
	]);
});
