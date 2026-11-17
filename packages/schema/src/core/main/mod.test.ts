import { Ok as MainOk, Result } from "@sekhmet/enum/result";
import { Err, Ok, unwrap, unwrapErr } from "@sekhmet/enum/result/mini";
import { assertEquals, assertInstanceOf, assertThrows } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import { type Branded, brand as brandSchema } from "@/src/algebra/main/mod.ts";
import { object, union } from "@/src/composites/main/mod.ts";
import * as mini from "@/src/core/mini/mod.ts";
import { boolean, number, string } from "@/src/primitives/main/mod.ts";
import {
	type ErrorOf,
	entries,
	formatIssue,
	type Input,
	type Issues,
	isSchemaIssue,
	type MainSchemaMember,
	nodeOf,
	type Output,
	ParseError,
	Schema,
	type SchemaIssue,
	SchemaWith,
	TooSmall,
} from "./mod.ts";

Deno.test("variance holds with views, checked narrowing-first (#31 was order-dependent)", () => {
	// Given: schemas and namespaces with narrow and wide outputs, some with views
	const narrowUser = object({
		shape: {
			name: new Schema({ parse: (_: unknown) => Ok<"a", never>("a") }),
		},
	});
	const wideUser = object({ shape: { name: string() } });

	// When: narrowing first, before any widening is checked
	// @ts-expect-error a string output is not an "a" output
	const narrowWith: SchemaWith<unknown, "a", never> = string().with;
	// @ts-expect-error a string output is not an "a" output
	const narrowSchema: Schema<unknown, "a", SchemaIssue> = string();
	// @ts-expect-error a wide object's view is not a narrow one's
	const narrowView: typeof narrowUser = wideUser;
	// @ts-expect-error the namespace's Self is the receiver: a wide one isn't narrow
	const narrowSelf: SchemaWith<
		unknown,
		{ name: "a" },
		Issues<SchemaIssue>,
		typeof narrowUser
	> = wideUser.with;

	// Then: only widening type-checks, for outputs, views and Self alike (a
	// main Schema's error stays exact: filter's error builder returns it)
	const narrowText = new Schema({ parse: (_: unknown) => Ok<"a", never>("a") });
	const wideSchema: Schema<unknown, string, never> = narrowText;
	const wideView: Schema<unknown, { name: string }, Issues<SchemaIssue>> & {
		readonly shape: { readonly name: Schema<unknown, string, never> };
	} = narrowUser;
	const wideSelf: SchemaWith<unknown, { name: string }, unknown> =
		narrowUser.with;
	assertInstanceOf(narrowWith, SchemaWith);
	assertInstanceOf(narrowSchema, Schema);
	assertInstanceOf(narrowView, Schema);
	assertInstanceOf(narrowSelf, SchemaWith);
	assertInstanceOf(wideSchema, Schema);
	assertInstanceOf(wideView, Schema);
	assertInstanceOf(wideSelf, SchemaWith);
});

Deno.test("MainSchemaMember names exactly the members main adds to mini", () => {
	// Given: the main and mini Schema types
	type Added = Exclude<
		keyof Schema<unknown, unknown, unknown>,
		keyof mini.Schema<unknown, unknown, unknown>
	>;

	// When: comparing what main adds with the names a view reserves
	// Then: they are the same, so a view can shadow no main member
	assertType<IsExact<Added, MainSchemaMember>>(true);
});

Deno.test("Schema.fromMiniView copies a view onto a main Schema, from mini or main", () => {
	// Given: a mini and a main schema, each with a view
	const text = mini.viewed({
		init: { parse: (input: string) => Ok(input) },
		view: { label: "text" },
	});
	const main = Object.assign(
		new Schema({ parse: (input: string) => Ok(input) }),
		{ label: "main" },
	);

	// When: viewing each as main
	const fromMini = Schema.fromMiniView(text);
	const fromMain = Schema.fromMiniView(main);

	// Then: each is a new main Schema over the same params, with the view
	assertEquals(fromMini.label, "text");
	assertEquals(fromMain.label, "main");
	assertEquals(fromMini.parseSync("a").unwrap(), "a");
	assertEquals(fromMain === main, false);
	assertInstanceOf(fromMini, Schema);
	assertInstanceOf(fromMain, Schema);
});

