import { assertEquals, assertFalse, unreachable } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import { match, union } from "@/src/core/mini/exit.ts";
import { Pending, type Poll, Ready } from "@/src/poll/mini/core.ts";
import * as TestSubject from "@/src/poll/mini/impl.ts";
import { Err, Ok, type Result } from "@/src/result/mini/core.ts";

/** A small table of Polls of Results used for mapOk/mapErr tests. */
const RESULT_SAMPLES: Poll<Result<number, string>>[] = [
	Ready(Ok(3)),
	Ready(Err("bad")),
	Pending(),
];

Deno.test("mapOk() maps only a ready Ok", () => {
	// Given: a ready Ok, a ready Err and a Pending
	const seen: number[] = [];
	const double = (n: number): number => {
		seen.push(n);
		return n * 2;
	};

	// When: mapping each one's success value
	const mapped = RESULT_SAMPLES.map((poll) => {
		return TestSubject.mapOk(poll, double);
	});

	// Then: only the Ok changed, and the mapping ran once, on its value
	assertEquals(mapped, [Ready(Ok(6)), Ready(Err("bad")), Pending()]);
	assertEquals(seen, [3]);
});

Deno.test("mapErr() maps only a ready Err", () => {
	// Given: a ready Ok, a ready Err and a Pending
	const seen: string[] = [];
	const length = (e: string): number => {
		seen.push(e);
		return e.length;
	};

	// When: mapping each one's error value
	const mapped = RESULT_SAMPLES.map((poll) => {
		return TestSubject.mapErr(poll, length);
	});

	// Then: only the Err changed, and the mapping ran once, on its error
	assertEquals(mapped, [Ready(Ok(3)), Ready(Err(3)), Pending()]);
	assertEquals(seen, ["bad"]);
});

Deno.test("mapOk() and mapErr() type their results", () => {
	// Given: a Poll of a Result
	const poll: Poll<Result<number, string>> = Ready(Ok(1));

	// When: mapping the success and the error types
	const okMapped = TestSubject.mapOk(poll, String);
	const errMapped = TestSubject.mapErr(poll, (e) => e.length);

	// Then: each changes only its own side of the Result
	assertType<IsExact<typeof okMapped, Poll<Result<string, string>>>>(true);
	assertType<IsExact<typeof errMapped, Poll<Result<number, number>>>>(true);
	assertEquals(okMapped, Ready(Ok("1")));
});

Deno.test("mapOk() obeys the functor laws", async (t) => {
	await t.step("identity: mapOk(p, id) ≡ p", () => {
		for (const p of RESULT_SAMPLES) {
			// Given: a Poll of a Result
			// When: mapping with the identity
			const subject = TestSubject.mapOk(p, (n) => n);

			// Then: it is unchanged
			assertEquals(subject, p);
		}
	});

	await t.step("composition: mapOk(mapOk(p, f), g) ≡ mapOk(p, g ∘ f)", () => {
		const f = (n: number): number => n + 1;
		const g = (n: number): string => `${n}`;
		for (const p of RESULT_SAMPLES) {
			// Given: a Poll of a Result and two mappings
			// When: mapping in two steps versus one
			const twoSteps = TestSubject.mapOk(TestSubject.mapOk(p, f), g);
			const oneStep = TestSubject.mapOk(p, (n) => g(f(n)));

			// Then: both agree
			assertEquals(twoSteps, oneStep);
		}
	});
});

const SAMPLES: Poll<number>[] = [Ready(0), Ready(4), Ready(-1), Pending()];

Deno.test("isReady() and isPending() are complementary", () => {
	for (const p of SAMPLES) {
		// Given: a poll p
		// When: checking both predicates
		const ready = TestSubject.isReady(p);
		const pending = TestSubject.isPending(p);

		// Then: exactly one holds
		assertEquals(ready, !pending);
	}
});

Deno.test("isReady() identifies Ready", () => {
	// Given: one poll of each variant
	// When: checking readiness
	// Then: only Ready is ready
	assertEquals(TestSubject.isReady(Ready(1)), true);
	assertEquals(TestSubject.isReady(Pending()), false);
});

