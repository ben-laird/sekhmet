/**
 * Renders decoded type expressions, parameters and JSDoc back to TypeScript
 * source.
 *
 * @module
 */

import type {
	JsDoc,
	JsDocTag,
	Param,
	Property,
	TypeNode,
	TypeParam,
} from "./doc.ts";
import type { TypeParamModifiers } from "./source.ts";

/** A reference to a named, non-type-parameter type. */
export interface NamedRef {
	/** The name as written at the reference site. */
	readonly name: string;
	/** Where the name resolves. */
	readonly resolution: Exclude<
		Extract<TypeNode, { kind: "ref" }>["resolution"],
		{ kind: "typeParam" }
	>;
}

/** How names are rewritten while rendering. */
export interface RenderContext {
	/** Type parameter renames (function parameter name → class parameter name). */
	readonly rename: ReadonlyMap<string, string>;
	/** How a named type is spelled in the generated module. */
	readonly reference: (ref: NamedRef) => string;
}

/**
 * Renders a type expression.
 *
 * @param options.type - The type to render
 * @param options.context - How names are rewritten
 * @returns The TypeScript source for the type
 */
export function renderType({
	type,
	context,
}: {
	type: TypeNode;
	context: RenderContext;
}): string {
	const render = (inner: TypeNode): string =>
		renderType({ type: inner, context });

	switch (type.kind) {
		case "keyword":
			return type.keyword;
		case "literal":
			return type.text;
		case "ref": {
			const { resolution } = type;
			const name =
				resolution.kind === "typeParam"
					? (context.rename.get(type.name) ?? type.name)
					: context.reference({ name: type.name, resolution });

			return type.args.length === 0
				? name
				: `${name}<${type.args.map(render).join(", ")}>`;
		}
		case "union":
			return type.types.map(render).join(" | ");
		case "intersection":
			return type.types.map(render).join(" & ");
		case "array":
			return `${render(type.element)}[]`;
		case "tuple":
			return renderTuple({ tuple: type, render });
		case "rest":
			return `...${render(type.type)}`;
		case "optional":
			return `${render(type.type)}?`;
		case "parenthesized":
			return `(${render(type.type)})`;
		case "typeOperator":
			return `${type.operator} ${render(type.type)}`;
		case "indexedAccess":
			return `${render(type.object)}[${render(type.index)}]`;
		case "function": {
			const prefix = type.constructor ? "new " : "";
			const typeParams = renderTypeParams({
				typeParams: type.typeParams,
				context,
			});
			const params = type.params
				.map((param) => renderParam({ param, context }))
				.join(", ");

			return `${prefix}${typeParams}(${params}) => ${render(type.returnType)}`;
		}
		case "predicate": {
			const asserts = type.asserts ? "asserts " : "";
			const target = type.type === undefined ? "" : ` is ${render(type.type)}`;

			return `${asserts}${type.subject}${target}`;
		}
		case "object":
			return renderObject({ properties: type.properties, context });
		case "this":
			return "this";
	}
}

/**
 * Renders a tuple type, labelling each element that has a recovered label.
 *
 * @param options.tuple - The tuple
 * @param options.render - How an (unlabeled) element type is rendered
 * @returns The TypeScript source for the tuple
 */
export function renderTuple({
	tuple,
	render,
}: {
	tuple: Extract<TypeNode, { kind: "tuple" }>;
	render: (element: TypeNode) => string;
}): string {
	const elements = tuple.elements.map((element, i) => {
		const label = tuple.labels?.[i];
		if (label === undefined) return render(element);
		if (element.kind === "rest") return `...${label}: ${render(element.type)}`;
		if (element.kind === "optional")
			return `${label}?: ${render(element.type)}`;

		return `${label}: ${render(element)}`;
	});

	return `[${elements.join(", ")}]`;
}

function renderObject({
	properties,
	context,
}: {
	properties: readonly Property[];
	context: RenderContext;
}): string {
	if (properties.length === 0) return "{}";

	const members = properties.map((property) => {
		const readonly = property.readonly ? "readonly " : "";
		const optional = property.optional ? "?" : "";
		const type =
			property.type === undefined
				? ""
				: `: ${renderType({ type: property.type, context })}`;

		return `${readonly}${property.name}${optional}${type}`;
	});

	return `{ ${members.join("; ")} }`;
}

