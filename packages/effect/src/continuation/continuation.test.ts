import { match, union, unionKinds } from "@sekhmet/enum/core/mini/exit";
import {
	assertEquals,
	assertInstanceOf,
	assertStrictEquals,
} from "@std/assert";
import {
	Async,
	type AsyncContinuation,
	Continuation,
	Deferred,
	Ready,
} from "@/src/continuation/continuation.ts";

Deno.test("Ready() wraps an immediately available value", () => {
	// Given: a value
	const value = { done: true };

	// When: wrapping it with Ready()
	const subject = Ready(value);

	// Then: it is a Ready continuation carrying the value
	assertInstanceOf(subject, Continuation);
	assertEquals(unionKinds(subject), "Ready");
	assertStrictEquals(union(subject), value);
});

Deno.test("Async() wraps a callback-driven computation without running it", () => {
	// Given: an async computation that records when it starts
	let started = false;
	const fn: AsyncContinuation<number> = () => {
		started = true;
	};

	// When: wrapping it with Async()
	const subject = Async(fn);

	// Then: it is an Async continuation holding the function, not yet started
	assertEquals(unionKinds(subject), "Async");
	assertStrictEquals(union(subject), fn);
	assertEquals(started, false);
});

Deno.test("Deferred() wraps a lazy step without running it", () => {
	// Given: a deferred step that records when it runs
	let ran = false;
	const fn = () => {
		ran = true;
		return Ready(1);
	};

	// When: wrapping it with Deferred()
	const subject = Deferred(fn);

	// Then: it is a Deferred continuation holding the function, not yet run
	assertEquals(unionKinds(subject), "Deferred");
	assertStrictEquals(union(subject), fn);
	assertEquals(ran, false);
});

Deno.test("Continuations nest: a Deferred step can yield another continuation", () => {
	// Given: a Deferred that produces an Async that produces a Ready
	const nested = Deferred(() => Async<number>((resolve) => resolve(Ready(7))));

	// When: driving it to completion by hand
	let resolved: Continuation<number> | undefined;
	const drive = (c: Continuation<number>): void =>
		match(c)({
			Ready: () => {
				resolved = c;
			},
			Deferred: (fn) => drive(fn()),
			Async: (fn) => {
				fn(drive);
			},
		});
	drive(nested);

	// Then: the innermost value is reached
	assertEquals(resolved, Ready(7));
});
