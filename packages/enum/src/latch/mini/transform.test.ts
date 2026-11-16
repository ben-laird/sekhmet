import { assertEquals, assertFalse, assertStrictEquals } from "@std/assert";
import { Active, Inactive, type Latch } from "@/src/latch/mini/core.ts";
import * as TestSubject from "@/src/latch/mini/transform.ts";
import { None, Some } from "@/src/option/mini/core.ts";
import { Err, Ok } from "@/src/result/mini/core.ts";

const SAMPLES: Latch<number, string>[] = [
	Active(0),
	Active(5),
	Active(-2),
	Inactive(""),
	Inactive("off"),
];

Deno.test("active() and inactive() project each variant into an Option", async (t) => {
	await t.step("Active", () => {
		// Given: Active(1)
		const latch: Latch<number, string> = Active(1);

		// When: projecting both sides
		const a = TestSubject.active(latch);
		const i = TestSubject.inactive(latch);

		// Then: only the active side is Some
		assertEquals(a, Some(1));
		assertEquals(i, None());
	});

	await t.step("Inactive", () => {
		// Given: Inactive("off")
		const latch: Latch<number, string> = Inactive("off");

		// When: projecting both sides
		const a = TestSubject.active(latch);
		const i = TestSubject.inactive(latch);

		// Then: only the inactive side is Some
		assertEquals(a, None());
		assertEquals(i, Some("off"));
	});
});

Deno.test("toResult() maps Active to Ok and Inactive to Err", async (t) => {
	await t.step("Active", () => {
		// Given: Active(1)
		// When: converting
		const subject = TestSubject.toResult(Active(1));

		// Then: Ok(1)
		assertEquals(subject, Ok(1));
	});

	await t.step("Inactive", () => {
		// Given: Inactive("off")
		// When: converting
		const subject = TestSubject.toResult(Inactive("off"));

		// Then: Err("off")
		assertEquals(subject, Err("off"));
	});
});

Deno.test("map() transforms Active and preserves Inactive", async (t) => {
	await t.step("Active", () => {
		// Given: Active(2)
		// When: mapping
		const subject = TestSubject.map(Active(2), (n) => n * 10);

		// Then: Active(20)
		assertEquals(subject, Active(20));
	});

	await t.step("Inactive never calls the mapping", () => {
		// Given: an Inactive latch and a tracking mapping
		const latch: Latch<number, string> = Inactive("off");
		let called = false;

		// When: mapping
		const subject = TestSubject.map(latch, (n) => {
			called = true;
			return n;
		});

		// Then: the latch passes through
		assertEquals(subject, Inactive("off"));
		assertFalse(called);
	});
});

Deno.test("map() obeys the functor laws", async (t) => {
	const f = (n: number) => n + 1;
	const g = (n: number) => `${n}`;

	await t.step("identity", () => {
		for (const l of SAMPLES) {
			// Given: a latch l
			// When: mapping with identity
			const subject = TestSubject.map(l, (x) => x);

			// Then: l is unchanged
			assertEquals(subject, l);
		}
	});

	await t.step("composition", () => {
		for (const l of SAMPLES) {
			// Given: a latch l
			// When: mapping in two steps versus once
			const twoSteps = TestSubject.map(TestSubject.map(l, f), g);
			const oneStep = TestSubject.map(l, (x) => g(f(x)));

			// Then: both agree
			assertEquals(twoSteps, oneStep);
		}
	});
});

Deno.test("mapInactive() obeys the functor laws on the inactive channel", async (t) => {
	const f = (s: string) => s.length;
	const g = (n: number) => n * 2;

	await t.step("transforms Inactive only", () => {
		// Given: one latch of each variant
		// When: mapping the inactive side
		const fromInactive = TestSubject.mapInactive(Inactive("abc"), f);
		const fromActive = TestSubject.mapInactive(Active(1), f);

		// Then: only Inactive changes
		assertEquals(fromInactive, Inactive(3));
		assertEquals(fromActive, Active(1));
	});

	await t.step("identity", () => {
		for (const l of SAMPLES) {
			// Given: a latch l
			// When: mapping the inactive side with identity
			const subject = TestSubject.mapInactive(l, (x) => x);

			// Then: l is unchanged
			assertEquals(subject, l);
		}
	});

	await t.step("composition", () => {
		for (const l of SAMPLES) {
			// Given: a latch l
			// When: mapping in two steps versus once
			const twoSteps = TestSubject.mapInactive(
				TestSubject.mapInactive(l, f),
				g,
			);
			const oneStep = TestSubject.mapInactive(l, (x) => g(f(x)));

			// Then: both agree
			assertEquals(twoSteps, oneStep);
		}
	});
});

