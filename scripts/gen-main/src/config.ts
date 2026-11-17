/**
 * The declarative description of each generated main entrypoint.
 *
 * @module
 */

/** Another feature's main class that a return type is converted to. */
export interface WrapTarget {
	/** The mini type's name (e.g. `Option`). */
	readonly type: string;
	/** The main module exporting the class, relative to the generated file. */
	readonly from: string;
	/**
	 * The main method mapping each of the type's type arguments, by position
	 * (e.g. `["map", "mapErr"]` for `Result<T, E>`); used to convert a wrap
	 * target nested in a type argument.
	 */
	readonly mappers?: readonly (string | undefined)[];
	/**
	 * Whether the class has a `fromMiniView` static (its feature sets
	 * {@linkcode ClassFeature.views}), so a returned intersection with a
	 * view (`Schema<I, O, E> & ObjectView<S>`) converts through it.
	 */
	readonly views?: boolean;
}

/**
 * How a primary class carries views: own properties holding the children
 * a value was built from (`Schema<I, O, E> & ObjectView<S>`). With it, main
 * gets a `fromMiniView` static that copies a mini value's own properties
 * onto a main one, returned intersections naming the primary convert
 * through it, and two more receiver forms keep the receiver's exact type,
 * rendered `this`: `self: S & Primary<A, B, C>` with
 * `S extends Primary<A, B, C>`, and `self: S` with `S extends` the `any`
 * alias. An options type's extra type parameter constrained to
 * `Primary<A, B, C>` (what a field method's receiver fills) is `this` too.
 */
export interface Views {
	/** The mini alias every value of the primary is assignable to (`AnySchema`). */
	readonly any: string;
}

/** What every generated feature declares, with or without a primary class. */
export interface FeatureBase {
	/** The public entrypoint the main module backs (e.g. `@sekhmet/enum/option`). */
	readonly entrypoint: string;
	/** The mini barrel, relative to the repository root. */
	readonly mini: string;
	/** The generated main module, relative to the repository root. */
	readonly output: string;
	/** Other features' main classes that top-level return types convert to. */
	readonly wraps?: readonly WrapTarget[];
	/** Curried mini functions whose method takes the returned function's parameters. */
	readonly uncurry?: readonly string[];
	/** Mini exports left out of main (e.g. names that clash in a kitchen-sink barrel). */
	readonly omit?: readonly string[];
	/** A runnable example for the module doc (doc-tested). */
	readonly example?: string;
	/**
	 * Mini functions of this feature that return their receiver (first
	 * argument) itself, retyped (`brand`). Main returns a value that is
	 * already main as is, so a subclass instance keeps its identity and
	 * members, and converts only a mini value.
	 */
	readonly identities?: readonly string[];
}

/**
 * A function of another feature's mini barrel that becomes a method of the
 * primary class (or of its namespace class; see {@linkcode Borrow.property}).
 * Without `field`, the function takes the receiver as its first parameter,
 * `self`, and the method takes the rest. With `field`, the function takes
 * one options object whose type passes the primary's type arguments first,
 * in order (`ArrayOptions<I, O, E>` for `Schema<I, O, E>`); the receiver
 * fills that field. The method then takes no arguments, or, with
 * `argument`, one: the value of that other field (`or({ left, right })`
 * is `.or(right)`), whose type parameters past the primary's become the
 * method's own.
 */
export interface BorrowedMethod {
	/** The function's name, which is also the method's. */
	readonly name: string;
	/** The field of the function's options object that the receiver fills. */
	readonly field?: string;
	/**
	 * The field of the function's options object that the method's single
	 * argument fills (only with `field`).
	 */
	readonly argument?: string;
	/**
	 * The method's own docs, in place of the function's: for when the
	 * function's prose or examples talk about parameters the method doesn't
	 * take (`array`'s `item` and length bounds for `.array()`). Required for
	 * a method of a namespace class, whose call sites the function's
	 * examples can't be rewritten to.
	 */
	readonly doc?: MethodDoc;
	/**
	 * Whether the function returns its receiver itself, retyped (`brand`):
	 * the method then returns a receiver that is already main as is (see
	 * {@linkcode FeatureBase.identities}).
	 */
	readonly identity?: boolean;
}

/** A borrowed method's own docs, written for the method form. */
export interface MethodDoc {
	/** The description. */
	readonly description: string;
	/** Each parameter's description (its `@param`), by name. */
	readonly params?: Readonly<Record<string, string>>;
	/** What the method returns (its `@returns`). */
	readonly returns: string;
	/** A runnable example in method form (its `@example`, doc-tested). */
	readonly example: string;
}

