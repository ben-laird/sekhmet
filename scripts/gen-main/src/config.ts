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

/** One feature whose main entrypoint is generated from its mini barrel. */
export interface Feature {
	/** The public entrypoint the main module backs (e.g. `@sekhmet/enum/option`). */
	readonly entrypoint: string;
	/** The mini barrel, relative to the repository root. */
	readonly mini: string;
	/** The generated main module, relative to the repository root. */
	readonly output: string;
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
	/** Other features' main classes that top-level return types convert to. */
	readonly wraps?: readonly WrapTarget[];
	/** Curried mini functions whose method takes the returned function's parameters. */
	readonly uncurry?: readonly string[];
	/** Mini exports left out of main (e.g. names that clash in a kitchen-sink barrel). */
	readonly omit?: readonly string[];
	/** A runnable example for the module doc (doc-tested). */
	readonly example?: string;
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

/** Every generated main entrypoint. */
export const FEATURES: readonly Feature[] = [
	{
		entrypoint: "@sekhmet/enum/core",
		mini: "packages/enum/src/core/mini/mod.ts",
		output: "packages/enum/src/core/main/mod.ts",
		primary: "Enum",
		construct: "variant",
		uncurry: ["match"],
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
	},
	{
		entrypoint: "@sekhmet/enum/ordering",
		mini: "packages/enum/src/ordering/mini/mod.ts",
		output: "packages/enum/src/ordering/main/mod.ts",
		primary: "Ordering",
		construct: "variant",
	},
	{
		entrypoint: "@sekhmet/enum/latch",
		mini: "packages/enum/src/latch/mini/mod.ts",
		output: "packages/enum/src/latch/main/mod.ts",
		primary: "Latch",
		construct: "variant",
		mappers: ["map", "mapInactive"],
		wraps: [OPTION, RESULT],
	},
	{
		entrypoint: "@sekhmet/enum/poll",
		mini: "packages/enum/src/poll/mini/mod.ts",
		output: "packages/enum/src/poll/main/mod.ts",
		primary: "Poll",
		construct: "variant",
		mappers: ["map"],
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
	},
];
