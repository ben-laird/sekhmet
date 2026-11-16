import { Err, Ok } from "@sekhmet/enum/result/mini/core";
import {
	assertEquals,
	assertInstanceOf,
	assertStrictEquals,
	assertThrows,
} from "@std/assert";
import { Panic, panic } from "@/src/mini/core.ts";
import { definePanicHook, PanicHandler } from "@/src/mini/hook.ts";

const toMessage = (p: Panic<unknown>): string => p.message;

Deno.test("definePanicHook() wraps a returning function in Ok", () => {
	// Given: a hook that maps panics to their message
	const withPanic = definePanicHook({ hook: toMessage });

	// When: running a function that returns normally
	const result = withPanic(() => 42);

	// Then: the result is Ok of the return value
	assertEquals(result, Ok(42));
});

Deno.test("definePanicHook() converts a Panic into Err via the hook", () => {
	// Given: a hook that maps panics to their message
	const withPanic = definePanicHook({ hook: toMessage });

	// When: running a function that panics
	const result = withPanic(() => panic({ message: "boom", cause: null }));

	// Then: the result is Err of the hook's output
	assertEquals(result, Err("boom"));
});

Deno.test("definePanicHook() passes the caught Panic itself to the hook", () => {
	// Given: a hook that records what it receives
	let seen: Panic<unknown> | undefined;
	const withPanic = definePanicHook({
		hook: (p) => {
			seen = p;
			return null;
		},
	});
	const original = new Panic({ message: "m", cause: 7 });

	// When: running a function that throws that Panic
	withPanic(() => {
		throw original;
	});

	// Then: the hook received the very same instance
	assertStrictEquals(seen, original);
});

Deno.test("definePanicHook() wraps non-panics by default", () => {
	// Given: a hook with default options
	const withPanic = definePanicHook({ hook: toMessage });
	const error = new TypeError("not a panic");

	// When: running a function that throws a plain Error
	const thrown = assertThrows(() =>
		withPanic(() => {
			throw error;
		}),
	);

	// Then: a NonPanic Panic is thrown, carrying the original as its cause
	// QUESTION: the wrapped Panic is re-thrown rather than converted to Err by
	// the hook. Is a non-panic meant to escape the boundary?
	assertInstanceOf(thrown, Panic);
	assertEquals(thrown.name, "Panic (NonPanic)");
	assertEquals(
		thrown.message,
		"Something other than a panic was thrown: TypeError: not a panic",
	);
	assertStrictEquals(thrown.cause, error);
});

Deno.test("definePanicHook() rethrows non-panics untouched when wrapNonPanics is false", () => {
	// Given: a hook that does not wrap non-panics
	const withPanic = definePanicHook({ hook: toMessage, wrapNonPanics: false });
	const error = new RangeError("raw");

	// When: running a function that throws a plain Error
	const thrown = assertThrows(() =>
		withPanic(() => {
			throw error;
		}),
	);

	// Then: the original error escapes as-is
	assertStrictEquals(thrown, error);
});

Deno.test("definePanicHook() exposes its handler", () => {
	// Given: a hook function
	const hook = toMessage;

	// When: defining a panic hook
	const withPanic = definePanicHook({ hook });

	// Then: the handler is a PanicHandler holding that hook
	assertInstanceOf(withPanic.handler, PanicHandler);
	assertStrictEquals(withPanic.handler.panicHook, hook);
});

Deno.test("PanicHandler.replace() swaps the hook used by the boundary", () => {
	// Given: a boundary built with one hook
	const withPanic = definePanicHook({ hook: () => "first" });

	// When: replacing the hook through the handler
	const returned = withPanic.handler.replace(() => "second");
	const result = withPanic(() => panic({ message: "m", cause: null }));

	// Then: replace() chains and the new hook is used
	assertStrictEquals(returned, withPanic.handler);
	assertEquals(result, Err("second"));
});

Deno.test("PanicHandler.map() transforms the error type", () => {
	// Given: a boundary mapping panics to their message
	const withPanic = definePanicHook({ hook: toMessage });

	// When: mapping the handler to the message length
	const mapped = withPanic.handler.map((message) => message.length);
	const result = mapped(() => panic({ message: "four", cause: null }));

	// Then: the error is the transformed value
	assertEquals(result, Err(4));
});

Deno.test("PanicHandler.map() follows later replacements of the source hook", () => {
	// Given: a mapped boundary derived from a source boundary
	const withPanic = definePanicHook({ hook: () => "a" });
	const mapped = withPanic.handler.map((e) => `${e}!`);

	// When: the source hook is replaced after mapping
	withPanic.handler.replace(() => "b");
	const result = mapped(() => panic({ message: "m", cause: null }));

	// Then: the mapped boundary sees the replacement
	assertEquals(result, Err("b!"));
});

Deno.test("PanicHandler.map() obeys the functor laws", async (t) => {
	const throwPanic = () => panic({ message: "law", cause: null });

	await t.step("identity", () => {
		// Given: a boundary
		const withPanic = definePanicHook({ hook: toMessage });

		// When: mapping with identity
		const mapped = withPanic.handler.map((e) => e);

		// Then: results equal the unmapped boundary's
		assertEquals(mapped(throwPanic), withPanic(throwPanic));
		assertEquals(
			mapped(() => 1),
			withPanic(() => 1),
		);
	});

	await t.step("composition", () => {
		// Given: a boundary and two functions
		const withPanic = definePanicHook({ hook: toMessage });
		const f = (s: string) => s.length;
		const g = (n: number) => n * 10;

		// When: mapping f then g, versus mapping their composition
		const chained = withPanic.handler.map(f).handler.map(g);
		const composed = withPanic.handler.map((s) => g(f(s)));

		// Then: both produce the same result
		assertEquals(chained(throwPanic), composed(throwPanic));
		assertEquals(chained(throwPanic), Err(30));
	});
});

Deno.test("PanicHandler.map() keeps the wrapNonPanics setting", () => {
	// Given: a non-wrapping boundary
	const withPanic = definePanicHook({ hook: toMessage, wrapNonPanics: false });
	const error = new Error("raw");

	// When: running a non-panic through a mapped boundary
	const mapped = withPanic.handler.map((m) => m.length);
	const thrown = assertThrows(() =>
		mapped(() => {
			throw error;
		}),
	);

	// Then: the original error still escapes unwrapped
	assertStrictEquals(thrown, error);
});
