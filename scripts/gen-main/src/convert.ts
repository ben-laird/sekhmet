/**
 * How a mini return type becomes a main one: which positions name a wrap
 * target (a main class), how the type is spelled, and the runtime code that
 * converts a mini value into it.
 *
 * Converted positions:
 * - the return type itself (`Option<T>`)
 * - wrap-target type arguments of a wrap target (`Result<Option<T>, E>`),
 *   through the outer class's mapper for that argument (`.map`)
 * - the plain elements of a returned tuple (`[Option<T>, Option<U>]`)
 * - the yielded type of a returned `Generator`/`IterableIterator` whose return
 *   type is `void`, by re-yielding lazily
 *
 * Everything else (parameters, unions, other generics) keeps its mini type.
 *
 * @module
 */

import type { TypeNode } from "./doc.ts";
import { renderTuple } from "./render.ts";
import { err, ok, type Result } from "./result.ts";

/** Turns the source of a mini value into the source of its main value. */
export type Apply = (expression: string) => string;

/** The runtime conversion a return type needs. */
export type Conversion =
	| { readonly kind: "none" }
	| { readonly kind: "value"; readonly apply: Apply }
	| {
			readonly kind: "tuple";
			readonly elements: readonly {
				readonly rest: boolean;
				readonly apply: Apply | undefined;
			}[];
	  }
	| { readonly kind: "iterable"; readonly apply: Apply };

/** A return type spelled for main, with the conversion its value needs. */
export interface Converted {
	/** The main spelling of the type. */
	readonly text: string;
	/** How a mini value of the type becomes a main one. */
	readonly conversion: Conversion;
}

/** What conversion planning needs to know about the generated module. */
export interface ConvertContext {
	/** Renders a type with its mini spelling. */
	readonly render: (type: TypeNode) => string;
	/** The wrap target a type names at its top level, if any. */
	readonly wrapTarget: (type: TypeNode) => string | undefined;
	/** The main method mapping each type argument of a wrap target, if any. */
	readonly mappers: (target: string) => readonly (string | undefined)[];
}

const ITERABLES: ReadonlySet<string> = new Set([
	"Generator",
	"IterableIterator",
]);

interface Value {
	readonly text: string;
	readonly apply: Apply | undefined;
}

function planValue({
	type,
	context,
	depth,
}: {
	type: TypeNode;
	context: ConvertContext;
	depth: number;
}): Result<Value, string> {
	const target = context.wrapTarget(type);
	if (target === undefined || type.kind !== "ref") {
		return ok({ text: context.render(type), apply: undefined });
	}

	const args: Value[] = [];
	for (const arg of type.args) {
		const planned = planValue({ type: arg, context, depth: depth + 1 });
		if (!planned.ok) return planned;
		args.push(planned.value);
	}

	const mappers = context.mappers(target);
	const maps: string[] = [];
	for (const [i, arg] of args.entries()) {
		if (arg.apply === undefined) continue;

		const mapper = mappers[i];
		if (mapper === undefined) {
			return err(
				`${target}'s type argument ${i} names a main class but ${target} has no mapper for it; add one to its \`mappers\``,
			);
		}
		const item = `value${depth}`;
		maps.push(`.${mapper}((${item}) => ${arg.apply(item)})`);
	}

	const text =
		args.length === 0
			? target
			: `${target}<${args.map((arg) => arg.text).join(", ")}>`;

	return ok({
		text,
		apply: (expression) => `${target}.fromMini(${expression})${maps.join("")}`,
	});
}

function isVoidLike(type: TypeNode | undefined): boolean {
	return (
		type === undefined ||
		(type.kind === "keyword" &&
			(type.keyword === "void" || type.keyword === "undefined"))
	);
}

/**
 * Plans how a mini return type is spelled and converted in main.
 *
 * @param options.type - The mini return type
 * @param options.context - The generated module's wrap targets and renderer
 * @returns The plan, or why a wrap target can't be converted
 */
