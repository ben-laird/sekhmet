import { isErr } from "@sekhmet/enum/result/mini/predicates";
import { unwrapErr } from "@sekhmet/enum/result/mini/unwrap";
import { definePanicRuntime } from "@sekhmet/panic";
import { Panic } from "@sekhmet/panic/mini/core";
import { assert, assertEquals, assertFalse, assertThrows } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import {
	isUnreachablePanic,
	type UnreachableCause,
	unreachable,
} from "@/src/unreachable/unreachable.ts";

type Shape = { kind: "circle"; r: number } | { kind: "square"; side: number };

function area(shape: Shape): number {
	switch (shape.kind) {
		case "circle": {
			return Math.PI * shape.r ** 2;
		}
		case "square": {
			return shape.side ** 2;
		}
		default: {
			return unreachable({
				value: shape,
				issueUrl: new URL("https://example.com/issues"),
			});
		}
	}
}

/** A check that only `true` passes the types; anything else is impossible. */
function onlyTrue(flag: true): void {
	if (flag === true) {
		return;
	}
	unreachable({ value: flag });
}

Deno.test("unreachable records and renders the impossible value", () => {
	// Given: a shape from untyped input that the types rule out
	const triangle = JSON.parse('{ "kind": "triangle", "sides": [3, 4, 5] }');

	// When: the exhaustive switch meets it
	const thrown = assertThrows(() => area(triangle), Panic);

	// Then: the message shows the value and the issue URL; the cause keeps both
	assertEquals(thrown.name, "Panic (Unreachable)");
	assertEquals(
		thrown.message,
		[
			"an unreachable code path was executed",
			'Impossible value: { kind: "triangle", sides: [3, 4, 5] }',
			"Please file an issue at https://example.com/issues",
		].join("\n"),
	);
	assert(isUnreachablePanic(thrown));
	assertEquals(thrown.cause, {
		value: triangle,
		issueUrl: new URL("https://example.com/issues"),
	});
});

Deno.test("unreachable without options panics with the header alone", () => {
	// Given: no options
	// When: unreachable runs
	const thrown = assertThrows(() => unreachable(), Panic);

	// Then: no value line, no issue line, and no value in the cause
	assertEquals(thrown.message, "an unreachable code path was executed");
	assert(isUnreachablePanic(thrown));
	assertFalse("value" in thrown.cause);
	assertEquals(thrown.cause, { issueUrl: undefined });
});

Deno.test("unreachable tells a passed undefined from no value", () => {
	// Given: an impossible value that is undefined at runtime
	const missing = JSON.parse("null") ?? undefined;

	// When: unreachable runs with it
	const thrown = assertThrows(() => onlyTrue(missing), Panic);

	// Then: the value line and the cause both record undefined
	assertEquals(
		thrown.message,
		"an unreachable code path was executed\nImpossible value: undefined",
	);
	assert(isUnreachablePanic(thrown));
	assert("value" in thrown.cause);
});

Deno.test("unreachable never throws while rendering a hostile value", () => {
	// Given: a cyclic value holding a BigInt, a symbol, a function, a throwing
	// getter and a throwing toJSON
	const hostile: Record<string, unknown> = {
		big: 1n,
		tag: Symbol("t"),
		fn: area,
		get boom(): never {
			throw new Error("getter ran");
		},
		toJSON: (): never => {
			throw new Error("toJSON ran");
		},
	};
	hostile.self = hostile;
	const untyped = JSON.parse("null") ?? hostile;

	// When: unreachable runs with it
	const thrown = assertThrows(() => onlyTrue(untyped), Panic);

	// Then: it panics with every part rendered, and no user code ran
	assertEquals(
		thrown.message,
		"an unreachable code path was executed\nImpossible value: { big: 1n, tag: Symbol(t), fn: [Function: area], boom: [Getter], toJSON: [Function: toJSON], self: [Circular] }",
	);
});

Deno.test("isUnreachablePanic accepts only unreachable's panic", () => {
	// Given: an unreachable panic and a hand-built one with the same name
	const real = assertThrows(() => unreachable());
	const forged = new Panic<UnreachableCause>({
		name: "Unreachable",
		message: "",
		cause: { issueUrl: undefined },
	});

	// When: the guard checks each
	const verdicts = [real, forged, undefined].map(isUnreachablePanic);

	// Then: only the real one passes
	assertEquals(verdicts, [true, false, false]);
});

Deno.test("options cannot override unreachable's name", () => {
	// Given: options carrying a name, passed through a wider variable
	const options = { issueUrl: new URL("https://example.com"), name: "Evil" };

	// When: unreachable runs with them
	const thrown = assertThrows(() => unreachable(options), Panic);

	// Then: the name is unreachable's own
	assertEquals(thrown.name, "Panic (Unreachable)");
});

Deno.test("a runtime's hook and catchUnwind see an unreachable panic", () => {
	// Given: a runtime whose hook counts unreachable panics
	const runtime = definePanicRuntime();
	let bugs = 0;
	runtime.setHook(({ payload }) => {
		if (isUnreachablePanic(payload)) {
			bugs++;
		}
	});

	// When: unreachable runs inside the boundary
	const result = runtime.catchUnwind(() => unreachable());

	// Then: the hook reported it, and the boundary returned it as Err
	assertEquals(bugs, 1);
	assert(isErr(result) && isUnreachablePanic(unwrapErr(result)));
});

Deno.test("unreachable and its guard have exact types", () => {
	// Given: a caught value
	const value: unknown = assertThrows(() => unreachable());

	// When: the guard narrows it
	// Then: it is a Panic of UnreachableCause, and unreachable returns never
	if (isUnreachablePanic(value)) {
		assertType<IsExact<typeof value, Panic<UnreachableCause>>>(true);
	}
	assertType<IsExact<ReturnType<typeof unreachable>, never>>(true);
	assertType<
		IsExact<
			UnreachableCause,
			{ readonly value?: unknown; readonly issueUrl: URL | undefined }
		>
	>(true);
});

Deno.test("unreachable compiles only for a value narrowed to never", () => {
	// Given: a value whose type is not narrowed, and calls that must not
	// compile, never run
	const notNarrowed: Shape = { kind: "circle", r: 1 };
	const neverRun = (): void => {
		// When: passing it, undefined, a name or a string URL
		// Then: each is a type error
		// @ts-expect-error a Shape is not never: the switch is not exhaustive
		unreachable({ value: notNarrowed });
		// @ts-expect-error undefined is not never either
		unreachable({ value: undefined });
		// @ts-expect-error options have no name: they cannot rename the panic
		unreachable({ name: "Evil" });
		// @ts-expect-error the issue URL is a URL, not a string
		unreachable({ issueUrl: "https://example.com" });
	};

	assertEquals(typeof neverRun, "function");
});

Deno.test("an unreachable panic widens to a Panic of unknown, never the reverse", () => {
	// Given: a narrowed unreachable panic and a Panic of unknown cause
	const narrow = assertThrows(() => unreachable());
	assert(isUnreachablePanic(narrow));
	const wide = new Panic<unknown>({ message: "", cause: 1 });

	// When: assigning between them both ways
	// @ts-expect-error a Panic of unknown cause is not an unreachable panic
	const narrowed: Panic<UnreachableCause> = wide;
	const widened: Panic<unknown> = narrow;

	// Then: only widening compiles
	assertEquals([narrowed, widened], [wide, narrow]);
});
