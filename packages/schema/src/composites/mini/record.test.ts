import { unionKinds } from "@sekhmet/enum/core/mini/exit";
import { Err, Ok, unwrap, unwrapErr } from "@sekhmet/enum/result/mini";
import { assertEquals } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import { InvalidType, type SchemaIssue } from "@/src/core/mini/issue.ts";
import { entries, type Issues } from "@/src/core/mini/issues.ts";
import {
	type ErrorOf,
	type Input,
	type Output,
	parse,
	parseAsync,
	parseSync,
	Schema,
} from "@/src/core/mini/schema.ts";
import { enumOf } from "./enum-of.ts";
import { record } from "./record.ts";

const name: Schema<string, string, "too long"> = new Schema((input) =>
	input.length <= 3 ? Ok(input) : Err("too long"),
);
const count: Schema<unknown, number, "not a number"> = new Schema((input) =>
	typeof input === "number" ? Ok(input) : Err("not a number"),
);
const laterCount: Schema<unknown, number, "not a number"> = new Schema(
	(input) =>
		Promise.resolve(
			typeof input === "number" ? Ok(input) : Err("not a number"),
		),
);

Deno.test("record parses every key and value", () => {
	// Given: a record from short names to numbers
	const scores = record(name, count);

	// When: parsing a matching object
	const parsed = unwrap(parseSync(scores, { ada: 3, bo: 4 }));

	// Then: every entry is kept
	assertEquals(parsed, { ada: 3, bo: 4 });
});

Deno.test("record reports failing keys and values at their key", async () => {
	// Given: a record from short names to numbers
	const scores = record(name, count);

	// When: parsing a bad key and, under another key, a bad value
	const issues = unwrapErr(
		await parseAsync(scores, { alexandra: 1, bo: "x", cy: 2 }),
	);

	// Then: each issue is at its key, in key order
	assertEquals(entries(issues), [
		{ path: ["alexandra"], error: "too long" },
		{ path: ["bo"], error: "not a number" },
	]);
});

Deno.test("record outputs the key schema's output as the key", () => {
	// Given: a record whose key schema upper-cases
	const upper = new Schema((input: string) => Ok(input.toUpperCase()));
	const scores = record(upper, count);

	// When: parsing an object
	const parsed = unwrap(parseSync(scores, { ada: 3 }));

	// Then: the output is keyed by the transformed key
	assertEquals(parsed, { ADA: 3 });
});

Deno.test("record rejects non-objects with InvalidType at the root", async () => {
	// Given: a record schema
	const scores = record(name, count);

	// When: parsing an array
	const issues = unwrapErr(await parseAsync(scores, [1]));

	// Then: one InvalidType issue is reported at the root
	assertEquals(entries(issues), [
		{ path: [], error: InvalidType({ input: [1], expected: "object" }) },
	]);
});

Deno.test("record is Async when its value schema is", async () => {
	// Given: a record with an async value schema
	const scores = record(name, laterCount);

	// When: parsing with it
	const kind = unionKinds(parse(scores, { ada: 1 }));

	// Then: the parse is Async and still succeeds
	assertEquals(kind, "Async");
	assertEquals(unwrap(await parseAsync(scores, { ada: 1 })), { ada: 1 });
});

Deno.test("record infers its input, output and error types", () => {
	// Given: records with string keys and with finite keys
	const scores = record(name, count);
	const flags = record(enumOf(["a", "b"]), count);

	// When: reading their types
	// Then: string keys give a Record; finite keys are each optional
	assertType<IsExact<Input<typeof scores>, unknown>>(true);
	assertType<IsExact<Output<typeof scores>, Record<string, number>>>(true);
	assertType<IsExact<Output<typeof flags>, { a?: number; b?: number }>>(true);
	assertType<
		IsExact<
			ErrorOf<typeof scores>,
			Issues<"too long" | "not a number" | SchemaIssue>
		>
	>(true);
});
