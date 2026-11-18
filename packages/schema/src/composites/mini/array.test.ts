import { unionKinds } from "@sekhmet/enum/core/mini/exit";
import { Err, Ok, unwrap, unwrapErr } from "@sekhmet/enum/result/mini";
import { assertEquals, assertStrictEquals } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import {
	InvalidType,
	type SchemaIssue,
	TooBig,
	TooSmall,
} from "@/src/core/mini/issue.ts";
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
import { array } from "./array.ts";
import { object } from "./object.ts";

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

Deno.test("array parses every element", () => {
	// Given: an array of numbers
	const counts = array({ item: count });

	// When: parsing a numeric array
	const parsed = unwrap(parseSync(counts, [1, 2, 3]));

	// Then: every element is kept, in order
	assertEquals(parsed, [1, 2, 3]);
});

Deno.test("array reports every failing element at its index", async () => {
	// Given: an array of objects with a number field
	const rows = array({ item: object({ shape: { n: count } }) });

	// When: parsing an array whose first and third rows are wrong
	const issues = unwrapErr(
		await parseAsync(rows, [{ n: "a" }, { n: 2 }, { n: "c" }]),
	);

	// Then: each issue's path starts at its index
	assertEquals(entries(issues), [
		{ path: [0, "n"], error: "not a number" },
		{ path: [2, "n"], error: "not a number" },
	]);
});

Deno.test("array rejects non-arrays with InvalidType at the root", async () => {
	// Given: an array schema
	const counts = array({ item: count });

	// When: parsing an array-like object
	const input = { 0: 1, length: 1 };
	const issues = unwrapErr(await parseAsync(counts, input));

	// Then: one InvalidType issue is reported at the root
	assertEquals(entries(issues), [
		{ path: [], error: InvalidType({ input, expected: "array" }) },
	]);
});

Deno.test("array is Sync for sync elements and Async otherwise, collecting every issue", async () => {
	// Given: arrays of a sync and an async element schema
	const now = array({ item: count });
	const later = array({ item: laterCount });

	// When: parsing with each
	const nowKind = unionKinds(parse(now, [1]));
	const laterKind = unionKinds(parse(later, [1]));
	const issues = unwrapErr(await parseAsync(later, ["a", 2, "c"]));

	// Then: the async array is Async and still reports every element
	assertEquals(nowKind, "Sync");
	assertEquals(laterKind, "Async");
	assertEquals(
		entries(issues).map(({ path }) => path),
		[[0], [2]],
	);
});

Deno.test("minItems and maxItems bound the array's length, inclusively", async (t) => {
	// Given: an array of one to two numbers
	const bounded = array({ item: count, minItems: 1, maxItems: 2 });

	await t.step("lengths within the bounds pass", () => {
		// When: parsing arrays of one and two numbers
		// Then: both pass
		assertEquals(unwrap(parseSync(bounded, [1])), [1]);
		assertEquals(unwrap(parseSync(bounded, [1, 2])), [1, 2]);
	});

	await t.step("too short fails with TooSmall at the root", async () => {
		// When: parsing an empty array
		const issues = unwrapErr(await parseAsync(bounded, []));

		// Then: one TooSmall issue is reported at the root
		assertEquals(entries(issues), [
			{
				path: [],
				error: TooSmall({
					input: [],
					origin: "array",
					minimum: 1,
					inclusive: true,
				}),
			},
		]);
	});

	await t.step("too long fails with TooBig at the root", async () => {
		// When: parsing three numbers
		const input = [1, 2, 3];
		const issues = unwrapErr(await parseAsync(bounded, input));

		// Then: one TooBig issue is reported at the root
		assertEquals(entries(issues), [
			{
				path: [],
				error: TooBig({ input, origin: "array", maximum: 2, inclusive: true }),
			},
		]);
	});
});

Deno.test("a length check also reports alongside failing elements", async () => {
	// Given: an array of at most one number
	const single = array({ item: count, maxItems: 1 });

	// When: parsing two wrong elements
	const issues = unwrapErr(await parseAsync(single, ["a", "b"]));

	// Then: both element issues and the length issue are reported
	assertEquals(
		entries(issues).map(({ path }) => path),
		[[0], [1], []],
	);
});

Deno.test("array infers its input, output and error types", () => {
	// Given: arrays of a loose and a typed element schema
	const counts = array({ item: count });
	const lengths = array({
		item: new Schema({ parse: (input: string) => Ok(input.length) }),
	});
	const bounded = array({ item: count, minItems: 1 });

	// When: reading their types
	// Then: the output is an array of the element's output, the error
	// flattens it with SchemaIssue, and a typed element types the input
	assertType<IsExact<Input<typeof counts>, unknown>>(true);
	assertType<IsExact<Output<typeof counts>, number[]>>(true);
	assertType<
		IsExact<ErrorOf<typeof counts>, Issues<"not a number" | SchemaIssue>>
	>(true);
	assertType<IsExact<Input<typeof lengths>, readonly string[]>>(true);
	assertType<
		IsExact<ErrorOf<typeof bounded>, Issues<"not a number" | SchemaIssue>>
	>(true);
});

Deno.test("array views its element schema, exactly as passed", () => {
	// Given: an element schema that is itself an object with a view
	const point = object({ shape: { x: count } });

	// When: building an array of it
	const points = array({ item: point, minItems: 1 });

	// Then: .item is the element schema, typed with its own view
	assertStrictEquals(points.item, point);
	assertStrictEquals(points.item.shape.x, count);
	assertType<IsExact<typeof points.item, typeof point>>(true);
	assertType<IsExact<Output<typeof points>, { x: number }[]>>(true);
});
