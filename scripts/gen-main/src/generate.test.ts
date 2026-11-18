import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import type { Borrow, Feature } from "./config.ts";
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
		"for (const $item of mini.iter(this)) {\n\t\t\tyield Box.fromMini($item);\n\t\t}",
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
		"const [$element0, $element1] = mini.split(pair);",
	);
	assertStringIncludes(output, "return [Box.fromMini($element0), $element1];");
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
		"return Box.fromMini(mini.nest(this)).map(($value0) => { return Box.fromMini($value0); });",
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

Deno.test("generateMain's locals don't collide with mini's parameter names", () => {
	// Given: a function whose parameters take the names generated code once
	// used for its locals, returning a tuple that needs converting
	const split = fn(
		"split",
		signature({
			typeParams: ["T"],
			params: [
				param("converted", named("Box", [typeParam("T")])),
				param("element0", keyword("number")),
			],
			returnType: {
				kind: "tuple",
				elements: [named("Box", [typeParam("T")]), keyword("number")],
			},
		}),
	);

	// When: generating
	const output = source([split]);

	// Then: the destructured locals are prefixed, so neither parameter is
	// redeclared
	assertStringIncludes(
		output,
		"const [$element0, $element1] = mini.split(converted, element0);",
	);
});

Deno.test("generateMain rejects a parameter taking the generated-locals prefix", () => {
	// Given: a function with a parameter starting with "$"
	const bad = fn(
		"bad",
		signature({
			typeParams: ["T"],
			params: [param("$item", named("Box", [typeParam("T")]))],
			returnType: named("Box", [typeParam("T")]),
		}),
	);

	// When: generating
	const result = generate([bad]);

	// Then: generation fails, naming the symbol and the parameter
	assert(!result.ok);
	assertEquals(result.error.symbol, "bad");
	assertStringIncludes(result.error.message, "$item");
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

const SHELF: Borrow = {
	entrypoint: "@pkg/shelf",
	mini: "pkg/src/shelf/mini/mod.ts",
	namespace: "shelf",
	methods: [{ name: "wrap" }, { name: "stack", field: "item" }],
};
const SHELF_URL = "file:///repo/pkg/src/shelf/mini/mod.ts";
const BORROWING: Feature = { ...FEATURE, borrows: [SHELF] };

const example = (doc: string): JsDoc => ({
	doc: "",
	tags: [{ kind: "example", doc }],
});

/** `wrap<A>(self: Box<A>, label: string): Box<shelf.Label<A>>`. */
const WRAP = fn(
	"wrap",
	signature({
		typeParams: ["A"],
		params: [selfBox("A"), param("label", keyword("string"))],
		returnType: named("Box", [
			{
				kind: "ref",
				name: "Label",
				args: [typeParam("A")],
				resolution: { kind: "local" },
			},
		]),
		jsDoc: example(
			'```ts\nimport { wrap } from "@pkg/shelf/mini";\nimport { full } from "@pkg/box/mini";\n\nwrap(full(1), "a");\n```',
		),
	}),
);

/** `stack<A>(options: StackOptions<A>): Box<A[]>`, filling `item`. */
const STACK = fn(
	"stack",
	signature({
		typeParams: ["A"],
		params: [
			param("options", {
				kind: "ref",
				name: "StackOptions",
				args: [typeParam("A")],
				resolution: { kind: "local" },
			}),
		],
		returnType: named("Box", [{ kind: "array", element: typeParam("A") }]),
		jsDoc: {
			doc: "Stacks a box.",
			tags: [
				{ kind: "param", name: "options", doc: "What to stack" },
				{
					kind: "example",
					doc: '```ts\nimport { stack } from "@pkg/shelf/mini";\nimport { full } from "@pkg/box/mini";\n\nconst pile = stack({ item: full(1) });\n```',
				},
			],
		},
	}),
);

const LABEL: DocSymbol = {
	name: "Label",
	declarations: [{ kind: "other", typeOnly: true }],
};

/** `interface StackOptions<A> { item: Box<A> }`. */
const STACK_OPTIONS: DocSymbol = {
	name: "StackOptions",
	declarations: [{ kind: "other", typeOnly: true, properties: ["item"] }],
};

/** The shelf barrel's symbols. */
const SHELF_SYMBOLS: readonly DocSymbol[] = [WRAP, STACK, LABEL, STACK_OPTIONS];

/** `stack`'s options parameter, `StackOptions<...args>`. */
const stackOptions = (...args: TypeNode[]): Param =>
	param("options", {
		kind: "ref",
		name: "StackOptions",
		args,
		resolution: { kind: "local" },
	});

/** A `stack` signature, varying only what a case needs. */
const stackSignature = ({
	typeParams = ["A"],
	params = [stackOptions(typeParam("A"))],
}: {
	typeParams?: string[];
	params?: Param[];
}): FunctionDeclaration =>
	signature({
		typeParams,
		params,
		returnType: named("Box", [{ kind: "array", element: typeParam("A") }]),
	});

function borrowing({
	borrowed,
	symbols = [],
	feature = BORROWING,
}: {
	borrowed: readonly DocSymbol[] | undefined;
	symbols?: DocSymbol[];
	feature?: Feature;
}): ReturnType<typeof generateMain> {
	return generateMain({
		feature,
		symbols: [BOX_CLASS, ...symbols],
		sources: SOURCES,
		miniUrl: MINI_URL,
		outputUrl: OUTPUT_URL,
		borrowed:
			borrowed === undefined
				? []
				: [{ borrow: SHELF, url: SHELF_URL, symbols: borrowed }],
	});
}

Deno.test("generateMain makes a borrowed self-first function a method", () => {
	// Given: a feature borrowing wrap(self: Box<A>, label) from the shelf barrel
	const borrowed = SHELF_SYMBOLS;

	// When: generating
	const result = borrowing({ borrowed });

	// Then: the barrel is imported as its namespace, and the method calls it with this
	assert(result.ok);
	const output = result.value;
	assertStringIncludes(
		output,
		'import * as shelf from "../../shelf/mini/mod.ts";',
	);
	assertStringIncludes(output, "wrap(label: string): Box<shelf.Label<T>> {");
	assertStringIncludes(output, "return Box.fromMini(shelf.wrap(this, label));");
	assertStringIncludes(output, "@see {@link shelf.wrap}");
	assertStringIncludes(
		output,
		"It also takes `wrap`, `stack` from `@pkg/shelf/mini` as methods.",
	);
});

Deno.test("generateMain fills a borrowed function's options field with this", () => {
	// Given: a feature borrowing stack({ item }) from the shelf barrel
	const borrowed = SHELF_SYMBOLS;

	// When: generating
	const result = borrowing({ borrowed });

	// Then: the method takes no arguments and passes the receiver as the item
	assert(result.ok);
	const output = result.value;
	assertStringIncludes(output, "stack(): Box<T[]> {");
	assertStringIncludes(
		output,
		"return Box.fromMini(shelf.stack({ item: this }));",
	);
	assert(!output.includes("@param options"));
});

Deno.test("generateMain rewrites borrowed methods' examples to method form", () => {
	// Given: borrowed functions whose examples call them as functions
	const borrowed = SHELF_SYMBOLS;

	// When: generating
	const result = borrowing({ borrowed });

	// Then: the calls are method calls and the borrowed imports are gone
	assert(result.ok);
	const output = result.value;
	assertStringIncludes(output, 'full(1).wrap("a");');
	assertStringIncludes(output, "const pile = full(1).stack();");
	assertStringIncludes(output, 'import { full } from "@pkg/box";');
	assert(!output.includes('from "@pkg/shelf/mini"'));
});

Deno.test("generateMain gives a borrowed method its configured docs", () => {
	// Given: a borrow of stack with docs written for the method
	const feature: Feature = {
		...FEATURE,
		borrows: [
			{
				...SHELF,
				methods: [
					{ name: "wrap" },
					{
						name: "stack",
						field: "item",
						doc: {
							description: "Stacks this box.",
							returns: "A box of this box's values",
							example: "full(1).stack();",
						},
					},
				],
			},
		],
	};

	// When: generating
	const result = generateMain({
		feature,
		symbols: [BOX_CLASS],
		sources: SOURCES,
		miniUrl: MINI_URL,
		outputUrl: OUTPUT_URL,
		borrowed: [{ borrow: SHELF, url: SHELF_URL, symbols: SHELF_SYMBOLS }],
	});

	// Then: the method's docs are the configured ones, not the function's
	assert(result.ok);
	const output = result.value;
	assertStringIncludes(output, "Stacks this box.");
	assertStringIncludes(output, "@returns A box of this box's values");
	assertStringIncludes(output, "full(1).stack();");
	assertStringIncludes(output, "@see {@link shelf.stack}");
	assert(!output.includes("Stacks a box."));
	assert(!output.includes("const pile ="));
});

Deno.test("generateMain rejects borrows it can't resolve or attach", async (t) => {
	// Given: a box feature that also has its own wrap method
	const ownWrap = fn(
		"wrap",
		signature({
			typeParams: ["T"],
			params: [selfBox("T")],
			returnType: keyword("void"),
		}),
	);
	const loose = fn(
		"wrap",
		signature({
			typeParams: ["A"],
			params: [param("label", keyword("string"))],
			returnType: keyword("void"),
		}),
	);
	const generic = fn("stack", {
		...signature({
			typeParams: ["A", "B"],
			params: [
				param("options", {
					kind: "ref",
					name: "StackOptions",
					args: [typeParam("A")],
					resolution: { kind: "local" },
				}),
			],
			returnType: typeParam("B"),
		}),
	});
	const cases: {
		name: string;
		borrowed: readonly DocSymbol[] | undefined;
		symbols?: DocSymbol[];
		message: string;
		symbol: string | undefined;
	}[] = [
		{
			name: "the barrel's symbols are missing",
			borrowed: undefined,
			message: "the symbols of pkg/src/shelf/mini/mod.ts were not provided",
			symbol: undefined,
		},
		{
			name: "the function isn't exported",
			borrowed: [STACK, STACK_OPTIONS],
			message: "@pkg/shelf/mini must export the function wrap",
			symbol: "wrap",
		},
		{
			name: "it clashes with an own method",
			borrowed: SHELF_SYMBOLS,
			symbols: [ownWrap],
			message: "wrap is already a member of Box",
			symbol: "wrap",
		},
		{
			name: "it doesn't take self first",
			borrowed: [loose, STACK, STACK_OPTIONS],
			message:
				"a borrowed function must take `self: Box` first, or name the options field it fills",
			symbol: "wrap",
		},
		{
			name: "a field method has type parameters it can't infer",
			borrowed: [WRAP, generic, STACK_OPTIONS],
			message:
				"a method filling `item` takes no arguments, so it can't infer B",
			symbol: "stack",
		},
		{
			name: "a field method's function takes more than the options object",
			borrowed: [
				WRAP,
				STACK_OPTIONS,
				fn(
					"stack",
					stackSignature({
						params: [
							stackOptions(typeParam("A")),
							param("extra", keyword("string")),
						],
					}),
				),
			],
			message: "a method filling `item` must take one options object",
			symbol: "stack",
		},
		{
			name: "a field method's function is overloaded",
			borrowed: [
				WRAP,
				STACK_OPTIONS,
				fn("stack", stackSignature({}), stackSignature({})),
			],
			message: "an overloaded function can't fill `item`",
			symbol: "stack",
		},
		{
			name: "the options type doesn't pass every type argument",
			borrowed: [
				WRAP,
				STACK_OPTIONS,
				fn("stack", stackSignature({ params: [stackOptions()] })),
			],
			message: "`options` must pass all 1 of Box's type parameters",
			symbol: "stack",
		},
		{
			name: "the options type's type arguments aren't distinct type parameters",
			borrowed: [
				WRAP,
				STACK_OPTIONS,
				fn(
					"stack",
					stackSignature({ params: [stackOptions(keyword("string"))] }),
				),
			],
			message:
				"`options`'s type arguments must be distinct type parameters of stack",
			symbol: "stack",
		},
		{
			name: "the options interface doesn't declare the field",
			borrowed: [
				WRAP,
				STACK,
				{
					name: "StackOptions",
					declarations: [
						{ kind: "other", typeOnly: true, properties: ["items"] },
					],
				},
			],
			message:
				"the borrows entry for stack (@pkg/shelf) fills `item`, which stack's options type doesn't declare",
			symbol: "stack",
		},
		{
			name: "the options type isn't an interface of the barrel",
			borrowed: [WRAP, STACK],
			message:
				"the borrows entry for stack (@pkg/shelf) fills `item`, which stack's options type doesn't declare",
			symbol: "stack",
		},
	];

	for (const { name, borrowed, symbols, message, symbol } of cases) {
		await t.step(name, () => {
			// When: generating
			const result = borrowing({
				borrowed,
				...(symbols === undefined ? {} : { symbols }),
			});

			// Then: generation fails, naming the function at fault
			assert(!result.ok);
			assertEquals(
				{ symbol: result.error.symbol, message: result.error.message },
				{ symbol, message },
			);
		});
	}
});

/** `pair<A, B>(options: PairOptions<A, B>): Box<[A, B]>`, filling `left`. */
const PAIR = fn(
	"pair",
	signature({
		typeParams: ["A", "B"],
		params: [
			param("options", {
				kind: "ref",
				name: "PairOptions",
				args: [typeParam("A"), typeParam("B")],
				resolution: { kind: "local" },
			}),
		],
		returnType: named("Box", [
			{ kind: "tuple", elements: [typeParam("A"), typeParam("B")] },
		]),
	}),
);

/** `interface PairOptions<A, B> { left: Box<A>; right: Box<B> }`. */
const PAIR_OPTIONS: DocSymbol = {
	name: "PairOptions",
	declarations: [
		{ kind: "other", typeOnly: true, properties: ["left", "right"] },
	],
};

const METHOD_DOC = {
	description: "Does it to this box.",
	params: { label: "The label" },
	returns: "A box",
	example: "full(1).on.wrap();",
};

/** The shelf's wrap and pair, on an `.on` namespace (`BoxOn`). */
const ON_SHELF: Borrow = {
	...SHELF,
	property: {
		name: "on",
		className: "BoxOn",
		doc: {
			description: "The shelf's methods for this box.",
			returns: "This box's shelf methods",
			example: "full(1).on;",
		},
	},
	methods: [
		{ name: "wrap", doc: METHOD_DOC },
		{ name: "pair", field: "left", argument: "right", doc: METHOD_DOC },
	],
};

/** Generates the box feature borrowing `borrow` from the shelf barrel. */
function borrowingWith({
	borrow,
	borrowed = [WRAP, PAIR, LABEL, PAIR_OPTIONS],
	symbols = [],
	borrows = [borrow],
}: {
	borrow: Borrow;
	borrowed?: readonly DocSymbol[];
	symbols?: DocSymbol[];
	borrows?: readonly Borrow[];
}): ReturnType<typeof generateMain> {
	return generateMain({
		feature: { ...FEATURE, borrows },
		symbols: [BOX_CLASS, ...symbols],
		sources: SOURCES,
		miniUrl: MINI_URL,
		outputUrl: OUTPUT_URL,
		borrowed: [{ borrow, url: SHELF_URL, symbols: borrowed }],
	});
}

Deno.test("generateMain fills one options field with this and another with the argument", () => {
	// Given: pair({ left, right }) borrowed onto the primary, filling left
	const borrow: Borrow = {
		...SHELF,
		methods: [{ name: "pair", field: "left", argument: "right" }],
	};

	// When: generating
	const result = borrowingWith({ borrow });

	// Then: the method takes right, typed by indexing the options type, whose
	// type parameters past the class's are the method's own
	assert(result.ok);
	assertStringIncludes(
		result.value,
		'pair<B>(right: shelf.PairOptions<T, B>["right"]): Box<[T, B]> {',
	);
	assertStringIncludes(
		result.value,
		"return Box.fromMini(shelf.pair({ left: this, right }));",
	);
});

Deno.test("generateMain puts a borrow with a property on a namespace class", () => {
	// Given: wrap and pair borrowed onto an `.on` namespace
	const borrow = ON_SHELF;

	// When: generating
	const result = borrowingWith({ borrow });

	// Then: the primary has a getter returning the namespace class, which
	// holds the mini instance and calls each function with it
	assert(result.ok);
	const output = result.value;
	assertStringIncludes(
		output,
		"get on(): BoxOn<T> {\n\t\treturn new BoxOn(this);",
	);
	assertStringIncludes(output, "export class BoxOn<out T> {");
	assertStringIncludes(output, "readonly #self: mini.Box<T>;");
	assertStringIncludes(output, "constructor(self: mini.Box<T>) {");
	assertStringIncludes(
		output,
		"return Box.fromMini(shelf.wrap(this.#self, label));",
	);
	assertStringIncludes(
		output,
		"return Box.fromMini(shelf.pair({ left: this.#self, right }));",
	);
	assertStringIncludes(output, "The shelf's methods for this box.");
	assertStringIncludes(output, "@param label - The label");
	assertStringIncludes(
		output,
		"from `@pkg/shelf/mini` as methods of its `.on` namespace (`BoxOn`).",
	);
	assert(!output.includes("shelf.wrap(this, label)"));
});

Deno.test("generateMain leaves a namespace method's function examples alone", () => {
	// Given: a box method whose example calls the namespaced wrap
	const fill = fn(
		"fill",
		signature({
			typeParams: ["A"],
			params: [selfBox("A")],
			returnType: keyword("void"),
			jsDoc: example(
				'```ts\nimport { wrap } from "@pkg/shelf/mini";\n\nwrap(full(1), "a");\n```',
			),
		}),
	);

	// When: generating with wrap on the namespace
	const result = borrowingWith({ borrow: ON_SHELF, symbols: [fill] });

	// Then: the call isn't rewritten into a method on the primary
	assert(result.ok);
	assertStringIncludes(result.value, 'wrap(full(1), "a");');
});

Deno.test("generateMain rejects namespaces and arguments it can't generate", async (t) => {
	// Given: borrows that each break one rule
	const onWith = (patch: Partial<Borrow>): Borrow => ({
		...ON_SHELF,
		...patch,
	});
	const ownOn = fn(
		"on",
		signature({
			typeParams: ["T"],
			params: [selfBox("T")],
			returnType: keyword("void"),
		}),
	);
	const boxOn: DocSymbol = {
		name: "BoxOn",
		declarations: [{ kind: "other", typeOnly: true }],
	};
	const cases: {
		name: string;
		borrow: Borrow;
		borrows?: readonly Borrow[];
		symbols?: DocSymbol[];
		message: string;
		symbol: string;
	}[] = [
		{
			name: "a namespace method has no docs of its own",
			borrow: onWith({ methods: [{ name: "wrap" }] }),
			message:
				"the borrows entry for wrap (@pkg/shelf) puts it on the `on` namespace, so it needs its own `doc`",
			symbol: "wrap",
		},
		{
			name: "argument without field",
			borrow: { ...SHELF, methods: [{ name: "pair", argument: "right" }] },
			message:
				"the borrows entry for pair (@pkg/shelf) sets `argument` without `field`",
			symbol: "pair",
		},
		{
			name: "argument and field are the same",
			borrow: {
				...SHELF,
				methods: [{ name: "pair", field: "left", argument: "left" }],
			},
			message:
				"the borrows entry for pair (@pkg/shelf) fills `left` with both the receiver and the argument",
			symbol: "pair",
		},
		{
			name: "the options type doesn't declare the argument",
			borrow: {
				...SHELF,
				methods: [{ name: "pair", field: "left", argument: "other" }],
			},
			message:
				"the borrows entry for pair (@pkg/shelf) fills `other`, which pair's options type doesn't declare",
			symbol: "pair",
		},
		{
			name: "the options type's extra type parameters can't be inferred",
			borrow: { ...SHELF, methods: [{ name: "pair", field: "left" }] },
			message:
				"a method filling `left` takes no arguments, so it can't infer B",
			symbol: "pair",
		},
		{
			name: "the getter clashes with an own method",
			borrow: ON_SHELF,
			symbols: [ownOn],
			message: "on is already a member of Box",
			symbol: "on",
		},
		{
			name: "two borrows claim one getter",
			borrow: ON_SHELF,
			borrows: [ON_SHELF, ON_SHELF],
			message: "on is already a member of Box",
			symbol: "on",
		},
		{
			name: "the class name is already a mini export",
			borrow: ON_SHELF,
			symbols: [boxOn],
			message: "BoxOn is already a name in the generated module",
			symbol: "BoxOn",
		},
		{
			name: "a namespace lists a method twice",
			borrow: onWith({
				methods: [
					{ name: "wrap", doc: METHOD_DOC },
					{ name: "wrap", doc: METHOD_DOC },
				],
			}),
			message: "wrap is already a member of BoxOn",
			symbol: "wrap",
		},
	];

	for (const { name, borrow, borrows, symbols, message, symbol } of cases) {
		await t.step(name, () => {
			// When: generating
			const result = borrowingWith({
				borrow,
				...(borrows === undefined ? {} : { borrows }),
				...(symbols === undefined ? {} : { symbols }),
			});

			// Then: generation fails, naming the member at fault
			assert(!result.ok);
			assertEquals(
				{ symbol: result.error.symbol, message: result.error.message },
				{ symbol, message },
			);
		});
	}
});

/** A feature whose Struct-based `Box` carries views, `AnyBox` being any box. */
const VIEWING: Feature = {
	...FEATURE,
	construct: "params",
	views: { any: "AnyBox" },
};

/** A `View<S>` type of the barrel. */
const view = (arg: TypeNode): TypeNode => ({
	kind: "ref",
	name: "View",
	args: [arg],
	resolution: { kind: "local" },
});

/** `S extends Box<A>`, a type parameter standing for the exact receiver. */
const exactParam: TypeParam = {
	name: "S",
	constraint: named("Box", [typeParam("A")]),
	default: undefined,
};

/** A signature with type parameters declared in full (with constraints). */
function constrainedSignature({
	typeParams,
	params,
	returnType,
}: {
	typeParams: TypeParam[];
	params: Param[];
	returnType: TypeNode;
}): FunctionDeclaration {
	return { ...signature({ params, returnType }), typeParams };
}

/** `wrapped<A, S extends Box<A>>(self: S & Box<A>): Box<A> & View<S>`. */
const WRAPPED = fn(
	"wrapped",
	constrainedSignature({
		typeParams: [declare("A"), exactParam],
		params: [
			param("self", {
				kind: "intersection",
				types: [typeParam("S"), named("Box", [typeParam("A")])],
			}),
		],
		returnType: {
			kind: "intersection",
			types: [named("Box", [typeParam("A")]), view(typeParam("S"))],
		},
	}),
);

Deno.test("generateMain gives a primary carrying views a fromMiniView that copies and checks", () => {
	// Given: a feature whose primary carries views
	const feature = VIEWING;

	// When: generating
	const output = source([], feature);

	// Then: fromMiniView rebuilds from the params, copies the view, and
	// panics on any other prototype than mini's or main's
	assertStringIncludes(
		output,
		"static fromMiniView<T, V extends object>(self: mini.Box<T> & V): Box<T> & V {",
	);
	assertStringIncludes(
		output,
		"if (prototype !== Box.prototype && prototype !== mini.Box.prototype) {",
	);
	assertStringIncludes(output, "throw new TypeError(");
	assertStringIncludes(
		output,
		"return Object.assign(new Box(getStructParams(self)), self);",
	);
});

Deno.test("generateMain renders an exact receiver as this and converts its view", () => {
	// Given: wrapped(self: S & Box<A>), returning Box<A> & View<S>
	const symbols = [WRAPPED];

	// When: generating with views
	const output = source(symbols, VIEWING);

	// Then: S is this, A is the class's T, and the result keeps its view
	assertStringIncludes(output, "wrapped(): Box<T> & View<this> {");
	assertStringIncludes(output, "return Box.fromMiniView(mini.wrapped(this));");
});

Deno.test("generateMain renders a receiver typed by the any alias as this", () => {
	// Given: tag<S extends AnyBox>(self: S, label: string): S
	const tag = fn(
		"tag",
		constrainedSignature({
			typeParams: [
				{ name: "S", constraint: named("AnyBox"), default: undefined },
			],
			params: [
				param("self", typeParam("S")),
				param("label", keyword("string")),
			],
			returnType: typeParam("S"),
		}),
	);

	// When: generating with views
	const output = source([tag], VIEWING);

	// Then: the method returns this, unconverted
	assertStringIncludes(output, "tag(label: string): this {");
	assertStringIncludes(output, "return mini.tag(this, label);");
});

Deno.test("generateMain renders a field's receiver type parameter as this", () => {
	// Given: stack<A, S extends Box<A>>(options: StackOptions<A, S>),
	// returning Box<A[]> & View<S>, borrowed onto a viewing primary
	const stack = fn(
		"stack",
		constrainedSignature({
			typeParams: [declare("A"), exactParam],
			params: [stackOptions(typeParam("A"), typeParam("S"))],
			returnType: {
				kind: "intersection",
				types: [
					named("Box", [{ kind: "array", element: typeParam("A") }]),
					view(typeParam("S")),
				],
			},
		}),
	);

	// When: generating
	const result = borrowing({
		borrowed: [WRAP, stack, LABEL, STACK_OPTIONS],
		feature: { ...VIEWING, borrows: [SHELF] },
	});

	// Then: the receiver fills S, so it is this, not a method parameter
	assert(result.ok);
	assertStringIncludes(result.value, "stack(): Box<T[]> & View<this> {");
	assertStringIncludes(
		result.value,
		"return Box.fromMiniView(shelf.stack({ item: this }));",
	);
});

Deno.test("generateMain gives a viewing primary's namespace class a Self for the exact receiver", () => {
	// Given: wrapped borrowed onto an `.on` namespace of a viewing primary
	const borrow: Borrow = {
		...ON_SHELF,
		methods: [{ name: "wrapped", doc: METHOD_DOC }],
	};

	// When: generating
	const result = generateMain({
		feature: { ...VIEWING, borrows: [borrow] },
		symbols: [BOX_CLASS],
		sources: SOURCES,
		miniUrl: MINI_URL,
		outputUrl: OUTPUT_URL,
		borrowed: [{ borrow, url: SHELF_URL, symbols: [WRAPPED] }],
	});

	// Then: the getter passes this as the class's Self, which the class holds
	// (bounded by the mini Box, never the main one, for sound variance), and
	// S is Self
	assert(result.ok);
	const output = result.value;
	assertStringIncludes(output, "get on(): BoxOn<T, this> {");
	assertStringIncludes(
		output,
		"export class BoxOn<out T, Self extends mini.Box<T> = mini.Box<T>> {",
	);
	assertStringIncludes(output, "readonly #self: Self;");
	assertStringIncludes(output, "constructor(self: Self) {");
	assertStringIncludes(output, "wrapped(): Box<T> & View<Self> {");
	assertStringIncludes(
		output,
		"return Box.fromMiniView(shelf.wrapped(this.#self));",
	);
});

Deno.test("generateMain rejects a namespace method type parameter named Self", () => {
	// Given: a namespace method with its own type parameter Self
	const borrow: Borrow = {
		...ON_SHELF,
		methods: [{ name: "selfish", doc: METHOD_DOC }],
	};
	const selfish = fn(
		"selfish",
		signature({
			typeParams: ["A", "Self"],
			params: [selfBox("A")],
			returnType: named("Box", [typeParam("Self")]),
		}),
	);

	// When: generating
	const result = generateMain({
		feature: { ...VIEWING, borrows: [borrow] },
		symbols: [BOX_CLASS],
		sources: SOURCES,
		miniUrl: MINI_URL,
		outputUrl: OUTPUT_URL,
		borrowed: [{ borrow, url: SHELF_URL, symbols: [selfish] }],
	});

	// Then: it fails, since Self is the namespace class's own
	assert(!result.ok);
	assertEquals(result.error.symbol, "selfish");
	assertStringIncludes(result.error.message, "type parameter Self shadows");
});

Deno.test("generateMain takes the view receiver forms only with views", () => {
	// Given: wrapped(self: S & Box<A>), in a feature without views
	const feature: Feature = { ...FEATURE, construct: "params" };

	// When: generating
	const result = generate([WRAPPED], feature);

	// Then: it isn't a method, and its intersection can't be converted
	assert(!result.ok);
	assertEquals(result.error.symbol, "wrapped");
	assertStringIncludes(result.error.message, "Box.fromMiniView");
});

Deno.test("generateMain rejects views on an Enum-based primary", () => {
	// Given: views on a primary rebuilt from its variant
	const feature: Feature = { ...VIEWING, construct: "variant" };

	// When: generating
	const result = generate([], feature);

	// Then: it fails, since a view is copied onto a Struct rebuilt from params
	assert(!result.ok);
	assertEquals(result.error.symbol, "Box");
	assertStringIncludes(result.error.message, '`construct: "params"`');
});

/** `retag<A>(self: Box<A>, label: string): Box<A>`, returning its receiver. */
const RETAG = fn(
	"retag",
	signature({
		typeParams: ["A"],
		params: [selfBox("A"), param("label", keyword("string"))],
		returnType: named("Box", [typeParam("A")]),
	}),
);

Deno.test("generateMain returns a main receiver as is from a function that returns it", () => {
	// Given: retag, declared to return its receiver, as a method and borrowed
	const feature: Feature = { ...FEATURE, identities: ["retag"] };
	const borrow: Borrow = {
		...SHELF,
		methods: [{ name: "wrap", identity: true }],
	};

	// When: generating each
	const own = source([RETAG], feature);
	const borrowed = borrowingWith({ borrow });

	// Then: a value already main is returned as is; only mini is converted
	assertStringIncludes(
		own,
		"const $value = mini.retag(this, label);\n\t\tif ($value instanceof Box) return $value;\n\n\t\treturn Box.fromMini($value);",
	);
	assert(borrowed.ok);
	assertStringIncludes(
		borrowed.value,
		"const $value = shelf.wrap(this, label);\n\t\tif ($value instanceof Box) return $value;",
	);
});

Deno.test("generateMain returns a main value as is from a wrapper declared to return its argument", () => {
	// Given: a class-less feature whose retag returns its argument
	const feature: Feature = {
		entrypoint: "@pkg/tags",
		mini: "pkg/src/tags/mini/mod.ts",
		output: "pkg/src/tags/main/mod.ts",
		wraps: [{ type: "Box", from: "../../box/main/mod.ts" }],
		identities: ["retag"],
	};

	// When: generating
	const output = source([RETAG], feature);

	// Then: the wrapper returns a main value as is
	assertStringIncludes(
		output,
		"const $value = mini.retag(self, label);\n\tif ($value instanceof Box) return $value;\n\n\treturn Box.fromMini($value);",
	);
});

Deno.test("generateMain rejects returning the receiver from a function it doesn't convert", () => {
	// Given: a function returning a string, declared to return its receiver
	const label = fn(
		"label",
		signature({
			typeParams: ["A"],
			params: [selfBox("A")],
			returnType: keyword("string"),
		}),
	);

	// When: generating
	const result = generate([label], { ...FEATURE, identities: ["label"] });

	// Then: it fails, naming the function
	assert(!result.ok);
	assertEquals(result.error.symbol, "label");
	assertStringIncludes(result.error.message, "returns its receiver");
});