Deno.test("Schema.fromMiniView panics on a subclass, which the copy would lose", () => {
	// Given: an instance of a subclass of the mini Schema
	class Tagged extends mini.Schema<string, string, never> {}
	const tagged = new Tagged({ parse: (input: string) => Ok(input) });

	// When: viewing it as main
	// Then: it panics with a TypeError
	assertThrows(() => Schema.fromMiniView(tagged), TypeError, "subclass");
});

const digits = new Schema({
	parse: (input: string) => {
		return /^\d+$/.test(input) ? Ok(Number(input)) : Err("not digits");
	},
});

Deno.test("parseSync returns enum's main Result, so its methods chain", () => {
	// Given: a schema that accepts digit strings
	// When: parsing a valid and an invalid input and chaining Result methods
	const parsed = digits.parseSync("21");
	const doubled = parsed.map((n) => n * 2).unwrapOr(0);
	const fallback = digits
		.parseSync("abc")
		.map((n) => n * 2)
		.unwrapOr(0);

	// Then: the result is a main Result and each chain ran to its end
	assertInstanceOf(parsed, Result);
	assertEquals(doubled, 42);
	assertEquals(fallback, 0);
});

Deno.test("Schema has exactly the modifier, transform and parsing methods", () => {
	// Given: the main Schema's prototype
	const methods = Object.getOwnPropertyNames(Schema.prototype)
		.filter((name) => name !== "constructor")
		.sort();

	// When: listing its own methods
	// Then: they are the shape modifiers, the transforms, the parsers and the
	// algebra namespace's getter, only
	assertEquals(methods, [
		"andThen",
		"annotate",
		"array",
		"filter",
		"inspect",
		"inspectErr",
		"map",
		"mapErr",
		"nullable",
		"optional",
		"orElse",
		"parse",
		"parseAsync",
		"parseSync",
		"pipe",
		"preprocess",
		"with",
	]);
});

Deno.test("SchemaWith has exactly the algebra methods", () => {
	// Given: the algebra namespace's prototype
	const methods = Object.getOwnPropertyNames(SchemaWith.prototype)
		.filter((name) => name !== "constructor")
		.sort();

	// When: listing its own methods
	// Then: they are or, brand and readonly, only
	assertEquals(methods, ["brand", "or", "readonly"]);
});

Deno.test("union([a, b]).with.or(c) is union([a, b, c])", async () => {
	// Given: a main union extended with .with.or, and the flat union
	const [a, b, c] = [string(), number(), boolean()];
	const extended = union([a, b]).with.or(c);
	const flat = union([a, b, c]);

	// When: both reject a value
	const found = unwrapErr(await extended.parseAsync(null));

	// Then: they fail alike (one InvalidUnion of three branches) and record
	// the same node
	assertEquals(found, unwrapErr(await flat.parseAsync(null)));
	assertEquals(nodeOf(extended), nodeOf(flat));
});

Deno.test(".with's methods return main Schemas that keep chaining", async () => {
	// Given: a chain through each algebra method
	const id = string()
		.with.or(number())
		.with.or(boolean())
		.map(String)
		.with.brand("Id")
		.array()
		.with.readonly();
	// {}

	// When: parsing a valid list and an invalid one
	const parsed = unwrap(id.parseSync(["a", 1, true]));
	const found = unwrapErr(await id.parseAsync([null]));

	// Then: each step returned a main Schema, the output is a frozen array of
	// branded ids, and a failing element is reported at its index
	assertInstanceOf(string().with, SchemaWith);
	assertInstanceOf(id, Schema);
	assertEquals<readonly string[]>(parsed, ["a", "1", "true"]);
	assertEquals(Object.isFrozen(parsed), true);
	const [{ path, error }] = entries(found);
	assertEquals(path, [0]);
	assertEquals(
		isSchemaIssue(error) && formatIssue(error),
		"Invalid input: no union branch matched",
	);
	assertType<IsExact<Output<typeof id>, readonly Branded<string, "Id">[]>>(
		true,
	);
});

