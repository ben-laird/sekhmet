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
 * - the one wrap target of a returned intersection with a view
 *   (`Schema<I, O, E> & ObjectView<S>`), through the target's `fromMiniView`,
 *   which keeps the view's own properties
 * - the one wrap target of a returned intersection that narrows it
 *   (`Enum<Eliminate<V, "Failed">> & JobEnd<T>`, the target having no
 *   views), through `fromMini` with the mini value's own properties
 *   assigned on; its type arguments keep their mini spelling
 * - the fulfilled value of a `Promise<X>` in any converted position, through
 *   `.then` (`Promise<Result<T, E>>`)
 * - the carried value of a carrier (`Vow<Outcome<T, E>>`) in any converted
 *   position, through the carrier's map function (`map(vow, …)`)
 * - the return value of a non-generic function type in any converted position
 *   (`(...args: A) => Result<U, E>`), by wrapping the function so that each
 *   call converts; a returned function is bound to a name first, at every
 *   level of a curried function, so each mini call still runs once
 *
 * Everything else (parameters, unions, other generics) keeps its mini type.
 *
 * @module
 */

import type { TypeNode } from "./doc.ts";
import { renderTuple } from "./render.ts";
import { err, ok, type Result } from "./result.ts";

/**
 * The prefix of every local name generated code declares (`$converted`,
 * `$item`, `$element0`, `$value0`, `$args0`). Mini parameters can't use it,
 * so a generated name never collides with one.
 */
export const GENERATED_PREFIX = "$";

/** A local name for generated code, out of reach of mini's parameters. */
function local(name: string): string {
	return `${GENERATED_PREFIX}${name}`;
}

/** Turns the source of a mini value into the source of its main value. */
export type Apply = (expression: string) => string;

/** The runtime conversion a return type needs. */
export type Conversion =
	| { readonly kind: "none" }
	| {
			readonly kind: "value";
			readonly apply: Apply;
			/** Whether the value must be bound to a name before `apply` reads it. */
			readonly named: boolean;
			/** The main class the value converts to, when it is a wrap target. */
			readonly target: string | undefined;
	  }
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
	/** Whether a wrap target's main class has a `fromMiniView` static. */
	readonly views: (target: string) => boolean;
	/**
	 * The local name of the map function of the carrier a type names at its
	 * top level, if it names one (see `CarrierTarget`).
	 */
	readonly carrier: (type: TypeNode) => string | undefined;
}

const ITERABLES: ReadonlySet<string> = new Set([
	"Generator",
	"IterableIterator",
]);

interface Value {
	readonly text: string;
	readonly apply: Apply | undefined;
	/** The wrap target `apply` converts to, when there is one. */
	readonly target?: string;
	/**
	 * Whether `apply` evaluates its expression on every call of the function
	 * it builds, so the expression must be a name rather than a call.
	 */
	readonly named: boolean;
}

/** A value of `type` that keeps its mini spelling and needs no conversion. */
function unconverted({
	type,
	context,
}: {
	type: TypeNode;
	context: ConvertContext;
}): Value {
	return { text: context.render(type), apply: undefined, named: false };
}

/** Plans `Promise<X>`: its fulfilled value converts through `.then`. */
function planPromise({
	type,
	context,
	depth,
}: {
	type: Extract<TypeNode, { kind: "ref" }>;
	context: ConvertContext;
	depth: number;
}): Result<Value, string> {
	const [fulfilled] = type.args;
	if (fulfilled === undefined) return ok(unconverted({ type, context }));

	const planned = planValue({ type: fulfilled, context, depth: depth + 1 });
	if (!planned.ok) return planned;

	const { text, apply } = planned.value;
	if (apply === undefined) return ok(unconverted({ type, context }));

	const item = local(`value${depth}`);

	return ok({
		text: `Promise<${text}>`,
		apply: (expression) => {
			return `${expression}.then(${arrow({ params: item, body: apply(item) })})`;
		},
		named: false,
	});
}

/**
 * Plans a carrier (`Vow<X>`): its carried value converts through the
 * carrier's map function, `map(expression, ($value) => …)`.
 */
function planCarrier({
	type,
	map,
	context,
	depth,
}: {
	type: Extract<TypeNode, { kind: "ref" }>;
	map: string;
	context: ConvertContext;
	depth: number;
}): Result<Value, string> {
	const [carried] = type.args;
	if (carried === undefined || type.args.length !== 1) {
		return ok(unconverted({ type, context }));
	}

	const planned = planValue({ type: carried, context, depth: depth + 1 });
	if (!planned.ok) return planned;

	const { text, apply } = planned.value;
	if (apply === undefined) return ok(unconverted({ type, context }));

	const item = local(`value${depth}`);

	return ok({
		text: context.render({ ...type, args: [verbatim(text)] }),
		apply: (expression) => {
			return `${map}(${expression}, ${arrow({ params: item, body: apply(item) })})`;
		},
		named: false,
	});
}

