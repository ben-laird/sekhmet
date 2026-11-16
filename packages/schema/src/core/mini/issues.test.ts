import { matrix } from "@sekhmet/matrix";
import { assert, assertEquals, assertFalse } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import {
	concat,
	entries,
	type Flatten,
	fromError,
	type Issues,
	isIssues,
	type Located,
	locate,
	prefix,
	toIssues,
} from "./issues.ts";

const SYMBOL_KEY = Symbol("key");
const KEYS: PropertyKey[] = ["name", 0, SYMBOL_KEY];
const SAMPLES: Issues<string>[] = [
	fromError("a"),
	prefix(fromError("b"), "field"),
	concat(prefix(fromError("c"), 1), prefix(prefix(fromError("d"), "x"), 2)),
];

Deno.test("fromError locates an error at the root", () => {
	// Given: an error
	const error = "invalid";

	// When: collecting it
	const issues = fromError(error);

	// Then: it is the only entry, at the empty path
	assertEquals(entries(issues), [{ path: [], error }]);
});

Deno.test("prefix prepends the key to every path", () => {
	for (const { issues, key } of matrix({ issues: SAMPLES, key: KEYS })) {
		// Given: issues and a key
		const before = entries(issues);

		// When: prefixing them
		const after = entries(prefix(issues, key));

		// Then: every entry keeps its error and gains the key in front
		assertEquals<readonly Located<string>[]>(
			after,
			before.map(({ path, error }) => ({ path: [key, ...path], error })),
		);
		// Then: the original is unchanged
		assertEquals(entries(issues), before);
	}
});

Deno.test("prefix composes outermost key first", () => {
	for (const { issues, outer, inner } of matrix({
		issues: SAMPLES,
		outer: KEYS,
		inner: KEYS,
	})) {
		// Given: issues and two keys
		// When: prefixing with the inner key, then the outer
		const twice = entries(prefix(prefix(issues, inner), outer));

		// Then: each path starts outer, inner
		assertEquals(
			twice.map(({ path }) => path),
			entries(issues).map(({ path }) => [outer, inner, ...path]),
		);
	}
});

Deno.test("concat is associative", () => {
	for (const { a, b, c } of matrix({ a: SAMPLES, b: SAMPLES, c: SAMPLES })) {
		// Given: three issues
		// When: concatenating them grouped both ways
		const left = concat(concat(a, b), c);
		const right = concat(a, concat(b, c));

		// Then: the entries are the same, in order
		assertEquals(entries(left), entries(right));
		assertEquals(
			entries(left).length,
			entries(a).length + entries(b).length + entries(c).length,
		);
	}
});

Deno.test("prefix distributes over concat", () => {
	for (const { a, b, key } of matrix({ a: SAMPLES, b: SAMPLES, key: KEYS })) {
		// Given: two issues and a key
		// When: prefixing the concatenation, and concatenating the prefixed
		const outside = prefix(concat(a, b), key);
		const inside = concat(prefix(a, key), prefix(b, key));

		// Then: both are the same
		assertEquals(entries(outside), entries(inside));
	}
});

Deno.test("isIssues recognises only Issues", () => {
	// Given: issues and other values
	const others: unknown[] = ["a", null, [{ path: [], error: "a" }], {}];

	// When: checking each
	// Then: only the Issues are recognised
	for (const issues of SAMPLES) assert(isIssues(issues));
	for (const other of others) assertFalse(isIssues(other));
});

Deno.test("toIssues collects a bare error and keeps Issues as they are", () => {
	for (const issues of SAMPLES) {
		// Given: issues
		// When: flattening them
		const flattened = toIssues(issues);

		// Then: they are returned unchanged, not nested
		assertEquals(flattened, issues);
	}

	// Given: a bare error
	// When: flattening it
	// Then: it is collected at the root
	assertEquals(entries(toIssues("bare")), entries(fromError("bare")));
});

Deno.test("locate is toIssues followed by prefix", () => {
	const errors: (string | Issues<string>)[] = ["bare", ...SAMPLES];

	for (const { error, key } of matrix({ error: errors, key: KEYS })) {
		// Given: a child error, bare or Issues, and its key
		// When: locating it under the key
		const located = locate({ key, error });

		// Then: it equals prefixing its flattened form
		assertEquals(entries(located), entries(prefix(toIssues(error), key)));
	}
});

Deno.test("Flatten unwraps Issues and distributes over unions", () => {
	// Given: child error types, bare and collected
	type Bare = TypeError;
	type Collected = Issues<RangeError>;

	// When: flattening them
	// Then: Issues<F> contributes F, any other E contributes itself
	assertType<IsExact<Flatten<Bare>, TypeError>>(true);
	assertType<IsExact<Flatten<Collected>, RangeError>>(true);
	assertType<IsExact<Flatten<Bare | Collected>, TypeError | RangeError>>(true);
	assertType<IsExact<Flatten<never>, never>>(true);
});

Deno.test("a composite of E1 and Issues<E2> children is Issues<E1 | E2>", () => {
	// Given: one child failing with a bare error, one with Issues
	const first: "required" = "required";
	const second: Issues<404> = prefix(fromError(404 as const), "status");

	// When: locating both under their keys and collecting them
	const issues = concat(
		locate({ key: "name", error: first }),
		locate({ key: "response", error: second }),
	);

	// Then: the error type is the union of both, flattened
	assertType<IsExact<typeof issues, Issues<"required" | 404>>>(true);
	assertEquals(entries(issues), [
		{ path: ["name"], error: "required" },
		{ path: ["response", "status"], error: 404 },
	]);
});
