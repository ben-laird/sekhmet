import {
	assertEquals,
	assertInstanceOf,
	assertStrictEquals,
	unreachable,
} from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import * as coreMini from "@/src/core/mini/mod.ts";
import { Err, Ok, Result } from "@/src/result/main/mod.ts";
import * as mini from "../mini/mod.ts";
import { flatten, maybe, None, Option, Some, transpose, unzip } from "./mod.ts";

Deno.test("Option methods chain on main constructors", () => {
	// Given: a main Some
	const start = Some(21);

	// When: chaining transformations
	const label = start
		.map((n) => n * 2)
		.filter((n) => n > 40)
		.mapOr("none", (n) => `got ${n}`);

	// Then: every step ran
	assertEquals(label, "got 42");
	assertEquals(
		None<number>()
			.map((n) => n + 1)
			.unwrapOr(0),
		0,
	);
});

Deno.test("main Option is an instance of mini Option and mini Enum", () => {
	// Given: a main Some
	const option = Some(1);

	// When: checking it against the mini classes
	const classes = [
		option instanceof Option,
		option instanceof mini.Option,
		option instanceof coreMini.Enum,
	];

	// Then: it is all of them, so mini functions accept it
	assertEquals(classes, [true, true, true]);
	assertEquals(mini.unwrap(option), 1);
});

Deno.test("Option methods returning Option return main Options", () => {
	// Given: a main Some and a mini None
	const some = Some(2);
	const miniNone = mini.None<number>();

	// When: combining them through methods and wrappers
	const ored = miniNone instanceof Option ? undefined : some.and(miniNone);
	const flat = flatten(Some(Some(3)));

	// Then: results are main Options even when mini returned a mini one
	assertInstanceOf(ored, Option);
	assertInstanceOf(flat, Option);
	assertEquals(flat.unwrap(), 3);
});

Deno.test("Option methods returning self keep its identity", () => {
	// Given: a main Some
	const option = Some(5);
	const seen: number[] = [];

	// When: inspecting it
	const inspected = option.inspect((value) => seen.push(value));

	// Then: the same instance comes back
	assertStrictEquals(inspected, option);
	assertEquals(seen, [5]);
});

Deno.test("Option.okOr returns a main Result", () => {
	// Given: a main Some and a main None
	const some = Some(4);
	const none = None<number>();

	// When: converting them to Results and chaining a Result method
	const ok = some.okOr("missing").map((n) => n * 10);
	const err = none.okOr("missing").mapErr((e) => e.length);

	// Then: the conversions chain as main Results
	assertInstanceOf(ok, Result);
	assertEquals(ok.unwrap(), 40);
	assertEquals(err.unwrapErr(), 7);
});

Deno.test("Option mutating methods mutate the receiver", () => {
	// Given: a main None
	const option = None<number>();

	// When: inserting a value, then taking it back out
	const inserted = option.getOrInsert(7);
	const taken = option.take();

	// Then: the receiver changed in place, and take returned a main Option
	assertEquals(inserted, 7);
	assertInstanceOf(taken, Option);
	assertEquals(taken.unwrap(), 7);
	assertEquals(option.isNone(), true);
});

Deno.test("a main view of a mini Option shares its state", () => {
	// Given: a mini Some returned through a main method
	const miniOption = mini.Some(1);
	const view = None<number>().or(miniOption);

	// When: taking the value out through the main view
	const taken = view.take();

	// Then: the mini source was emptied too, and the view is a main Option
	assertInstanceOf(view, Option);
	assertEquals(taken.unwrap(), 1);
	assertEquals(mini.isNone(miniOption), true);
});

Deno.test("unzip returns a tuple of main Options", () => {
	// Given: a main Some holding a pair
	const pair = Some<[number, string]>([1, "a"]);

	// When: unzipping it and chaining on each half
	const [first, second] = unzip(pair);

	// Then: both halves are main Options that chain
	assertInstanceOf(first, Option);
	assertInstanceOf(second, Option);
	assertEquals(first.map((n) => n + 1).unwrap(), 2);
	assertEquals(second.map((s) => s.toUpperCase()).unwrap(), "A");
});

Deno.test("maybe returns a main Option that chains", () => {
	// Given: a present value and an absent one
	const present: number | null = 0;
	const absent: number | null = null;

	// When: wrapping each with main maybe and chaining on it
	const some = maybe(present);
	const none = maybe(absent);

	// Then: both are main Options and the chain runs
	assertInstanceOf(some, Option);
	assertInstanceOf(none, Option);
	assertEquals(some.map((n) => n + 1).unwrapOr(-1), 1);
	assertEquals(none.map((n) => n + 1).unwrapOr(-1), -1);
});

