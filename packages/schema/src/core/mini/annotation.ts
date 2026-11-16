/**
 * Metadata a schema carries beside its structure: typed annotations, each
 * keyed by an {@linkcode AnnotationKey} you hold.
 *
 * @module
 */

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