/**
 * A getter on the primary class that groups a borrow's methods on a
 * generated namespace class, rather than on the primary itself:
 * `schema.with.or(other)`. The class holds the receiver and is exported
 * from the generated module beside the primary.
 */
export interface NamespaceProperty {
	/** The getter's name on the primary class (e.g. `with`). */
	readonly name: string;
	/** The generated class the getter returns (e.g. `SchemaWith`). */
	readonly className: string;
	/** The getter's docs; the class's are built from them. */
	readonly doc: MethodDoc;
}

/**
 * Methods the primary class takes from another feature's mini barrel: a
 * function that belongs to that feature but reads best chained (a schema's
 * `.optional()`). The generated module imports the barrel as `namespace`.
 */
export interface Borrow {
	/** The other feature's public entrypoint (e.g. `@sekhmet/schema/composites`). */
	readonly entrypoint: string;
	/** The other feature's mini barrel, relative to the repository root. */
	readonly mini: string;
	/** The name the generated module imports the barrel under. */
	readonly namespace: string;
	/** The barrel's functions that become methods. */
	readonly methods: readonly BorrowedMethod[];
	/**
	 * Puts the methods on a namespace class behind a getter instead of on
	 * the primary class.
	 */
	readonly property?: NamespaceProperty;
}

/**
 * A feature whose mini barrel exports a class: main extends it, with each
 * `self`-first function as a method.
 */
export interface ClassFeature extends FeatureBase {
	/** The mini class the main class extends; `self` parameters of this type become `this`. */
	readonly primary: string;
	/**
	 * How the primary class is rebuilt from a mini instance's struct params:
	 * `variant` spreads an Enum's variant tuple into the constructor, `params`
	 * passes a Struct's params through unchanged.
	 */
	readonly construct: "variant" | "params";
	/** The primary's mapper per type argument; see {@linkcode WrapTarget.mappers}. */
	readonly mappers?: readonly (string | undefined)[];
	/** Methods taken from other features' mini barrels. */
	readonly borrows?: readonly Borrow[];
	/** How the primary carries views (only with `construct: "params"`). */
	readonly views?: Views;
}

/**
 * A feature with no class of its own, such as a set of constructors for
 * another feature's class: main re-declares each function whose return
 * names a wrap target so it returns the main class, and re-exports the rest.
 */
export interface FunctionFeature extends FeatureBase {
	/** Absent: the feature has no primary class. */
	readonly primary?: never;
	/** Absent: there is no primary class to rebuild. */
	readonly construct?: never;
	/** Absent: there is no primary class to map. */
	readonly mappers?: never;
	/** Absent: there is no primary class to take methods. */
	readonly borrows?: never;
	/** Absent: there is no primary class to carry views. */
	readonly views?: never;
}

/** One feature whose main entrypoint is generated from its mini barrel. */
export type Feature = ClassFeature | FunctionFeature;

/** Whether a feature has a primary class for main to extend. */
export function isClassFeature(feature: Feature): feature is ClassFeature {
	return feature.primary !== undefined;
}

const OPTION: WrapTarget = {
	type: "Option",
	from: "../../option/main/mod.ts",
	mappers: ["map"],
};
const RESULT: WrapTarget = {
	type: "Result",
	from: "../../result/main/mod.ts",
	mappers: ["map", "mapErr"],
};
/** Enum's main `Result`, imported from another package through its entrypoint. */
const ENUM_RESULT: WrapTarget = {
	type: "Result",
	from: "@sekhmet/enum/result",
	mappers: ["map", "mapErr"],
};
const SCHEMA_MAPPERS: readonly (string | undefined)[] = [
	undefined,
	"map",
	"mapErr",
];

/** `Schema.array()`'s docs: composites' `array` documents `item` and its bounds. */
const ARRAY_METHOD_DOC: MethodDoc = {
	description: [
		"A schema for arrays whose every element this schema accepts. Every",
		"element is parsed, and every failing element is reported at its index;",
		"a non-array fails with an `InvalidType` issue at the root. For length",
		"bounds, use `array({ item, minItems, maxItems })`.",
	].join("\n"),
	returns: "A schema for arrays of this schema's values",
	example: [
		'import { assertEquals } from "@std/assert";',
		'import { unwrap } from "@sekhmet/enum/result/mini";',
		'import { string } from "@sekhmet/schema/primitives";',
		"",
		"const tags = string().array();",
		"",
		'assertEquals(unwrap(tags.parseSync(["a", "b"])), ["a", "b"]);',
	].join("\n"),
};

