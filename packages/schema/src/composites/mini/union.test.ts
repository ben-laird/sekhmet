import { unionKinds } from "@sekhmet/enum/core/mini/exit";
import { Err, Ok, unwrap, unwrapErr } from "@sekhmet/enum/result/mini";
import { assertEquals } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import { InvalidUnion, type SchemaIssue } from "@/src/core/mini/issue.ts";
import {
	entries,
	fromError,
	type Issues,
	issues,
} from "@/src/core/mini/issues.ts";
import {
	type ErrorOf,
	type Input,
	type Output,
	parse,
	parseAsync,
	parseSync,
	Schema,
} from "@/src/core/mini/schema.ts";
import { object } from "./object.ts";
import { union } from "./union.ts";

const text: Schema<unknown, string, "not text"> = new Schema({
	parse: (input) => {
		return typeof input === "string" ? Ok(input) : Err("not text");
	},
});
const count: Schema<unknown, number, "not a number"> = new Schema({
	parse: (input) => {
		return typeof input === "number" ? Ok(input) : Err("not a number");
	},
});
const laterCount: Schema<unknown, number, "not a number"> = new Schema({
	parse: (input) => {
		return Promise.resolve(
			typeof input === "number" ? Ok(input) : Err("not a number"),
		);
	},
});

Deno.test("union accepts what any option accepts", () => {
	// Given: a union of text and number
	const textOrCount = union([text, count]);

	// When: parsing a string and a number
	// Then: both are accepted
	assertEquals(unwrap(parseSync(textOrCount, "a")), "a");
	assertEquals(unwrap(parseSync(textOrCount, 1)), 1);
});

Deno.test("union's first matching option wins and later options don't run", () => {
	// Given: two options that both accept strings, the second counting calls
	let calls = 0;
	const counted = new Schema({
		parse: (input: unknown) => {
			calls += 1;
			return Ok(`second: ${String(input)}`);
		},
	});
	const either = union([text, counted]);

	// When: parsing a string
	const parsed = unwrap(parseSync(either, "a"));

	// Then: the first option's output is used, and the second never ran
	assertEquals(parsed, "a");
	assertEquals(calls, 0);
});

Deno.test("union fails with InvalidUnion carrying each option's issues", async () => {
	// Given: a union of text and an object
	const either = union([text, object({ shape: { n: count } })]);

	// When: parsing a value neither accepts
	const input = { n: "x" };
	const found = unwrapErr(await parseAsync(either, input));

	// Then: one InvalidUnion at the root holds each option's issues in order
	assertEquals(entries(found), [
		{
			path: [],
			error: InvalidUnion({
				input,
				branches: [
					fromError("not text"),
					issues([{ path: ["n"], error: "not a number" }]),
				],
			}),
		},
	]);
});

Deno.test("union is Async when an option it runs is", async () => {
	// Given: a union whose first option is async
	const either = union([laterCount, text]);

	// When: parsing a value the async option rejects
	const kind = unionKinds(parse(either, "a"));

	// Then: the parse is Async and falls through to the next option
	assertEquals(kind, "Async");
	assertEquals(unwrap(await parseAsync(either, "a")), "a");
});

Deno.test("union infers its input, output and error types", () => {
	// Given: a loose union, and one with a typed option
	const either = union([text, count]);
	const typed = union([
		text,
		new Schema({ parse: (input: string) => Ok(input.length) }),
	]);

	// When: reading their types
	// Then: the output is the options' union, the input their intersection
	assertType<IsExact<Input<typeof either>, unknown>>(true);
	assertType<IsExact<Output<typeof either>, string | number>>(true);
	assertType<IsExact<ErrorOf<typeof either>, Issues<SchemaIssue>>>(true);
	assertType<IsExact<Input<typeof typed>, string>>(true);
});