/** Plans a non-generic function type: each call's return value converts. */
function planFunction({
	type,
	context,
	depth,
}: {
	type: Extract<TypeNode, { kind: "function" }>;
	context: ConvertContext;
	depth: number;
}): Result<Value, string> {
	const planned = planValue({
		type: type.returnType,
		context,
		depth: depth + 1,
	});
	if (!planned.ok) return planned;

	const { text, apply, named } = planned.value;
	if (apply === undefined) return ok(unconverted({ type, context }));

	const args = local(`args${depth}`);
	const bound = local(`converted${depth}`);

	// A returned value that is itself `named` (a curried function) is bound
	// once per call, so the outer call isn't deferred into, and repeated by,
	// each inner call.
	return ok({
		text: context.render({ ...type, returnType: verbatim(text) }),
		apply: (expression) => {
			const call = `${expression}(...${args})`;
			if (named) {
				return arrow({
					params: `...${args}`,
					body: apply(bound),
					before: `const ${bound} = ${call};`,
				});
			}

			return arrow({ params: `...${args}`, body: apply(call) });
		},
		named: true,
	});
}

/**
 * Renders an arrow function with a braced body, so generated code stays
 * bracketed however Biome wraps it.
 */
function arrow({
	params,
	body,
	before,
}: {
	params: string;
	body: string;
	before?: string;
}): string {
	const statements = before === undefined ? "" : `${before} `;

	return `(${params}) => { ${statements}return ${body}; }`;
}

/** A type node that renders as `text` unchanged. */
function verbatim(text: string): TypeNode {
	return { kind: "ref", name: text, args: [], resolution: { kind: "global" } };
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
	if (
		type.kind === "ref" &&
		type.resolution.kind === "global" &&
		type.name === "Promise" &&
		type.args.length === 1
	) {
		return planPromise({ type, context, depth });
	}
	const map = context.carrier(type);
	if (map !== undefined && type.kind === "ref") {
		return planCarrier({ type, map, context, depth });
	}
	if (
		type.kind === "function" &&
		!type.constructor &&
		type.typeParams.length === 0
	) {
		return planFunction({ type, context, depth });
	}

	const target = context.wrapTarget(type);
	if (target === undefined || type.kind !== "ref") {
		return ok(unconverted({ type, context }));
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
		const item = local(`value${depth}`);
		maps.push(`.${mapper}(${arrow({ params: item, body: arg.apply(item) })})`);
	}

	const text =
		args.length === 0
			? target
			: `${target}<${args.map((arg) => arg.text).join(", ")}>`;

	return ok({
		text,
		apply: (expression) => `${target}.fromMini(${expression})${maps.join("")}`,
		named: false,
		target,
	});
}

/**
 * Plans a top-level intersection naming one wrap target, a mini class with a
 * view (`Schema<I, O, E> & ObjectView<S>`): the target is spelled as its main
 * class, the other members as they are, and the value is converted with the
 * target's `fromMiniView`, which copies the view's own properties. An
 * intersection naming no wrap target needs no conversion.
 */
function planIntersection({
	type,
	context,
}: {
	type: Extract<TypeNode, { kind: "intersection" }>;
	context: ConvertContext;
}): Result<Value, string> {
	const targets = type.types.filter((member) => {
		return context.wrapTarget(member) !== undefined;
	});
	const [member, ...others] = targets;
	if (member === undefined) {
		const text = type.types.map(context.render).join(" & ");

		return ok({ text, apply: undefined, named: false });
	}
	const target = context.wrapTarget(member);
	if (others.length > 0 || target === undefined) {
		return err(
			"an intersection may name one wrap target, the class its view is on",
		);
	}
	if (!context.views(target)) {
		const narrows = type.types.every((part) => {
			return part === member || isEnum(part);
		});
		if (narrows) return ok(planNarrowing({ type, member, target, context }));

		return err(
			`${target} & … needs ${target}.fromMiniView; set \`views\` on ${target}'s feature or wrap target`,
		);
	}

	const nested = member.kind === "ref" ? member.args : [];
	const converts = nested.some((arg) => {
		const plannedArg = planValue({ type: arg, context, depth: 1 });
		return !plannedArg.ok || plannedArg.value.apply !== undefined;
	});
	const planned = planValue({ type: member, context, depth: 0 });
	if (!planned.ok) return planned;
	if (converts) {
		return err(
			`${target}'s type arguments name a main class, which an intersection with its view can't convert`,
		);
	}
	const text = type.types
		.map((part) => {
			if (part === member) return planned.value.text;

			return context.render(part);
		})
		.join(" & ");
	// {}

	return ok({
		text,
		apply: (expression) => `${target}.fromMiniView(${expression})`,
		named: false,
		target,
	});
}

