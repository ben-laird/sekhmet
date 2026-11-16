import { unionKinds } from "@sekhmet/enum/core/mini/exit";
import { Err, Ok, unwrap, unwrapErr } from "@sekhmet/enum/result/mini";
import { assertEquals } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import {
	formatIssue,
	InvalidType,
	type SchemaIssue,
	TooSmall,
} from "@/src/core/mini/issue.ts";
import { entries, type Issues, issues } from "@/src/core/mini/issues.ts";
import {
	type ErrorOf,
	type Output,
	parse,
	parseAsync,
	parseSync,
	Schema,
} from "@/src/core/mini/schema.ts";
import { EMPTY_FAILURE_MESSAGE, fromStandard } from "./from-standard.ts";
import type {
	InferStandardOutput,
	StandardIssue,
	StandardResult,
	StandardSchemaV1,
} from "./spec.ts";
import { toStandard } from "./to-standard.ts";

/**
 * A hand-written Standard Schema of `{ name: string }`, in the shape Zod or
 * Valibot produce: input `{ name: unknown }`, output `{ name: string }`.
 */
function user({
	async,
}: {
	async: boolean;
}): StandardSchemaV1<{ name: unknown }, { name: string }> {
	const check = (value: unknown): StandardResult<{ name: string }> => {
		if (typeof value !== "object" || value === null) {
			return { issues: [{ message: "Expected object" }] };
		}
		const name: unknown = Reflect.get(value, "name");
		return typeof name === "string"
			? { value: { name } }
			: {
					issues: [
						{ message: "Expected string", path: [{ key: "name" }] },
						{ message: "Required", path: ["name", 0] },
					],
				};
	};

	return {
		"~standard": {
			version: 1,
			vendor: "fixture",
			validate: (value) =>
				async ? Promise.resolve(check(value)) : check(value),
		},
	};
}

const syncUser = user({ async: false });
const asyncUser = user({ async: true });

Deno.test("fromStandard infers the Standard Schema's output", () => {
	// Given: a Standard Schema of { name: string }
	// When: wrapping it
	const schema = fromStandard(syncUser);

	// Then: the schema takes unknown, outputs the Standard output, fails with Issues
	assertType<IsExact<Output<typeof schema>, { name: string }>>(true);
	assertType<
		IsExact<Output<typeof schema>, InferStandardOutput<typeof syncUser>>
	>(true);
	assertType<IsExact<ErrorOf<typeof schema>, Issues<StandardIssue>>>(true);
});

Deno.test("fromStandard parses synchronously when validate does", () => {
	// Given: a synchronous Standard Schema, wrapped
	const schema = fromStandard(syncUser);

	// When: parsing a valid value
	const potential = parse(schema, { name: "Ada" });

	// Then: the parse is Sync and yields the Standard output
	assertEquals(unionKinds(potential), "Sync");
	assertEquals(unwrap(parseSync(schema, { name: "Ada" })), {
		name: "Ada",
	});
});

Deno.test("fromStandard parses asynchronously when validate returns a Promise", async () => {
	// Given: an asynchronous Standard Schema, wrapped
	const schema = fromStandard(asyncUser);

	// When: parsing a valid value
	const potential = parse(schema, { name: "Ada" });

	// Then: the parse is Async and yields the Standard output
	assertEquals(unionKinds(potential), "Async");
	assertEquals(unwrap(await parseAsync(schema, { name: "Ada" })), {
		name: "Ada",
	});
});

Deno.test("fromStandard makes each Standard issue an Issues entry", async (t) => {
	await t.step("paths are normalised to PropertyKeys", async () => {
		// Given: a Standard Schema whose issues mix { key } and plain segments
		const schema = fromStandard(asyncUser);

		// When: parsing an invalid value
		const issues = unwrapErr(await parseAsync(schema, { name: 1 }));

		// Then: each issue is an entry at its normalised path, kept as the error
		assertEquals(entries(issues), [
			{
				path: ["name"],
				error: { message: "Expected string", path: [{ key: "name" }] },
			},
			{ path: ["name", 0], error: { message: "Required", path: ["name", 0] } },
		]);
	});

	await t.step("an issue without a path is at the root", async () => {
		// Given: a Standard Schema reporting a pathless issue
		const schema = fromStandard(syncUser);

		// When: parsing a non-object
		const issues = unwrapErr(await parseAsync(schema, 1));

		// Then: the entry's path is empty
		assertEquals(entries(issues), [
			{ path: [], error: { message: "Expected object" } },
		]);
	});

	await t.step("an empty issues list becomes one root issue", async () => {
		// Given: a Standard Schema that fails without issues
		const schema = fromStandard<never>({
			"~standard": {
				version: 1,
				vendor: "fixture",
				validate: () => ({ issues: [] }),
			},
		});

		// When: parsing anything
		const issues = unwrapErr(await parseAsync(schema, 1));

		// Then: Issues, which is never empty, holds one root issue saying so
		assertEquals(entries(issues), [
			{ path: [], error: { message: EMPTY_FAILURE_MESSAGE } },
		]);
	});
});

