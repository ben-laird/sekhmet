import { assertEquals } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import { None, type Option, Some } from "./core.ts";
import { maybe, type Present } from "./nullable.ts";

/** Returns `value` typed as `T`, out of reach of control-flow narrowing. */
function typed<T>(value: T): T {
	return value;
}

Deno.test("maybe() by default treats null and undefined as absent", async (t) => {
	await t.step("null and undefined are None", () => {
		// Given: the two nullish values
		const values = [null, undefined];

		// When: each is wrapped with the default mode
		const options = values.map((value) => maybe(value));

		// Then: both are None
		assertEquals(options, [None(), None()]);
	});

	await t.step("falsy values are Some", () => {
		// Given: values that are falsy but not nullish
		const values = [0, "", false, Number.NaN, 0n];

		// When: each is wrapped with the default mode
		const options = values.map((value) => maybe(value));

		// Then: every one is Some, with the value unchanged
		assertEquals(
			options,
			values.map((value) => Some(value)),
		);
	});

	await t.step("an explicit nullish mode matches the default", () => {
		// Given: a nullish value and a present one
		const absent: string | null | undefined = undefined;
		const present: string | null | undefined = "text";

		// When: each is wrapped with absent: "nullish"
		const none = maybe(absent, { absent: "nullish" });
		const some = maybe(present, { absent: "nullish" });

		// Then: they match the default mode
		assertEquals(none, None());
		assertEquals(some, Some("text"));
	});
});

Deno.test('maybe() with absent: "undefined" keeps null', async (t) => {
	await t.step("undefined is None", () => {
		// Given: undefined
		const value = undefined;

		// When: it is wrapped with absent: "undefined"
		const option = maybe(value, { absent: "undefined" });

		// Then: it is None
		assertEquals(option, None());
	});

	await t.step("null and falsy values are Some", () => {
		// Given: null and the falsy values
		const values = [null, 0, "", false];

		// When: each is wrapped with absent: "undefined"
		const options = values.map((value) => {
			return maybe(value, { absent: "undefined" });
		});

		// Then: every one is Some
		assertEquals(
			options,
			values.map((value) => Some(value)),
		);
	});
});

Deno.test('maybe() with absent: "null" keeps undefined', async (t) => {
	await t.step("null is None", () => {
		// Given: null
		const value = null;

		// When: it is wrapped with absent: "null"
		const option = maybe(value, { absent: "null" });

		// Then: it is None
		assertEquals(option, None());
	});

	await t.step("undefined and falsy values are Some", () => {
		// Given: undefined and the falsy values
		const values = [undefined, 0, "", false];

		// When: each is wrapped with absent: "null"
		const options = values.map((value) => maybe(value, { absent: "null" }));

		// Then: every one is Some
		assertEquals(
			options,
			values.map((value) => Some(value)),
		);
	});
});

Deno.test("maybe() narrows the Some type per absent mode", () => {
	// Given: a value that may be a string, null or undefined
	const value = typed<string | null | undefined>(null);

	// When: it is wrapped in each mode
	const byDefault = maybe(value);
	const nullish = maybe(value, { absent: "nullish" });
	const notUndefined = maybe(value, { absent: "undefined" });
	const notNull = maybe(value, { absent: "null" });
	const empty = maybe(value, {});

	// Then: each Some type drops exactly what the mode counts as absent
	assertType<IsExact<typeof byDefault, Option<string>>>(true);
	assertType<IsExact<typeof nullish, Option<string>>>(true);
	assertType<IsExact<typeof notUndefined, Option<string | null>>>(true);
	assertType<IsExact<typeof notNull, Option<string | undefined>>>(true);
	assertType<IsExact<typeof empty, Option<string>>>(true);
});

Deno.test("maybe() with a widened mode keeps both possibilities", () => {
	// Given: a mode only known to be "undefined" or "null"
	const value = typed<string | null | undefined>("x");
	const absent = typed<"undefined" | "null">("null");

	// When: the value is wrapped with it
	const option = maybe(value, { absent });

	// Then: the Some type is the union of both modes' narrowings
	assertType<IsExact<typeof option, Option<string | null | undefined>>>(true);
});

Deno.test("maybe() treats an undefined mode as the nullish default", () => {
	// Given: options whose mode is undefined, as consumers' default
	// (non-exact) optional properties allow
	const value = typed<string | null | undefined>(null);
	const options = typed<{ absent?: "null" | undefined }>({ absent: undefined });

	// When: the value is wrapped with an explicit undefined and with them
	const explicit = maybe(value, { absent: undefined });
	const loose = maybe(value, options);

	// Then: explicit undefined narrows like the default, and a possibly
	// undefined mode narrows to what its mode removes
	assertType<IsExact<typeof explicit, Option<string>>>(true);
	assertType<IsExact<typeof loose, Option<string | undefined>>>(true);
	assertEquals([explicit, loose], [None(), None()]);
});

Deno.test("Present of a never mode is the nullish default's narrowing", () => {
	// Given: a possibly absent type
	type Value = string | null | undefined;

	// When: it is narrowed by the never mode, which no value has at runtime
	type Narrowed = Present<Value, never>;

	// Then: it narrows like the "nullish" fallback, not to never
	assertType<IsExact<Narrowed, string>>(true);
	assertType<IsExact<Narrowed, Present<Value, "nullish">>>(true);
});

Deno.test("maybe() rejects unknown modes and narrowed reads", () => {
	// Given: a possibly absent value
	const value = typed<number | null | undefined>(1);

	// When / Then: a mode outside Absent does not compile
	// @ts-expect-error "falsy" is not a mode: truthiness is never checked
	maybe(value, { absent: "falsy" });

	// When / Then: a mode that keeps null cannot be read as a plain number
	// @ts-expect-error absent: "undefined" keeps null in the Some type
	const kept: Option<number> = maybe(value, { absent: "undefined" });

	// Then: the default mode's narrowed type does compile
	const narrowed: Option<number> = maybe(value);
	assertEquals([kept, narrowed], [Some(1), Some(1)]);
});

Deno.test("maybe()'s Option is covariant in the narrowed type", () => {
	// Given: a narrowed Option and a wide one
	const value = typed<number | null>(1);
	const narrow = maybe(value);
	const wide = maybe(value, { absent: "undefined" });

	// When / Then: widening the narrowed Option is accepted
	const widened: Option<number | null> = narrow;

	// Then: narrowing the wide Option is rejected
	// @ts-expect-error Option<number | null> is not Option<number>
	const narrowed: Option<number> = wide;

	// Then: widening still holds when checked after a rejection
	const widenedAgain: Option<number | null | undefined> = narrow;
	assertEquals([widened, narrowed, widenedAgain], [Some(1), Some(1), Some(1)]);
});