Deno.test("mapOr() maps Active or falls back to the default", async (t) => {
	await t.step("Active", () => {
		// Given: Active(3)
		// When: mapping with a default
		const subject = TestSubject.mapOr(Active(3), 0, (n) => n * n);

		// Then: the mapped value
		assertEquals(subject, 9);
	});

	await t.step("Inactive", () => {
		// Given: an Inactive latch
		const latch: Latch<number, string> = Inactive("off");

		// When: mapping with a default
		const subject = TestSubject.mapOr(latch, -1, (n) => n);

		// Then: the default
		assertEquals(subject, -1);
	});
});

Deno.test("mapOrElse() folds each variant with its own mapping", async (t) => {
	const describe = (l: Latch<number, string>) =>
		TestSubject.mapOrElse(
			l,
			(n) => `active:${n}`,
			(s) => `inactive:${s}`,
		);

	await t.step("Active", () => {
		// Given: Active(4)
		// When: folding
		const subject = describe(Active(4));

		// Then: the active arm was used
		assertEquals(subject, "active:4");
	});

	await t.step("Inactive", () => {
		// Given: Inactive("off")
		// When: folding
		const subject = describe(Inactive("off"));

		// Then: the inactive arm was used
		assertEquals(subject, "inactive:off");
	});
});

Deno.test("inspect() observes Active values and returns the latch", async (t) => {
	await t.step("Active", () => {
		// Given: Active(5) and a recorder
		const latch: Latch<number, string> = Active(5);
		const seen: number[] = [];

		// When: inspecting
		const subject = TestSubject.inspect(latch, (n) => seen.push(n));

		// Then: the value was observed and the same latch is returned
		assertEquals(seen, [5]);
		assertStrictEquals(subject, latch);
	});

	await t.step("Inactive", () => {
		// Given: Inactive("off") and a recorder
		const latch: Latch<number, string> = Inactive("off");
		const seen: number[] = [];

		// When: inspecting
		const subject = TestSubject.inspect(latch, (n) => seen.push(n));

		// Then: nothing was observed
		assertEquals(seen, []);
		assertStrictEquals(subject, latch);
	});
});

Deno.test("inspectInactive() observes Inactive values and returns the latch", async (t) => {
	await t.step("Inactive", () => {
		// Given: Inactive("off") and a recorder
		const latch: Latch<number, string> = Inactive("off");
		const seen: string[] = [];

		// When: inspecting the inactive side
		const subject = TestSubject.inspectInactive(latch, (s) => seen.push(s));

		// Then: the value was observed and the same latch is returned
		assertEquals(seen, ["off"]);
		assertStrictEquals(subject, latch);
	});

	await t.step("Active", () => {
		// Given: Active(1) and a recorder
		const latch: Latch<number, string> = Active(1);
		const seen: string[] = [];

		// When: inspecting the inactive side
		TestSubject.inspectInactive(latch, (s) => seen.push(s));

		// Then: nothing was observed
		assertEquals(seen, []);
	});
});

Deno.test("iter() and iterInactive() yield the matching side once", () => {
	for (const l of SAMPLES) {
		// Given: a latch l
		// When: collecting both iterators
		const actives = [...TestSubject.iter(l)];
		const inactives = [...TestSubject.iterInactive(l)];

		// Then: exactly one side yields a single element, matching the projection
		assertEquals(actives.length + inactives.length, 1);
		assertEquals(
			TestSubject.active(l),
			actives.length === 1 ? Some(actives[0]) : None(),
		);
		assertEquals(
			TestSubject.inactive(l),
			inactives.length === 1 ? Some(inactives[0]) : None(),
		);
	}
});
