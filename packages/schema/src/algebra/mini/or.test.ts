import { unionKinds, union as variant } from "@sekhmet/enum/core/mini/exit";
import { Err, Ok, unwrap, unwrapErr } from "@sekhmet/enum/result/mini";
import { getStructParams } from "@sekhmet/primordials/struct";
import { assertEquals } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import { union } from "@/src/composites/mini/union.ts";
import { Schema as MainSchema } from "@/src/core/main/mod.ts";
import { annotationKey } from "@/src/core/mini/annotation.ts";
import type { SchemaIssue } from "@/src/core/mini/issue.ts";
import type { Issues } from "@/src/core/mini/issues.ts";
import { children, nodeOf, SchemaNode } from "@/src/core/mini/node.ts";
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
const flag: Schema<unknown, boolean, "not a flag"> = new Schema({
	parse: (input) => {
		return typeof input === "boolean" ? Ok(input) : Err("not a flag");
	},
});
const laterCount: Schema<unknown, number, "not a number"> = new Schema({
	parse: (input) => {
		return Promise.resolve(
			typeof input === "number" ? Ok(input) : Err("not a number"),
		);
	},
});

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
	const counted = new Schema({
		parse: (input: unknown) => {
			calls += 1;
			return Ok(input);
		},
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

Deno.test("or chains flatten into one union", async () => {
	// Given: chains of ors on either side, and the flat union they stand for
	const leftChain = or({ left: or({ left: text, right: count }), right: flag });
	const rightChain = or({
		left: text,
		right: or({ left: count, right: flag }),
	});
	const flat = union([text, count, flag]);
	const expected = unwrapErr(await parseAsync(flat, null));

	// When: each chain accepts a value of the last side, and rejects another
	// Then: it accepts what any side accepts, fails with one InvalidUnion of
	// three branches, and records the flat union's node
	for (const chain of [leftChain, rightChain]) {
		assertEquals(unwrap(parseSync(chain, true)), true);
		assertEquals(unwrapErr(await parseAsync(chain, null)), expected);
		assertEquals(nodeOf(chain), nodeOf(flat));
	}
});

Deno.test("or spreads an un-annotated union written with union", () => {
	// Given: a union, and a union of a union, each extended with or
	const inner = union([text, count]);
	const extended = or({ left: inner, right: flag });
	const nested = or({ left: union([inner]), right: flag });

	// When: reading their nodes
	// Then: each spreads its union's options one level deep only
	assertEquals(nodeOf(extended), nodeOf(union([text, count, flag])));
	assertEquals(nodeOf(nested), nodeOf(union([inner, flag])));
});

Deno.test("or keeps an annotated union whole", async () => {
	// Given: a union with an annotation
	const label = annotationKey<string>({ name: "label" });
	const plain = union([text, count]);
	const labelled = new Schema({
		...getStructParams(plain),
		annotations: [label("text or count")],
	});

	// When: extending it with or
	const extended = or({ left: labelled, right: flag });

	// Then: the annotated union is one branch, so the issue has two branches
	assertEquals(variant(nodeOf(extended)), { options: [labelled, flag] });
	assertEquals(
		unwrapErr(await parseAsync(extended, null)),
		unwrapErr(await parseAsync(union([labelled, flag]), null)),
	);
});

Deno.test("or of two non-unions is a union of the two", () => {
	// Given: two schemas that are not unions
	// When: combining them with or
	// Then: the node is the union of both, in order
	assertEquals(
		nodeOf(or({ left: text, right: count })),
		new SchemaNode("Union", { options: [text, count] }),
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
	const left = new Schema({ parse: (input: { a: string }) => Ok(input.a) });
	const right = new Schema({ parse: (input: { b: number }) => Ok(input.b) });

	// When: combining them
	const either = or({ left, right });

	// Then: the input suits both, the output is either, and the error is a union's
	assertType<IsExact<Input<typeof either>, { a: string } & { b: number }>>(
		true,
	);
	assertType<IsExact<Output<typeof either>, string | number>>(true);
	assertType<IsExact<ErrorOf<typeof either>, Issues<SchemaIssue>>>(true);
});

Deno.test("or has no view, in its type or at runtime: how many options it flattens to varies", () => {
	// Given: a union and another schema
	const either = union([text, count]);

	// When: or-ing them with the function and with main's .with.or
	const any = or({ left: either, right: flag });
	const anyMain = MainSchema.fromMini(either).with.or(flag);

	// Then: neither has an own property, though each node has all three
	// options
	// @ts-expect-error or returns a plain Schema, with no options
	assertEquals(any.options, undefined);
	assertEquals(Object.keys(any), []);
	assertEquals(Object.keys(anyMain), []);
	assertEquals(children(nodeOf(any)), [text, count, flag]);
	assertEquals(children(nodeOf(anyMain)), [text, count, flag]);
});
