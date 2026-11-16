import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import type { Feature } from "./config.ts";
import { moduleScopeValueUses } from "./cycle.ts";
import type {
	DocSymbol,
	FunctionDeclaration,
	JsDoc,
	Param,
	TypeNode,
	TypeParam,
} from "./doc.ts";
import { GENERATED_HEADER, generateMain } from "./generate.ts";

const MINI_DIR = "file:///repo/pkg/src/box/mini/";
const CORE = `${MINI_DIR}core.ts`;
const OPS = `${MINI_DIR}ops.ts`;
const MINI_URL = `${MINI_DIR}mod.ts`;
const OUTPUT_URL = "file:///repo/pkg/src/box/main/mod.ts";

const FEATURE: Feature = {
	entrypoint: "@pkg/box",
	mini: "pkg/src/box/mini/mod.ts",
	output: "pkg/src/box/main/mod.ts",
	primary: "Box",
	construct: "variant",
};

const typeParam = (name: string): TypeNode => ({
	kind: "ref",
	name,
	args: [],
	resolution: { kind: "typeParam" },
});

const named = (name: string, args: TypeNode[] = []): TypeNode => ({
	kind: "ref",
	name,
	args,
	resolution: { kind: "import", specifier: "./core.ts", name },
});

const keyword = (name: string): TypeNode => ({
	kind: "keyword",
	keyword: name,
});

const param = (name: string, type: TypeNode): Param => ({
	kind: "identifier",
	name,
	optional: false,
	type,
});

const declare = (name: string): TypeParam => ({
	name,
	constraint: undefined,
	default: undefined,
});

function signature({
	typeParams = [],
	params,
	returnType,
	jsDoc,
}: {
	typeParams?: string[];
	params: Param[];
	returnType: TypeNode | undefined;
	jsDoc?: JsDoc;
}): FunctionDeclaration {
	return {
		kind: "function",
		location: { filename: OPS, byteIndex: 0 },
		jsDoc,
		typeParams: typeParams.map(declare),
		params,
		returnType,
		hasBody: false,
	};
}

const fn = (
	name: string,
	...declarations: FunctionDeclaration[]
): DocSymbol => ({
	name,
	declarations,
});

const BOX_CLASS: DocSymbol = {
	name: "Box",
	declarations: [
		{
			kind: "class",
			location: { filename: CORE, byteIndex: 0 },
			jsDoc: { doc: "A box.", tags: [] },
			typeParams: [declare("T")],
		},
	],
};

const SOURCES: ReadonlyMap<string, string> = new Map([
	[CORE, "export class Box<out T> extends Enum<V<T>> {}"],
	[OPS, "export function f() {}"],
]);

function generate(
	symbols: DocSymbol[],
	feature: Feature = FEATURE,
): ReturnType<typeof generateMain> {
	return generateMain({
		feature,
		symbols: [BOX_CLASS, ...symbols],
		sources: SOURCES,
		miniUrl: MINI_URL,
		outputUrl: OUTPUT_URL,
	});
}

function source(symbols: DocSymbol[], feature: Feature = FEATURE): string {
	const result = generate(symbols, feature);
	if (!result.ok) throw new Error(result.error.message);
	return result.value;
}

const selfBox = (arg = "A"): Param =>
	param("self", named("Box", [typeParam(arg)]));

Deno.test("generateMain emits the header, mini import and class extending mini", () => {
	// Given: a mini barrel exporting only the primary class
	const symbols: DocSymbol[] = [];

	// When: generating its main module
	const output = source(symbols);

	// Then: the file is marked generated and the class extends mini, keeping variance
	assert(output.startsWith(`${GENERATED_HEADER}\n`));
	assertStringIncludes(output, 'import * as mini from "../mini/mod.ts";');
	assertStringIncludes(output, "export class Box<out T> extends mini.Box<T> {");
	assertStringIncludes(
		output,
		"static fromMini<T>(self: mini.Box<T>): Box<T> {",
	);
	assertStringIncludes(
		output,
		"const view = new Box<T>(...params.variant);\n\t\tview[struct] = params;",
	);
});

Deno.test("generateMain rebuilds Struct-based classes from their params", () => {
	// Given: a feature whose primary is a plain Struct
	const feature: Feature = { ...FEATURE, construct: "params" };

	// When: generating its main module
	const output = source([], feature);

	// Then: fromMini passes the struct params through unchanged
	assertStringIncludes(output, "return new Box(getStructParams(self));");
});

