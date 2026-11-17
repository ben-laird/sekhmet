import { isNone, type Option, unwrap } from "@sekhmet/enum/option/mini";
import { Ok, unwrap as unwrapResult } from "@sekhmet/enum/result/mini";
import { getStructParams } from "@sekhmet/primordials/struct";
import { assertEquals, assertStrictEquals } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import { readonly } from "@/src/algebra/mini/readonly.ts";
import { nullable, optional } from "@/src/composites/mini/modifiers.ts";
import { Schema as MainSchema } from "@/src/core/main/mod.ts";
import {
	type AnnotationKey,
	annotate,
	annotation,
	annotationKey,
	description,
	title,
} from "./annotation.ts";
import { nodeOf } from "./node.ts";
import { map, type Output, parseSync, Schema } from "./schema.ts";
import { viewed } from "./view.ts";

const label = annotationKey<string>({ name: "label" });
const order = annotationKey<number>({ name: "order" });
const text = new Schema({ parse: (input: string) => Ok(input) });

Deno.test("annotate keeps the parser and node and adds the annotations", () => {
	// Given: a schema
	// When: annotating it
	const labelled = annotate(text, [label("Name"), order(1)]);

	// Then: it parses as before, with the same node, and has the annotations
	assertEquals(unwrapResult(parseSync(labelled, "Ada")), "Ada");
	assertStrictEquals(
		getStructParams(labelled).parse,
		getStructParams(text).parse,
	);
	assertStrictEquals(nodeOf(labelled), nodeOf(text));
	assertEquals(unwrap(annotation({ schema: labelled, key: label })), "Name");
	assertEquals(unwrap(annotation({ schema: labelled, key: order })), 1);
});

Deno.test("a later annotation for a key wins, across annotate calls too", () => {
	// Given: a key annotated twice in one call, then again
	const once = annotate(text, [label("First"), label("Second")]);
	const twice = annotate(once, [label("Third")]);

	// When: reading the key
	// Then: the last entry wins
	assertEquals(unwrap(annotation({ schema: once, key: label })), "Second");
	assertEquals(unwrap(annotation({ schema: twice, key: label })), "Third");
});

Deno.test("a key without an annotation, or another key's, reads None", () => {
	// Given: a schema annotated with one key, and another key of the same name
	const labelled = annotate(text, [label("Name")]);
	const otherLabel = annotationKey<string>({ name: "label" });

	// When: reading a missing key and the look-alike
	// Then: both are None: keys are told apart by identity
	assertEquals(isNone(annotation({ schema: labelled, key: title })), true);
	assertEquals(isNone(annotation({ schema: labelled, key: otherLabel })), true);
});

Deno.test("every other operation starts with no annotations", () => {
	// Given: an annotated schema
	const labelled = annotate(text, [label("Name")]);

	// When: transforming it
	const mapped = map(labelled, (value) => value.length);

	// Then: the transform has none of its own, and lookup doesn't reach in
	assertEquals(getStructParams(mapped).annotations, []);
	assertEquals(isNone(annotation({ schema: mapped, key: label })), true);
});

Deno.test("lookup falls back through optional, nullable and readonly", () => {
	// Given: an annotated schema behind each wrapper, and behind all three
	const labelled = annotate(text, [label("Name")]);
	const wrappers = [
		optional(labelled),
		nullable(labelled),
		readonly(labelled),
		readonly(nullable(optional(labelled))),
	];

	for (const schema of wrappers) {
		// When: reading the key through the wrapper
		// Then: the inner schema's annotation is found
		assertEquals(unwrap(annotation({ schema, key: label })), "Name");
	}
});

Deno.test("a wrapper's own annotation wins over its inner schema's", () => {
	// Given: an annotated schema, made optional and annotated again
	const inner = annotate(text, [label("Inner")]);
	const outer = annotate(optional(inner), [label("Outer")]);

	// When: reading the key
	// Then: the wrapper's own annotation is found first
	assertEquals(unwrap(annotation({ schema: outer, key: label })), "Outer");
});

Deno.test("annotations survive a main view and the main method", () => {
	// Given: a mini annotated schema, and a main schema annotated by method
	const mini = annotate(text, [label("Mini")]);
	const main = MainSchema.fromMini(text).annotate([label("Main")]);

	// When: viewing the mini schema as main, and chaining the main one
	const viewed = MainSchema.fromMini(mini);
	const chained = main.optional();

	// Then: the view keeps its annotations, and lookup sees through optional
	assertEquals(unwrap(annotation({ schema: viewed, key: label })), "Mini");
	assertEquals(unwrap(annotation({ schema: chained, key: label })), "Main");
});

