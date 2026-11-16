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
		wraps: [ENUM_RESULT],
		example: [
			'import { assertEquals } from "@std/assert";',
			'import { Err, Ok, unwrap } from "@sekhmet/enum/result/mini";',
			'import { Schema } from "@sekhmet/schema/core";',
			"",
			"const digits = new Schema((input: string) =>",
			'\t/^\\d+$/.test(input) ? Ok(input) : Err("not digits"),',
			");",
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
			},
		],
		example: [
			'import { assertEquals } from "@std/assert";',
			'import { Err, Ok, unwrap } from "@sekhmet/enum/result/mini";',
			'import { InvalidType, Schema } from "@sekhmet/schema/core/mini";',
			'import { fromStandard, toStandard } from "@sekhmet/schema/standard";',
			"",
			"const text = new Schema((input: unknown) =>",
			'\ttypeof input === "string" ? Ok(input) : Err(InvalidType({ input, expected: "string" })),',
			");",
			"const length = fromStandard(toStandard(text)).map((s) => s.length);",
			"",
			'assertEquals(unwrap(length.parseSync("four")), 4);',
		].join("\n"),
	},
	{
		entrypoint: "@sekhmet/schema/composites",
		mini: "packages/schema/src/composites/mini/mod.ts",
		output: "packages/schema/src/composites/main/mod.ts",
		primary: "ObjectSchema",
		construct: "params",
		wraps: [
			{
				type: "Schema",
				from: "../../core/main/mod.ts",
				mappers: SCHEMA_MAPPERS,
			},
		],
		example: [
			'import { assertEquals } from "@std/assert";',
			'import { Ok, unwrap } from "@sekhmet/enum/result/mini";',
			'import { array, object } from "@sekhmet/schema/composites";',
			'import { parseSync } from "@sekhmet/schema/core/mini";',
			'import { Schema } from "@sekhmet/schema/core";',
			"",
			"const text = new Schema((input: unknown) => Ok(String(input)));",
			"const user = object({ name: text, tags: array(text) }).strict();",
			"",
			'assertEquals(unwrap(parseSync(user, { name: "Ada", tags: [] })), {',
			'\tname: "Ada",',
			"\ttags: [],",
			"});",
		].join("\n"),
	},
];
