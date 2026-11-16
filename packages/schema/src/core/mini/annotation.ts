/**
 * Metadata a schema carries beside its structure: typed annotations, each
 * keyed by an {@linkcode AnnotationKey} you hold.
 *
 * @module
 */

import { union as variant } from "@sekhmet/enum/core/mini/exit";
import { isolate } from "@sekhmet/enum/core/mini/isolate";
import { None, type Option, Some } from "@sekhmet/enum/option/mini";
import { getStructParams } from "@sekhmet/primordials/struct";
import type { SchemaNode } from "./node.ts";
import { type AnySchema, Schema } from "./schema.ts";

/**
 * One annotation: a key and its value. Make one by calling the key with the
 * value (`label("Name")`), which checks the value's type.
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { annotationKey } from "@sekhmet/schema/core/mini/annotation";
 *
 * const label = annotationKey<string>({ name: "label" });
 * const { key, value } = label("Name");
 *
 * assertEquals(key, label);
 * assertEquals(value, "Name");
 * ```
 */
export interface Annotation {
	/** The annotation's key. */
	readonly key: AnnotationKey<never>;
	/** Its value, of the key's type. */
	readonly value: unknown;
}

/**
 * A typed annotation key, defined with {@linkcode annotationKey}: call it
 * with a value of type `T` to make an {@linkcode Annotation}. Keys are told
 * apart by identity, not by name, so hold each in a constant.
 *
 * @template T The type of the key's values
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { type AnnotationKey, annotationKey } from "@sekhmet/schema/core/mini/annotation";
 *
 * const label: AnnotationKey<string> = annotationKey({ name: "label" });
 *
 * assertEquals(label.name, "label");
 * // @ts-expect-error a label is a string
 * label(1);
 * ```
 */
export interface AnnotationKey<T> {
	/** An annotation of this key, with `value`. */
	(value: T): Annotation;
	/** The key's name, for display. */
	readonly name: string;
}

/**
 * Defines a typed annotation key. Hold it in a constant: keys are told
 * apart by identity, so two keys with one name are different keys.
 *
 * @template T The type of the key's values
 * @param options The key's name, for display
 * @returns The new key
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { annotationKey } from "@sekhmet/schema/core/mini/annotation";
 *
 * const placeholder = annotationKey<string>({ name: "placeholder" });
 *
 * assertEquals(placeholder.name, "placeholder");
 * ```
 */
export function annotationKey<T>(options: {
	readonly name: string;
}): AnnotationKey<T> {
	const key = (value: T): Annotation => ({ key, value });

	return Object.defineProperty(key, "name", { value: options.name });
}

/**
 * The well-known key for a schema's description: prose saying what its
 * values are, as JSON Schema's `description`.
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { unwrap } from "@sekhmet/enum/option/mini";
 * import { annotate, annotation, description } from "@sekhmet/schema/core/mini/annotation";
 * import { string } from "@sekhmet/schema/primitives/mini";
 *
 * const email = annotate(string({ format: "email" }), [description("Where we write")]);
 *
 * assertEquals(unwrap(annotation({ schema: email, key: description })), "Where we write");
 * ```
 */
export const description: AnnotationKey<string> = annotationKey({
	name: "description",
});

/**
 * The well-known key for a schema's title: a short name for its values, as
 * JSON Schema's `title`.
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { unwrap } from "@sekhmet/enum/option/mini";
 * import { annotate, annotation, title } from "@sekhmet/schema/core/mini/annotation";
 * import { string } from "@sekhmet/schema/primitives/mini";
 *
 * const email = annotate(string(), [title("Email")]);
 *
 * assertEquals(unwrap(annotation({ schema: email, key: title })), "Email");
 * ```
 */
export const title: AnnotationKey<string> = annotationKey({ name: "title" });

/**
 * Annotates a schema: the same schema (its parser and node), with
 * `annotations` added after its own. A later annotation for a key wins over
 * an earlier one. Annotations describe the schema they are on: every other
 * operation builds a schema with none, so `map(annotate(s, …), f)` has no
 * annotations of its own.
 *
 * @template I The input type
 * @template O The output type
 * @template E The error type
 * @param self The schema to annotate
 * @param annotations The annotations to add, each made by calling its key
 * @returns The schema with the annotations added
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { unwrap } from "@sekhmet/enum/option/mini";
 * import { Ok, unwrap as unwrapResult } from "@sekhmet/enum/result/mini";
 * import { annotate, annotation, parseSync, Schema, title } from "@sekhmet/schema/core/mini";
 *
 * const text = new Schema({ parse: (input: string) => Ok(input) });
 * const name = annotate(text, [title("Name"), title("Full name")]);
 *
 * assertEquals(unwrapResult(parseSync(name, "Ada")), "Ada");
 * assertEquals(unwrap(annotation({ schema: name, key: title })), "Full name");
 * ```
 */
