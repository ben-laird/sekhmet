/**
 * Source-text recovery for what `deno doc --json` drops: the `const`, `in`
 * and `out` modifiers on type parameters, and tuple element labels.
 *
 * @module
 */

import type { FunctionDeclaration, Param, TypeNode, TypeParam } from "./doc.ts";

/** A type parameter's modifiers, keyed by the parameter's name. */
export type TypeParamModifiers = ReadonlyMap<string, readonly string[]>;

const MODIFIER = /^\s*((?:(?:const|in|out)\s+)*)([A-Za-z_$][\w$]*)/;
const HEADER =
	/^(?:export\s+)?(?:declare\s+)?(?:default\s+)?(?:async\s+)?(?:abstract\s+)?(?:function\s*\*?|class)\s*[A-Za-z_$][\w$]*\s*/;
const OPENERS = new Set(["<", "(", "[", "{"]);
const CLOSERS = new Set([">", ")", "]", "}"]);

/**
 * Slices a source file at a UTF-8 byte offset, which is how `deno doc`
 * locates declarations.
 *
 * @param options.source - The whole source file
 * @param options.byteIndex - The byte offset to start from
 * @returns The source from that offset on
 */
export function sliceFromByte({
	source,
	byteIndex,
}: {
	source: string;
	byteIndex: number;
}): string {
	const bytes = new TextEncoder().encode(source);

	return new TextDecoder().decode(bytes.subarray(byteIndex));
}

/**
 * Splits text on commas that are not nested in brackets.
 *
 * @param text - The text to split
 * @returns The top-level comma-separated pieces
 */
export function splitTopLevel(text: string): string[] {
	const pieces: string[] = [];
	let depth = 0;
	let start = 0;

	for (let i = 0; i < text.length; i++) {
		const char = text.charAt(i);
		if (char === ">" && text.charAt(i - 1) === "=") continue;
		if (OPENERS.has(char)) depth++;
		else if (CLOSERS.has(char)) depth--;
		else if (char === "," && depth === 0) {
			pieces.push(text.slice(start, i));
			start = i + 1;
		}
	}
	pieces.push(text.slice(start));

	return pieces;
}

/**
 * Reads the modifiers of a function's or class's type parameters from the
 * declaration's source text.
 *
 * @param declaration - Source text starting at the declaration (`export function f<…>(…)`)
 * @returns Each type parameter's modifiers; empty when there are none or the
 *   header can't be read
 */
export function typeParamModifiers(declaration: string): TypeParamModifiers {
	const modifiers = new Map<string, readonly string[]>();
	const header = HEADER.exec(declaration);
	if (!header) return modifiers;

	const rest = declaration.slice(header[0].length);
	if (!rest.startsWith("<")) return modifiers;

	let depth = 0;
	let end = -1;
	for (let i = 0; i < rest.length; i++) {
		const char = rest.charAt(i);
		if (char === ">" && rest.charAt(i - 1) === "=") continue;
		if (OPENERS.has(char)) depth++;
		else if (CLOSERS.has(char)) depth--;
		if (depth === 0) {
			end = i;
			break;
		}
	}
	if (end < 0) return modifiers;

	for (const piece of splitTopLevel(rest.slice(1, end))) {
		const match = MODIFIER.exec(piece);
		const name = match?.[2];
		if (!match || name === undefined) continue;

		const found = (match[1] ?? "").split(/\s+/).filter((m) => m !== "");
		if (found.length > 0) modifiers.set(name, found);
	}

	return modifiers;
}

/** One tuple's element labels; `undefined` for an unlabeled element. */
export type TupleLabels = readonly (string | undefined)[];

const LABEL = /^\s*(?:\.\.\.)?\s*([A-Za-z_$][\w$]*)\s*\??\s*:(?!:)/;
const QUOTES = new Set(['"', "'", "`"]);

/**
 * Whether a `[` is a tuple type rather than an array type (`T[]`) or an
 * indexed access (`T[0]`): those follow an operand, a tuple doesn't.
 */
function opensTuple(text: string, at: number): boolean {
	let i = at - 1;
	while (i >= 0 && /\s/.test(text.charAt(i))) i--;
	if (i < 0) return true;

	const before = text.charAt(i);
	if (before === ">") return text.charAt(i - 1) === "=";

	return !/[\w$)\]}]/.test(before);
}

/**
 * Reads the element labels of the first `count` tuple types in a
 * declaration's source text, in source order (outer tuples before the
 * tuples nested in them).
 *
 * @param options.declaration - Source text starting at the declaration
 * @param options.count - How many tuples the decoded signature contains
 * @returns Each tuple's labels, or `undefined` if fewer tuples were found
 */
