import { assertEquals } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import * as TestSubject from "@/src/either/mini/combinators.ts";
import { type Either, Left, Right } from "@/src/either/mini/core.ts";
import { None, type Option, Some } from "@/src/option/mini/core.ts";
import { Err, Ok, type Result } from "@/src/result/mini/core.ts";

const left: Either<number, string> = Left(2);
const right: Either<number, string> = Right("abc");

Deno.test("left() and right() project a side into an Option", () => {
	// Given: a Left and a Right
	// When: projecting each side
	const projections = [
		TestSubject.left(left),
		TestSubject.left(right),
		TestSubject.right(left),
		TestSubject.right(right),
	];

	// Then: Some on the matching side, None on the other
	assertEquals(projections, [Some(2), None(), None(), Some("abc")]);
});

Deno.test("leftAnd() and rightAnd() replace their own side", () => {
	// Given: replacement Eithers
	const otherLeft: Either<boolean, string> = Left(true);
	const otherRight: Either<number, boolean> = Right(false);

	// When: chaining each side
	const results = [
		TestSubject.leftAnd(left, otherLeft),
		TestSubject.leftAnd(right, otherLeft),
		TestSubject.rightAnd(left, otherRight),
		TestSubject.rightAnd(right, otherRight),
	];

	// Then: the matching side is replaced; the other passes through
	assertEquals(results, [Left(true), Right("abc"), Left(2), Right(false)]);
});

Deno.test("leftAndThen() chains on a Left only", () => {
	// Given: a chain that may switch sides, and a call log
	let calls = 0;
	const halve = (n: number): Either<number, string> => {
		calls += 1;
		return n % 2 === 0 ? Left(n / 2) : Right(`odd: ${n}`);
	};

	// When: chaining a Left, an odd Left and a Right
	const results = [
		TestSubject.leftAndThen(left, halve),
		TestSubject.leftAndThen(Left(3), halve),
		TestSubject.leftAndThen(right, halve),
	];

	// Then: the Lefts ran the chain; the Right passed through untouched
	assertEquals(results, [Left(1), Right("odd: 3"), Right("abc")]);
	assertEquals(calls, 2);
});

Deno.test("rightAndThen() chains on a Right only", () => {
	// Given: a chain that may switch sides
	const measure = (s: string): Either<number, boolean> =>
		s.length > 0 ? Right(true) : Left(0);

	// When: chaining a Right, an empty Right and a Left
	const results = [
		TestSubject.rightAndThen(right, measure),
		TestSubject.rightAndThen(Right(""), measure),
		TestSubject.rightAndThen(left, measure),
	];

	// Then: the Rights ran the chain; the Left passed through
	assertEquals(results, [Right(true), Left(0), Left(2)]);
});

Deno.test("factorNone() pulls a shared None out", () => {
	// Given: Eithers of Options
	type Side = Either<Option<number>, Option<string>>;
	const cases: Side[] = [Left(Some(1)), Right(Some("a")), Left(None())];

	// When: factoring out the None
	const results = cases.map(TestSubject.factorNone);

	// Then: present values keep their side; an empty Option is None
	assertEquals(results, [Some(Left(1)), Some(Right("a")), None()]);
	assertType<IsExact<(typeof results)[number], Option<Either<number, string>>>>(
		true,
	);
});

Deno.test("factorErr() pulls a shared error out", () => {
	// Given: Eithers of Results sharing an error type
	type Side = Either<Result<number, string>, Result<boolean, string>>;
	const cases: Side[] = [Left(Ok(1)), Right(Ok(true)), Right(Err("bad"))];

	// When: factoring out the error
	const results = cases.map(TestSubject.factorErr);

	// Then: successes keep their side; an error is the Err
	assertEquals(results, [Ok(Left(1)), Ok(Right(true)), Err("bad")]);
	assertType<
		IsExact<(typeof results)[number], Result<Either<number, boolean>, string>>
	>(true);
});

Deno.test("factorOk() pulls a shared success out, keeping error sources apart", () => {
	// Given: Eithers of Results sharing a success type
	type Side = Either<Result<number, string>, Result<number, Error>>;
	const error = new Error("io");
	const cases: Side[] = [Left(Ok(1)), Left(Err("parse")), Right(Err(error))];

	// When: factoring out the success value
	const results = cases.map(TestSubject.factorOk);

	// Then: a success is Ok; each error keeps its side
	assertEquals(results, [Ok(1), Err(Left("parse")), Err(Right(error))]);
	assertType<
		IsExact<(typeof results)[number], Result<number, Either<string, Error>>>
	>(true);
});

Deno.test("factorFirst() and factorSecond() pull a shared element out", () => {
	// Given: Eithers of pairs sharing one element
	const first: Either<[string, number], [string, boolean]> = Right([
		"id",
		true,
	]);
	const second: Either<[number, string], [boolean, string]> = Left([1, "id"]);

	// When: factoring out the shared element
	const [shared, rest] = TestSubject.factorFirst(first);
	const [rest2, shared2] = TestSubject.factorSecond(second);

	// Then: the shared element comes out; the rest keeps its side
	assertEquals([shared, rest], ["id", Right(true)]);
	assertEquals([rest2, shared2], [Left(1), "id"]);
});