Deno.test("generateMain wraps a class-less feature's functions in the wrap target", () => {
	// Given: a feature with no primary class whose constructor returns a Bag wrap target
	const feature: Feature = {
		entrypoint: "@pkg/bags",
		mini: "pkg/src/bags/mini/mod.ts",
		output: "pkg/src/bags/main/mod.ts",
		wraps: [{ type: "Bag", from: "../../bag/main/mod.ts" }],
	};
	const bag = named("Bag", [keyword("string")]);
	const words = fn(
		"words",
		signature({ params: [param("text", keyword("string"))], returnType: bag }),
	);
	const count = fn(
		"count",
		signature({ params: [], returnType: keyword("number") }),
	);

	// When: generating from a barrel that exports no class
	const result = generateMain({
		feature,
		symbols: [words, count],
		sources: SOURCES,
		miniUrl: "file:///repo/pkg/src/bags/mini/mod.ts",
		outputUrl: "file:///repo/pkg/src/bags/main/mod.ts",
	});

	// Then: there is no class; the constructor returns the main Bag and the rest is re-exported
	assert(result.ok);
	const output = result.value;
	assert(!output.includes("export class"));
	assert(!output.includes("@sekhmet/primordials/struct"));
	assertStringIncludes(output, 'import { Bag } from "../../bag/main/mod.ts";');
	assertStringIncludes(
		output,
		"export function words(text: string): Bag<string> {\n\treturn Bag.fromMini(mini.words(text));",
	);
	assertStringIncludes(output, 'export { count } from "../mini/mod.ts";');
	assertStringIncludes(
		output,
		"Functions whose mini form (`@pkg/bags/mini`) returns `Bag` return the main class instead",
	);
});

Deno.test("generateMain re-exports a class-less feature's self-first functions", () => {
	// Given: a feature with no primary class and a function whose first parameter is self
	const feature: Feature = {
		entrypoint: "@pkg/bags",
		mini: "pkg/src/bags/mini/mod.ts",
		output: "pkg/src/bags/main/mod.ts",
	};
	const size = fn(
		"size",
		signature({
			typeParams: ["T"],
			params: [selfBox("T")],
			returnType: keyword("number"),
		}),
	);

	// When: generating
	const result = generateMain({
		feature,
		symbols: [size],
		sources: SOURCES,
		miniUrl: "file:///repo/pkg/src/bags/mini/mod.ts",
		outputUrl: "file:///repo/pkg/src/bags/main/mod.ts",
	});

	// Then: with no class to attach it to, it is re-exported unchanged
	assert(result.ok);
	assertStringIncludes(result.value, 'export { size } from "../mini/mod.ts";');
});

Deno.test("generateMain turns self-first functions into methods with this", () => {
	// Given: map(self: Box<A>, f: (a: A) => B): Box<B>, where A is Box's T
	const map = fn(
		"map",
		signature({
			typeParams: ["A", "B"],
			params: [
				selfBox(),
				param("f", {
					kind: "function",
					constructor: false,
					typeParams: [],
					params: [param("a", typeParam("A"))],
					returnType: typeParam("B"),
				}),
			],
			returnType: named("Box", [typeParam("B")]),
		}),
	);

	// When: generating
	const output = source([map]);

	// Then: A is renamed to the class's T, B stays a method type parameter,
	// and the result is converted to the main class
	assertStringIncludes(output, "map<B>(f: (a: T) => B): Box<B> {");
	assertStringIncludes(output, "return Box.fromMini(mini.map(this, f));");
});

Deno.test("generateMain rewrites self predicates and assertions to this", () => {
	// Given: a type guard and an assertion on self
	const isFull = fn(
		"isFull",
		signature({
			typeParams: ["T"],
			params: [selfBox("T")],
			returnType: {
				kind: "predicate",
				asserts: false,
				subject: "self",
				type: named("Box", [keyword("never")]),
			},
		}),
	);
	const assertFull = fn(
		"assertFull",
		signature({
			typeParams: ["T"],
			params: [selfBox("T")],
			returnType: {
				kind: "predicate",
				asserts: true,
				subject: "self",
				type: named("Box", [typeParam("T")]),
			},
		}),
	);

	// When: generating
	const output = source([isFull, assertFull]);

	// Then: predicates target this and name the main class; assertions don't return
	assertStringIncludes(output, "isFull(): this is Box<never> {");
	assertStringIncludes(output, "return mini.isFull(this);");
	assertStringIncludes(output, "assertFull(): asserts this is Box<T> {");
	assertStringIncludes(output, "\t\tmini.assertFull(this);\n");
});