/**
 * Plans a top-level intersection of one wrap target that has no views with
 * enum `Enum`s only: a narrowing of its variants
 * (`Enum<Eliminate<V, "Failed">> & JobEnd<T>`). The target is spelled as its main class with its type arguments as they are
 * (the narrowing names them in mini, so converting them would break it),
 * and the value converts through `fromMini`, with the mini value's own
 * properties assigned on, so the main value is typed as the narrowing too.
 */
function planNarrowing({
	type,
	member,
	target,
	context,
}: {
	type: Extract<TypeNode, { kind: "intersection" }>;
	member: TypeNode;
	target: string;
	context: ConvertContext;
}): Value {
	const args = member.kind === "ref" ? member.args.map(context.render) : [];
	const spelled = args.length === 0 ? target : `${target}<${args.join(", ")}>`;
	const text = type.types
		.map((part) => {
			if (part === member) return spelled;

			return context.render(part);
		})
		.join(" & ");
	// {}

	return {
		text,
		apply: (expression) => {
			return `Object.assign(${target}.fromMini(${expression}), ${expression})`;
		},
		named: true,
		target,
	};
}

/**
 * The entrypoints enum's `Enum` class is imported from: its core feature
 * and its mini paths (`@sekhmet/enum/core/mini`, `…/core/mini/core`).
 */
const ENUM_CORE = "@sekhmet/enum/core";

/**
 * Whether a type is enum's own `Enum` class, which a narrowing names: an
 * `Enum` imported from enum's core entrypoints, under any local name. Any
 * other type named `Enum` is foreign, so its intersection fails generation.
 */
function isEnum(type: TypeNode): boolean {
	if (type.kind !== "ref" || type.resolution.kind !== "import") return false;

	const { specifier, name } = type.resolution;
	const fromCore =
		specifier === ENUM_CORE || specifier.startsWith(`${ENUM_CORE}/`);
	return fromCore && name === "Enum";
}

/** Plans a top-level return type: an intersection with a view, or a value. */
function planTopLevel({
	type,
	context,
}: {
	type: TypeNode;
	context: ConvertContext;
}): Result<Value, string> {
	if (type.kind === "intersection") return planIntersection({ type, context });

	return planValue({ type, context, depth: 0 });
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

	const planned = planTopLevel({ type, context });
	if (!planned.ok) return planned;

	const { text, apply, named, target } = planned.value;
	if (apply === undefined) return ok({ text, conversion: { kind: "none" } });

	return ok({ text, conversion: { kind: "value", apply, named, target } });
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
	identity = false,
}: {
	call: string;
	conversion: Conversion;
	isVoid: boolean;
	indent: string;
	identity?: boolean;
}): string {
	switch (conversion.kind) {
		case "none":
			return isVoid ? `${call};` : `return ${call};`;
		case "value": {
			const { target } = conversion;
			if (identity && target !== undefined) {
				return identityBody({ call, target, apply: conversion.apply, indent });
			}
			if (conversion.named) {
				const converted = local("converted");

				return `const ${converted} = ${call};\n${indent}return ${conversion.apply(converted)};`;
			}

			return `return ${conversion.apply(call)};`;
		}
		case "iterable": {
			const item = local("item");

			return `for (const ${item} of ${call}) {\n${indent}\tyield ${conversion.apply(item)};\n${indent}}`;
		}
		case "tuple": {
			const names = conversion.elements.map(({ rest }, i) => {
				return `${rest ? "..." : ""}${local(`element${i}`)}`;
			});
			const values = conversion.elements.map(({ rest, apply }, i) => {
				const name = local(`element${i}`);
				if (rest) return `...${name}`;
				if (apply === undefined) return name;

				return apply(name);
			});

			return `const [${names.join(", ")}] = ${call};\n${indent}return [${values.join(", ")}];`;
		}
	}
}

/**
 * The body of a function that returns its receiver itself (`brand`): a
 * value that is already the main class (a subclass included) is returned
 * as is, so its identity and members survive; only a mini value is
 * converted.
 */
function identityBody({
	call,
	target,
	apply,
	indent,
}: {
	call: string;
	target: string;
	apply: Apply;
	indent: string;
}): string {
	const value = local("value");
	const check = `const ${value} = ${call};\n${indent}if (${value} instanceof ${target}) return ${value};`;

	return `${check}\n\n${indent}return ${apply(value)};`;
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
			return `value:${conversion.named}:${conversion.apply("x")}`;
		case "iterable":
			return `iterable:${conversion.apply("x")}`;
		case "tuple":
			return `tuple:${conversion.elements.map((e) => `${e.rest}:${e.apply?.("x") ?? ""}`).join(",")}`;
	}
}