Deno.test(".with.or infers the right schema's types", () => {
	// Given: schemas with typed inputs
	const left = new Schema({ parse: (input: { a: string }) => Ok(input.a) });
	const right = new Schema({ parse: (input: { b: number }) => Ok(input.b) });

	// When: or-ing them through the namespace
	const either = left.with.or(right);

	// Then: the input intersects, the output unions, the error is a union's
	assertType<IsExact<Input<typeof either>, { a: string } & { b: number }>>(
		true,
	);
	assertType<IsExact<Output<typeof either>, string | number>>(true);
	assertType<IsExact<ErrorOf<typeof either>, Issues<SchemaIssue>>>(true);
});

Deno.test("SchemaWith is covariant in its output, like the Schema it holds", () => {
	// Given: a namespace of a schema with a narrow output
	const narrow: SchemaWith<unknown, "a", never> = new Schema({
		parse: (_: unknown) => {
			return Ok("a" as const);
		},
	}).with;

	// When: widening it, and narrowing a wide one
	const wide: SchemaWith<unknown, string, unknown> = narrow;
	// @ts-expect-error a string output is not an "a" output
	const narrowed: SchemaWith<unknown, "a", never> = string().with;

	// Then: only the widening type-checks
	assertInstanceOf(wide, SchemaWith);
	assertInstanceOf(narrowed, SchemaWith);
});

Deno.test(".array() parses every element with the receiver, and chains", async () => {
	// Given: an array of digit strings, built by the method
	const all = digits.array();

	// When: parsing a valid array and one with a failing element
	const parsed = unwrap(all.parseSync(["1", "22"]));
	const found = unwrapErr(await all.parseAsync(["1", "x"]));

	// Then: it is a main Schema of arrays, reporting each element at its index
	assertInstanceOf(all, Schema);
	assertEquals(parsed, [1, 22]);
	assertEquals(entries(found), [{ path: [1], error: "not digits" }]);
});

Deno.test(".optional() and .nullable() pass undefined and null through", () => {
	// Given: a number schema that may be missing or null
	const maybe = number({ min: 0 }).optional().nullable();

	// When: parsing undefined, null, a valid and an invalid number
	// Then: the modifiers pass their value through and the rest is checked
	assertEquals(unwrap(maybe.parseSync(undefined)), undefined);
	assertEquals(unwrap(maybe.parseSync(null)), null);
	assertEquals(unwrap(maybe.parseSync(1)), 1);
	assertEquals(
		unwrapErr(maybe.parseSync(-1)),
		ParseError(
			TooSmall({ input: -1, origin: "number", minimum: 0, inclusive: true }),
		),
	);
});

Deno.test("the modifiers' types: arrays, optional values and nullable values", () => {
	// Given: schemas built with the modifier methods, and a key-optional field
	const tags = string().array();
	const user = object({
		shape: {
			name: string(),
			age: number().optional(),
			email: { schema: string(), key: "optional" },
			tags,
		},
	});
	const nickname = string().nullable();

	// When: reading their types
	// Then: .array() maps the element's types, .optional() adds undefined to
	// the value (its key stays required), a key: "optional" entry makes the
	// key optional, and .nullable() adds null to the input and output
	assertType<IsExact<Input<typeof tags>, unknown>>(true);
	assertType<IsExact<Output<typeof tags>, string[]>>(true);
	assertType<IsExact<ErrorOf<typeof tags>, Issues<SchemaIssue>>>(true);
	assertType<
		IsExact<
			Output<typeof user>,
			{ name: string; tags: string[]; age: number | undefined; email?: string }
		>
	>(true);
	assertType<IsExact<Output<typeof nickname>, string | null>>(true);
	assertType<
		IsExact<Input<ReturnType<typeof digits.array>>, readonly string[]>
	>(true);
});

