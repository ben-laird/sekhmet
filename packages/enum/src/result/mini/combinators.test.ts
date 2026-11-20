import { assertEquals, assertFalse } from "@std/assert";
import { transpose as transposeOption } from "@/src/option/mini/combinators.ts";
import { None, type Option, Some } from "@/src/option/mini/core.ts";
import * as TestSubject from "@/src/result/mini/combinators.ts";
import { Err, Ok, type Result } from "@/src/result/mini/core.ts";

/** A small table of Results used for law tests. */
const SAMPLES: Result<number, string>[] = [
	Ok(0),
	Ok(1),
	Ok(-5),
	Ok(1000),
	Err(""),
	Err("boom"),
];

Deno.test("ok() converts Ok to Some and Err to None", async (t) => {
	await t.step("Ok", () => {
		// Given: Ok(3)
		const result = Ok(3);

		// When: converting with ok()
		const subject = TestSubject.ok(result);

		// Then: Some(3)
		assertEquals(subject, Some(3));
	});

	await t.step("Err", () => {
		// Given: an Err
		const result: Result<number, string> = Err("e");

		// When: converting with ok()
		const subject = TestSubject.ok(result);

		// Then: None
		assertEquals(subject, None());
	});
});

Deno.test("err() converts Err to Some and Ok to None", async (t) => {
	await t.step("Err", () => {
		// Given: Err("e")
		const result = Err("e");

		// When: converting with err()
		const subject = TestSubject.err(result);

		// Then: Some("e")
		assertEquals(subject, Some("e"));
	});

	await t.step("Ok", () => {
		// Given: an Ok
		const result: Result<number, string> = Ok(1);

		// When: converting with err()
		const subject = TestSubject.err(result);

		// Then: None
		assertEquals(subject, None());
	});
});

Deno.test("iter() yields the Ok value once and nothing for Err", async (t) => {
	await t.step("Ok", () => {
		// Given: Ok(9)
		const result = Ok(9);

		// When: collecting iter()
		const subject = [...TestSubject.iter(result)];

		// Then: a single element
		assertEquals(subject, [9]);
	});

	await t.step("Err", () => {
		// Given: an Err
		const result: Result<number, string> = Err("e");

		// When: collecting iter()
		const subject = [...TestSubject.iter(result)];

		// Then: empty
		assertEquals(subject, []);
	});
});

Deno.test("and() returns the second Result only when the first is Ok", async (t) => {
	await t.step("Ok and Ok", () => {
		// Given: two Oks
		// When: combining with and()
		const subject = TestSubject.and(Ok(1), Ok("two"));

		// Then: the second
		assertEquals(subject, Ok("two"));
	});

	await t.step("Ok and Err", () => {
		// Given: Ok then Err
		// When: combining with and()
		const subject = TestSubject.and(Ok(1), Err("late"));

		// Then: the second (Err)
		assertEquals(subject, Err("late"));
	});

	await t.step("Err and anything", () => {
		// Given: Err then Ok
		const first: Result<number, string> = Err("early");

		// When: combining with and()
		const subject = TestSubject.and(first, Ok("two"));

		// Then: the first error short-circuits
		assertEquals(subject, Err("early"));
	});
});

Deno.test("andThen() chains on Ok and short-circuits on Err", async (t) => {
	await t.step("Ok", () => {
		// Given: Ok(4) and a fallible half
		const half = (n: number): Result<number, string> =>
			n % 2 === 0 ? Ok(n / 2) : Err("odd");

		// When: chaining
		const subject = TestSubject.andThen(Ok(4), half);

		// Then: the chained Result
		assertEquals(subject, Ok(2));
	});

	await t.step("Err never calls the continuation", () => {
		// Given: an Err and a tracking continuation
		let called = false;
		const first: Result<number, string> = Err("e");

		// When: chaining
		const subject = TestSubject.andThen(first, (n) => {
			called = true;
			return Ok(n);
		});

		// Then: the Err passes through untouched
		assertEquals(subject, Err("e"));
		assertFalse(called);
	});
});

Deno.test("andThen() obeys the monad laws (Ok as unit)", async (t) => {
	const f = (n: number): Result<number, string> =>
		n >= 0 ? Ok(n * 2) : Err("negative");
	const g = (n: number): Result<number, string> =>
		n < 100 ? Ok(n + 1) : Err("too big");

	await t.step("left identity: andThen(Ok(a), f) ≡ f(a)", () => {
		for (const a of [0, 1, -5, 60, 1000]) {
			// Given: a plain value a
			// When: lifting it then chaining f
			const subject = TestSubject.andThen(Ok(a), f);

			// Then: it equals applying f directly
			assertEquals(subject, f(a));
		}
	});

	await t.step("right identity: andThen(m, Ok) ≡ m", () => {
		for (const m of SAMPLES) {
			// Given: a Result m
			// When: chaining with Ok
			const subject = TestSubject.andThen(m, Ok);

			// Then: m is unchanged
			assertEquals(subject, m);
		}
	});

	await t.step("associativity", () => {
		for (const m of SAMPLES) {
			// Given: a Result m and continuations f, g
			// When: associating to the left versus the right
			const left = TestSubject.andThen(TestSubject.andThen(m, f), g);
			const right = TestSubject.andThen(m, (x) => TestSubject.andThen(f(x), g));

			// Then: both agree
			assertEquals(left, right);
		}
	});
});

