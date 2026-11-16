import { assertEquals, assertFalse } from "@std/assert";
import { Err, Ok, type Result } from "@/src/result/mini/core.ts";
import * as TestSubject from "@/src/result/mini/transform.ts";

const SAMPLES: Result<number, string>[] = [
	Ok(0),
	Ok(7),
	Ok(-3),
	Err(""),
	Err("boom"),
];

Deno.test("map() transforms Ok and preserves Err", async (t) => {
	await t.step("Ok", () => {
		// Given: Ok(10)
		// When: mapping with doubling
		const subject = TestSubject.map(Ok(10), (n) => n * 2);

		// Then: Ok(20)
		assertEquals(subject, Ok(20));
	});

	await t.step("Err never calls the mapping", () => {
		// Given: an Err and a tracking mapping
		const result: Result<number, string> = Err("e");
		let called = false;

		// When: mapping
		const subject = TestSubject.map(result, (n) => {
			called = true;
			return n;
		});

		// Then: the Err passes through
		assertEquals(subject, Err("e"));
		assertFalse(called);
	});
});

Deno.test("map() obeys the functor laws", async (t) => {
	const f = (n: number) => n + 1;
	const g = (n: number) => `${n}`;

	await t.step("identity: map(r, x => x) ≡ r", () => {
		for (const r of SAMPLES) {
			// Given: a Result r
			// When: mapping with identity
			const subject = TestSubject.map(r, (x) => x);

			// Then: r is unchanged
			assertEquals(subject, r);
		}
	});

	await t.step("composition: map(map(r, f), g) ≡ map(r, x => g(f(x)))", () => {
		for (const r of SAMPLES) {
			// Given: a Result r
			// When: mapping in two steps versus once
			const twoSteps = TestSubject.map(TestSubject.map(r, f), g);
			const oneStep = TestSubject.map(r, (x) => g(f(x)));

			// Then: both agree
			assertEquals(twoSteps, oneStep);
		}
	});
});

Deno.test("mapErr() transforms Err and preserves Ok", async (t) => {
	await t.step("Err", () => {
		// Given: Err("abc")
		// When: mapping the error to its length
		const subject = TestSubject.mapErr(Err("abc"), (e) => e.length);

		// Then: Err(3)
		assertEquals(subject, Err(3));
	});

	await t.step("Ok never calls the mapping", () => {
		// Given: an Ok and a tracking mapping
		let called = false;

		// When: mapping the error
		const subject = TestSubject.mapErr(Ok(1), (e) => {
			called = true;
			return e;
		});

		// Then: the Ok passes through
		assertEquals(subject, Ok(1));
		assertFalse(called);
	});
});

Deno.test("mapErr() obeys the functor laws on the error channel", async (t) => {
	const f = (e: string) => e.length;
	const g = (n: number) => n * 10;

	await t.step("identity", () => {
		for (const r of SAMPLES) {
			// Given: a Result r
			// When: mapping the error with identity
			const subject = TestSubject.mapErr(r, (e) => e);

			// Then: r is unchanged
			assertEquals(subject, r);
		}
	});

	await t.step("composition", () => {
		for (const r of SAMPLES) {
			// Given: a Result r
			// When: mapping the error in two steps versus once
			const twoSteps = TestSubject.mapErr(TestSubject.mapErr(r, f), g);
			const oneStep = TestSubject.mapErr(r, (e) => g(f(e)));

			// Then: both agree
			assertEquals(twoSteps, oneStep);
		}
	});
});

Deno.test("mapOr() maps Ok or falls back to the default", async (t) => {
	await t.step("Ok", () => {
		// Given: Ok(4)
		// When: mapping with a default
		const subject = TestSubject.mapOr(Ok(4), 0, (n) => n * n);

		// Then: the mapped value
		assertEquals(subject, 16);
	});

	await t.step("Err", () => {
		// Given: an Err and a tracking mapping
		const result: Result<number, string> = Err("e");
		let called = false;

		// When: mapping with a default
		const subject = TestSubject.mapOr(result, -1, (n) => {
			called = true;
			return n;
		});

		// Then: the default, and the mapping never ran
		assertEquals(subject, -1);
		assertFalse(called);
	});
});

Deno.test("mapOrElse() folds each variant with its own mapping", async (t) => {
	const describe = (r: Result<number, string>) =>
		TestSubject.mapOrElse(
			r,
			(n) => `ok:${n}`,
			(e) => `err:${e}`,
		);

	await t.step("Ok", () => {
		// Given: Ok(7)
		// When: folding to a description
		const subject = describe(Ok(7));

		// Then: the Ok arm was used
		assertEquals(subject, "ok:7");
	});

	await t.step("Err", () => {
		// Given: Err("boom")
		// When: folding to a description
		const subject = describe(Err("boom"));

		// Then: the Err arm was used
		assertEquals(subject, "err:boom");
	});
});

Deno.test("mapOrElse() equals mapOr when the error mapping is constant", () => {
	for (const r of SAMPLES) {
		// Given: a Result r and a default
		const fallback = 99;

		// When: comparing mapOrElse with a constant error arm to mapOr
		const viaElse = TestSubject.mapOrElse(
			r,
			(n) => n + 1,
			() => fallback,
		);
		const viaOr = TestSubject.mapOr(r, fallback, (n) => n + 1);

		// Then: both agree
		assertEquals(viaElse, viaOr);
	}
});

Deno.test("inspect() observes only Ok values", async (t) => {
	await t.step("Ok", () => {
		// Given: Ok(5) and a recorder
		const seen: number[] = [];

		// When: inspecting
		const subject = TestSubject.inspect(Ok(5), (n) => seen.push(n));

		// Then: the value was observed once and nothing is returned
		assertEquals(seen, [5]);
		assertEquals(subject, undefined);
	});

	await t.step("Err", () => {
		// Given: an Err and a recorder
		const seen: number[] = [];
		const result: Result<number, string> = Err("e");

		// When: inspecting
		TestSubject.inspect(result, (n) => seen.push(n));

		// Then: nothing was observed
		assertEquals(seen, []);
	});
});

Deno.test("inspectErr() observes only Err values", async (t) => {
	await t.step("Err", () => {
		// Given: Err("e") and a recorder
		const seen: string[] = [];

		// When: inspecting the error
		TestSubject.inspectErr(Err("e"), (e) => seen.push(e));

		// Then: the error was observed once
		assertEquals(seen, ["e"]);
	});

	await t.step("Ok", () => {
		// Given: an Ok and a recorder
		const seen: string[] = [];
		const result: Result<number, string> = Ok(1);

		// When: inspecting the error
		TestSubject.inspectErr(result, (e) => seen.push(e));

		// Then: nothing was observed
		assertEquals(seen, []);
	});
});
