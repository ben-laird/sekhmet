import { unionKinds } from "@sekhmet/enum/core/mini/exit";
import { Err, Ok, unwrap, unwrapErr } from "@sekhmet/enum/result/mini";
import { definePanicRuntime } from "@sekhmet/panic";
import { resume } from "@sekhmet/panic/outcome/mini";
import { getStructParams } from "@sekhmet/primordials/struct";
import { wait } from "@sekhmet/vow";
import { assertEquals, assertStrictEquals } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import { nodeOf } from "@/src/core/mini/node.ts";
import {
	type ErrorOf,
	type Input,
	type Output,
	parse,
	parseSync,
	Schema,
} from "@/src/core/mini/schema.ts";
import { viewed } from "@/src/core/mini/view.ts";
import { BRAND, type Branded, brand } from "./brand.ts";

const panics = definePanicRuntime();

/** Whether a `From` is assignable to a `To`. */
type Assignable<From, To> = [From] extends [To] ? true : false;

const text: Schema<unknown, string, "not text"> = new Schema({
	parse: (input) => {
		return typeof input === "string" ? Ok(input) : Err("not text");
	},
});

Deno.test("brand passes the output through unchanged", () => {
	// Given: an object schema's output, and that schema branded
	const value = { id: 1 };
	const same = new Schema({ parse: (input: unknown) => Ok(input) });
	const branded = brand(same, "Thing");

	// When: parsing with the branded schema
	const parsed = unwrap(parseSync(branded, { input: value, panics }));

	// Then: the very same value comes back, with no brand key at runtime
	assertStrictEquals(parsed, value);
	assertEquals(Object.getOwnPropertySymbols(parsed), []);
});

Deno.test("brand keeps the schema's failures", async () => {
	// Given: a branded text schema
	const name = brand(text, "Name");

	// When: parsing a non-string
	const found = unwrapErr(
		resume(await wait(parse(name, { input: 1, panics }))),
	);

	// Then: it fails as the unbranded schema does
	assertEquals(found, "not text");
});

Deno.test("brand keeps the parse's timing", () => {
	// Given: a branded async schema
	const later = brand(
		new Schema({ parse: (input: string) => Promise.resolve(Ok(input)) }),
		"Later",
	);

	// When: parsing
	// Then: it is still pending, and a branded sync schema still resolved
	assertEquals(unionKinds(parse(later, { input: "a", panics })), "Pending");
	assertEquals(
		unionKinds(parse(brand(text, "Now"), { input: "a", panics })),
		"Resolved",
	);
});

Deno.test("brand is type-only: the schema is returned as is", () => {
	// Given: a schema
	// When: branding it, twice
	const twice = brand(brand(text, "A"), "B");

	// Then: it is the same schema at runtime; only its type changed
	assertStrictEquals(twice, text);
	assertType<IsExact<Output<typeof twice>, Branded<Branded<string, "A">, "B">>>(
		true,
	);
});

Deno.test("brand types: only the output is branded", () => {
	// Given: a branded schema
	const name = brand(text, "Name");

	// When: reading its types
	// Then: the input and error are unchanged, and the output carries the brand
	assertType<IsExact<Input<typeof name>, unknown>>(true);
	assertType<IsExact<Output<typeof name>, Branded<string, "Name">>>(true);
	assertType<IsExact<ErrorOf<typeof name>, "not text">>(true);
});

Deno.test("Branded is assignable to its base but not the reverse", () => {
	// Given: a branded type
	type UserId = Branded<string, "UserId">;

	// When: comparing it with plain strings and other brands
	// Then: a brand widens to its base, but nothing gains a brand unparsed
	assertType<Assignable<UserId, string>>(true);
	assertType<Assignable<string, UserId>>(false);
	assertType<Assignable<UserId, Branded<string, "OrderId">>>(false);
	assertEquals(typeof BRAND, "symbol");
});

Deno.test("Brands compose: a twice-branded value is both", () => {
	// Given: a value type branded "A", then "B"
	type Both = Branded<Branded<string, "A">, "B">;

	// When: comparing it with each single brand
	// Then: it is assignable to either, but neither single brand is to it
	assertType<Assignable<Both, Branded<string, "A">>>(true);
	assertType<Assignable<Both, Branded<string, "B">>>(true);
	assertType<Assignable<Branded<string, "A">, Both>>(false);
});

Deno.test("brand records no node: it returns its schema", () => {
	// Given: a schema
	// When: branding it
	const branded = brand(text, "Text");

	// Then: the branded schema has the schema's own node
	assertStrictEquals(nodeOf(branded), nodeOf(text));
});

Deno.test("brand keeps the schema's view, since it returns the schema itself", () => {
	// Given: a schema with a view
	const wrapped = viewed({
		init: getStructParams(text),
		view: { inner: text },
	});

	// When: branding it
	const branded = brand(wrapped, "Wrapped");

	// Then: the view stays on the result, beside the branded output
	assertStrictEquals(branded.inner, text);
	assertType<IsExact<typeof branded.inner, typeof text>>(true);
	assertType<IsExact<Output<typeof branded>, Branded<string, "Wrapped">>>(true);
});