/** A sekhmet schema failing with `Issues<SchemaIssue>` at nested paths. */
const tagged = new Schema((input: unknown) =>
	Array.isArray(input) && input.length > 0
		? Ok(input.length)
		: Err(
				issues([
					{ path: ["tags"], error: InvalidType({ input, expected: "array" }) },
					{
						path: ["tags", 0],
						error: TooSmall({
							input,
							origin: "array",
							minimum: 1,
							inclusive: true,
						}),
					},
				]),
			),
);

Deno.test("fromStandard(toStandard(schema)) round-trips", async (t) => {
	await t.step("outputs are preserved", async () => {
		// Given: a schema round-tripped through Standard Schema
		const schema = fromStandard(toStandard(tagged));

		// When: parsing a valid value
		const output = await parseAsync(schema, ["a", "b"]);

		// Then: the output is the original schema's
		assertEquals(unwrap(output), 2);
	});

	await t.step("issue messages and paths are preserved", async () => {
		// Given: a schema round-tripped through Standard Schema
		const schema = fromStandard(toStandard(tagged));

		// When: parsing an invalid value
		const roundTripped = unwrapErr(await parseAsync(schema, []));
		const original = unwrapErr(await parseAsync(tagged, []));

		// Then: each entry keeps its path, and its message is formatIssue's
		assertEquals(
			entries(roundTripped).map(({ path, error }) => ({
				path,
				message: error.message,
			})),
			entries(original).map(({ path, error }) => ({
				path,
				message: formatIssue(error),
			})),
		);
	});

	await t.step("a root SchemaIssue stays at the root", async () => {
		// Given: a schema failing with a single SchemaIssue, round-tripped
		const single = new Schema<unknown, never, SchemaIssue>((input) =>
			Err(InvalidType({ input, expected: "string" })),
		);
		const schema = fromStandard(toStandard(single));

		// When: parsing
		const issues = unwrapErr(await parseAsync(schema, 1));

		// Then: one entry at the empty path, with formatIssue's message
		assertEquals(entries(issues), [
			{ path: [], error: { message: "Expected string, received number" } },
		]);
	});

	await t.step("sync stays sync", () => {
		// Given: a synchronous schema, round-tripped
		const schema = fromStandard(toStandard(tagged));

		// When: parsing
		const potential = parse(schema, ["a"]);

		// Then: the parse is Sync
		assertEquals(unionKinds(potential), "Sync");
	});

	await t.step("async stays async", async () => {
		// Given: an asynchronous schema, round-tripped
		const delayed = new Schema((input: unknown) =>
			Promise.resolve(
				typeof input === "number"
					? Ok(input)
					: Err(InvalidType({ input, expected: "number" })),
			),
		);
		const schema = fromStandard(toStandard(delayed));

		// When: parsing
		const potential = parse(schema, 1);

		// Then: the parse is Async, with the original output
		assertEquals(unionKinds(potential), "Async");
		assertEquals(unwrap(await parseAsync(schema, 1)), 1);
	});
});

Deno.test("toStandard(fromStandard(standard)) round-trips with toIssue", async () => {
	// Given: a Standard Schema wrapped and exposed again, keeping each issue
	const standard = toStandard(fromStandard(asyncUser), {
		toIssue: (issue) => ({ message: issue.message }),
	});

	// When: validating a valid and an invalid value
	const valid = await standard["~standard"].validate({ name: "Ada" });
	const invalid = await standard["~standard"].validate({ name: 1 });

	// Then: the output and each issue's message and normalised path survive
	assertEquals(valid, { value: { name: "Ada" } });
	assertEquals(invalid, {
		issues: [
			{ message: "Expected string", path: ["name"] },
			{ message: "Required", path: ["name", 0] },
		],
	});
});
