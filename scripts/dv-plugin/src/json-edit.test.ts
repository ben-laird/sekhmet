import { isErr, unwrap, unwrapErr } from "@sekhmet/enum/result/mini";
import { assert, assertEquals } from "@std/assert";
import {
	describeJsonEditError,
	locateStringValue,
	replaceStringField,
	valueAtPath,
} from "./json-edit.ts";

const MANIFEST = `{
	"name": "@sekhmet/vow",
	"version": "0.1.0",
	"license": "MIT",

	"exports": {
		".": "./mod.ts"
	},

	"imports": {
		"@/": "./"
	}
}
`;

Deno.test("replaceStringField keeps tabs, blank lines and key order", () => {
	// Given: a tab-indented manifest with blank-line groups
	const text = MANIFEST;

	// When: the version is replaced
	const edited = replaceStringField({
		text,
		path: ["version"],
		value: "0.2.0",
	});

	// Then: only the version literal changed
	assertEquals(
		unwrap(edited),
		MANIFEST.replace('"version": "0.1.0"', '"version": "0.2.0"'),
	);
});

Deno.test("replaceStringField edits a nested key without touching a same-named top-level one", () => {
	// Given: a document where "version" appears both nested and at the top
	const text = `{
	"nested": { "version": "9.9.9" },
	"version": "0.1.0"
}`;

	// When: the top-level version is replaced
	const edited = replaceStringField({
		text,
		path: ["version"],
		value: "1.0.0",
	});

	// Then: the nested value is untouched
	assertEquals(
		unwrap(edited),
		`{
	"nested": { "version": "9.9.9" },
	"version": "1.0.0"
}`,
	);
});

Deno.test("replaceStringField tolerates comments and trailing commas", () => {
	// Given: JSONC with line and block comments and a trailing comma
	const text = `{
	// the package
	"name": "x", /* inline "version": "nope" */
	"version": "0.1.0",
}`;

	// When: the version is replaced
	const edited = replaceStringField({
		text,
		path: ["version"],
		value: "0.1.1",
	});

	// Then: the comments survive and the real field changed
	assertEquals(unwrap(edited), text.replace('"0.1.0"', '"0.1.1"'));
});

Deno.test("replaceStringField reports a missing field", () => {
	// Given: a manifest without a version
	const text = `{ "name": "x" }`;

	// When: the version is replaced
	const edited = replaceStringField({
		text,
		path: ["version"],
		value: "1.0.0",
	});

	// Then: the edit fails with field-missing
	assert(isErr(edited));
	assertEquals(unwrapErr(edited), { kind: "field-missing", path: ["version"] });
	assertEquals(
		describeJsonEditError(unwrapErr(edited)),
		'field "version" is missing',
	);
});

Deno.test("replaceStringField refuses a non-string field", () => {
	// Given: a version stored as a number
	const text = `{ "version": 1 }`;

	// When: the version is replaced
	const edited = replaceStringField({
		text,
		path: ["version"],
		value: "1.0.0",
	});

	// Then: the edit fails with field-not-string
	assertEquals(unwrapErr(edited).kind, "field-not-string");
});

Deno.test("replaceStringField reports malformed JSON", () => {
	// Given: text that is not JSON
	const text = `{ "version": `;

	// When: the version is replaced
	const edited = replaceStringField({
		text,
		path: ["version"],
		value: "1.0.0",
	});

	// Then: the edit fails with invalid-json
	assertEquals(unwrapErr(edited).kind, "invalid-json");
});

Deno.test("locateStringValue escapes keys and handles escaped quotes in values", () => {
	// Given: values containing escaped quotes before the target
	const text = `{ "a": "say \\"hi\\"", "imports": { "@sekhmet/enum": "jsr:x" } }`;

	// When: locating a nested key that contains a slash
	const span = locateStringValue({ text, path: ["imports", "@sekhmet/enum"] });

	// Then: the span covers exactly the quoted value
	assert(span !== undefined);
	assertEquals(text.slice(span.start, span.end), '"jsr:x"');
});

Deno.test("locateStringValue skips arrays and returns the last duplicate", () => {
	// Given: an array before the target and a repeated key
	const text = `{ "list": ["version", {"version": "x"}], "v": "1", "v": "2" }`;

	// When: locating the repeated key
	const span = locateStringValue({ text, path: ["v"] });

	// Then: the last occurrence wins, like JSON.parse
	assert(span !== undefined);
	assertEquals(text.slice(span.start, span.end), '"2"');
});

Deno.test("valueAtPath walks objects and stops at non-objects", () => {
	// Given: a nested value
	const value = { a: { b: "c" }, list: ["x"] };

	// When / Then: present, absent and through-array paths
	assertEquals(valueAtPath({ value, path: ["a", "b"] }), "c");
	assertEquals(valueAtPath({ value, path: ["a", "missing"] }), undefined);
	assertEquals(valueAtPath({ value, path: ["list", "0"] }), undefined);
});