Deno.test("generateMain names the main class in each member of an intersection predicate", () => {
	// Given: a guard narrowing self to a variant and to the primary at once
	const isEmpty = fn(
		"isEmpty",
		signature({
			typeParams: ["T"],
			params: [selfBox("T")],
			returnType: {
				kind: "predicate",
				asserts: false,
				subject: "self",
				type: {
					kind: "intersection",
					types: [
						named("Enum", [typeParam("T")]),
						named("Box", [keyword("never")]),
					],
				},
			},
		}),
	);

	// When: generating
	const output = source([isEmpty]);

	// Then: the primary member is the main class, and the rest keep their spelling
	assertStringIncludes(output, "isEmpty(): this is Enum<T> & Box<never> {");
});

Deno.test("generateMain does not return from void methods", () => {
	// Given: a void self-first function
	const clear = fn(
		"clear",
		signature({
			typeParams: ["T"],
			params: [selfBox("T")],
			returnType: keyword("void"),
		}),
	);

	// When: generating
	const output = source([clear]);

	// Then: the body is a bare call
	assertStringIncludes(output, "clear(): void {\n\t\tmini.clear(this);\n\t}");
});

Deno.test("generateMain re-yields generators of the primary lazily as main", () => {
	// Given: a function returning a Generator of the primary
	const iter = fn(
		"iter",
		signature({
			typeParams: ["T"],
			params: [selfBox("T")],
			returnType: {
				kind: "ref",
				name: "Generator",
				args: [named("Box", [typeParam("T")]), keyword("void")],
				resolution: { kind: "global" },
			},
		}),
	);

	// When: generating
	const output = source([iter]);

	// Then: the method is a generator converting each yielded value
	assertStringIncludes(output, "*iter(): Generator<Box<T>, void> {");
	assertStringIncludes(
		output,
		"for (const item of mini.iter(this)) {\n\t\t\tyield Box.fromMini(item);\n\t\t}",
	);
});

Deno.test("generateMain converts primary types in returned tuples", () => {
	// Given: a free function returning a labeled-free tuple of Boxes
	const split = fn(
		"split",
		signature({
			typeParams: ["T"],
			params: [param("pair", named("Box", [typeParam("T")]))],
			returnType: {
				kind: "tuple",
				elements: [named("Box", [typeParam("T")]), keyword("number")],
			},
		}),
	);

	// When: generating
	const output = source([split]);

	// Then: the Box element converts and the other passes through
	assertStringIncludes(
		output,
		"export function split<T>(pair: mini.Box<T>): [Box<T>, number] {",
	);
	assertStringIncludes(
		output,
		"const [element0, element1] = mini.split(pair);",
	);
	assertStringIncludes(output, "return [Box.fromMini(element0), element1];");
});

Deno.test("generateMain converts wrap targets nested in type arguments through mappers", () => {
	// Given: Box<Box<T>> returned by a method, with Box's mapper declared
	const nest = fn(
		"nest",
		signature({
			typeParams: ["T"],
			params: [selfBox("T")],
			returnType: named("Box", [named("Box", [typeParam("T")])]),
		}),
	);

	// When: generating with and without the mapper
	const output = source([nest], { ...FEATURE, mappers: ["map"] });
	const missing = generate([nest]);

	// Then: the inner Box converts through the outer's map, or generation explains what's missing
	assertStringIncludes(output, "nest(): Box<Box<T>> {");
	assertStringIncludes(
		output,
		"return Box.fromMini(mini.nest(this)).map((value0) => Box.fromMini(value0));",
	);
	assert(!missing.ok);
	assertStringIncludes(missing.error.message, "no mapper");
});

Deno.test("generateMain forwards overloads through one implementation", () => {
	// Given: an overloaded self-first function
	const fold = fn(
		"fold",
		signature({
			typeParams: ["T", "U"],
			params: [selfBox("T"), param("init", typeParam("U"))],
			returnType: typeParam("U"),
		}),
		signature({
			typeParams: ["T", "U"],
			params: [
				selfBox("T"),
				{
					kind: "rest",
					name: "args",
					type: { kind: "tuple", elements: [typeParam("U")] },
				},
			],
			returnType: typeParam("U"),
		}),
		{
			...signature({ params: [], returnType: keyword("unknown") }),
			hasBody: true,
		},
	);

	// When: generating
	const output = source([fold]);

	// Then: each overload is a method signature and the implementation forwards everything
	assertStringIncludes(output, "fold<U>(init: U): U;");
	assertStringIncludes(output, "fold<U>(...args: [U]): U;");
	assertStringIncludes(output, "fold(...args: unknown[]): unknown {");
	assertStringIncludes(
		output,
		"return Reflect.apply(mini.fold, undefined, [this, ...args]);",
	);
});

