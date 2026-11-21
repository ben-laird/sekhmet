import { union } from "@sekhmet/enum/core/mini";
import { assert, assertEquals, assertFalse } from "@std/assert";
import { AlreadyHandled, type Attempt, Failed, Handled } from "./core.ts";
import {
	isAlreadyHandled,
	isAlreadyHandledAnd,
	isFailed,
	isFailedAnd,
	isHandled,
	isHandledAnd,
	isResolved,
	isResolvedAnd,
} from "./predicates.ts";

const already: Attempt<number, string> = AlreadyHandled(8080);
const handled: Attempt<number, string> = Handled(8080);
const failed: Attempt<number, string> = Failed("offline");

Deno.test("each variant predicate holds for its variant only", () => {
	// Given: one attempt of each variant
	// When: each predicate is asked of each
	// Then: it holds for its own variant only
	assertEquals([already, handled, failed].map(isAlreadyHandled), [
		true,
		false,
		false,
	]);
	assertEquals([already, handled, failed].map(isHandled), [false, true, false]);
	assertEquals([already, handled, failed].map(isFailed), [false, false, true]);
});

Deno.test("isResolved holds for both handled variants", () => {
	// Given: one attempt of each variant
	// When: isResolved is asked of each
	// Then: it holds for AlreadyHandled and Handled, not Failed
	assertEquals([already, handled, failed].map(isResolved), [true, true, false]);
});

Deno.test("the …And forms also test the value held", () => {
	// Given: a predicate on the residue and one on the error
	const highPort = (port: number): boolean => port > 1024;
	const offline = (error: string): boolean => error === "offline";

	// When: each …And form is asked of each attempt
	// Then: it holds only for its variant with a value that passes
	assert(isAlreadyHandledAnd(already, highPort));
	assertFalse(isAlreadyHandledAnd(AlreadyHandled(80), highPort));
	assertFalse(isAlreadyHandledAnd(handled, highPort));
	assert(isHandledAnd(handled, highPort));
	assertFalse(isHandledAnd(Handled(80), highPort));
	assertFalse(isHandledAnd(already, highPort));
	assert(isFailedAnd(failed, offline));
	assertFalse(isFailedAnd(Failed("timeout"), offline));
	assertFalse(isFailedAnd(handled, offline));
	assert(isResolvedAnd(already, highPort));
	assert(isResolvedAnd(handled, highPort));
	assertFalse(isResolvedAnd(Handled(80), highPort));
	assertFalse(isResolvedAnd(failed, highPort));
});

Deno.test("the predicates narrow the variant and the type parameters", () => {
	// Given: attempts typed with both parameters
	const attempt: Attempt<number | string, string> = Handled(8080);

	// When: narrowing with predicates
	// Then: the value reads directly, and the other parameter is never
	if (isResolved(handled)) {
		const residue: number = union(handled);
		const wider: Attempt<number, Error> = handled;
		assertEquals(residue, 8080);
		assertEquals(wider, handled);
	}
	if (isFailed(failed)) {
		const error: string = union(failed);
		const wider: Attempt<boolean, string> = failed;
		assertEquals(error, "offline");
		assertEquals(wider, failed);
	}
	if (isHandledAnd(attempt, (r): r is number => typeof r === "number")) {
		const port: number = union(attempt);
		assertEquals(port, 8080);
	}
});
