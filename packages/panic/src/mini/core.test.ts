import {
	assert,
	assertEquals,
	assertFalse,
	assertInstanceOf,
	assertMatch,
	assertNotEquals,
	assertThrows,
} from "@std/assert";
import { FakeTime } from "@std/testing/time";
import { Panic, panic, panicWithoutCause } from "@/src/mini/core.ts";

const UUID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

Deno.test("Panic is an Error carrying the source message", () => {
	// Given: a panic source with a message
	const source = { message: "invariant broken", cause: 1 };

	// When: constructing a Panic
	const subject = new Panic(source);

	// Then: it is an Error whose message is the source message
	assertInstanceOf(subject, Error);
	assertEquals(subject.message, "invariant broken");
});

Deno.test("Panic exposes the typed cause", () => {
	// Given: a structured cause
	const cause = { host: "localhost", port: 5432 };

	// When: constructing a Panic with that cause
	const subject = new Panic({ message: "Connection lost", cause });

	// Then: the cause is the same object
	assertEquals(subject.cause, cause);
});

Deno.test("Panic name is bare 'Panic' when no name is given", async (t) => {
	await t.step("name omitted", () => {
		// Given: a source without a name
		// When: constructing a Panic
		const subject = new Panic({ message: "m", cause: null });

		// Then: the name is just "Panic"
		assertEquals(subject.name, "Panic");
	});

	await t.step("name empty string", () => {
		// Given: a source with an empty name
		// When: constructing a Panic
		const subject = new Panic({ name: "", message: "m", cause: null });

		// Then: an empty name is treated as absent
		assertEquals(subject.name, "Panic");
	});

	await t.step("name explicitly undefined", () => {
		// Given: a source with an undefined name
		// When: constructing a Panic
		const subject = new Panic({ name: undefined, message: "m", cause: null });

		// Then: the name is just "Panic"
		assertEquals(subject.name, "Panic");
	});
});

Deno.test("Panic name includes a custom name in parentheses", () => {
	// Given: a source with a category name
	const source = { name: "DatabaseError", message: "m", cause: null };

	// When: constructing a Panic
	const subject = new Panic(source);

	// Then: the name is "Panic (DatabaseError)"
	assertEquals(subject.name, "Panic (DatabaseError)");
});

Deno.test("Panic id is a v4 UUID unique per instance", () => {
	// Given: two panics built from the same source
	const source = { message: "m", cause: null };

	// When: constructing both
	const first = new Panic(source);
	const second = new Panic(source);

	// Then: each id is a UUID, and the ids differ
	assertMatch(first.id, UUID);
	assertMatch(second.id, UUID);
	assertNotEquals(first.id, second.id);
});

Deno.test("Panic timestamp records the construction time", () => {
	// Given: a frozen clock
	using time = new FakeTime(new Date("2026-01-02T03:04:05.000Z"));

	// When: constructing a Panic
	const subject = new Panic({ message: "m", cause: null });

	// Then: the timestamp is the clock's current time
	assertEquals(subject.timestamp.getTime(), time.now);
});

Deno.test("Panic.check() narrows by the cause predicate", async (t) => {
	type Cause = { type: "network"; code: number } | { type: "disk" };
	const isNetwork = (c: Cause): c is { type: "network"; code: number } =>
		c.type === "network";

	await t.step("predicate matches", () => {
		// Given: a panic with a network cause
		const cause: Cause = { type: "network", code: 500 };
		const subject = new Panic<Cause>({ message: "m", cause });

		// When: checking against the network guard
		const matched = subject.check(isNetwork);

		// Then: the check succeeds and the narrowed cause is usable
		assert(matched);
		assertEquals(subject.cause.code, 500);
	});

	await t.step("predicate does not match", () => {
		// Given: a panic with a disk cause
		const cause: Cause = { type: "disk" };
		const subject = new Panic<Cause>({ message: "m", cause });

		// When: checking against the network guard
		const matched = subject.check(isNetwork);

		// Then: the check fails
		assertFalse(matched);
	});
});

Deno.test("panic() throws a Panic with the given source", () => {
	// Given: a named source with a cause
	const source = {
		name: "ValidationError",
		message: "Invalid input",
		cause: { field: "email" },
	};

	// When: calling panic()
	const thrown = assertThrows(() => panic(source), Panic, "Invalid input");

	// Then: the thrown Panic carries the name and cause
	assertEquals(thrown.name, "Panic (ValidationError)");
	assertEquals(thrown.cause, { field: "email" });
});

Deno.test("panicWithoutCause() throws a Panic whose cause is null", () => {
	// Given: a source without a cause
	const source = { message: "Unexpected state reached" };

	// When: calling panicWithoutCause()
	const thrown = assertThrows(
		() => panicWithoutCause(source),
		Panic,
		"Unexpected state reached",
	);

	// Then: the cause is null
	assertEquals(thrown.cause, null);
});
