import { Enum, union, unionKinds } from "@sekhmet/enum/core/mini";
import { assert, assertEquals, assertInstanceOf } from "@std/assert";
import { IssueState } from "./core.ts";

Deno.test("an IssueState is an Enum holding its variant", () => {
	// Given: an unhandled and a handled state
	const unhandled = new IssueState<string, number>("Unhandled", "app.json");
	const handled = new IssueState<string, number>("Handled", 8080);

	// When: each is read as an enum
	// Then: each is an Enum, with its kind and the value it holds
	assertInstanceOf(unhandled, Enum);
	assertEquals(
		[unionKinds(unhandled), union(unhandled)],
		["Unhandled", "app.json"],
	);
	assertEquals([unionKinds(handled), union(handled)], ["Handled", 8080]);
});

Deno.test("an IssueState is invariant in both type parameters", () => {
	// Given: a state over a wide value and a wide residue
	const wide = new IssueState<string | number, number | boolean>(
		"Unhandled",
		1,
	);

	// When: widening or narrowing either parameter is written (never run)
	const misuses = (): void => {
		// @ts-expect-error: widening T is rejected
		const _widenedT: IssueState<unknown, number | boolean> = wide;
		// @ts-expect-error: narrowing T is rejected
		const _narrowedT: IssueState<string, number | boolean> = wide;
		// @ts-expect-error: widening R is rejected
		const _widenedR: IssueState<string | number, unknown> = wide;
		// @ts-expect-error: narrowing R is rejected
		const _narrowedR: IssueState<string | number, number> = wide;
	};

	// Then: none of it type-checks
	assert(typeof misuses === "function");
});