/** `Schema.optional()`'s docs, written for the receiver. */
const OPTIONAL_METHOD_DOC: MethodDoc = {
	description: [
		"A schema whose value is optional: it also accepts `undefined`, passing",
		"it through without parsing it with this schema. It does not make an",
		"`object` key optional: the key must still be present; declare an",
		'optional key with a field entry, `{ schema, key: "optional" }`.',
	].join("\n"),
	returns: "A schema for this schema's values or `undefined`",
	example: [
		'import { assertEquals } from "@std/assert";',
		'import { isErr, unwrap } from "@sekhmet/enum/result/mini";',
		'import { object } from "@sekhmet/schema/composites";',
		'import { string } from "@sekhmet/schema/primitives";',
		"",
		"const user = object({ shape: { middle: string().optional() } });",
		"",
		"assertEquals(unwrap(user.parseSync({ middle: undefined })), { middle: undefined });",
		"assertEquals(isErr(user.parseSync({})), true);",
	].join("\n"),
};

/** `Schema.nullable()`'s docs, written for the receiver. */
const NULLABLE_METHOD_DOC: MethodDoc = {
	description: [
		"A schema that also accepts `null`, passing it through without parsing",
		"it with this schema.",
	].join("\n"),
	returns: "A schema for this schema's values or `null`",
	example: [
		'import { assertEquals } from "@std/assert";',
		'import { unwrap } from "@sekhmet/enum/result/mini";',
		'import { string } from "@sekhmet/schema/primitives";',
		"",
		"assertEquals(unwrap(string().nullable().parseSync(null)), null);",
	].join("\n"),
};

/** `Schema.with`'s docs: the getter of the algebra namespace. */
const WITH_DOC: MethodDoc = {
	description: [
		"The schema algebra for this schema: `.with.or(other)`,",
		'`.with.brand("Name")` and `.with.readonly()`, each returning a main',
		"`Schema`, so calls keep chaining.",
	].join("\n"),
	returns: "This schema's algebra methods",
	example: [
		'import { assertEquals } from "@std/assert";',
		'import { unwrap } from "@sekhmet/enum/result/mini";',
		'import { number, string } from "@sekhmet/schema/primitives";',
		"",
		"const id = string().with.or(number()).map(String);",
		"",
		'assertEquals(unwrap(id.parseSync(7)), "7");',
	].join("\n"),
};

/** `Schema.with.or()`'s docs, written for the receiver. */
const OR_METHOD_DOC: MethodDoc = {
	description: [
		"A schema that accepts what this schema or `right` accepts: this schema",
		"is tried first, and `right` only when it fails; when both fail, it fails",
		"with one `InvalidUnion` issue at the root. Chains flatten:",
		"`a.with.or(b).with.or(c)` is `union([a, b, c])`, as is",
		"`union([a, b]).with.or(c)`; a union with annotations stays one branch.",
	].join("\n"),
	params: { right: "The schema to try when this one fails" },
	returns: "A schema for what either accepts",
	example: [
		'import { assertEquals } from "@std/assert";',
		'import { unwrap } from "@sekhmet/enum/result/mini";',
		'import { boolean, number, string } from "@sekhmet/schema/primitives";',
		"",
		"const scalar = string().with.or(number()).with.or(boolean());",
		"",
		"assertEquals(unwrap(scalar.parseSync(true)), true);",
	].join("\n"),
};

/** `Schema.with.brand()`'s docs, written for the receiver. */
const BRAND_METHOD_DOC: MethodDoc = {
	description: [
		"This schema with its output branded `name`, a type-only brand: parsing",
		"is the branded type's smart constructor. The output passes through",
		"unchanged at runtime, and the schema is returned itself, so its view",
		"(`.shape`, `.inner`, …) stays on the result.",
	].join("\n"),
	params: { name: "The brand's name" },
	returns:
		"A schema whose output is branded `name`, keeping this schema's view: this schema itself when it is already main",
	example: [
		'import { assertEquals } from "@std/assert";',
		'import { unwrap } from "@sekhmet/enum/result/mini";',
		'import type { Branded } from "@sekhmet/schema/algebra";',
		'import { string } from "@sekhmet/schema/primitives";',
		"",
		'const userId = string({ minLength: 1 }).with.brand("UserId");',
		'const id: Branded<string, "UserId"> = unwrap(userId.parseSync("u1"));',
		"",
		'assertEquals(id, "u1");',
	].join("\n"),
};

