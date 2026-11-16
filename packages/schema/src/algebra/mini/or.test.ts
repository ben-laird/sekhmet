import { unionKinds } from "@sekhmet/enum/core/mini/exit";
import { Err, Ok, unwrap, unwrapErr } from "@sekhmet/enum/result/mini";
import { assertEquals } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import { union } from "@/src/composites/mini/union.ts";
import type { SchemaIssue } from "@/src/core/mini/issue.ts";
import type { Issues } from "@/src/core/mini/issues.ts";
import {
	type ErrorOf,
	type Input,
	type Output,
	parse,
	parseAsync,
	parseSync,
	Schema,
} from "@/src/core/mini/schema.ts";
import { or } from "./or.ts";

const text: Schema<unknown, string, "not text"> = new Schema((input) => {
	return typeof input === "string" ? Ok(input) : Err("not text");
});
const count: Schema<unknown, number, "not a number"> = new Schema((input) => {
	return typeof input === "number" ? Ok(input) : Err("not a number");
});
const flag: Schema<unknown, boolean, "not a flag"> = new Schema((input) => {
	return typeof input === "boolean" ? Ok(input) : Err("not a flag");
});
const laterCount: Schema<unknown, number, "not a number"> = new Schema(
	(input) => {
		return Promise.resolve(
			typeof input === "number" ? Ok(input) : Err("not a number"),
		);
	},
);

Deno.test("or tries left, then right", () => {
	// Given: text or count
	const either = or({ left: text, right: count });

	// When: parsing what each side accepts
	// Then: both are accepted
	assertEquals(unwrap(parseSync(either, "a")), "a");
	assertEquals(unwrap(parseSync(either, 1)), 1);
});

Deno.test("or doesn't run right when left succeeds", () => {
	// Given: a right side that counts its calls
	let calls = 0;
	const counted = new Schema((input: unknown) => {
		calls += 1;
		return Ok(input);
	});
	const either = or({ left: text, right: counted });

	// When: parsing what left accepts
	parseSync(either, "a");

	// Then: right never ran
	assertEquals(calls, 0);
});

Deno.test("or fails exactly like the union of its sides", async () => {
	// Given: or of two schemas, and the union of the same two
	const either = or({ left: text, right: count });
	const same = union([text, count]);

	// When: both parse a value neither side accepts
	const found = unwrapErr(await parseAsync(either, null));
	const expected = unwrapErr(await parseAsync(same, null));

	// Then: the errors are equal: one InvalidUnion with each branch's issues
	assertEquals(found, expected);
});

Deno.test("or flattens chains on either side into one union", async () => {
	// Given: chains nested to the left, to the right, and a flat union
	const leftNested = or({
		left: or({ left: text, right: count }),
		right: flag,
	});
	const rightNested = or({
		left: text,
		right: or({ left: count, right: flag }),
	});
	const flat = union([text, count, flag]);

	// When: each rejects the same value
	const expected = unwrapErr(await parseAsync(flat, null));

	// Then: each fails exactly like the flat union, one branch per schema
	assertEquals(unwrapErr(await parseAsync(leftNested, null)), expected);
	assertEquals(unwrapErr(await parseAsync(rightNested, null)), expected);
});

Deno.test("or extends a union built with union", async () => {
	// Given: a union of two schemas, then or'd with a third
	const extended = or({ left: union([text, count]), right: flag });

	// When: it rejects a value
	const found = unwrapErr(await parseAsync(extended, null));

	// Then: it fails like the three-option union
	assertEquals(
		found,
		unwrapErr(await parseAsync(union([text, count, flag]), null)),
	);
});

Deno.test("or stays Sync when both sides are, and is Async otherwise", () => {
	// Given: a sync or, and one with an async right side
	const now = or({ left: text, right: count });
	const later = or({ left: text, right: laterCount });

	// When: parsing a value only the right side accepts
	// Then: the parse's Potential follows the sides that ran
	assertEquals(unionKinds(parse(now, 1)), "Sync");
	assertEquals(unionKinds(parse(later, 1)), "Async");
});

Deno.test("or's types: input intersects, output unions, error is Issues", () => {
	// Given: two sides with typed inputs
	const left = new Schema((input: { a: string }) => Ok(input.a));
	const right = new Schema((input: { b: number }) => Ok(input.b));

	// When: combining them
	const either = or({ left, right });

	// Then: the input suits both, the output is either, and the error is a union's
	assertType<IsExact<Input<typeof either>, { a: string } & { b: number }>>(
		true,
	);
	assertType<IsExact<Output<typeof either>, string | number>>(true);
	assertType<IsExact<ErrorOf<typeof either>, Issues<SchemaIssue>>>(true);
});
