import { assertEquals } from "@std/assert";
import { sliceFromByte, splitTopLevel, typeParamModifiers } from "./source.ts";

Deno.test("typeParamModifiers reads const modifiers on a function", () => {
	// Given: a function declaration with a const type parameter
	const declaration =
		"export function isolate<T extends SomeVariant, const K extends T[0]>(self: Enum<T>, kind: K) {}";

	// When: reading its modifiers
	const modifiers = typeParamModifiers(declaration);

	// Then: only K carries const
	assertEquals([...modifiers], [["K", ["const"]]]);
});

Deno.test("typeParamModifiers reads variance on a class", () => {
	// Given: a class with in and out type parameters
	const declaration =
		"export class Pipe<in I, out O, X> extends Struct<F<I, O>> {}";

	// When: reading its modifiers
	const modifiers = typeParamModifiers(declaration);

	// Then: each annotated parameter keeps its modifier
	assertEquals(
		[...modifiers],
		[
			["I", ["in"]],
			["O", ["out"]],
		],
	);
});

Deno.test("typeParamModifiers skips arrow types inside constraints", () => {
	// Given: a constraint containing an arrow function type
	const declaration =
		"export function* run<F extends (x: number) => void, const K>(f: F) {}";

	// When: reading its modifiers
	const modifiers = typeParamModifiers(declaration);

	// Then: the arrow's `>` doesn't end the list early
	assertEquals([...modifiers], [["K", ["const"]]]);
});

Deno.test("typeParamModifiers is empty without type parameters", () => {
	// Given: a declaration without a type parameter list
	const declaration = "export function reverse(self: Ordering): Ordering {}";

	// When: reading its modifiers
	const modifiers = typeParamModifiers(declaration);

	// Then: there are none
	assertEquals(modifiers.size, 0);
});

Deno.test("sliceFromByte counts UTF-8 bytes, not characters", () => {
	// Given: source with a multi-byte character before the declaration
	const source = "// — note\nexport function f() {}";
	const byteIndex = new TextEncoder().encode("// — note\n").length;

	// When: slicing at the byte offset
	const sliced = sliceFromByte({ source, byteIndex });

	// Then: the slice starts at the declaration
	assertEquals(sliced, "export function f() {}");
});

Deno.test("splitTopLevel ignores nested commas", () => {
	// Given: a list whose items contain generic arguments
	const text = "A, B extends Map<K, V>, C = [1, 2]";

	// When: splitting it
	const pieces = splitTopLevel(text);

	// Then: it splits only at the top level
	assertEquals(pieces, ["A", " B extends Map<K, V>", " C = [1, 2]"]);
});