Deno.test("generateMain uncurries configured curried functions", () => {
	// Given: match(self) => <U>(arms: Arms<T, U>) => U, configured to uncurry
	const match = fn(
		"match",
		signature({
			typeParams: ["T"],
			params: [selfBox("T")],
			returnType: {
				kind: "function",
				constructor: false,
				typeParams: [declare("U")],
				params: [
					param("arms", named("Arms", [typeParam("T"), typeParam("U")])),
				],
				returnType: typeParam("U"),
			},
		}),
	);
	const arms: DocSymbol = {
		name: "Arms",
		declarations: [{ kind: "other", typeOnly: true }],
	};

	// When: generating with match uncurried
	const output = source([match, arms], { ...FEATURE, uncurry: ["match"] });

	// Then: the method takes the returned function's parameters directly
	assertStringIncludes(output, "match<U>(arms: mini.Arms<T, U>): U {");
	assertStringIncludes(output, "return mini.match(this)(arms);");
});

Deno.test("generateMain wraps non-self functions that return the primary", () => {
	// Given: a constructor and a plain helper
	const full = fn(
		"Full",
		signature({
			typeParams: ["T"],
			params: [param("value", typeParam("T"))],
			returnType: named("Box", [typeParam("T")]),
		}),
	);
	const size = fn(
		"size",
		signature({
			params: [param("n", keyword("number"))],
			returnType: keyword("number"),
		}),
	);

	// When: generating
	const output = source([full, size]);

	// Then: the constructor returns the main class; the helper is re-exported as-is
	assertStringIncludes(output, "export function Full<T>(value: T): Box<T> {");
	assertStringIncludes(output, "return Box.fromMini(mini.Full(value));");
	assertStringIncludes(output, 'export { size } from "../mini/mod.ts";');
});

Deno.test("generateMain converts configured wrap targets and aliases clashing imports", () => {
	// Given: a Bag wrap target, a method returning Bag, and one taking a mini Bag
	const feature: Feature = {
		...FEATURE,
		wraps: [{ type: "Bag", from: "../../bag/main/mod.ts" }],
	};
	const bag = (arg: string): TypeNode => ({
		kind: "ref",
		name: "Bag",
		args: [typeParam(arg)],
		resolution: {
			kind: "import",
			specifier: "../../bag/mini/core.ts",
			name: "Bag",
		},
	});
	const toBag = fn(
		"toBag",
		signature({
			typeParams: ["T"],
			params: [selfBox("T")],
			returnType: bag("T"),
		}),
	);
	const fill = fn(
		"fill",
		signature({
			typeParams: ["T"],
			params: [selfBox("T"), param("from", bag("T"))],
			returnType: keyword("void"),
		}),
	);

	// When: generating
	const output = source([toBag, fill], feature);

	// Then: the return converts to the main Bag, and the parameter keeps the mini Bag under an alias
	assertStringIncludes(output, 'import { Bag } from "../../bag/main/mod.ts";');
	assertStringIncludes(
		output,
		'import type { Bag as MiniBag } from "../../bag/mini/core.ts";',
	);
	assertStringIncludes(
		output,
		"toBag(): Bag<T> {\n\t\treturn Bag.fromMini(mini.toBag(this));",
	);
	assertStringIncludes(output, "fill(from: MiniBag<T>): void {");
});

Deno.test("generateMain re-exports the rest of mini and honours omit", () => {
	// Given: a type, a value and an omitted value
	const variants: DocSymbol = {
		name: "BoxVariants",
		declarations: [{ kind: "other", typeOnly: true }],
	};
	const helper = fn(
		"helper",
		signature({ params: [], returnType: keyword("number") }),
	);
	const clash = fn(
		"Clash",
		signature({ params: [], returnType: keyword("number") }),
	);

	// When: generating with Clash omitted
	const output = source([variants, helper, clash], {
		...FEATURE,
		omit: ["Clash"],
	});

	// Then: types and values are re-exported separately, without the omitted name
	assertStringIncludes(
		output,
		'export type { BoxVariants } from "../mini/mod.ts";',
	);
	assertStringIncludes(output, 'export { helper } from "../mini/mod.ts";');
	assertEquals(output.includes("Clash"), false);
});