export function annotate<I, O, E>(
	self: Schema<I, O, E>,
	annotations: readonly Annotation[],
): Schema<I, O, E> {
	const params = getStructParams(self);

	return new Schema({
		...params,
		annotations: [...params.annotations, ...annotations],
	});
}

/**
 * What {@linkcode annotation} reads: the schema, and the key to read.
 *
 * @template T The type of the key's values
 *
 * @example
 * ```ts
 * import { type AnnotationOptions, title } from "@sekhmet/schema/core/mini/annotation";
 * import { string } from "@sekhmet/schema/primitives/mini";
 *
 * const options: AnnotationOptions<string> = { schema: string(), key: title };
 * ```
 */
export interface AnnotationOptions<T> {
	/** The schema to read. */
	readonly schema: AnySchema;
	/** The key to read. */
	readonly key: AnnotationKey<T>;
}

/**
 * The schema a wrapper node passes annotation lookups to: the inner schema
 * of `optional`, `nullable` and `readonly`, which accept the same values
 * plus `undefined` or `null`, or freeze them. Nothing else is a wrapper: a
 * transform's output is a different value.
 */
function wrapped(node: SchemaNode): AnySchema | undefined {
	if (isolate(node, "Optional")) return variant(node).inner;
	if (isolate(node, "Nullable")) return variant(node).inner;
	if (isolate(node, "Readonly")) return variant(node).inner;

	return undefined;
}

/**
 * The value of `key` on `schema`: the last annotation for it, or, when the
 * schema has none, the one on the schema it wraps, through `optional`,
 * `nullable` and `readonly` only (a field's `.optional()` keeps its label,
 * a `map` doesn't). `None` when there is none.
 *
 * @template T The type of the key's values
 * @param options The schema, and the key to read
 * @returns The key's value, typed by the key
 *
 * @example
 * A form generator reads each field's label from an object's shape:
 *
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { union } from "@sekhmet/enum/core/mini/exit";
 * import { isolate } from "@sekhmet/enum/core/mini/isolate";
 * import { unwrapOr } from "@sekhmet/enum/option/mini";
 * import { object, optional } from "@sekhmet/schema/composites/mini";
 * import { nodeOf } from "@sekhmet/schema/core/mini";
 * import { annotate, annotation, annotationKey } from "@sekhmet/schema/core/mini/annotation";
 * import { string } from "@sekhmet/schema/primitives/mini";
 *
 * const label = annotationKey<string>({ name: "label" });
 * const signUp = object({
 * 	shape: {
 * 		name: annotate(string({ minLength: 1 }), [label("Full name")]),
 * 		email: annotate(string({ format: "email" }), [label("Email")]),
 * 		referrer: optional(annotate(string(), [label("Who sent you?")])),
 * 		notes: string(),
 * 	},
 * });
 *
 * const node = nodeOf(signUp);
 * const fields: { key: string; label: string }[] = [];
 * if (isolate(node, "Object")) {
 * 	for (const [key, entry] of Object.entries(union(node).shape)) {
 * 		const schema = "schema" in entry ? entry.schema : entry;
 * 		const text = unwrapOr(annotation({ schema, key: label }), key);
 * 		fields.push({ key, label: text });
 * 	}
 * }
 *
 * assertEquals(fields, [
 * 	{ key: "name", label: "Full name" },
 * 	{ key: "email", label: "Email" },
 * 	{ key: "referrer", label: "Who sent you?" },
 * 	{ key: "notes", label: "notes" },
 * ]);
 * ```
 */
export function annotation<T>(options: AnnotationOptions<T>): Option<T> {
	const { schema, key } = options;
	const { node, annotations } = getStructParams(schema);
	const found = annotations.findLast((entry) => entry.key === key);
	if (found !== undefined) return Some(valueOfKey<T>(found));

	const inner = wrapped(node);
	if (inner === undefined) return None();

	return annotation({ schema: inner, key });
}

/**
 * The value of an annotation whose key is an `AnnotationKey<T>`. An
 * annotation's key is erased to `AnnotationKey<never>` when it is stored,
 * and identity, which `annotation` checked, is the only proof of `T` there
 * is: the type system can't carry it, so this one cast restores it.
 */
function valueOfKey<T>(entry: Annotation): T {
	return entry.value as T;
}
