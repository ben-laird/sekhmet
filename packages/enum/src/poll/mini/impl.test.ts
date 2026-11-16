import { assertEquals, assertFalse } from "@std/assert";
import { Pending, type Poll, Ready } from "@/src/poll/mini/core.ts";
import * as TestSubject from "@/src/poll/mini/impl.ts";

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
