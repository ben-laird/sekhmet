import { Err, Ok } from "@sekhmet/enum/result/mini";
import { assertEquals, assertInstanceOf, assertThrows } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import {
	InvalidType,
	type SchemaIssue,
	TooSmall,
} from "@/src/core/mini/issue.ts";
import { type Issues, issues } from "@/src/core/mini/issues.ts";
import { Schema } from "@/src/core/mini/schema.ts";
import type { InferStandardInput, InferStandardOutput } from "./spec.ts";
import { toStandard } from "./to-standard.ts";

const text = new Schema((input: unknown) =>
	typeof input === "string"
		? Ok(input)
		: Err(InvalidType({ input, expected: "string" })),
);

Deno.test("toStandard declares Standard Schema v1 from the sekhmet vendor", () => {
	// Given: a schema whose input is unknown
	// When: exposing it as a Standard Schema
	const standard = toStandard(text);

	// Then: its props name version 1 and the sekhmet vendor
	assertEquals(standard["~standard"].version, 1);
	assertEquals(standard["~standard"].vendor, "sekhmet");
});

Deno.test("toStandard types infer the schema's output", () => {
	// Given: a schema of unknown to string
	// When: exposing it as a Standard Schema
	const standard = toStandard(text);

	// Then: Standard inference sees unknown in and string out
	assertType<IsExact<InferStandardInput<typeof standard>, unknown>>(true);
	assertType<IsExact<InferStandardOutput<typeof standard>, string>>(true);
});

Deno.test("toStandard validates synchronously when the parse is Sync", () => {
	// Given: a synchronous schema exposed as a Standard Schema
	const standard = toStandard(text);

	// When: validating a valid and an invalid value
	const valid = standard["~standard"].validate("a");
	const invalid = standard["~standard"].validate(1);

	// Then: both results are plain objects, not promises
	assertEquals(valid, { value: "a" });
	assertEquals(invalid, {
		issues: [{ message: "Expected string, received number" }],
	});
});

Deno.test("toStandard returns a Promise when the parse is Async", async () => {
	// Given: an asynchronous schema exposed as a Standard Schema
	const standard = toStandard(
		new Schema((input: unknown) =>
			Promise.resolve(
				typeof input === "string"
					? Ok(input)
					: Err(InvalidType({ input, expected: "string" })),
			),
		),
	);

	// When: validating a valid and an invalid value
	const valid = standard["~standard"].validate("a");
	const invalid = standard["~standard"].validate(null);

	// Then: both results are promises of the Standard results
	assertInstanceOf(valid, Promise);
	assertInstanceOf(invalid, Promise);
	assertEquals(await valid, { value: "a" });
	assertEquals(await invalid, {
		issues: [{ message: "Expected string, received null" }],
	});
});

Deno.test("toStandard reports one issue per Issues entry, with its path", () => {
	// Given: a schema failing with Issues<SchemaIssue> at nested paths
	const found = issues([
		{ path: ["name"], error: InvalidType({ input: 1, expected: "string" }) },
		{
			path: ["tags", 0],
			error: TooSmall({
				input: [],
				origin: "array",
				minimum: 1,
				inclusive: true,
			}),
		},
	]);
	const standard = toStandard(new Schema((_: unknown) => Err(found)));

	// When: validating any value
	const result = standard["~standard"].validate({});

	// Then: each entry is an issue with formatIssue's message and its path
	assertEquals(result, {
		issues: [
			{ message: "Expected string, received number", path: ["name"] },
			{
				message: "Too small: expected array to have >= 1 items",
				path: ["tags", 0],
			},
		],
	});
});

Deno.test("toStandard keeps symbol path segments", () => {
	// Given: an Issues entry under a symbol key
	const key = Symbol("key");
	const standard = toStandard(
		new Schema((input: unknown) =>
			Err(
				issues([
					{ path: [key], error: InvalidType({ input, expected: "string" }) },
				]),
			),
		),
	);

	// When: validating
	const result = standard["~standard"].validate(1);

	// Then: the path holds the symbol itself
	assertEquals(result, {
		issues: [{ message: "Expected string, received number", path: [key] }],
	});
});

