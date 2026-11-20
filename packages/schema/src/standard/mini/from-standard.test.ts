import { unionKinds } from "@sekhmet/enum/core/mini/exit";
import { Err, Ok, unwrap, unwrapErr } from "@sekhmet/enum/result/mini";
import { definePanicRuntime } from "@sekhmet/panic";
import { resume } from "@sekhmet/panic/outcome/mini";
import { wait } from "@sekhmet/vow";
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

const panics = definePanicRuntime();

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
	const parsing = parse(schema, { input: { name: "Ada" }, panics });

	// Then: the parse is resolved and yields the Standard output
	assertEquals(unionKinds(parsing), "Resolved");
	assertEquals(unwrap(parseSync(schema, { name: "Ada" })), {
		name: "Ada",
	});
});

Deno.test("fromStandard parses asynchronously when validate returns a Promise", async () => {
	// Given: an asynchronous Standard Schema, wrapped
	const schema = fromStandard(asyncUser);

	// When: parsing a valid value
	const parsing = parse(schema, { input: { name: "Ada" }, panics });

	// Then: the parse is pending and yields the Standard output
	assertEquals(unionKinds(parsing), "Pending");
	assertEquals(
		unwrap(
			resume(await wait(parse(schema, { input: { name: "Ada" }, panics }))),
		),
		{
			name: "Ada",
		},
	);
});

Deno.test("fromStandard makes each Standard issue an Issues entry", async (t) => {
	await t.step("paths are normalised to PropertyKeys", async () => {
		// Given: a Standard Schema whose issues mix { key } and plain segments
		const schema = fromStandard(asyncUser);

		// When: parsing an invalid value
		const issues = unwrapErr(
			resume(await wait(parse(schema, { input: { name: 1 }, panics }))),
		);

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
		const issues = unwrapErr(
			resume(await wait(parse(schema, { input: 1, panics }))),
		);

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
		const issues = unwrapErr(
			resume(await wait(parse(schema, { input: 1, panics }))),
		);

		// Then: Issues, which is never empty, holds one root issue saying so
		assertEquals(entries(issues), [
			{ path: [], error: { message: EMPTY_FAILURE_MESSAGE } },
		]);
	});
});

/** A sekhmet schema failing with `Issues<SchemaIssue>` at nested paths. */
const tagged = new Schema({
	parse: (input: unknown) => {
		return Array.isArray(input) && input.length > 0
			? Ok(input.length)
			: Err(
					issues([
						{
							path: ["tags"],
							error: InvalidType({ input, expected: "array" }),
						},
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
				);
	},
});

Deno.test("fromStandard(toStandard({ panics, schema })) round-trips", async (t) => {
	await t.step("outputs are preserved", async () => {
		// Given: a schema round-tripped through Standard Schema
		const schema = fromStandard(toStandard({ panics, schema: tagged }));

		// When: parsing a valid value
		const output = resume(
			await wait(parse(schema, { input: ["a", "b"], panics })),
		);

		// Then: the output is the original schema's
		assertEquals(unwrap(output), 2);
	});

	await t.step("issue messages and paths are preserved", async () => {
		// Given: a schema round-tripped through Standard Schema
		const schema = fromStandard(toStandard({ panics, schema: tagged }));

		// When: parsing an invalid value
		const roundTripped = unwrapErr(
			resume(await wait(parse(schema, { input: [], panics }))),
		);
		const original = unwrapErr(
			resume(await wait(parse(tagged, { input: [], panics }))),
		);

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
		const single = new Schema<unknown, never, SchemaIssue>({
			parse: (input) => {
				return Err(InvalidType({ input, expected: "string" }));
			},
		});
		const schema = fromStandard(toStandard({ panics, schema: single }));

		// When: parsing
		const issues = unwrapErr(
			resume(await wait(parse(schema, { input: 1, panics }))),
		);

		// Then: one entry at the empty path, with formatIssue's message
		assertEquals(entries(issues), [
			{ path: [], error: { message: "Expected string, received number" } },
		]);
	});

	await t.step("sync stays sync", () => {
		// Given: a synchronous schema, round-tripped
		const schema = fromStandard(toStandard({ panics, schema: tagged }));

		// When: parsing
		const parsing = parse(schema, { input: ["a"], panics });

		// Then: the parse is resolved
		assertEquals(unionKinds(parsing), "Resolved");
	});

	await t.step("async stays async", async () => {
		// Given: an asynchronous schema, round-tripped
		const delayed = new Schema({
			parse: (input: unknown) => {
				return Promise.resolve(
					typeof input === "number"
						? Ok(input)
						: Err(InvalidType({ input, expected: "number" })),
				);
			},
		});
		const schema = fromStandard(toStandard({ panics, schema: delayed }));

		// When: parsing
		const parsing = parse(schema, { input: 1, panics });

		// Then: the parse is pending, with the original output
		assertEquals(unionKinds(parsing), "Pending");
		assertEquals(
			unwrap(resume(await wait(parse(schema, { input: 1, panics })))),
			1,
		);
	});
});

Deno.test("toStandard(fromStandard(standard)) round-trips with toIssue", async () => {
	// Given: a Standard Schema wrapped and exposed again, keeping each issue
	const standard = toStandard({
		panics,
		schema: fromStandard(asyncUser),
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
