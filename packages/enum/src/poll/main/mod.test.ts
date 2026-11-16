import { assertEquals, assertInstanceOf } from "@std/assert";
import * as coreMini from "@/src/core/mini/mod.ts";
import * as mini from "../mini/mod.ts";
import { Pending, Poll, Ready } from "./mod.ts";

Deno.test("Poll methods chain on main constructors", () => {
	// Given: a main Ready and a main Pending
	const ready = Ready(5);
	const pending = Pending<number>();

	// When: mapping twice
	const mappedReady = ready.map((n) => n * 2).map((n) => `${n}`);
	const mappedPending = pending.map((n) => n * 2).map((n) => `${n}`);

	// Then: the results are main Polls in the expected states
	assertInstanceOf(mappedReady, Poll);
	assertEquals(mappedReady.isReady(), true);
	assertEquals(coreMini.union(mappedReady), "10");
	assertEquals(mappedPending.isPending(), true);
});

Deno.test("main Poll is an instance of mini Poll and mini Enum", () => {
	// Given: a main Ready
	const poll = Ready(1);

	// When: checking it against the mini classes
	const classes = [
		poll instanceof Poll,
		poll instanceof mini.Poll,
		poll instanceof coreMini.Enum,
	];

	// Then: it is all of them, so mini functions accept it
	assertEquals(classes, [true, true, true]);
	assertEquals(mini.isReady(poll), true);
});