Deno.test("annotate keeps the view, on a new mini or main Schema", () => {
	// Given: a mini and a main schema, each with a view
	const miniViewed = viewed({
		init: { parse: (input: string) => Ok(input) },
		view: { child: text },
	});
	const mainViewed = MainSchema.fromMiniView(miniViewed);

	// When: annotating each, with the function and the method
	const miniLabelled = annotate(miniViewed, [label("Mini")]);
	const mainLabelled = mainViewed.annotate([label("Main")]);

	// Then: each is a new Schema of its kind with the view, and the original
	// is unchanged
	assertType<IsExact<typeof miniLabelled.child, typeof text>>(true);
	assertType<IsExact<typeof mainLabelled.child, typeof text>>(true);
	assertType<IsExact<Output<typeof mainLabelled>, string>>(true);
	assertStrictEquals(miniLabelled.child, text);
	assertStrictEquals(mainLabelled.child, text);
	assertStrictEquals(Object.getPrototypeOf(miniLabelled), Schema.prototype);
	assertStrictEquals(Object.getPrototypeOf(mainLabelled), MainSchema.prototype);
	assertEquals(
		unwrap(annotation({ schema: mainLabelled, key: label })),
		"Main",
	);
	assertEquals(isNone(annotation({ schema: mainViewed, key: label })), true);
	assertEquals(mainLabelled.parseSync("a").unwrap(), "a");
});

Deno.test("annotate works on frozen and subclassed schemas, typed as a Schema", () => {
	// Given: a frozen main schema, and a subclass with private state
	class Secret extends MainSchema<string, string, never> {
		#count = 1;
		get count(): number {
			return this.#count;
		}
	}
	const frozen = Object.freeze(MainSchema.fromMini(text));
	const secret = new Secret({ parse: (input: string) => Ok(input) });

	// When: annotating each, with the method and the function
	const labelledFrozen = frozen.annotate([label("Frozen")]);
	const labelledSecret = annotate(secret, [label("Secret")]);

	// Then: each is a new, unfrozen Schema that parses and has the
	// annotation; the subclass's type is not claimed
	assertEquals(labelledFrozen.parseSync("a").unwrap(), "a");
	assertEquals(Object.isFrozen(labelledFrozen), false);
	assertEquals(
		unwrap(annotation({ schema: labelledSecret, key: label })),
		"Secret",
	);
	assertEquals(unwrapResult(parseSync(labelledSecret, "b")), "b");
	assertEquals(secret.count, 1);
	// @ts-expect-error the copy isn't a Secret: it has none of its private state
	const forged: Secret = labelledSecret;
	assertEquals(forged instanceof Secret, false);
});

Deno.test("annotation is typed by its key, and a key checks its values", () => {
	// Given: a string key and a number key
	const labelled = annotate(text, [label("Name"), order(1)]);

	// When: reading each
	const name = annotation({ schema: labelled, key: label });
	const position = annotation({ schema: labelled, key: order });

	// Then: each Option is typed by its key, and a wrong value doesn't compile
	assertType<IsExact<typeof name, Option<string>>>(true);
	assertType<IsExact<typeof position, Option<number>>>(true);
	// @ts-expect-error a label is a string
	label(1);
});

Deno.test("an annotation can't be forged, nor a key read at another type", () => {
	// Given: a string key
	const labelled = annotate(text, [label("Name")]);

	// When: forging an annotation from an object literal, and narrowing or
	// widening the key
	// Then: each is a type error, and the real annotation reads back as is
	// @ts-expect-error only calling a key builds an annotation
	annotate(text, [{ key: label, value: 42 }]);
	// @ts-expect-error keys are invariant: no narrower type
	const narrow: AnnotationKey<"a"> = label;
	// @ts-expect-error keys are invariant: no wider type
	const wide: AnnotationKey<unknown> = label;
	assertEquals([narrow, wide], [label, label]);
	assertEquals(unwrap(annotation({ schema: labelled, key: label })), "Name");
});

Deno.test("description and title are well-known string keys", () => {
	// Given: a schema with a title and a description
	const email = annotate(text, [title("Email"), description("Where we write")]);

	// When: reading them
	// Then: each is found, and each key is named for what it holds
	assertEquals(unwrap(annotation({ schema: email, key: title })), "Email");
	assertEquals(
		unwrap(annotation({ schema: email, key: description })),
		"Where we write",
	);
	assertEquals([title.name, description.name], ["title", "description"]);
});
