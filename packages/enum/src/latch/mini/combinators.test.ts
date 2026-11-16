import { assertEquals, assertFalse } from "@std/assert";
import * as TestSubject from "@/src/latch/mini/combinators.ts";
import { Active, Inactive, type Latch } from "@/src/latch/mini/core.ts";

const SAMPLES: Latch<number, string>[] = [
	Active(0),
	Active(3),
	Active(-8),
	Inactive(""),
	Inactive("off"),
];

Deno.test("and() returns the second latch only when the first is Active", async (t) => {
	await t.step("Active and Active", () => {
		// Given: two Active latches
		// When: combining with and()
		const subject = TestSubject.and(Active(1), Active("two"));

		// Then: the second
		assertEquals(subject, Active("two"));
	});

	await t.step("Active and Inactive", () => {
		// Given: Active then Inactive
		// When: combining with and()
		const subject = TestSubject.and(Active(1), Inactive("late"));

		// Then: the second
		assertEquals(subject, Inactive("late"));
	});

	await t.step("Inactive and anything", () => {
		// Given: Inactive then Active
		const first: Latch<number, string> = Inactive("early");

		// When: combining with and()
		const subject = TestSubject.and(first, Active("two"));

		// Then: the first inactive value short-circuits
		assertEquals(subject, Inactive("early"));
	});
});

Deno.test("andThen() chains on Active and short-circuits on Inactive", async (t) => {
	await t.step("Active", () => {
		// Given: Active(4)
		// When: chaining
		const subject = TestSubject.andThen(Active(4), (n) => Active(n + 1));

		// Then: the chained latch
		assertEquals(subject, Active(5));
	});

	await t.step("Inactive never calls the continuation", () => {
		// Given: an Inactive latch and a tracking continuation
		const first: Latch<number, string> = Inactive("off");
		let called = false;

		// When: chaining
		const subject = TestSubject.andThen(first, (n) => {
			called = true;
			return Active(n);
		});

		// Then: the latch passes through
		assertEquals(subject, Inactive("off"));
		assertFalse(called);
	});
});

Deno.test("andThen() obeys the monad laws (Active as unit)", async (t) => {
	const f = (n: number): Latch<number, string> =>
		n >= 0 ? Active(n * 2) : Inactive("negative");
	const g = (n: number): Latch<number, string> =>
		n < 5 ? Active(n + 1) : Inactive("big");

	await t.step("left identity: andThen(Active(a), f) ≡ f(a)", () => {
		for (const a of [0, 1, -1, 3, 10]) {
			// Given: a plain value a
			// When: lifting then chaining f
			const subject = TestSubject.andThen(Active(a), f);

			// Then: it equals f(a)
			assertEquals(subject, f(a));
		}
	});

	await t.step("right identity: andThen(m, Active) ≡ m", () => {
		for (const m of SAMPLES) {
			// Given: a latch m
			// When: chaining with Active
			const subject = TestSubject.andThen(m, Active);

			// Then: m is unchanged
			assertEquals(subject, m);
		}
	});

	await t.step("associativity", () => {
		for (const m of SAMPLES) {
			// Given: a latch m and continuations f, g
			// When: associating left versus right
			const left = TestSubject.andThen(TestSubject.andThen(m, f), g);
			const right = TestSubject.andThen(m, (x) => TestSubject.andThen(f(x), g));

			// Then: both agree
			assertEquals(left, right);
		}
	});
});

Deno.test("or() returns the first Active, else the fallback", async (t) => {
	await t.step("Active or anything", () => {
		// Given: Active first
		// When: combining with or()
		const subject = TestSubject.or(Active(1), Active(2));

		// Then: the first
		assertEquals(subject, Active(1));
	});

	await t.step("Inactive or fallback", () => {
		// Given: Inactive first
		const first: Latch<number, string> = Inactive("off");

		// When: combining with or()
		const subject = TestSubject.or(first, Inactive(0));

		// Then: the fallback
		assertEquals(subject, Inactive(0));
	});
});

Deno.test("orElse() recovers on Inactive and short-circuits on Active", async (t) => {
	await t.step("Inactive", () => {
		// Given: Inactive("abc")
		const first: Latch<number, string> = Inactive("abc");

		// When: recovering
		const subject = TestSubject.orElse(first, (s) => Active(s.length));

		// Then: the recovered latch
		assertEquals(subject, Active(3));
	});

	await t.step("Active never calls the recovery", () => {
		// Given: an Active latch and a tracking recovery
		let called = false;

		// When: recovering
		const subject = TestSubject.orElse(Active(1), () => {
			called = true;
			return Active(0);
		});

		// Then: the latch passes through
		assertEquals(subject, Active(1));
		assertFalse(called);
	});
});

Deno.test("orElse() obeys the monad laws on the inactive channel (Inactive as unit)", async (t) => {
	const f = (s: string): Latch<number, string> =>
		s === "" ? Active(0) : Inactive(`${s}!`);
	const g = (s: string): Latch<number, string> =>
		s.length > 3 ? Active(s.length) : Inactive(s.toUpperCase());

	await t.step("left identity", () => {
		for (const s of ["", "a", "off"]) {
			// Given: an inactive value s
			// When: lifting then recovering with f
			const subject = TestSubject.orElse(Inactive(s), f);

			// Then: it equals f(s)
			assertEquals(subject, f(s));
		}
	});

	await t.step("right identity", () => {
		for (const m of SAMPLES) {
			// Given: a latch m
			// When: recovering with Inactive
			const subject = TestSubject.orElse(m, Inactive);

			// Then: m is unchanged
			assertEquals(subject, m);
		}
	});

	await t.step("associativity", () => {
		for (const m of SAMPLES) {
			// Given: a latch m and recoveries f, g
			// When: associating left versus right
			const left = TestSubject.orElse(TestSubject.orElse(m, f), g);
			const right = TestSubject.orElse(m, (s) => TestSubject.orElse(f(s), g));

			// Then: both agree
			assertEquals(left, right);
		}
	});
});

Deno.test("unwrapOr() laws", async (t) => {
	await t.step("unwrapOr(Active(a), d) ≡ a", () => {
		for (const a of [0, 1, -1]) {
			// Given: an Active latch and a default
			// When: unwrapping with the default
			const subject = TestSubject.unwrapOr(Active(a), 99);

			// Then: the active value wins
			assertEquals(subject, a);
		}
	});

	await t.step("unwrapOr(Inactive(i), d) ≡ d", () => {
		for (const d of [0, 1, -1]) {
			// Given: an Inactive latch and a default
			const latch: Latch<number, string> = Inactive("off");

			// When: unwrapping with the default
			const subject = TestSubject.unwrapOr(latch, d);

			// Then: the default wins
			assertEquals(subject, d);
		}
	});
});

Deno.test("unwrapOrElse() derives the fallback from the inactive value lazily", async (t) => {
	await t.step("Inactive", () => {
		// Given: Inactive("abc")
		const latch: Latch<number, string> = Inactive("abc");

		// When: unwrapping with a fallback
		const subject = TestSubject.unwrapOrElse(latch, (s) => s.length);

		// Then: the derived fallback
		assertEquals(subject, 3);
	});

	await t.step("Active never calls the fallback", () => {
		// Given: an Active latch and a tracking fallback
		let called = false;

		// When: unwrapping with a fallback
		const subject = TestSubject.unwrapOrElse(Active(7), () => {
			called = true;
			return 0;
		});

		// Then: the active value
		assertEquals(subject, 7);
		assertFalse(called);
	});
});
