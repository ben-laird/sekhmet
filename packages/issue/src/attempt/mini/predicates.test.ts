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

Deno.test("the …And forms keep a narrowed attempt in their false branch", () => {
	// Given: attempts already narrowed to their variant
	const alreadyAttempt: Attempt<number, string> = AlreadyHandled(8080);
	const resolvedAttempt: Attempt<number, string> = Handled(8080);
	const failedAttempt: Attempt<number, string> = Failed("offline");
	assert(isAlreadyHandled(alreadyAttempt));
	assert(isHandled(resolvedAttempt));
	assert(isFailed(failedAttempt));

	// When: an …And form's predicate fails on each
	// Then: the false branch still holds the narrowed attempt, not never
	if (!isAlreadyHandledAnd(alreadyAttempt, (port) => port < 1024)) {
		const port: number = union(alreadyAttempt);
		// @ts-expect-error: the narrowed attempt isn't collapsed to never
		const _gone: never = alreadyAttempt;
		assertEquals(port, 8080);
	} else {
		assert(false, "8080 isn't a low port");
	}
	if (!isHandledAnd(resolvedAttempt, (port) => port < 1024)) {
		const port: number = union(resolvedAttempt);
		// @ts-expect-error: the narrowed attempt isn't collapsed to never
		const _gone: never = resolvedAttempt;
		assertEquals(port, 8080);
	} else {
		assert(false, "8080 isn't a low port");
	}
	if (!isResolvedAnd(resolvedAttempt, (port) => port < 1024)) {
		// @ts-expect-error: the narrowed attempt isn't collapsed to never
		const _gone: never = resolvedAttempt;
		assertEquals(union(resolvedAttempt), 8080);
	}
	if (!isFailedAnd(failedAttempt, (error) => error === "timeout")) {
		const error: string = union(failedAttempt);
		// @ts-expect-error: the narrowed attempt isn't collapsed to never
		const _gone: never = failedAttempt;
		assertEquals(error, "offline");
	} else {
		assert(false, "offline isn't a timeout");
	}
});