Deno.test("transpose returns a main Result holding a main Option", () => {
	// Given: a main Some of an Ok and a main Some of an Err
	const okInside = Some(Ok<number, string>(5));
	const errInside = Some(Err<number, string>("bad"));

	// When: transposing them and chaining through both layers
	const transposed = transpose(okInside);
	const inner = transposed.unwrap();

	// Then: the Result and the Option inside it are both main
	assertInstanceOf(transposed, Result);
	assertInstanceOf(inner, Option);
	assertEquals(inner.map((n) => n * 2).unwrap(), 10);
	assertEquals(transpose(errInside).unwrapErr(), "bad");
});

Deno.test("main isSome() narrows to Some and keeps a main Option<T>", async (t) => {
	await t.step(
		"the guarded option matches on Some alone and keeps its methods",
		() => {
			// Given: a main Option typed as either variant
			const option: Option<number> = Some(42);

			// When: guarding it with isSome()
			if (option.isSome()) {
				// Then: only the Some arm is required, the payload is a number,
				// and main methods still chain
				const value = coreMini.match(option)({ Some: (n) => n });
				assertType<IsExact<typeof value, number>>(true);
				assertEquals(option.map((n) => n + 1).unwrap(), 43);
			} else {
				unreachable();
			}
		},
	);

	await t.step("an unguarded option needs the None arm too", () => {
		// Given: a main Option typed as either variant
		const option: Option<number> = Some(42);

		// When: matching it with only a Some arm
		// @ts-expect-error: the None arm is missing
		const value = coreMini.match(option)({ Some: (n: number) => n });

		// Then: the match is rejected at compile time
		assertEquals(value, 42);
	});

	await t.step("the else-branch is not narrowed", () => {
		// Given: a main Option typed as either variant
		const option: Option<number> = None();

		// When: the guard fails
		if (option.isSome()) {
			unreachable();
		} else {
			// Then: the option keeps its declared type
			assertType<IsExact<typeof option, Option<number>>>(true);
		}
	});
});

Deno.test("main isSomeAnd() narrows to Some and a main Option<U>", async (t) => {
	await t.step("a type-guard predicate narrows the payload", () => {
		// Given: a main Option whose value may be a string or a number
		const option: Option<string | number> = Some(42);

		// When: guarding it with a guard for numbers
		if (option.isSomeAnd((x): x is number => typeof x === "number")) {
			// Then: only the Some arm is required, and it is a main Option<number>
			const value = coreMini.match(option)({ Some: (n) => n });
			assertType<IsExact<typeof value, number>>(true);
			const narrowed: Option<number> = option;
			assertEquals(narrowed.map((n) => n + 1).unwrap(), 43);
		} else {
			unreachable();
		}
	});

	await t.step("the else-branch is not narrowed", () => {
		// Given: a main Option holding a string
		const option: Option<string | number> = Some("hello");

		// When: the numeric guard fails
		if (option.isSomeAnd((x): x is number => typeof x === "number")) {
			unreachable();
		} else {
			// Then: the option keeps its declared type
			assertType<IsExact<typeof option, Option<string | number>>>(true);
		}
	});
});

Deno.test("main isNone() narrows to None and to a main Option<never>", async (t) => {
	await t.step(
		"the guarded option matches on None alone and fits any Option",
		() => {
			// Given: a main Option typed as either variant
			const option: Option<number> = None();

			// When: guarding it with isNone()
			if (option.isNone()) {
				// Then: only the None arm is required, and it is a main Option of any type
				assertEquals(coreMini.match(option)({ None: () => "empty" }), "empty");
				const other: Option<string> = option;
				assertEquals(other.map((s) => s.length).isNone(), true);
			} else {
				unreachable();
			}
		},
	);

	await t.step("an unguarded option needs the Some arm too", () => {
		// Given: a main Option typed as either variant
		const option: Option<number> = None();

		// When: matching it with only a None arm
		// @ts-expect-error: the Some arm is missing
		const label = coreMini.match(option)({ None: () => "empty" });

		// Then: the match is rejected at compile time
		assertEquals(label, "empty");
	});

	await t.step("the else-branch is not narrowed", () => {
		// Given: a main Option typed as either variant
		const option: Option<number> = Some(42);

		// When: the guard fails
		if (option.isNone()) {
			unreachable();
		} else {
			// Then: the option keeps its declared type
			assertType<IsExact<typeof option, Option<number>>>(true);
		}
	});
});
