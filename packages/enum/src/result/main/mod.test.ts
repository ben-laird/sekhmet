import { assertEquals, assertInstanceOf } from "@std/assert";
import * as coreMini from "@/src/core/mini/mod.ts";
import { Option } from "@/src/option/main/mod.ts";
import * as mini from "../mini/mod.ts";
import { Err, Ok, Result } from "./mod.ts";

Deno.test("Result methods chain on main constructors", () => {
	// Given: a main Ok and a main Err
	const ok = Ok<number, string>(2);
	const err = Err<number, string>("bad");

	// When: chaining transformations on each
	const fromOk = ok
		.map((n) => n + 1)
		.andThen((n) => (n > 2 ? Ok(n * 2) : Err("small")))
		.unwrapOr(0);
	const fromErr = err.mapErr((e) => e.toUpperCase()).unwrapErr();

	// Then: every step ran
	assertEquals(fromOk, 6);
	assertEquals(fromErr, "BAD");
});

Deno.test("main Result is an instance of mini Result and mini Enum", () => {
	// Given: a main Ok
	const result = Ok(1);

	// When: checking it against the mini classes
	const classes = [
		result instanceof Result,
		result instanceof mini.Result,
		result instanceof coreMini.Enum,
	];

	// Then: it is all of them, so mini functions accept it
	assertEquals(classes, [true, true, true]);
	assertEquals(mini.unwrap(result), 1);
});

Deno.test("Result.ok and Result.err return main Options", () => {
	// Given: a main Ok and a main Err
	const ok = Ok<number, string>(3);
	const err = Err<number, string>("nope");

	// When: projecting them to Options and chaining Option methods
	const value = ok.ok().map((n) => n * 2);
	const error = err.err().map((e) => e.length);

	// Then: the projections chain as main Options
	assertInstanceOf(value, Option);
	assertEquals(value.unwrap(), 6);
	assertEquals(error.unwrap(), 4);
});