Deno.test("the Result-style transforms chain as methods and take main Results", async () => {
	// Given: digits trimmed first, halved if even, logged, and recovered to -1
	const seen: number[] = [];
	const halved = digits
		.preprocess((input: string) => input.trim())
		.andThen((n) => {
			if (n % 2 === 0) {
				return MainOk<number, "odd">(n / 2);
			}

			return Err<number, "odd">("odd");
		})
		.inspect((n) => {
			seen.push(n);
		})
		.inspectErr(() => {
			seen.push(0);
		})
		.orElse((error) => {
			if (error === "odd") {
				return Promise.resolve(Ok(-1));
			}

			return Promise.resolve(Err(error));
		});
	// {}

	// When: parsing an even, an odd and a non-digit input, in order
	const results = [
		await halved.parseAsync(" 42 "),
		await halved.parseAsync("7"),
		await halved.parseAsync("x"),
	];

	// Then: each method ran in the chain's order and returned a main Schema
	// with the chain's types
	assertEquals(results, [Ok(21), Ok(-1), Err("not digits")]);
	assertEquals(seen, [21, 0, 0]);
	assertType<IsExact<Input<typeof halved>, string>>(true);
	assertType<IsExact<Output<typeof halved>, number>>(true);
	assertType<IsExact<ErrorOf<typeof halved>, string>>(true);
	assertInstanceOf(halved, Schema);
});

Deno.test("each transform method views its receiver, exactly", () => {
	// Given: a schema with a view of its own
	const user = object({ shape: { name: string() } });

	// When: transforming it each way, and piping it
	const name = user.map((value) => value.name);
	const checked = user.inspect(() => {});
	const text = new Schema({
		parse: (input: unknown) => Ok<string, string>(String(input)),
	});
	const piped = text.pipe(digits);

	// Then: .inner is the receiver with its view, and .next the piped schema
	assertEquals(name.inner, user);
	assertEquals(piped.inner, text);
	assertEquals(checked.inner.shape.name.parseSync("a").unwrap(), "a");
	assertEquals(piped.next, digits);
	assertType<IsExact<typeof name.inner, typeof user>>(true);
	assertType<IsExact<typeof checked.inner, typeof user>>(true);
	assertType<IsExact<typeof piped.next, typeof digits>>(true);
	assertType<IsExact<Output<typeof piped>, number>>(true);
});

Deno.test("a transform's view holds the receiver's view, not its own", () => {
	// Given: an object with a view
	const user = object({ shape: { name: string() } });

	// When: mapping it, then making the result optional
	const maybeName = user.map((value) => value.name).optional();

	// Then: the view reaches the object through each step, and no step
	// claims the object's shape as its own
	assertEquals(maybeName.inner.inner.shape.name.parseSync("a").unwrap(), "a");
	// @ts-expect-error a mapped schema's view is .inner, not the receiver's .shape
	assertEquals(user.map((value) => value.name).shape, undefined);
});