Deno.test("generateMain rewrites examples and drops self docs", () => {
	// Given: a documented self-first function
	const jsDoc: JsDoc = {
		doc: "Gets the value.",
		tags: [
			{ kind: "template", name: "T", doc: "The value type" },
			{ kind: "param", name: "self", doc: "The box" },
			{ kind: "return", doc: "The value" },
			{ kind: "example", doc: "```ts ignore\nget(Full(1)); // 1\n```" },
		],
	};
	const get = fn(
		"get",
		signature({
			typeParams: ["T"],
			params: [selfBox("T")],
			returnType: typeParam("T"),
			jsDoc,
		}),
	);

	// When: generating
	const output = source([get]);

	// Then: the doc loses @param self and the class's @template, and the example is in method form
	assertStringIncludes(output, "Full(1).get(); // 1");
	assertStringIncludes(output, "@returns The value");
	assertStringIncludes(output, "@see {@link mini.get}");
	assertEquals(output.includes("The box"), false);
	assertEquals(output.includes("The value type"), false);
});

Deno.test("generateMain points example imports at the main entrypoint", () => {
	// Given: a method and a constructor whose examples import from mini
	const example = (code: string): JsDoc => ({
		doc: "",
		tags: [{ kind: "example", doc: `\`\`\`ts\n${code}\n\`\`\`` }],
	});
	const get = fn(
		"get",
		signature({
			typeParams: ["T"],
			params: [selfBox("T")],
			returnType: typeParam("T"),
			jsDoc: example(
				'import { Full, get } from "@pkg/box/mini";\n\nget(Full(1));',
			),
		}),
	);
	const full = fn(
		"Full",
		signature({
			typeParams: ["T"],
			params: [param("value", typeParam("T"))],
			returnType: named("Box", [typeParam("T")]),
			jsDoc: example(
				'import { Full, get } from "@pkg/box/mini/core";\n\nget(Full(1));',
			),
		}),
	);

	// When: generating
	const output = source([get, full]);

	// Then: both import from main, drop the method's import and call it as a method
	assertStringIncludes(
		output,
		'\t * import { Full } from "@pkg/box";\n\t *\n\t * Full(1).get();',
	);
	assertStringIncludes(
		output,
		' * import { Full } from "@pkg/box";\n *\n * Full(1).get();\n',
	);
	assertEquals(output.includes('from "@pkg/box/mini'), false);
});

Deno.test("generateMain rejects a method type parameter that shadows the class's", () => {
	// Given: self typed Box<A> with an extra type parameter named T
	const bad = fn(
		"bad",
		signature({
			typeParams: ["A", "T"],
			params: [selfBox("A")],
			returnType: typeParam("T"),
		}),
	);

	// When: generating
	const result = generate([bad]);

	// Then: generation fails, naming the symbol
	assert(!result.ok);
	assertEquals(result.error.symbol, "bad");
	assertStringIncludes(result.error.message, "shadows");
});

Deno.test("generateMain rejects overloads that disagree on self", () => {
	// Given: one overload with self and one without
	const mixed = fn(
		"mixed",
		signature({
			typeParams: ["T"],
			params: [selfBox("T")],
			returnType: keyword("void"),
		}),
		signature({ params: [], returnType: keyword("void") }),
	);

	// When: generating
	const result = generate([mixed]);

	// Then: generation fails
	assert(!result.ok);
	assertEquals(result.error.symbol, "mixed");
});

Deno.test("generateMain requires the primary class", () => {
	// Given: a barrel without the primary class
	const input = {
		feature: FEATURE,
		symbols: [],
		sources: SOURCES,
		miniUrl: MINI_URL,
		outputUrl: OUTPUT_URL,
	};

	// When: generating
	const result = generateMain(input);

	// Then: generation fails, naming the primary
	assert(!result.ok);
	assertEquals(result.error.symbol, "Box");
});

function rejection(
	symbols: DocSymbol[],
	feature: Feature = FEATURE,
): {
	symbol: string | undefined;
	message: string;
} {
	const result = generate(symbols, feature);
	if (result.ok) throw new Error("expected generation to fail");
	return { symbol: result.error.symbol, message: result.error.message };
}

