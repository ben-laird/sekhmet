import { unionKinds } from "@sekhmet/enum/core/mini/exit";
import { Err, Ok, unwrap, unwrapErr } from "@sekhmet/enum/result/mini";
import { definePanicRuntime } from "@sekhmet/panic";
import { resume } from "@sekhmet/panic/outcome/mini";
import { wait } from "@sekhmet/vow";
import {
	assertEquals,
	assertNotStrictEquals,
	assertStrictEquals,
} from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import { children, nodeOf, SchemaNode } from "@/src/core/mini/node.ts";
import {
	type ErrorOf,
	type Input,
	type Output,
	parse,
	parseSync,
	Schema,
} from "@/src/core/mini/schema.ts";
import { type ReadonlyOutput, readonly } from "./readonly.ts";

const panics = definePanicRuntime();

/** Passes its input through, typed as `T`: the caller's value is the output. */
function identity<T>(): Schema<T, T, never> {
	return new Schema({ parse: (input: T) => Ok(input) });
}

Deno.test("readonly freezes a copy of a plain object, never the input", () => {
	// Given: a schema that outputs its input object, made readonly
	const input = { name: "Ada" };
	const frozen = readonly(identity<{ name: string }>());

	// When: parsing the object
	const parsed = unwrap(parseSync(frozen, input));

	// Then: the output is an equal, frozen copy, and the input is untouched
	assertEquals(parsed, input);
	assertNotStrictEquals(parsed, input);
	assertEquals(Object.isFrozen(parsed), true);
	assertEquals(Object.isFrozen(input), false);
});

Deno.test("readonly freezes a copy of an array, never the input", () => {
	// Given: a schema that outputs its input array, made readonly
	const input = [1, 2];
	const frozen = readonly(identity<number[]>());

	// When: parsing the array
	const parsed = unwrap(parseSync(frozen, input));

	// Then: the output is an equal, frozen array copy, and the input is untouched
	assertEquals(parsed, [1, 2]);
	assertEquals(Array.isArray(parsed), true);
	assertNotStrictEquals(parsed, input);
	assertEquals(Object.isFrozen(parsed), true);
	assertEquals(Object.isFrozen(input), false);
});

Deno.test("readonly is shallow: nested objects are not frozen", () => {
	// Given: an object with a nested object
	const input = { inner: { n: 1 } };
	const frozen = readonly(identity<{ inner: { n: number } }>());

	// When: parsing it
	const parsed = unwrap(parseSync(frozen, input));

	// Then: only the outer copy is frozen; the nested object is shared as is
	assertEquals(Object.isFrozen(parsed), true);
	assertEquals(Object.isFrozen(parsed.inner), false);
	assertStrictEquals(parsed.inner, input.inner);
});

Deno.test("readonly keeps a null prototype and symbol keys", () => {
	// Given: a null-prototype object with a symbol key
	const key = Symbol("key");
	const input: Record<PropertyKey, unknown> = Object.assign(
		Object.create(null),
		{ a: 1, [key]: 2 },
	);
	const frozen = readonly(identity<Record<PropertyKey, unknown>>());

	// When: parsing it
	const parsed = unwrap(parseSync(frozen, input));

	// Then: the copy has the same prototype and keys
	assertEquals(Object.getPrototypeOf(parsed), null);
	assertEquals(parsed.a, 1);
	assertEquals(parsed[key], 2);
});

Deno.test("readonly passes primitives, Maps, Dates and class instances through", () => {
	// Given: a readonly identity, and values that are not arrays or plain objects
	class Point {
		constructor(readonly x: number) {}
	}
	const map = new Map([["a", 1]]);
	const date = new Date(0);
	const point = new Point(1);
	const frozen = readonly(identity<unknown>());

	// When: parsing each
	// Then: each comes back as the very same value, not frozen
	assertEquals(unwrap(parseSync(frozen, "text")), "text");
	assertEquals(unwrap(parseSync(frozen, null)), null);
	assertStrictEquals(unwrap(parseSync(frozen, map)), map);
	assertStrictEquals(unwrap(parseSync(frozen, date)), date);
	assertStrictEquals(unwrap(parseSync(frozen, point)), point);
	assertEquals(Object.isFrozen(map), false);
});

Deno.test("readonly keeps failures and the parse's timing", async () => {
	// Given: a readonly sync schema that fails, and a readonly async one
	const failing = readonly(new Schema({ parse: (_: unknown) => Err("nope") }));
	const later = readonly(
		new Schema({ parse: (input: number[]) => Promise.resolve(Ok(input)) }),
	);

	// When: parsing with each
	const found = unwrapErr(
		resume(await wait(parse(failing, { input: 1, panics }))),
	);
	const parsed = unwrap(
		resume(await wait(parse(later, { input: [1], panics }))),
	);

	// Then: the failure is unchanged, and the async output is frozen too
	assertEquals(found, "nope");
	assertEquals(unionKinds(parse(failing, { input: 1, panics })), "Resolved");
	assertEquals(unionKinds(parse(later, { input: [1], panics })), "Pending");
	assertEquals(Object.isFrozen(parsed), true);
});

Deno.test("readonly types: only the output changes", () => {
	// Given: a readonly schema of objects
	const frozen = readonly(
		new Schema({ parse: (input: string) => Ok({ name: input }) }),
	);

	// When: reading its types
	// Then: the input and error are kept, and the output is Readonly
	assertType<IsExact<Input<typeof frozen>, string>>(true);
	assertType<IsExact<Output<typeof frozen>, { readonly name: string }>>(true);
	assertType<IsExact<ErrorOf<typeof frozen>, never>>(true);
});

Deno.test("ReadonlyOutput maps each kind of output", () => {
	// Given: outputs of every kind
	// When: applying ReadonlyOutput
	// Then: containers become read-only, shallowly, and the rest is unchanged
	assertType<
		IsExact<ReadonlyOutput<{ a: { b: 1 } }>, { readonly a: { b: 1 } }>
	>(true);
	assertType<IsExact<ReadonlyOutput<string[]>, readonly string[]>>(true);
	assertType<
		IsExact<ReadonlyOutput<[number, string]>, readonly [number, string]>
	>(true);
	assertType<
		IsExact<ReadonlyOutput<Map<string, number>>, ReadonlyMap<string, number>>
	>(true);
	assertType<IsExact<ReadonlyOutput<Set<string>>, ReadonlySet<string>>>(true);
	assertType<IsExact<ReadonlyOutput<string>, string>>(true);
	assertType<IsExact<ReadonlyOutput<() => void>, () => void>>(true);
	assertType<
		IsExact<
			ReadonlyOutput<string[] | { a: number } | undefined>,
			readonly string[] | { readonly a: number } | undefined
		>
	>(true);
});

Deno.test("readonly records a Readonly node over its schema", () => {
	// Given: a schema
	const anything = new Schema({ parse: (input: unknown) => Ok(input) });

	// When: making it read-only
	const node = nodeOf(readonly(anything));

	// Then: the node wraps the schema itself, not a map of it
	assertEquals(node, new SchemaNode("Readonly", { inner: anything }));
	assertStrictEquals(children(node)[0], anything);
});

Deno.test("readonly views the schema it freezes the output of", () => {
	// Given: a schema
	const items = identity<string[]>();

	// When: making it readonly
	const frozen = readonly(items);

	// Then: .inner is the schema itself
	assertStrictEquals(frozen.inner, items);
	assertType<IsExact<typeof frozen.inner, typeof items>>(true);
});
