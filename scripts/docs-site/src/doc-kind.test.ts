import { assertEquals } from "@std/assert";
import { DOC_KINDS, describeUnknownDocKind, parseDocKind } from "./doc-kind.ts";
import { err, ok } from "./result.ts";

Deno.test("parseDocKind accepts every Diátaxis kind", () => {
	// Given: the four kinds as written in frontmatter
	const values = ["tutorial", "how-to", "explanation", "reference"];

	// When: parsing each
	const kinds = values.map(parseDocKind);

	// Then: each is its own kind, in sidebar order
	assertEquals(kinds, DOC_KINDS.map(ok));
});

Deno.test("parseDocKind leaves an untagged page untagged", () => {
	// Given: a page that declares no kind
	const value = undefined;

	// When: parsing it
	const kind = parseDocKind(value);

	// Then: it has no kind
	assertEquals(kind, ok(undefined));
});

Deno.test("parseDocKind rejects any other value", () => {
	// Given: a near miss and an empty value
	const values = ["howto", ""];

	// When: parsing each
	const errors = values.map(parseDocKind);

	// Then: each error carries the value, and its description lists the kinds
	assertEquals(errors, [err({ value: "howto" }), err({ value: "" })]);
	assertEquals(
		describeUnknownDocKind({ value: "howto" }),
		'unknown kind "howto"; expected one of tutorial, how-to, explanation, reference',
	);
});
