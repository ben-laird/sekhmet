import { assertEquals, assertThrows } from "@std/assert";
import { type Either, Left, Right } from "@/src/either/mini/core.ts";
import * as TestSubject from "@/src/either/mini/unwrap.ts";

const left: Either<number, string> = Left(2);
const right: Either<number, string> = Right("abc");

Deno.test("leftOr() and rightOr() fall back on the other side", () => {
	// Given: a Left and a Right
	// When: taking each side with a fallback
	const values = [
		TestSubject.leftOr(left, 0),
		TestSubject.leftOr(right, 0),
		TestSubject.rightOr(left, "none"),
		TestSubject.rightOr(right, "none"),
	];

	// Then: the side's value if present, else the fallback
	assertEquals(values, [2, 0, "none", "abc"]);
});

Deno.test("leftOrElse() and rightOrElse() compute from the other side", () => {
	// Given: a Left, a Right and a call log
	const calls: string[] = [];
	const toLeft = (s: string): number => {
		calls.push(`toLeft ${s}`);
		return s.length;
	};
	const toRight = (n: number): string => {
		calls.push(`toRight ${n}`);
		return String(n);
	};

	// When: taking each side with a computed fallback
	const values = [
		TestSubject.leftOrElse(left, toLeft),
		TestSubject.leftOrElse(right, toLeft),
		TestSubject.rightOrElse(left, toRight),
		TestSubject.rightOrElse(right, toRight),
	];

	// Then: the fallback ran only on the other side, with its value
	assertEquals(values, [2, 3, "2", "abc"]);
	assertEquals(calls, ["toLeft abc", "toRight 2"]);
});

Deno.test("unwrapLeft() and expectLeft() panic on a Right", async (t) => {
	await t.step("Left", () => {
		// Given: a Left
		// When: unwrapping its left side
		const values = [
			TestSubject.unwrapLeft(left),
			TestSubject.expectLeft(left, "should be left"),
		];

		// Then: its value
		assertEquals(values, [2, 2]);
	});

	await t.step("Right", () => {
		// Given: a Right
		// When: unwrapping its left side
		// Then: it panics, with the custom message for expectLeft
		assertThrows(
			() => TestSubject.unwrapLeft(right),
			Error,
			"Either unwrapLeft failed!",
		);
		assertThrows(
			() => TestSubject.expectLeft(right, "should be left"),
			Error,
			"should be left",
		);
	});
});

Deno.test("unwrapRight() and expectRight() panic on a Left", async (t) => {
	await t.step("Right", () => {
		// Given: a Right
		// When: unwrapping its right side
		const values = [
			TestSubject.unwrapRight(right),
			TestSubject.expectRight(right, "should be right"),
		];

		// Then: its value
		assertEquals(values, ["abc", "abc"]);
	});

	await t.step("Left", () => {
		// Given: a Left
		// When: unwrapping its right side
		// Then: it panics, carrying the Either as the cause
		const error = assertThrows(
			() => TestSubject.unwrapRight(left),
			Error,
			"Either unwrapRight failed!",
		);
		assertEquals(error.cause, left);
		assertThrows(
			() => TestSubject.expectRight(left, "should be right"),
			Error,
			"should be right",
		);
	});
});
