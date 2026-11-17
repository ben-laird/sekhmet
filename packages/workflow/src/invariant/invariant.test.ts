import { definePanicRuntime } from "@sekhmet/panic";
import { Panic } from "@sekhmet/panic/mini/core";
import { assert, assertEquals, assertThrows } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import {
	type InvariantCause,
	invariant,
	isInvariantPanic,
} from "@/src/invariant/invariant.ts";

const EXPECTED = "the cart should never be empty at checkout";

Deno.test("invariant returns when the condition is truthy", () => {
	// Given: truthy conditions of several types
	const conditions: unknown[] = [true, 1, "x", {}, []];

	// When: invariant checks each
	const checked = conditions.map((condition) => {
		invariant(condition, { expectedBehavior: EXPECTED });
		return condition;
	});

	// Then: none panicked
	assertEquals(checked, conditions);
});

Deno.test("invariant panics around the expected behavior", () => {
	// Given: a broken condition and an issue URL
	const issueUrl = new URL("https://example.com/issues");

	// When: invariant checks it
	const thrown = assertThrows(
		() => invariant(0, { expectedBehavior: EXPECTED, issueUrl }),
		Panic,
	);

	// Then: the message reads as the "should" statement; the cause keeps all
	assertEquals(thrown.name, "Panic (Invariant)");
	assertEquals(
		thrown.message,
		[
			"an invariant was violated",
			"Expected behavior: the cart should never be empty at checkout",
			"Please file an issue at https://example.com/issues",
		].join("\n"),
	);
	assert(isInvariantPanic(thrown));
	assertEquals(thrown.cause, {
		check: { kind: "condition", condition: 0 },
		expectedBehavior: EXPECTED,
		issueUrl,
	});
});

Deno.test("invariant without an issue URL leaves its line out", () => {
	// Given: a broken condition and no issue URL
	// When: invariant checks it
	const thrown = assertThrows(
		() => invariant(null, { expectedBehavior: EXPECTED }),
		Panic,
	);

	// Then: the message ends at the expected behavior
	assertEquals(
		thrown.message,
		`an invariant was violated\nExpected behavior: ${EXPECTED}`,
	);
});

Deno.test("isInvariantPanic accepts only invariant's panic", () => {
	// Given: an invariant panic and a hand-built one with the same name
	const real = assertThrows(() => {
		invariant(false, { expectedBehavior: EXPECTED });
	});
	const forged = new Panic<InvariantCause>({
		name: "Invariant",
		message: "",
		cause: {
			check: { kind: "condition", condition: false },
			expectedBehavior: "",
			issueUrl: undefined,
		},
	});

	// When: the guard checks each
	const verdicts = [real, forged, "Invariant"].map(isInvariantPanic);

	// Then: only the real one passes
	assertEquals(verdicts, [true, false, false]);
});

Deno.test("options cannot override invariant's name", () => {
	// Given: options carrying a name, passed through a wider variable
	const options = { expectedBehavior: EXPECTED, name: "Evil" };

	// When: invariant breaks with them
	const thrown = assertThrows(() => invariant(false, options), Panic);

	// Then: the name is invariant's own
	assertEquals(thrown.name, "Panic (Invariant)");
});

Deno.test("a runtime's hook and catchUnwind see an invariant panic", () => {
	// Given: a runtime whose hook records broken expectations
	const runtime = definePanicRuntime();
	const broken: string[] = [];
	runtime.setHook(({ payload }) => {
		if (isInvariantPanic(payload)) {
			broken.push(payload.cause.expectedBehavior);
		}
	});

	// When: an invariant breaks inside the boundary
	runtime.catchUnwind(() => {
		invariant(false, { expectedBehavior: EXPECTED });
	});

	// Then: the hook saw the expected behavior
	assertEquals(broken, [EXPECTED]);
});

Deno.test("invariant narrows its condition", () => {
	// Given: a value that may be undefined
	const cart: readonly string[] = ["apple"];
	const first = cart[0];

	// When: invariant asserts it is defined
	invariant(first !== undefined, { expectedBehavior: EXPECTED });

	// Then: it is narrowed to string, and the guard narrows to the cause
	assertType<IsExact<typeof first, string>>(true);
	const value: unknown = first;
	if (isInvariantPanic(value)) {
		assertType<IsExact<typeof value, Panic<InvariantCause>>>(true);
	}
	assertEquals(first, "apple");
});

Deno.test("an invariant cause narrows on the check that failed", () => {
	// Given: a panic from a broken invariant
	const thrown = assertThrows(() => {
		invariant("", { expectedBehavior: EXPECTED });
	});
	assert(isInvariantPanic(thrown));
	const { check } = thrown.cause;

	// When: narrowing on the check's kind
	assert(check.kind === "condition");

	// Then: the falsy condition is kept, typed unknown
	assertType<IsExact<typeof check.condition, unknown>>(true);
	assertEquals(check.condition, "");
});

Deno.test("invariant requires an expected behavior and nothing else", () => {
	// Given: calls that must not compile, never run
	const neverRun = (): void => {
		// When: leaving out the options, the expected behavior, or adding a name
		// Then: each is a type error
		// @ts-expect-error the options with the expected behavior are required
		invariant(true);
		// @ts-expect-error the expected behavior is required
		invariant(true, {});
		// @ts-expect-error options have no name: they cannot rename the panic
		invariant(true, { expectedBehavior: EXPECTED, name: "Evil" });
	};

	assertEquals(typeof neverRun, "function");
});

Deno.test("an invariant panic widens to a Panic of unknown, never the reverse", () => {
	// Given: a narrowed invariant panic and a Panic of unknown cause
	const narrow = assertThrows(() => {
		invariant(false, { expectedBehavior: EXPECTED });
	});
	assert(isInvariantPanic(narrow));
	const wide = new Panic<unknown>({ message: "", cause: 1 });

	// When: assigning between them both ways
	const widened: Panic<unknown> = narrow;
	// @ts-expect-error a Panic of unknown cause is not an invariant panic
	const narrowed: Panic<InvariantCause> = wide;

	// Then: only widening compiles
	assertEquals([widened, narrowed], [narrow, wide]);
});
