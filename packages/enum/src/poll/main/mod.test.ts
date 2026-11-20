import { assertEquals, assertInstanceOf, unreachable } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import * as coreMini from "@/src/core/mini/mod.ts";
import { Err, Ok, Result } from "@/src/result/main/mod.ts";
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

Deno.test("main isReady() narrows to Ready and keeps a main Poll<T>", async (t) => {
	await t.step(
		"the guarded poll matches on Ready alone and keeps its methods",
		() => {
			// Given: a main Poll typed as either variant
			const poll: Poll<number> = Ready(42);

			// When: guarding it with isReady()
			if (poll.isReady()) {
				// Then: only the Ready arm is required, the payload is a number,
				// and main methods still chain
				const value = coreMini.match(poll)({ Ready: (n) => n });
				assertType<IsExact<typeof value, number>>(true);
				assertEquals(value, 42);
				assertEquals(poll.map((n) => n + 1).isReady(), true);
			} else {
				unreachable();
			}
		},
	);

	await t.step("an unguarded poll needs the Pending arm too", () => {
		// Given: a main Poll typed as either variant
		const poll: Poll<number> = Ready(42);

		// When: matching it with only a Ready arm
		// @ts-expect-error: the Pending arm is missing
		const value = coreMini.match(poll)({ Ready: (n: number) => n });

		// Then: the match is rejected at compile time
		assertEquals(value, 42);
	});

	await t.step("the else-branch is not narrowed", () => {
		// Given: a main Poll typed as either variant
		const poll: Poll<number> = Pending();

		// When: the guard fails
		if (poll.isReady()) {
			unreachable();
		} else {
			// Then: the poll keeps its declared type
			assertType<IsExact<typeof poll, Poll<number>>>(true);
		}
	});
});

Deno.test("main isPending() narrows to Pending and to a main Poll<never>", async (t) => {
	await t.step(
		"the guarded poll matches on Pending alone and fits any Poll",
		() => {
			// Given: a main Poll typed as either variant
			const poll: Poll<number> = Pending();

			// When: guarding it with isPending()
			if (poll.isPending()) {
				// Then: only the Pending arm is required, and it is a main Poll of any type
				assertEquals(
					coreMini.match(poll)({ Pending: () => "waiting" }),
					"waiting",
				);
				const other: Poll<string> = poll;
				assertEquals(other.map((s) => s.length).isPending(), true);
			} else {
				unreachable();
			}
		},
	);

	await t.step("an unguarded poll needs the Ready arm too", () => {
		// Given: a main Poll typed as either variant
		const poll: Poll<number> = Pending();

		// When: matching it with only a Pending arm
		// @ts-expect-error: the Ready arm is missing
		const label = coreMini.match(poll)({ Pending: () => "waiting" });

		// Then: the match is rejected at compile time
		assertEquals(label, "waiting");
	});

	await t.step("the else-branch is not narrowed", () => {
		// Given: a main Poll typed as either variant
		const poll: Poll<number> = Ready(42);

		// When: the guard fails
		if (poll.isPending()) {
			unreachable();
		} else {
			// Then: the poll keeps its declared type
			assertType<IsExact<typeof poll, Poll<number>>>(true);
		}
	});
});

Deno.test("Poll.mapOk and mapErr return main Polls of main Results", () => {
	// Given: a ready Ok, a ready Err and a Pending, each of a Result
	const done: Poll<Result<number, string>> = Ready(Ok(2));
	const failed: Poll<Result<number, string>> = Ready(Err("bad"));
	const waiting: Poll<Result<number, string>> = Pending();

	// When: mapping the success of one and the error of another
	const mapped = done.mapOk((n) => n * 10);
	const recovered = failed.mapErr((e) => e.length);

	// Then: both are main Polls whose Results are main, and chain
	assertInstanceOf(mapped, Poll);
	assertType<IsExact<typeof mapped, Poll<Result<number, string>>>>(true);
	assertType<IsExact<typeof recovered, Poll<Result<number, number>>>>(true);
	assertInstanceOf(coreMini.union(mapped), Result);
	assertEquals(
		mapped.map((result) => result.unwrapOr(0)),
		Ready(20),
	);
	assertEquals(
		recovered.map((result) => result.unwrapErr()),
		Ready(3),
	);
	assertEquals(waiting.mapOk((n) => n * 10).isPending(), true);
});

Deno.test("Poll.mapOk and mapErr exist only for a Poll of a Result", () => {
	// Given: a Poll of a number
	const plain = Ready(1);

	// When: writing mapOk and mapErr on it
	// @ts-expect-error: mapOk's this is a Poll of a Result
	const mapOk = (): unknown => plain.mapOk((n: number) => n);
	// @ts-expect-error: mapErr's this is a Poll of a Result
	const mapErr = (): unknown => plain.mapErr((e: string) => e);

	// Then: neither compiles, so neither is called
	assertEquals([typeof mapOk, typeof mapErr], ["function", "function"]);
});