Deno.test("isReady() narrows to the Ready variant and keeps T", async (t) => {
	await t.step("a match after the guard needs only the Ready arm", () => {
		// Given: a Poll typed as either variant
		const poll: Poll<number> = Ready(42);

		// When: guarding it with isReady()
		if (TestSubject.isReady(poll)) {
			// Then: only the Ready arm is required
			const value = match(poll)({ Ready: (n) => n });
			assertEquals(value, 42);
		} else {
			unreachable();
		}
	});

	await t.step("an unguarded match needs the Pending arm too", () => {
		// Given: a Poll typed as either variant
		const poll: Poll<number> = Ready(42);

		// When: matching it with only a Ready arm
		// @ts-expect-error: the Pending arm is missing
		const value = match(poll)({ Ready: (n: number) => n });

		// Then: the match is rejected at compile time
		assertEquals(value, 42);
	});

	await t.step("the guarded poll is still a Poll<T>", () => {
		// Given: a Poll typed as either variant
		const poll: Poll<number> = Ready(42);

		// When: guarding it with isReady()
		if (TestSubject.isReady(poll)) {
			// Then: it is still assignable to Poll<number>
			const same: Poll<number> = poll;
			assertEquals(same, Ready(42));
		} else {
			unreachable();
		}
	});

	await t.step("the guarded payload is exactly T", () => {
		// Given: a Poll typed as either variant
		const poll: Poll<number> = Ready(42);

		// When: guarding it with isReady() and reading its value
		if (TestSubject.isReady(poll)) {
			const value = union(poll);

			// Then: the value is a number, not number | undefined
			assertType<IsExact<typeof value, number>>(true);
			assertEquals(value, 42);
		} else {
			unreachable();
		}
	});

	await t.step("the else-branch is not narrowed", () => {
		// Given: a Poll typed as either variant
		const poll: Poll<number> = Pending();

		// When: the guard fails
		if (TestSubject.isReady(poll)) {
			unreachable();
		} else {
			// Then: the poll keeps its declared type
			assertType<IsExact<typeof poll, Poll<number>>>(true);
		}
	});
});

Deno.test("isPending() narrows to the Pending variant and to Poll<never>", async (t) => {
	await t.step("a match after the guard needs only the Pending arm", () => {
		// Given: a Poll typed as either variant
		const poll: Poll<number> = Pending();

		// When: guarding it with isPending()
		if (TestSubject.isPending(poll)) {
			// Then: only the Pending arm is required
			const label = match(poll)({ Pending: () => "pending" });
			assertEquals(label, "pending");
		} else {
			unreachable();
		}
	});

	await t.step("an unguarded match needs the Ready arm too", () => {
		// Given: a Poll typed as either variant
		const poll: Poll<number> = Pending();

		// When: matching it with only a Pending arm
		// @ts-expect-error: the Ready arm is missing
		const label = match(poll)({ Pending: () => "pending" });

		// Then: the match is rejected at compile time
		assertEquals(label, "pending");
	});

	await t.step("the guarded poll is a Poll of any type", () => {
		// Given: a Poll typed as either variant
		const poll: Poll<number> = Pending();

		// When: guarding it with isPending()
		if (TestSubject.isPending(poll)) {
			// Then: it is assignable to a Poll of an unrelated type
			const other: Poll<string> = poll;
			assertEquals(other, Pending());
		} else {
			unreachable();
		}
	});

	await t.step("the else-branch is not narrowed", () => {
		// Given: a Poll typed as either variant
		const poll: Poll<number> = Ready(42);

		// When: the guard fails
		if (TestSubject.isPending(poll)) {
			unreachable();
		} else {
			// Then: the poll keeps its declared type
			assertType<IsExact<typeof poll, Poll<number>>>(true);
		}
	});
});

Deno.test("map() transforms Ready and preserves Pending", async (t) => {
	await t.step("Ready", () => {
		// Given: Ready(2)
		// When: mapping
		const subject = TestSubject.map(Ready(2), (n) => n * 3);

		// Then: Ready(6)
		assertEquals(subject, Ready(6));
	});

	await t.step("Pending never calls the mapping", () => {
		// Given: Pending and a tracking mapping
		const poll: Poll<number> = Pending();
		let called = false;

		// When: mapping
		const subject = TestSubject.map(poll, (n) => {
			called = true;
			return n;
		});

		// Then: still Pending
		assertEquals(subject, Pending());
		assertFalse(called);
	});
});

Deno.test("map() obeys the functor laws", async (t) => {
	const f = (n: number) => n + 1;
	const g = (n: number) => `${n}`;

	await t.step("identity", () => {
		for (const p of SAMPLES) {
			// Given: a poll p
			// When: mapping with identity
			const subject = TestSubject.map(p, (x) => x);

			// Then: p is unchanged
			assertEquals(subject, p);
		}
	});

	await t.step("composition", () => {
		for (const p of SAMPLES) {
			// Given: a poll p
			// When: mapping in two steps versus once
			const twoSteps = TestSubject.map(TestSubject.map(p, f), g);
			const oneStep = TestSubject.map(p, (x) => g(f(x)));

			// Then: both agree
			assertEquals(twoSteps, oneStep);
		}
	});
});
