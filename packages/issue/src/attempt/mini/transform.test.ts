import { assertEquals, assertStrictEquals } from "@std/assert";
import { AlreadyHandled, type Attempt, Failed, Handled } from "./core.ts";
import { inspect, inspectErr, map, mapErr } from "./transform.ts";

const already: Attempt<number, string> = AlreadyHandled(1);
const handled: Attempt<number, string> = Handled(2);
const failed: Attempt<number, string> = Failed("offline");

Deno.test("map() maps the residue and keeps the variant", () => {
	// Given: one attempt of each variant
	// When: mapping the residue
	const mapped = [already, handled, failed].map((attempt) => {
		return map(attempt, (n) => n * 10);
	});

	// Then: handled residues are mapped in their own variant; Failed passes
	assertEquals(mapped, [AlreadyHandled(10), Handled(20), Failed("offline")]);
});

Deno.test("mapErr() maps the error and passes handled attempts through", () => {
	// Given: one attempt of each variant
	// When: mapping the error
	const mapped = [already, handled, failed].map((attempt) => {
		return mapErr(attempt, (e) => e.length);
	});

	// Then: only Failed changes
	assertEquals(mapped, [AlreadyHandled(1), Handled(2), Failed(7)]);
});

Deno.test("inspect() sees the residue of both handled variants and returns self", () => {
	// Given: one attempt of each variant, and a log
	const seen: number[] = [];

	// When: inspecting each
	const returned = [already, handled, failed].map((attempt) => {
		return inspect(attempt, (n) => seen.push(n));
	});

	// Then: it saw both residues, and each attempt came back itself
	assertEquals(seen, [1, 2]);
	assertStrictEquals(returned[0], already);
	assertStrictEquals(returned[2], failed);
});

Deno.test("inspectErr() sees the error of Failed only and returns self", () => {
	// Given: one attempt of each variant, and a log
	const seen: string[] = [];

	// When: inspecting each one's error
	const returned = [already, handled, failed].map((attempt) => {
		return inspectErr(attempt, (e) => seen.push(e));
	});

	// Then: it saw the one error, and each attempt came back itself
	assertEquals(seen, ["offline"]);
	assertStrictEquals(returned[1], handled);
});