Deno.test("or() returns the first Ok, else the second Result", async (t) => {
	await t.step("Ok or anything", () => {
		// Given: Ok first
		// When: combining with or()
		const subject = TestSubject.or(Ok(1), Ok(2));

		// Then: the first
		assertEquals(subject, Ok(1));
	});

	await t.step("Err or Ok", () => {
		// Given: Err then Ok
		const first: Result<number, string> = Err("e");

		// When: combining with or()
		const subject = TestSubject.or(first, Ok(2));

		// Then: the second
		assertEquals(subject, Ok(2));
	});

	await t.step("Err or Err", () => {
		// Given: two Errs
		const first: Result<number, string> = Err("a");

		// When: combining with or()
		const subject = TestSubject.or(first, Err("b"));

		// Then: the second error
		assertEquals(subject, Err("b"));
	});
});

Deno.test("orElse() recovers on Err and short-circuits on Ok", async (t) => {
	await t.step("Err", () => {
		// Given: an Err and a recovery
		const first: Result<number, string> = Err("abc");

		// When: recovering
		const subject = TestSubject.orElse(first, (e) => Ok(e.length));

		// Then: the recovered Result
		assertEquals(subject, Ok(3));
	});

	await t.step("Ok never calls the recovery", () => {
		// Given: an Ok and a tracking recovery
		let called = false;

		// When: recovering
		const subject = TestSubject.orElse(Ok(1), () => {
			called = true;
			return Ok(0);
		});

		// Then: the Ok passes through
		assertEquals(subject, Ok(1));
		assertFalse(called);
	});
});

Deno.test("orElse() obeys the monad laws on the error channel (Err as unit)", async (t) => {
	const f = (e: string): Result<number, string> =>
		e === "" ? Ok(0) : Err(`${e}!`);
	const g = (e: string): Result<number, string> =>
		e.length > 3 ? Ok(e.length) : Err(e.toUpperCase());

	await t.step("left identity: orElse(Err(e), f) ≡ f(e)", () => {
		for (const e of ["", "a", "boom"]) {
			// Given: an error value e
			// When: lifting it then recovering with f
			const subject = TestSubject.orElse(Err(e), f);

			// Then: it equals applying f directly
			assertEquals(subject, f(e));
		}
	});

	await t.step("right identity: orElse(m, Err) ≡ m", () => {
		for (const m of SAMPLES) {
			// Given: a Result m
			// When: recovering with Err
			const subject = TestSubject.orElse(m, Err);

			// Then: m is unchanged
			assertEquals(subject, m);
		}
	});

	await t.step("associativity", () => {
		for (const m of SAMPLES) {
			// Given: a Result m and recoveries f, g
			// When: associating to the left versus the right
			const left = TestSubject.orElse(TestSubject.orElse(m, f), g);
			const right = TestSubject.orElse(m, (e) => TestSubject.orElse(f(e), g));

			// Then: both agree
			assertEquals(left, right);
		}
	});
});

Deno.test("transpose() turns a Result of an Option inside out", async (t) => {
	await t.step("Ok(Some(x)) becomes Some(Ok(x))", () => {
		// Given: an Ok holding a Some
		const result: Result<Option<number>, string> = Ok(Some(5));

		// When: transposing it
		const subject = TestSubject.transpose(result);

		// Then: the Option is outside, holding an Ok
		assertEquals(subject, Some(Ok(5)));
	});

	await t.step("Ok(None) becomes None", () => {
		// Given: an Ok holding a None
		const result: Result<Option<number>, string> = Ok(None());

		// When: transposing it
		const subject = TestSubject.transpose(result);

		// Then: there is no value, so the whole is None
		assertEquals(subject, None());
	});

	await t.step("Err(e) becomes Some(Err(e))", () => {
		// Given: an Err
		const result: Result<Option<number>, string> = Err("bad");

		// When: transposing it
		const subject = TestSubject.transpose(result);

		// Then: the error is kept inside a Some
		assertEquals(subject, Some(Err("bad")));
	});

	await t.step("it inverts Option's transpose", () => {
		const samples: Result<Option<number>, string>[] = [
			Ok(Some(1)),
			Ok(None()),
			Err("e"),
		];
		for (const sample of samples) {
			// Given: a Result of an Option
			// When: transposing it there and back
			const subject = transposeOption(TestSubject.transpose(sample));

			// Then: it is unchanged
			assertEquals(subject, sample);
		}
	});
});