/** `Schema.with.readonly()`'s docs, written for the receiver. */
const READONLY_METHOD_DOC: MethodDoc = {
	description: [
		"This schema with its array and plain object outputs replaced by frozen",
		"shallow copies (never the value it produced, which may be the input).",
		"Other values pass through unchanged.",
	].join("\n"),
	returns: "A schema whose array and plain object outputs are frozen copies",
	example: [
		'import { assertEquals } from "@std/assert";',
		'import { unwrap } from "@sekhmet/enum/result/mini";',
		'import { string } from "@sekhmet/schema/primitives";',
		"",
		'const tags = unwrap(string().array().with.readonly().parseSync(["a"]));',
		"",
		"assertEquals(Object.isFrozen(tags), true);",
	].join("\n"),
};

/** Every generated main entrypoint. */
export const FEATURES: readonly Feature[] = [
	{
		entrypoint: "@sekhmet/enum/core",
		mini: "packages/enum/src/core/mini/mod.ts",
		output: "packages/enum/src/core/main/mod.ts",
		primary: "Enum",
		construct: "variant",
		uncurry: ["match"],
		example: [
			'import { assertEquals } from "@std/assert";',
			'import { Enum, type Split } from "@sekhmet/enum/core";',
			"",
			"type Shape = Split<{ Circle: [radius: number]; Square: [side: number] }>;",
			"",
			'const shape = new Enum<Shape>("Square", 3);',
			"const area = shape.match({",
			"\tCircle: (radius) => Math.PI * radius ** 2,",
			"\tSquare: (side) => side ** 2,",
			"});",
			"",
			"assertEquals(area, 9);",
		].join("\n"),
	},
	{
		entrypoint: "@sekhmet/enum/option",
		mini: "packages/enum/src/option/mini/mod.ts",
		output: "packages/enum/src/option/main/mod.ts",
		primary: "Option",
		construct: "variant",
		mappers: ["map"],
		wraps: [RESULT],
		example: [
			'import { Some } from "@sekhmet/enum/option";',
			"",
			"const label = Some(21)",
			"\t.map((n) => n * 2)",
			"\t.filter((n) => n > 40)",
			'\t.mapOr("none", (n) => "got " + n);',
		].join("\n"),
	},
	{
		entrypoint: "@sekhmet/enum/result",
		mini: "packages/enum/src/result/mini/mod.ts",
		output: "packages/enum/src/result/main/mod.ts",
		primary: "Result",
		construct: "variant",
		mappers: ["map", "mapErr"],
		wraps: [OPTION],
		example: [
			'import { assertEquals } from "@std/assert";',
			'import { Err, Ok, type Result } from "@sekhmet/enum/result";',
			"",
			"const parse = (text: string): Result<number, string> =>",
			'\tNumber.isNaN(Number(text)) ? Err("not a number") : Ok(Number(text));',
			"",
			'const doubled = parse("21")',
			"\t.map((n) => n * 2)",
			"\t.ok() // a main Option",
			"\t.unwrapOr(0);",
			"",
			"assertEquals(doubled, 42);",
		].join("\n"),
	},
	{
		entrypoint: "@sekhmet/enum/ordering",
		mini: "packages/enum/src/ordering/mini/mod.ts",
		output: "packages/enum/src/ordering/main/mod.ts",
		primary: "Ordering",
		construct: "variant",
		example: [
			'import { assertEquals } from "@std/assert";',
			'import { compareNumbers, compareStrings } from "@sekhmet/enum/ordering";',
			"",
			"const people = [",
			'\t{ name: "Bea", age: 30 },',
			'\t{ name: "Al", age: 30 },',
			'\t{ name: "Cy", age: 25 },',
			"];",
			"people.sort((a, b) =>",
			"\tcompareNumbers(a.age, b.age)",
			"\t\t.andThen(compareStrings(a.name, b.name))",
			"\t\t.toNumber(),",
			");",
			"",
			'assertEquals(people.map((p) => p.name), ["Cy", "Al", "Bea"]);',
		].join("\n"),
	},
	{
		entrypoint: "@sekhmet/enum/latch",
		mini: "packages/enum/src/latch/mini/mod.ts",
		output: "packages/enum/src/latch/main/mod.ts",
		primary: "Latch",
		construct: "variant",
		mappers: ["map", "mapInactive"],
		wraps: [OPTION, RESULT],
		example: [
			'import { assertEquals } from "@std/assert";',
			'import { Active, type Latch } from "@sekhmet/enum/latch";',
			"",
			'const connection: Latch<string, string> = Active("socket");',
			'connection.deactivate("closed by peer");',
			"",
			"assertEquals(connection.isActive(), false);",
			'assertEquals(connection.inactive().unwrap(), "closed by peer");',
		].join("\n"),
	},
	{
		entrypoint: "@sekhmet/enum/poll",
		mini: "packages/enum/src/poll/mini/mod.ts",
		output: "packages/enum/src/poll/main/mod.ts",
		primary: "Poll",
		construct: "variant",
		mappers: ["map"],
		example: [
			'import { assertEquals } from "@std/assert";',
			'import { Pending, Ready } from "@sekhmet/enum/poll";',
			"",
			"assertEquals(Ready(2).map((n) => n + 1).isReady(), true);",
			"assertEquals(Pending<number>().map((n) => n + 1).isReady(), false);",
		].join("\n"),
	},
	{
		entrypoint: "@sekhmet/effect/effect",
		mini: "packages/effect/src/effect/mini/mod.ts",
		output: "packages/effect/src/effect/main/mod.ts",
		primary: "Effect",
		construct: "params",
		mappers: [undefined, "map", "mapError"],
		example: [
			'import { Success } from "@sekhmet/effect/effect";',
			"",
			"const effect = Success(5)",
			"\t.map((x) => x * 2)",
			'\t.inspect((x) => console.log("value:", x))',
			'\t.mapError((e) => "error: " + e);',
		].join("\n"),
	},
	{
		entrypoint: "@sekhmet/effect/fiber",
		mini: "packages/effect/src/fiber/mini/mod.ts",
		output: "packages/effect/src/fiber/main/mod.ts",
		primary: "Fiber",
		construct: "params",
		wraps: [
			{
				type: "Effect",
				from: "../../effect/main/mod.ts",
				mappers: [undefined, "map", "mapError"],
			},
		],
		// The `@sekhmet/effect` barrel also re-exports effect/main's `Failed`;
		// exporting FiberError's constructors here too would make it ambiguous.
		omit: ["Failed", "Cancelled", "Panicked"],
		example: [
			'import { assertEquals } from "@std/assert";',
			'import { Success } from "@sekhmet/effect/effect";',
			'import { fork } from "@sekhmet/effect/fiber";',
			'import { Runtime } from "@sekhmet/effect/runtime";',
			'import { Scheduler, sync } from "@sekhmet/effect/scheduler";',
			'import { Ok } from "@sekhmet/enum/result/mini";',
			"",
			"const runtime = new Runtime({",
			"\tinput: undefined,",
			"\tconfig: { scheduler: new Scheduler({ schedule: sync() }) },",
			"});",
			"",
			"const results: unknown[] = [];",
			"fork(runtime, Success(21).map((n) => n * 2)).join((result) =>",
			"\tresults.push(result),",
			");",
			"",
			"assertEquals(results, [Ok(42)]);",
		].join("\n"),
	},
	{
		entrypoint: "@sekhmet/schema/core",
		mini: "packages/schema/src/core/mini/mod.ts",
		output: "packages/schema/src/core/main/mod.ts",
		primary: "Schema",
		construct: "params",
		mappers: SCHEMA_MAPPERS,
		views: { any: "AnySchema" },
		wraps: [ENUM_RESULT],
		// The shape modifiers belong to composites but read best chained.
		borrows: [
			{
				entrypoint: "@sekhmet/schema/composites",
				mini: "packages/schema/src/composites/mini/mod.ts",
				namespace: "composites",
				methods: [
					{ name: "array", field: "item", doc: ARRAY_METHOD_DOC },
					{ name: "optional", doc: OPTIONAL_METHOD_DOC },
					{ name: "nullable", doc: NULLABLE_METHOD_DOC },
				],
			},
			// The algebra reads best chained too, but on a namespace of its own.
			{
				entrypoint: "@sekhmet/schema/algebra",
				mini: "packages/schema/src/algebra/mini/mod.ts",
				namespace: "algebra",
				property: { name: "with", className: "SchemaWith", doc: WITH_DOC },
				methods: [
					{
						name: "or",
						field: "left",
						argument: "right",
						doc: OR_METHOD_DOC,
					},
					{ name: "brand", doc: BRAND_METHOD_DOC, identity: true },
					{ name: "readonly", doc: READONLY_METHOD_DOC },
				],
			},
		],
		example: [
			'import { assertEquals } from "@std/assert";',
			'import { Err, Ok, unwrap } from "@sekhmet/enum/result/mini";',
			'import { Schema } from "@sekhmet/schema/core";',
			"",
			"const digits = new Schema({",
			"\tparse: (input: string) => {",
			'\t\treturn /^\\d+$/.test(input) ? Ok(input) : Err("not digits");',
			"\t},",
			"});",
			"const doubled = digits.map(Number).map((n) => n * 2);",
			"",
			'assertEquals(unwrap(doubled.parseSync("21")), 42);',
		].join("\n"),
	},
	{
		entrypoint: "@sekhmet/schema/primitives",
		mini: "packages/schema/src/primitives/mini/mod.ts",
		output: "packages/schema/src/primitives/main/mod.ts",
		wraps: [
			{
				type: "Schema",
				from: "../../core/main/mod.ts",
				mappers: SCHEMA_MAPPERS,
				views: true,
			},
		],
		example: [
			'import { assertEquals } from "@std/assert";',
			'import { unwrap } from "@sekhmet/enum/result/mini";',
			'import { string } from "@sekhmet/schema/primitives";',
			"",
			"const length = string().map((text) => text.length);",
			"",
			'assertEquals(unwrap(length.parseSync("four")), 4);',
		].join("\n"),
	},
	{
		entrypoint: "@sekhmet/schema/standard",
		mini: "packages/schema/src/standard/mini/mod.ts",
		output: "packages/schema/src/standard/main/mod.ts",
		wraps: [
			{
				type: "Schema",
				from: "../../core/main/mod.ts",
				mappers: SCHEMA_MAPPERS,
				views: true,
			},
		],
		example: [
			'import { assertEquals } from "@std/assert";',
			'import { Err, Ok, unwrap } from "@sekhmet/enum/result/mini";',
			'import { InvalidType, Schema } from "@sekhmet/schema/core/mini";',
			'import { fromStandard, toStandard } from "@sekhmet/schema/standard";',
			"",
			"const text = new Schema({",
			"\tparse: (input: unknown) => {",
			'\t\tif (typeof input === "string") return Ok(input);',
			"",
			'\t\treturn Err(InvalidType({ input, expected: "string" }));',
			"\t},",
			"});",
			"const length = fromStandard(toStandard({ schema: text })).map((s) => s.length);",
			"",
			'assertEquals(unwrap(length.parseSync("four")), 4);',
		].join("\n"),
	},
	{
		entrypoint: "@sekhmet/schema/composites",
		mini: "packages/schema/src/composites/mini/mod.ts",
		output: "packages/schema/src/composites/main/mod.ts",
		wraps: [
			{
				type: "Schema",
				from: "../../core/main/mod.ts",
				mappers: SCHEMA_MAPPERS,
				views: true,
			},
		],
		example: [
			'import { assertEquals } from "@std/assert";',
			'import { unwrap } from "@sekhmet/enum/result/mini";',
			'import { object } from "@sekhmet/schema/composites";',
			'import { number, string } from "@sekhmet/schema/primitives";',
			"",
			"const user = object({",
			"\tshape: {",
			"\t\tname: string({ minLength: 1 }),",
			'\t\tage: { schema: number({ int: true, min: 0 }), key: "optional" },',
			"\t\tnickname: string().optional(),",
			"\t\ttags: string().array(),",
			"\t},",
			'\tunknownKeys: "strict",',
			"});",
			"",
			'const input = { name: "Ada", nickname: undefined, tags: [] };',
			"assertEquals(unwrap(user.parseSync(input)), input);",
		].join("\n"),
	},
	{
		entrypoint: "@sekhmet/schema/algebra",
		mini: "packages/schema/src/algebra/mini/mod.ts",
		output: "packages/schema/src/algebra/main/mod.ts",
		identities: ["brand"],
		wraps: [
			{
				type: "Schema",
				from: "../../core/main/mod.ts",
				mappers: SCHEMA_MAPPERS,
				views: true,
			},
		],
		example: [
			'import { assertEquals } from "@std/assert";',
			'import { unwrap } from "@sekhmet/enum/result/mini";',
			'import { or } from "@sekhmet/schema/algebra";',
			'import { number, string } from "@sekhmet/schema/primitives";',
			"",
			"const id = or({ left: string(), right: number() }).map(String);",
			"",
			'assertEquals(unwrap(id.parseSync(7)), "7");',
		].join("\n"),
	},
];
