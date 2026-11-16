import { assertEquals } from "@std/assert";
import type { TypeNode } from "./doc.ts";
import {
	type RenderContext,
	renderJsDoc,
	renderParam,
	renderType,
	renderTypeParams,
} from "./render.ts";

const CONTEXT: RenderContext = {
	rename: new Map([["A", "T"]]),
	reference: (ref) =>
		ref.resolution.kind === "global" ? ref.name : `mini.${ref.name}`,
};

const param = (name: string): TypeNode => ({
	kind: "ref",
	name,
	args: [],
	resolution: { kind: "typeParam" },
});

Deno.test("renderType renames type parameters and qualifies named types", () => {
	// Given: Option<A> | Generator<B>, with A renamed and Option from mini
	const type: TypeNode = {
		kind: "union",
		types: [
			{
				kind: "ref",
				name: "Option",
				args: [param("A")],
				resolution: { kind: "local" },
			},
			{
				kind: "ref",
				name: "Generator",
				args: [param("B")],
				resolution: { kind: "global" },
			},
		],
	};

	// When: rendering it
	const rendered = renderType({ type, context: CONTEXT });

	// Then: A becomes T, Option is qualified, and globals stay bare
	assertEquals(rendered, "mini.Option<T> | Generator<B>");
});

Deno.test("renderType renders functions, tuples, predicates and objects", () => {
	// Given: one of each structural type
	const fnType: TypeNode = {
		kind: "function",
		constructor: false,
		typeParams: [],
		params: [
			{
				kind: "rest",
				name: "xs",
				type: { kind: "array", element: param("A") },
			},
		],
		returnType: {
			kind: "tuple",
			elements: [param("A"), { kind: "literal", text: "0" }],
		},
	};
	const predicate: TypeNode = {
		kind: "predicate",
		asserts: true,
		subject: "value",
		type: param("B"),
	};
	const object: TypeNode = {
		kind: "object",
		properties: [
			{ name: "a", optional: true, readonly: true, type: param("A") },
			{
				name: "b",
				optional: false,
				readonly: false,
				type: { kind: "keyword", keyword: "string" },
			},
		],
	};

	// When: rendering them
	const rendered = [fnType, predicate, object].map((type) =>
		renderType({ type, context: CONTEXT }),
	);

	// Then: each prints as TypeScript
	assertEquals(rendered, [
		"(...xs: T[]) => [T, 0]",
		"asserts value is B",
		"{ readonly a?: T; b: string }",
	]);
});

Deno.test("renderTypeParams applies modifiers, constraints and defaults", () => {
	// Given: a const parameter with a constraint and one with a default
	const typeParams = [
		{
			name: "K",
			constraint: { kind: "keyword", keyword: "string" } as const,
			default: undefined,
		},
		{
			name: "U",
			constraint: undefined,
			default: { kind: "keyword", keyword: "never" } as const,
		},
	];

	// When: rendering them with K marked const
	const rendered = renderTypeParams({
		typeParams,
		context: CONTEXT,
		modifiers: new Map([["K", ["const"]]]),
	});

	// Then: the list carries every part
	assertEquals(rendered, "<const K extends string, U = never>");
});

Deno.test("renderParam marks optional and rest parameters", () => {
	// Given: an optional and a rest parameter
	const optional = {
		kind: "identifier",
		name: "message",
		optional: true,
		type: { kind: "keyword", keyword: "string" },
	} as const;
	const rest = {
		kind: "rest",
		name: "args",
		type: { kind: "array", element: param("A") },
	} as const;

	// When: rendering them
	const rendered = [optional, rest].map((p) =>
		renderParam({ param: p, context: CONTEXT }),
	);

	// Then: each has its marker
	assertEquals(rendered, ["message?: string", "...args: T[]"]);
});

Deno.test("renderJsDoc groups tags and indents the block", () => {
	// Given: a description, two tags and an example
	const jsDoc = {
		doc: "Does a thing.\n",
		tags: [
			{ kind: "param", name: "x", doc: "The input" },
			{ kind: "return", doc: "The output" },
			{ kind: "example", doc: "```ts\nf(1);\n```" },
		],
	} as const;

	// When: rendering it with a tab indent
	const rendered = renderJsDoc({ jsDoc, context: CONTEXT, indent: "\t" });

	// Then: tags follow a blank line and every line is prefixed
	assertEquals(
		rendered,
		[
			"\t/**",
			"\t * Does a thing.",
			"\t *",
			"\t * @param x - The input",
			"\t * @returns The output",
			"\t * @example",
			"\t * ```ts",
			"\t * f(1);",
			"\t * ```",
			"\t */",
			"",
		].join("\n"),
	);
});

Deno.test("renderType prints tuple labels", () => {
	// Given: a labeled tuple with an optional and a rest element
	const type: TypeNode = {
		kind: "tuple",
		elements: [
			param("A"),
			{ kind: "optional", type: param("B") },
			{ kind: "rest", type: { kind: "array", element: param("B") } },
		],
		labels: ["first", "second", "rest"],
	};

	// When: rendering it
	const rendered = renderType({ type, context: CONTEXT });

	// Then: each element keeps its label and marker
	assertEquals(rendered, "[first: T, second?: B, ...rest: B[]]");
});