export function tupleLabels({
	declaration,
	count,
}: {
	declaration: string;
	count: number;
}): TupleLabels[] | undefined {
	const found: TupleLabels[] = [];

	for (let i = 0; i < declaration.length && found.length < count; i++) {
		const char = declaration.charAt(i);

		if (QUOTES.has(char)) {
			const close = declaration.indexOf(char, i + 1);
			if (close < 0) return undefined;
			i = close;
			continue;
		}
		if (char !== "[" || !opensTuple(declaration, i)) continue;

		let depth = 0;
		let end = -1;
		for (let j = i; j < declaration.length; j++) {
			const inner = declaration.charAt(j);
			if (inner === ">" && declaration.charAt(j - 1) === "=") continue;
			if (OPENERS.has(inner)) depth++;
			else if (CLOSERS.has(inner)) depth--;
			if (depth === 0) {
				end = j;
				break;
			}
		}
		if (end < 0) return undefined;

		const body = declaration.slice(i + 1, end);
		found.push(
			body.trim() === ""
				? []
				: splitTopLevel(body).map((element) => LABEL.exec(element)?.[1]),
		);
	}

	return found.length === count ? found : undefined;
}

function countTuples(type: TypeNode | undefined): number {
	if (type === undefined) return 0;

	switch (type.kind) {
		case "tuple":
			return 1 + type.elements.reduce((n, e) => n + countTuples(e), 0);
		case "ref":
			return type.args.reduce((n, a) => n + countTuples(a), 0);
		case "union":
		case "intersection":
			return type.types.reduce((n, t) => n + countTuples(t), 0);
		case "array":
			return countTuples(type.element);
		case "rest":
		case "optional":
		case "parenthesized":
		case "typeOperator":
			return countTuples(type.type);
		case "indexedAccess":
			return countTuples(type.object) + countTuples(type.index);
		case "function":
			return (
				countInTypeParams(type.typeParams) +
				countInParams(type.params) +
				countTuples(type.returnType)
			);
		case "predicate":
			return countTuples(type.type);
		case "object":
			return type.properties.reduce((n, p) => n + countTuples(p.type), 0);
		case "keyword":
		case "literal":
		case "this":
			return 0;
	}
}

function countInTypeParams(typeParams: readonly TypeParam[]): number {
	return typeParams.reduce(
		(n, tp) => n + countTuples(tp.constraint) + countTuples(tp.default),
		0,
	);
}

function countInParams(params: readonly Param[]): number {
	return params.reduce((n, p) => n + countTuples(p.type), 0);
}

/** Rebuilds a type, labelling its tuples from `next` in pre-order. */
function label(type: TypeNode, next: () => TupleLabels): TypeNode {
	const visit = (inner: TypeNode): TypeNode => label(inner, next);

	switch (type.kind) {
		case "tuple": {
			const labels = next();
			const elements = type.elements.map(visit);
			const usable =
				labels.length === elements.length &&
				labels.every((l) => l !== undefined);

			return usable
				? { kind: "tuple", elements, labels }
				: { kind: "tuple", elements };
		}
		case "ref":
			return { ...type, args: type.args.map(visit) };
		case "union":
		case "intersection":
			return { kind: type.kind, types: type.types.map(visit) };
		case "array":
			return { kind: "array", element: visit(type.element) };
		case "rest":
		case "optional":
		case "parenthesized":
			return { kind: type.kind, type: visit(type.type) };
		case "typeOperator":
			return { ...type, type: visit(type.type) };
		case "indexedAccess":
			return { ...type, object: visit(type.object), index: visit(type.index) };
		case "function":
			return {
				...type,
				typeParams: labelTypeParams(type.typeParams, next),
				params: labelParams(type.params, next),
				returnType: visit(type.returnType),
			};
		case "predicate":
			return type.type === undefined
				? type
				: { ...type, type: visit(type.type) };
		case "object":
			return {
				kind: "object",
				properties: type.properties.map((p) =>
					p.type === undefined ? p : { ...p, type: visit(p.type) },
				),
			};
		case "keyword":
		case "literal":
		case "this":
			return type;
	}
}

function labelTypeParams(
	typeParams: readonly TypeParam[],
	next: () => TupleLabels,
): TypeParam[] {
	return typeParams.map((tp) => ({
		name: tp.name,
		constraint:
			tp.constraint === undefined ? undefined : label(tp.constraint, next),
		default: tp.default === undefined ? undefined : label(tp.default, next),
	}));
}

function labelParams(
	params: readonly Param[],
	next: () => TupleLabels,
): Param[] {
	return params.map((p) =>
		p.type === undefined ? p : { ...p, type: label(p.type, next) },
	);
}

/**
 * Attaches tuple labels recovered from a declaration's source text to its
 * decoded signature. Tuples are matched to the source in order; when the
 * counts don't line up the declaration is returned unchanged.
 *
 * @param options.declaration - The decoded function declaration
 * @param options.text - Source text starting at the declaration
 * @returns The declaration with labeled tuples
 */
export function withTupleLabels({
	declaration,
	text,
}: {
	declaration: FunctionDeclaration;
	text: string;
}): FunctionDeclaration {
	const count =
		countInTypeParams(declaration.typeParams) +
		countInParams(declaration.params) +
		countTuples(declaration.returnType);
	if (count === 0) return declaration;

	const labels = tupleLabels({ declaration: text, count });
	if (labels === undefined) return declaration;

	let index = 0;
	const next = (): TupleLabels => labels[index++] ?? [];

	return {
		...declaration,
		typeParams: labelTypeParams(declaration.typeParams, next),
		params: labelParams(declaration.params, next),
		returnType:
			declaration.returnType === undefined
				? undefined
				: label(declaration.returnType, next),
	};
}
