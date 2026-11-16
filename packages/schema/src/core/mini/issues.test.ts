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
	issues,
	type Located,
	locate,
	prefix,
	toIssues,
} from "./issues.ts";

const SYMBOL_KEY = Symbol("key");
const PATHS: (readonly PropertyKey[])[] = [
	[],
	["name"],
	[0],
	[SYMBOL_KEY],
	["user", 1, SYMBOL_KEY],
];
const SAMPLES: Issues<string>[] = [
	fromError("a"),
	issues([{ path: ["field"], error: "b" }]),
	issues([
		{ path: [1], error: "c" },
		{ path: [2, "x"], error: "d" },
	]),
];

Deno.test("fromError locates an error at the root", () => {
	// Given: an error
	const error = "invalid";

	// When: collecting it
	const collected = fromError(error);

	// Then: it is the only entry, at the empty path
	assertEquals(entries(collected), [{ path: [], error }]);
});

Deno.test("issues holds exactly the entries it was given, in order", () => {
	// Given: located errors with full paths
	const list = [
		{ path: ["name"], error: "required" },
		{ path: ["user", "age"], error: 0 },
	] as const;

	// When: building issues from them
	const built = issues(list);

	// Then: the entries are the list, and the error type is their union
	assertEquals(entries(built), list);
	assertType<IsExact<typeof built, Issues<"required" | 0>>>(true);
});

Deno.test("issues rejects an empty list at the type level", () => {
	// Given: no entries
	// When: building issues from them
	// @ts-expect-error: Issues is never empty
	const build = (): Issues<never> => issues([]);

	// Then: it is a type error (and the call is never made)
	assertEquals(typeof build, "function");
});

Deno.test("issues of a single root entry is fromError", () => {
	// Given: an error
	const error = "invalid";

	// When: building issues with it at the root, and collecting it
	// Then: both are the same
	assertEquals(
		entries(issues([{ path: [], error }])),
		entries(fromError(error)),
	);
});

Deno.test("prefix prepends the whole path to every path", () => {
	for (const { found, path } of matrix({ found: SAMPLES, path: PATHS })) {
		// Given: issues and a path
		const before = entries(found);

		// When: prefixing them
		const after = entries(prefix({ issues: found, path }));

		// Then: every entry keeps its error and gains the path in front
		assertEquals<readonly Located<string>[]>(
			after,
			before.map((entry) => ({
				path: [...path, ...entry.path],
				error: entry.error,
			})),
		);
		// Then: the original is unchanged
		assertEquals(entries(found), before);
	}
});

Deno.test("prefix by the empty path is the identity", () => {
	for (const found of SAMPLES) {
		// Given: issues
		// When: prefixing them by the empty path
		const same = prefix({ issues: found, path: [] });

		// Then: the entries are unchanged
		assertEquals(entries(same), entries(found));
	}
});

Deno.test("prefix composes: inner then outer is the joined path", () => {
	for (const { found, outer, inner } of matrix({
		found: SAMPLES,
		outer: PATHS,
		inner: PATHS,
	})) {
		// Given: issues and two paths
		// When: prefixing with the inner path, then the outer
		const twice = prefix({
			issues: prefix({ issues: found, path: inner }),
			path: outer,
		});

		// Then: it is one prefix by the outer path followed by the inner
		assertEquals(
			entries(twice),
			entries(prefix({ issues: found, path: [...outer, ...inner] })),
		);
	}
});

Deno.test("concat is associative", () => {
	for (const { a, b, c } of matrix({ a: SAMPLES, b: SAMPLES, c: SAMPLES })) {
		// Given: three issues
		// When: concatenating them grouped both ways, and flat
		const left = concat([concat([a, b]), c]);
		const right = concat([a, concat([b, c])]);
		const flat = concat([a, b, c]);

		// Then: the entries are the same, in order
		assertEquals(entries(left), entries(right));
		assertEquals(entries(left), entries(flat));
		assertEquals(
			entries(flat).length,
			entries(a).length + entries(b).length + entries(c).length,
		);
	}
});

Deno.test("concat of one issues is the identity", () => {
	for (const found of SAMPLES) {
		// Given: issues
		// When: concatenating a list holding only them
		const same = concat([found]);

		// Then: the entries are unchanged
		assertEquals(entries(same), entries(found));
	}
});

Deno.test("prefix distributes over concat", () => {
	for (const { a, b, path } of matrix({
		a: SAMPLES,
		b: SAMPLES,
		path: PATHS,
	})) {
		// Given: two issues and a path
		// When: prefixing the concatenation, and concatenating the prefixed
		const outside = prefix({ issues: concat([a, b]), path });
		const inside = concat([
			prefix({ issues: a, path }),
			prefix({ issues: b, path }),
		]);

		// Then: both are the same
		assertEquals(entries(outside), entries(inside));
	}
});

Deno.test("isIssues recognises only Issues", () => {
	// Given: issues and other values
	const others: unknown[] = ["a", null, [{ path: [], error: "a" }], {}];

	// When: checking each
	// Then: only the Issues are recognised
	for (const found of SAMPLES) assert(isIssues(found));
	for (const other of others) assertFalse(isIssues(other));
});

Deno.test("toIssues collects a bare error and keeps Issues as they are", () => {
	for (const found of SAMPLES) {
		// Given: issues
		// When: flattening them
		const flattened = toIssues(found);

		// Then: they are returned unchanged, not nested
		assertEquals(flattened, found);
	}

	// Given: a bare error
	// When: flattening it
	// Then: it is collected at the root
	assertEquals(entries(toIssues("bare")), entries(fromError("bare")));
});

Deno.test("locate is toIssues followed by a one-key prefix", () => {
	const errors: (string | Issues<string>)[] = ["bare", ...SAMPLES];
	const keys: PropertyKey[] = ["name", 0, SYMBOL_KEY];

	for (const { error, key } of matrix({ error: errors, key: keys })) {
		// Given: a child error, bare or Issues, and its key
		// When: locating it under the key
		const located = locate({ key, error });

		// Then: it equals prefixing its flattened form by [key]
		assertEquals(
			entries(located),
			entries(prefix({ issues: toIssues(error), path: [key] })),
		);
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
	const first = "required" as const;
	const second: Issues<404> = issues([{ path: ["status"], error: 404 }]);

	// When: locating both under their keys and collecting them
	const found = concat([
		locate({ key: "name", error: first }),
		locate({ key: "response", error: second }),
	]);

	// Then: the error type is the union of both, flattened
	assertType<IsExact<typeof found, Issues<"required" | 404>>>(true);
	assertEquals(entries(found), [
		{ path: ["name"], error: "required" },
		{ path: ["response", "status"], error: 404 },
	]);
});