const isBox = (arg: TypeNode): TypeNode => ({
	kind: "predicate",
	asserts: false,
	subject: "self",
	type: named("Box", [arg]),
});

Deno.test("generateMain rejects self that omits the class's type arguments", () => {
	// Given: self typed as a bare Box although Box takes T
	const bare = fn(
		"bare",
		signature({
			params: [param("self", named("Box"))],
			returnType: keyword("void"),
		}),
	);

	// When: generating
	const error = rejection([bare]);

	// Then: generation fails on the arity
	assertEquals(error.symbol, "bare");
	assertStringIncludes(error.message, "must pass all 1");
});

Deno.test("generateMain rejects self type arguments that aren't the function's type parameters", () => {
	// Given: self typed Box<number>
	const fixed = fn(
		"fixed",
		signature({
			params: [param("self", named("Box", [keyword("number")]))],
			returnType: keyword("void"),
		}),
	);

	// When: generating
	const error = rejection([fixed]);

	// Then: generation fails, asking for distinct type parameters
	assertEquals(error.symbol, "fixed");
	assertStringIncludes(error.message, "distinct type parameters");
});

Deno.test("generateMain rejects a method without a return type", () => {
	// Given: a self-first function with no annotated return type
	const untyped = fn(
		"untyped",
		signature({
			typeParams: ["T"],
			params: [selfBox("T")],
			returnType: undefined,
		}),
	);

	// When: generating
	const error = rejection([untyped]);

	// Then: generation fails on the missing annotation
	assertEquals(error, {
		symbol: "untyped",
		message: "the return type must be annotated",
	});
});

Deno.test("generateMain rejects uncurrying a function that doesn't return a function", () => {
	// Given: a configured uncurry target that returns a plain value
	const flat = fn(
		"flat",
		signature({
			typeParams: ["T"],
			params: [selfBox("T")],
			returnType: typeParam("T"),
		}),
	);

	// When: generating with it uncurried
	const error = rejection([flat], { ...FEATURE, uncurry: ["flat"] });

	// Then: generation fails
	assertEquals(error.symbol, "flat");
	assertStringIncludes(error.message, "uncurried");
});

Deno.test("generateMain rejects overloads that disagree on returning the primary", () => {
	// Given: one overload returning Box and one returning a number
	const split = fn(
		"split",
		signature({
			typeParams: ["T"],
			params: [selfBox("T")],
			returnType: named("Box", [typeParam("T")]),
		}),
		signature({
			typeParams: ["T"],
			params: [selfBox("T"), param("n", keyword("number"))],
			returnType: keyword("number"),
		}),
	);

	// When: generating
	const error = rejection([split]);

	// Then: generation fails
	assertEquals(error.symbol, "split");
	assertStringIncludes(error.message, "overloads must agree");
});

Deno.test("generateMain rejects overloaded type predicates", () => {
	// Given: two overloaded type guards on self
	const guard = fn(
		"guard",
		signature({
			typeParams: ["T"],
			params: [selfBox("T")],
			returnType: isBox(keyword("never")),
		}),
		signature({
			typeParams: ["T"],
			params: [selfBox("T"), param("strict", keyword("boolean"))],
			returnType: isBox(keyword("never")),
		}),
	);

	// When: generating
	const error = rejection([guard]);

	// Then: generation fails
	assertEquals(error, {
		symbol: "guard",
		message: "overloaded type predicates are not supported",
	});
});

Deno.test("generateMain uses wrap targets only inside bodies", () => {
	// Given: a feature converting to another feature's main class, by method and by wrapper
	const feature: Feature = {
		...FEATURE,
		wraps: [{ type: "Bag", from: "../../bag/main/mod.ts" }],
	};
	const bag: TypeNode = {
		kind: "ref",
		name: "Bag",
		args: [],
		resolution: {
			kind: "import",
			specifier: "../../bag/mini/core.ts",
			name: "Bag",
		},
	};
	const toBag = fn(
		"toBag",
		signature({ typeParams: ["T"], params: [selfBox("T")], returnType: bag }),
	);
	const emptyBag = fn("emptyBag", signature({ params: [], returnType: bag }));

	// When: generating
	const output = source([toBag, emptyBag], feature);

	// Then: Bag is never used while the module evaluates, so the import cycle is safe
	assertStringIncludes(output, "Bag.fromMini(");
	assertEquals(moduleScopeValueUses({ source: output, names: ["Bag"] }), []);
});
