import { unionKinds } from "@sekhmet/enum/core/mini/exit";
import { Err, Ok, unwrap, unwrapErr } from "@sekhmet/enum/result/mini";
import { assertEquals, assertStrictEquals } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import {
	InvalidType,
	InvalidValue,
	type SchemaIssue,
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
import { discriminatedUnion } from "./discriminated-union.ts";
import { object } from "./object.ts";

const size: Schema<unknown, number, "not a size"> = new Schema({
	parse: (input) => {
		return typeof input === "number" ? Ok(input) : Err("not a size");
	},
});
const laterSize: Schema<unknown, number, "not a size"> = new Schema({
	parse: (input) => {
		return Promise.resolve(
			typeof input === "number" ? Ok(input) : Err("not a size"),
		);
	},
});
const shape = discriminatedUnion({
	key: "kind",
	options: {
		circle: object({ shape: { radius: size } }),
		square: object({ shape: { side: size } }),
	},
});

Deno.test("discriminatedUnion dispatches on the key and keeps the discriminant", () => {
	// Given: a union of circles and squares
	// When: parsing one of each
	const circle = unwrap(parseSync(shape, { kind: "circle", radius: 2 }));
	const square = unwrap(parseSync(shape, { kind: "square", side: 3 }));

	// Then: each is parsed by its option and carries its kind
	assertEquals(circle, { radius: 2, kind: "circle" });
	assertEquals(square, { side: 3, kind: "square" });
});

Deno.test("discriminatedUnion reports the chosen option's issues", async () => {
	// Given: a union of circles and squares
	// When: parsing a circle with a bad radius
	const issues = unwrapErr(
		await parseAsync(shape, { kind: "circle", radius: "big" }),
	);

	// Then: the circle's issue is reported at its path
	assertEquals(entries(issues), [{ path: ["radius"], error: "not a size" }]);
});

Deno.test("discriminatedUnion rejects an unknown discriminant with InvalidValue at the key", async (t) => {
	for (const kind of ["star", 1, undefined, "toString"]) {
		await t.step(String(kind), async () => {
			// Given: a union of circles and squares
			// When: parsing an object whose kind names no option
			const issues = unwrapErr(await parseAsync(shape, { kind }));

			// Then: one InvalidValue issue at ["kind"] lists the options
			assertEquals(entries(issues), [
				{
					path: ["kind"],
					error: InvalidValue({ input: kind, expected: ["circle", "square"] }),
				},
			]);
		});
	}
});

Deno.test("discriminatedUnion rejects non-objects with InvalidType at the root", async () => {
	// Given: a union of circles and squares
	// When: parsing null
	const issues = unwrapErr(await parseAsync(shape, null));

	// Then: one InvalidType issue is reported at the root
	assertEquals(entries(issues), [
		{ path: [], error: InvalidType({ input: null, expected: "object" }) },
	]);
});

Deno.test("discriminatedUnion is Async when the chosen option is", async () => {
	// Given: a union whose circle option is async
	const later = discriminatedUnion({
		key: "kind",
		options: {
			circle: object({ shape: { radius: laterSize } }),
			square: object({ shape: { side: size } }),
		},
	});

	// When: parsing a square and a circle
	const squareKind = unionKinds(parse(later, { kind: "square", side: 1 }));
	const circleKind = unionKinds(parse(later, { kind: "circle", radius: 1 }));

	// Then: only the circle's parse is Async
	assertEquals(squareKind, "Sync");
	assertEquals(circleKind, "Async");
	assertEquals(unwrap(await parseAsync(later, { kind: "circle", radius: 1 })), {
		radius: 1,
		kind: "circle",
	});
});

Deno.test("discriminatedUnion infers a union narrowed by its key", () => {
	// Given: a union of circles and squares
	// When: reading its types
	type Shape = Output<typeof shape>;

	// Then: each option's output carries its literal kind
	assertType<IsExact<Input<typeof shape>, unknown>>(true);
	assertType<
		IsExact<
			Shape,
			{ radius: number; kind: "circle" } | { side: number; kind: "square" }
		>
	>(true);
	assertType<
		IsExact<ErrorOf<typeof shape>, Issues<"not a size" | SchemaIssue>>
	>(true);
});

Deno.test("discriminatedUnion views its key and options, exactly as passed", () => {
	// Given: the shape union declared above
	// When: reading its view
	const { key, options } = shape;

	// Then: the key stays literal and each option keeps its own view
	assertEquals(key, "kind");
	assertStrictEquals(options.circle.shape.radius, size);
	assertType<IsExact<typeof key, "kind">>(true);
	assertType<IsExact<typeof options.square.shape.side, typeof size>>(true);
	assertType<IsExact<Output<typeof options.square>, { side: number }>>(true);
});

Deno.test('a discriminatedUnion keyed "optional" is a required key of an object', () => {
	// Given: a discriminated union whose view has key: "optional"
	const keyed = discriminatedUnion({
		key: "optional",
		options: { yes: object({ shape: {} }) },
	});

	// When: using it as a shape's value
	const holder = object({ shape: { value: keyed } });

	// Then: its key is required, not read as a field entry's
	assertType<IsExact<Output<typeof holder>, { value: { optional: "yes" } }>>(
		true,
	);
	assertEquals(unwrap(parseSync(holder, { value: { optional: "yes" } })), {
		value: { optional: "yes" },
	});
});