Deno.test("a long chain of transforms and modifiers type-checks, keeping every step", () => {
	// Given: a long chain of .map and .optional steps
	const chain = string()
		.map((text) => text.length)
		.optional()
		.map((length) => length ?? 0)
		.optional()
		.map((length) => length ?? 0)
		.optional()
		.map((length) => length ?? 0)
		.optional()
		.map((length) => length ?? 0)
		.optional()
		.map((length) => length ?? 0)
		.optional()
		.map((length) => length ?? 0)
		.optional()
		.map((length) => length ?? 0)
		.optional()
		.map((length) => length ?? 0)
		.optional()
		.map((length) => length ?? 0)
		.optional()
		.map((length) => length ?? 0)
		.optional()
		.map((length) => length ?? 0)
		.optional()
		.map((length) => length ?? 0)
		.optional()
		.map((length) => length ?? 0)
		.optional()
		.map((length) => length ?? 0)
		.optional()
		.map((length) => length ?? 0)
		.optional()
		.map((length) => length ?? 0);
	// {}

	// When: parsing with it, and walking its view back
	const parsed = chain.parseSync("four").unwrap();
	const optionalStep = chain.inner.inner.inner.inner.inner;

	// Then: it parses through every step, and the view reaches back
	assertEquals(parsed, 4);
	assertType<IsExact<Output<typeof chain>, number>>(true);
	assertEquals(optionalStep.parseSync(undefined).unwrap(), undefined);
});

Deno.test(".with keeps the receiver's view: readonly views it, brand keeps it", () => {
	// Given: an object with a view
	const user = object({ shape: { name: string() } });

	// When: making it readonly and branding it through the namespace
	const frozen = user.with.readonly();
	const branded = user.with.brand("User");

	// Then: readonly's .inner is the receiver, and brand keeps its .shape
	assertEquals(frozen.inner, user);
	assertEquals(branded.shape, user.shape);
	assertType<IsExact<typeof frozen.inner, typeof user>>(true);
	assertType<IsExact<typeof branded.shape, typeof user.shape>>(true);
	assertType<
		IsExact<Output<typeof branded>, Branded<{ name: string }, "User">>
	>(true);
	assertEquals(branded.shape.name.parseSync("a").unwrap(), "a");
	assertInstanceOf(frozen, Schema);
	assertInstanceOf(branded, Schema);
});

Deno.test("SchemaWith's Self defaults to the mini Schema, which every receiver widens to", () => {
	// Given: the namespace of an object with a view
	const user = object({ shape: { name: string() } });

	// When: widening it to the namespace of any schema of its types
	const plain: SchemaWith<
		unknown,
		{ name: string },
		Issues<SchemaIssue>
	> = user.with;

	// Then: it type-checks, and its methods drop the view they can't see
	const frozen = plain.readonly();
	assertType<
		IsExact<
			typeof frozen.inner,
			mini.Schema<unknown, { name: string }, Issues<SchemaIssue>>
		>
	>(true);
	assertEquals(frozen.inner, user);
});

Deno.test("brand returns a main subclass instance itself, keeping its members", () => {
	// Given: a user subclass of the main Schema
	class Tagged extends Schema<string, string, never> {
		readonly tag: string = "t";
	}
	const tagged = new Tagged({ parse: (input: string) => Ok(input) });

	// When: branding it through the namespace and the algebra function
	const viaWith = tagged.with.brand("B");
	const viaFunction = brandSchema(tagged, "B");

	// Then: each is the receiver itself, so its subclass and members survive
	assertEquals(viaWith === tagged, true);
	assertEquals(viaFunction === tagged, true);
	assertEquals(viaWith.tag, "t");
	assertEquals(viaWith.parseSync("x").unwrap(), "x");
	assertType<IsExact<Output<typeof viaWith>, Branded<string, "B">>>(true);
	// @ts-expect-error a plain string is not the branded output
	const plain: Schema<string, Branded<string, "B">, never> = tagged;
	assertInstanceOf(plain, Tagged);
});

Deno.test("brand converts a mini receiver to a main Schema with its view", () => {
	// Given: a mini schema with a view
	const labelled = mini.viewed({
		init: { parse: (input: string) => Ok(input) },
		view: { label: "text" },
	});

	// When: branding it with the main algebra function
	const branded = brandSchema(labelled, "Label");

	// Then: it is a main copy over the same params, with the view
	assertEquals(branded.label, "text");
	assertEquals(branded.parseSync("a").unwrap(), "a");
	assertInstanceOf(branded, Schema);
});