export function convertReturn({
	type,
	context,
}: {
	type: TypeNode;
	context: ConvertContext;
}): Result<Converted, string> {
	if (type.kind === "tuple") {
		const elements: { rest: boolean; apply: Apply | undefined }[] = [];
		const texts = new Map<TypeNode, string>();
		for (const element of type.elements) {
			if (element.kind === "optional" || element.kind === "rest") {
				elements.push({ rest: element.kind === "rest", apply: undefined });
				continue;
			}
			const planned = planValue({ type: element, context, depth: 0 });
			if (!planned.ok) return planned;
			texts.set(element, planned.value.text);
			elements.push({ rest: false, apply: planned.value.apply });
		}

		const hasOptional = type.elements.some((e) => e.kind === "optional");
		if (hasOptional || elements.every((e) => e.apply === undefined)) {
			return ok({ text: context.render(type), conversion: { kind: "none" } });
		}

		const text = renderTuple({
			tuple: type,
			render: (element) => texts.get(element) ?? context.render(element),
		});

		return ok({ text, conversion: { kind: "tuple", elements } });
	}

	if (
		type.kind === "ref" &&
		type.resolution.kind === "global" &&
		ITERABLES.has(type.name)
	) {
		const [yielded, returned, ...rest] = type.args;
		if (yielded !== undefined && isVoidLike(returned)) {
			const planned = planValue({ type: yielded, context, depth: 0 });
			if (!planned.ok) return planned;

			const { apply } = planned.value;
			if (apply !== undefined) {
				const others = [returned, ...rest]
					.filter((arg) => arg !== undefined)
					.map(context.render);
				const text = `${type.name}<${[planned.value.text, ...others].join(", ")}>`;

				return ok({ text, conversion: { kind: "iterable", apply } });
			}
		}
	}

	const planned = planValue({ type, context, depth: 0 });
	if (!planned.ok) return planned;

	const { text, apply } = planned.value;

	return ok({
		text,
		conversion:
			apply === undefined ? { kind: "none" } : { kind: "value", apply },
	});
}

/**
 * Renders the statements that return a converted mini call.
 *
 * @param options.call - The mini call expression
 * @param options.conversion - How its value is converted
 * @param options.isVoid - Whether the return type is `void` (no `return`)
 * @param options.indent - The indentation of each statement
 * @returns The body statements
 */
export function convertedBody({
	call,
	conversion,
	isVoid,
	indent,
}: {
	call: string;
	conversion: Conversion;
	isVoid: boolean;
	indent: string;
}): string {
	switch (conversion.kind) {
		case "none":
			return isVoid ? `${call};` : `return ${call};`;
		case "value":
			return `return ${conversion.apply(call)};`;
		case "iterable":
			return `for (const item of ${call}) {\n${indent}\tyield ${conversion.apply("item")};\n${indent}}`;
		case "tuple": {
			const names = conversion.elements.map(
				({ rest }, i) => `${rest ? "..." : ""}element${i}`,
			);
			const values = conversion.elements.map(({ rest, apply }, i) =>
				rest || apply === undefined
					? `${rest ? "..." : ""}element${i}`
					: apply(`element${i}`),
			);

			return `const [${names.join(", ")}] = ${call};\n${indent}return [${values.join(", ")}];`;
		}
	}
}

/**
 * A key identifying a conversion's runtime behaviour, so overloads can be
 * checked to agree on it.
 *
 * @param conversion - The conversion
 * @returns A string equal for conversions that convert the same way
 */
export function conversionKey(conversion: Conversion): string {
	switch (conversion.kind) {
		case "none":
			return "none";
		case "value":
		case "iterable":
			return `${conversion.kind}:${conversion.apply("x")}`;
		case "tuple":
			return `tuple:${conversion.elements.map((e) => `${e.rest}:${e.apply?.("x") ?? ""}`).join(",")}`;
	}
}