/**
 * Renders a type parameter list, including the angle brackets. An empty list
 * renders as the empty string.
 *
 * @param options.typeParams - The type parameters
 * @param options.context - How names are rewritten
 * @param options.modifiers - Modifiers recovered from source (`const`, `in`, `out`)
 * @returns The TypeScript source for the list
 */
export function renderTypeParams({
	typeParams,
	context,
	modifiers = new Map(),
}: {
	typeParams: readonly TypeParam[];
	context: RenderContext;
	modifiers?: TypeParamModifiers;
}): string {
	if (typeParams.length === 0) return "";

	const rendered = typeParams.map((typeParam) => {
		const prefix = (modifiers.get(typeParam.name) ?? [])
			.map((modifier) => `${modifier} `)
			.join("");
		const name = context.rename.get(typeParam.name) ?? typeParam.name;
		const constraint =
			typeParam.constraint === undefined
				? ""
				: ` extends ${renderType({ type: typeParam.constraint, context })}`;
		const fallback =
			typeParam.default === undefined
				? ""
				: ` = ${renderType({ type: typeParam.default, context })}`;

		return `${prefix}${name}${constraint}${fallback}`;
	});

	return `<${rendered.join(", ")}>`;
}

/**
 * Renders one parameter declaration.
 *
 * @param options.param - The parameter
 * @param options.context - How names are rewritten
 * @returns The TypeScript source for the parameter
 */
export function renderParam({
	param,
	context,
}: {
	param: Param;
	context: RenderContext;
}): string {
	const type =
		param.type === undefined
			? ""
			: `: ${renderType({ type: param.type, context })}`;

	if (param.kind === "rest") return `...${param.name}${type}`;

	return `${param.name}${param.optional ? "?" : ""}${type}`;
}

/**
 * Renders the argument that forwards a parameter to a call.
 *
 * @param param - The parameter being forwarded
 * @returns The argument source (`name` or `...name`)
 */
export function forwardParam(param: Param): string {
	return param.kind === "rest" ? `...${param.name}` : param.name;
}

function renderTag({
	tag,
	context,
}: {
	tag: JsDocTag;
	context: RenderContext;
}): string {
	const withDoc = (head: string, doc: string): string =>
		doc.trim() === "" ? head : `${head} ${doc.trim()}`;

	switch (tag.kind) {
		case "param":
		case "template":
			return withDoc(
				`@${tag.kind} ${tag.name}`,
				tag.doc === "" ? "" : `- ${tag.doc}`,
			);
		case "return":
			return withDoc("@returns", tag.doc);
		case "example":
			return `@example\n${tag.doc.trim()}`;
		case "throws": {
			const type =
				tag.type === undefined
					? ""
					: ` {${renderType({ type: tag.type, context })}}`;

			return withDoc(`@throws${type}`, tag.doc);
		}
		case "see":
			return withDoc("@see", tag.doc);
		case "deprecated":
			return withDoc("@deprecated", tag.doc);
		case "unsupported":
			return tag.value.trim();
	}
}

/**
 * Renders a JSDoc comment block at an indentation level.
 *
 * @param options.jsDoc - The comment's description and tags
 * @param options.context - How names in `@throws` types are rewritten
 * @param options.indent - The indentation to prefix each line with
 * @returns The comment, ending in a newline
 */
export function renderJsDoc({
	jsDoc,
	context,
	indent = "",
}: {
	jsDoc: JsDoc;
	context: RenderContext;
	indent?: string;
}): string {
	const sections = [
		jsDoc.doc.trim(),
		...jsDoc.tags.map((tag) => renderTag({ tag, context })),
	].filter((section) => section !== "");

	const lines: string[] = [];
	sections.forEach((section, i) => {
		const isTag = section.startsWith("@");
		const previousIsTag = sections[i - 1]?.startsWith("@") ?? false;
		if (i > 0 && !(isTag && previousIsTag)) lines.push("");
		lines.push(...section.split("\n"));
	});

	const body = lines
		.map((line) => (line === "" ? `${indent} *` : `${indent} * ${line}`))
		.join("\n");

	return `${indent}/**\n${body}\n${indent} */\n`;
}
