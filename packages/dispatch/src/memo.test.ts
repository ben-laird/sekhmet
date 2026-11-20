import { Panic } from "@sekhmet/panic";
import { assert, assertEquals, assertThrows } from "@std/assert";
import { once, POISONED_MESSAGE } from "@/src/memo.ts";

Deno.test("once runs its computation on the first call only", () => {
	// Given: a computation that counts its runs
	let runs = 0;
	const double = once((n: number) => {
		runs += 1;
		return n * 2;
	});

	// When: it's called three times
	const values = [double(1), double(2), double(3)];

	// Then: it ran once, and every call got the first value
	assertEquals(runs, 1);
	assertEquals(values, [2, 2, 2]);
});

Deno.test("once is poisoned by a throw: the first caller gets it, later ones a poison panic", () => {
	// Given: a computation that throws
	const payload = new Error("mapping bug");
	let runs = 0;
	const broken = once((_: number): number => {
		runs += 1;
		throw payload;
	});

	// When: it's called, then called again
	const first = assertThrows(() => broken(1));
	const later = assertThrows(() => broken(2));

	// Then: the first call threw the payload, and the later one a poison panic caused by it
	assert(first === payload);
	assert(later instanceof Panic);
	assertEquals(later.name, "Panic (Poisoned)");
	assertEquals(later.message, POISONED_MESSAGE);
	assert(later.cause === payload);
	assertEquals(runs, 1);
});
