import { match, unionKinds } from "@sekhmet/enum/core/mini/exit";
import { assert, assertEquals, assertFalse } from "@std/assert";
import {
	Custom,
	formatIssue,
	InvalidFormat,
	InvalidType,
	InvalidUnion,
	InvalidValue,
	isSchemaIssue,
	NotMultipleOf,
	type SchemaIssue,
	TooBig,
	TooSmall,
	type TypeName,
	typeName,
	UnknownKey,
} from "./issue.ts";
import { fromError } from "./issues.ts";

/** Reads the rejected input every variant carries. */
function inputOf(issue: SchemaIssue): unknown {
	return match(issue)({
		InvalidType: ({ input }) => input,
		InvalidValue: ({ input }) => input,
		InvalidFormat: ({ input }) => input,
		TooSmall: ({ input }) => input,
		TooBig: ({ input }) => input,
		NotMultipleOf: ({ input }) => input,
		UnknownKey: ({ input }) => input,
		InvalidUnion: ({ input }) => input,
		Custom: ({ input }) => input,
	});
}

Deno.test("typeName names every kind of runtime value", () => {
	// Given: one value of each kind and the name expected for it
	const cases: [unknown, TypeName][] = [
		[undefined, "undefined"],
		[null, "null"],
		[true, "boolean"],
		[1.5, "number"],
		[-0, "number"],
		[Number.NaN, "nan"],
		[Number.POSITIVE_INFINITY, "infinity"],
		[Number.NEGATIVE_INFINITY, "infinity"],
		[1n, "bigint"],
		["", "string"],
		[Symbol("s"), "symbol"],
		[() => {}, "function"],
		[[], "array"],
		[new Date(0), "date"],
		[new Date(Number.NaN), "invalid date"],
		[{}, "object"],
		[new Map(), "object"],
	];

	for (const [value, expected] of cases) {
		// When: naming the value's type
		const name = typeName(value);

		// Then: it is the expected name
		assertEquals(name, expected, `typeName(${String(value)})`);
	}
});

Deno.test("every constructor builds its variant and keeps the input", () => {
	// Given: an input and one issue of each variant built from it
	const input = { rejected: true };
	const issues: [SchemaIssue, string][] = [
		[InvalidType({ input, expected: "string" }), "InvalidType"],
		[InvalidValue({ input, expected: ["a"] }), "InvalidValue"],
		[InvalidFormat({ input, format: "email" }), "InvalidFormat"],
		[
			TooSmall({ input, origin: "number", minimum: 1, inclusive: true }),
			"TooSmall",
		],
		[
			TooBig({ input, origin: "number", maximum: 1, inclusive: true }),
			"TooBig",
		],
		[NotMultipleOf({ input, origin: "number", divisor: 2 }), "NotMultipleOf"],
		[UnknownKey({ input, key: "extra" }), "UnknownKey"],
		[InvalidUnion({ input, branches: [fromError("no")] }), "InvalidUnion"],
		[Custom({ input, message: "no" }), "Custom"],
	];

	for (const [issue, kind] of issues) {
		// When: reading its kind and input
		// Then: the kind is the variant, and the input is the same value
		assertEquals(unionKinds(issue), kind);
		assert(inputOf(issue) === input);
		assert(isSchemaIssue(issue));
	}
});

Deno.test("InvalidType derives received from the input", () => {
	// Given: an input of the wrong type
	const input = [1, 2];

	// When: building the issue
	const issue = InvalidType({ input, expected: "string" });

	// Then: received names the input's type
	assertEquals(
		match(issue)({
			InvalidType: ({ expected, received }) => [expected, received],
			InvalidValue: () => undefined,
			InvalidFormat: () => undefined,
			TooSmall: () => undefined,
			TooBig: () => undefined,
			NotMultipleOf: () => undefined,
			UnknownKey: () => undefined,
			InvalidUnion: () => undefined,
			Custom: () => undefined,
		}),
		["string", "array"],
	);
});

Deno.test("isSchemaIssue rejects other errors", () => {
	// Given: values that are not issues
	const others: unknown[] = [new TypeError("no"), "no", null, {}];

	// When: checking each
	// Then: none is a SchemaIssue
	for (const other of others) assertFalse(isSchemaIssue(other));
});

Deno.test("formatIssue renders a default English message", () => {
	// Given: issues of every variant and origin, with their messages
	const input = undefined;
	const cases: [SchemaIssue, string][] = [
		[
			InvalidType({ input: Number.NaN, expected: "number" }),
			"Expected number, received nan",
		],
		[InvalidValue({ input, expected: [1n] }), "Expected 1n"],
		[
			InvalidValue({ input, expected: ["a", 2, null] }),
			'Expected one of "a", 2, null',
		],
		[InvalidFormat({ input, format: "uuid" }), "Invalid uuid"],
		[
			InvalidFormat({ input, format: "regex", pattern: /^a+$/ }),
			"Invalid regex: must match /^a+$/",
		],
		[
			TooSmall({ input, origin: "number", minimum: 0, inclusive: false }),
			"Too small: expected number to be > 0",
		],
		[
			TooSmall({ input, origin: "bigint", minimum: 5n, inclusive: true }),
			"Too small: expected bigint to be >= 5n",
		],
		[
			TooSmall({
				input,
				origin: "date",
				minimum: new Date(0),
				inclusive: true,
			}),
			"Too small: expected date to be >= 1970-01-01T00:00:00.000Z",
		],
		[
			TooSmall({ input, origin: "string", minimum: 3, inclusive: true }),
			"Too small: expected string to have >= 3 characters",
		],
		[
			TooBig({ input, origin: "array", maximum: 2, inclusive: true }),
			"Too big: expected array to have <= 2 items",
		],
		[
			TooBig({ input, origin: "set", maximum: 2, inclusive: false }),
			"Too big: expected set to have < 2 items",
		],
		[
			TooBig({ input, origin: "map", maximum: 1, inclusive: true }),
			"Too big: expected map to have <= 1 entries",
		],
		[
			NotMultipleOf({ input, origin: "number", divisor: 0.5 }),
			"Expected a multiple of 0.5",
		],
		[UnknownKey({ input, key: "extra" }), 'Unknown key "extra"'],
		[UnknownKey({ input, key: Symbol("id") }), "Unknown key Symbol(id)"],
		[UnknownKey({ input, key: 3 }), "Unknown key 3"],
		[
			InvalidUnion({ input, branches: [fromError("a"), fromError("b")] }),
			"Invalid input: no union branch matched",
		],
		[Custom({ input, message: "Passwords differ" }), "Passwords differ"],
	];

	for (const [issue, expected] of cases) {
		// When: formatting the issue
		const message = formatIssue(issue);

		// Then: it is the expected message
		assertEquals(message, expected);
	}
});