Deno.test("toStandard converts other errors with toIssue", async (t) => {
	await t.step("a message becomes an issue at the root", () => {
		// Given: a schema failing with a custom error, and a toIssue giving a message
		const even = new Schema((input: unknown) =>
			typeof input === "number" && input % 2 === 0
				? Ok(input)
				: Err({ code: "odd" }),
		);
		const standard = toStandard(even, {
			toIssue: ({ code }) => `Rejected: ${code}`,
		});

		// When: validating an odd number
		const result = standard["~standard"].validate(3);

		// Then: the message is the only issue, with no path
		assertEquals(result, { issues: [{ message: "Rejected: odd" }] });
	});

	await t.step("an issue's own path follows the entry's path", () => {
		// Given: Issues of custom errors, and a toIssue that adds a path
		const standard = toStandard(
			new Schema((_: unknown) =>
				Err(
					issues([
						{ path: ["outer"], error: "a" },
						{ path: [], error: "b" },
					]),
				),
			),
			{
				toIssue: (error) => ({
					message: `bad ${error}`,
					path: [{ key: "inner" }],
				}),
			},
		);

		// When: validating
		const result = standard["~standard"].validate(undefined);

		// Then: each entry's path is prepended to toIssue's path
		assertEquals(result, {
			issues: [
				{ message: "bad a", path: ["outer", { key: "inner" }] },
				{ message: "bad b", path: [{ key: "inner" }] },
			],
		});
	});

	await t.step("toIssue may also format SchemaIssues", () => {
		// Given: a SchemaIssue schema with a custom toIssue
		const standard = toStandard(text, { toIssue: () => "nope" });

		// When: validating an invalid value
		const result = standard["~standard"].validate(1);

		// Then: toIssue's message replaces formatIssue's
		assertEquals(result, { issues: [{ message: "nope" }] });
	});
});

Deno.test("toStandard's types enforce its contract", async (t) => {
	await t.step("SchemaIssue and Issues<SchemaIssue> need no options", () => {
		// Given: schemas failing with SchemaIssue, Issues<SchemaIssue>, or never
		const issue = new Schema<unknown, number, SchemaIssue>((_) => Ok(1));
		const issues = new Schema<unknown, number, Issues<SchemaIssue>>((_) =>
			Ok(1),
		);
		const infallible = new Schema<unknown, number, never>((_) => Ok(1));

		// When: exposing each without options
		const results = [
			toStandard(issue),
			toStandard(issues),
			toStandard(infallible),
		];

		// Then: each compiles and validates
		assertEquals(
			results.map((standard) => standard["~standard"].validate(0)),
			[{ value: 1 }, { value: 1 }, { value: 1 }],
		);
	});

	await t.step("an input other than unknown is a type error", () => {
		// Given: a schema that only accepts strings
		const length = new Schema((input: string) => Ok(input.length));

		// When: exposing it as a Standard Schema
		// Then: it does not compile
		// @ts-expect-error: Standard Schema validates unknown input
		toStandard(length);
		// @ts-expect-error: even with a toIssue option
		toStandard(length, { toIssue: () => "" });
	});

	await t.step("other errors require toIssue", () => {
		// Given: schemas failing with a string and with Issues<string>
		const plain = new Schema<unknown, number, string>((_) => Ok(1));
		const located = new Schema<unknown, number, Issues<string>>((_) => Ok(1));

		// When: exposing them without options
		// Then: neither compiles
		// @ts-expect-error: a string error needs toIssue
		toStandard(plain);
		// @ts-expect-error: Issues<string> needs toIssue
		toStandard(located);
	});

	await t.step("toIssue receives each flattened error", () => {
		// Given: a schema failing with a string or Issues<number>
		const mixed = new Schema<unknown, number, string | Issues<number>>((_) =>
			Ok(1),
		);

		// When: exposing it with a toIssue
		// Then: toIssue's parameter is the flattened error, string | number
		toStandard(mixed, {
			toIssue: (error) => {
				assertType<IsExact<typeof error, string | number>>(true);
				return String(error);
			},
		});
	});

	await t.step("bypassing the types to omit toIssue panics", () => {
		// Given: a string-error schema exposed without toIssue, against the types
		// @ts-expect-error: deliberately bypasses the overloads
		const standard = toStandard(new Schema((_: unknown) => Err("bad")));

		// When: validating
		// Then: the broken contract panics
		assertThrows(
			() => standard["~standard"].validate(0),
			TypeError,
			"needs a toIssue option",
		);
	});
});
