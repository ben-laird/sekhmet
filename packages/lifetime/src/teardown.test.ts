import { Panic } from "@sekhmet/panic";
import { assert, assertEquals } from "@std/assert";
import { Lifetime } from "./lifetime.ts";
import {
	asPanic,
	installDisposers,
	isThenable,
	suppressedError,
} from "./teardown.ts";

Deno.test("suppressedError uses the platform's SuppressedError where there is one", () => {
	// Given: a runtime with SuppressedError, or without it
	const native: unknown = Reflect.get(globalThis, "SuppressedError");

	// When: two errors are chained
	const chained = suppressedError({ error: "newer", suppressed: "older" });

	// Then: the native class when there is one; the same shape either way
	if (typeof native === "function") {
		assert(chained instanceof globalThis.SuppressedError);
	}
	assertEquals(chained.name, "SuppressedError");
	assertEquals(Reflect.get(chained, "error"), "newer");
	assertEquals(Reflect.get(chained, "suppressed"), "older");
});

Deno.test("suppressedError falls back to an Error of the same shape, without installing a global", () => {
	// Given: a runtime without SuppressedError
	const native = Object.getOwnPropertyDescriptor(globalThis, "SuppressedError");
	Reflect.deleteProperty(globalThis, "SuppressedError");
	try {
		// When: two errors are chained
		const chained = suppressedError({ error: "newer", suppressed: "older" });

		// Then: an Error named SuppressedError, holding both; no global appeared
		assert(chained instanceof Error);
		assertEquals(chained.name, "SuppressedError");
		assertEquals(Reflect.get(chained, "error"), "newer");
		assertEquals(Reflect.get(chained, "suppressed"), "older");
		assertEquals(Reflect.get(globalThis, "SuppressedError"), undefined);
	} finally {
		if (native !== undefined) {
			Object.defineProperty(globalThis, "SuppressedError", native);
		}
	}
});

Deno.test("asPanic keeps a Panic and wraps anything else, keeping it as the cause", () => {
	// Given: a Panic, an Error and a string
	const panic = new Panic({ message: "already", cause: null });
	const error = new Error("boom");

	// When: each is made a panic
	const kept = asPanic({ payload: panic, name: "CleanupFailed" });
	const wrapped = asPanic({ payload: error, name: "CleanupFailed" });
	const text = asPanic({ payload: "bare", name: "CleanupFailed" });

	// Then: the Panic is unchanged; the others carry their message and payload
	assert(kept === panic);
	assertEquals(
		[wrapped.name, wrapped.message],
		["Panic (CleanupFailed)", "boom"],
	);
	assert(wrapped.cause === error);
	assertEquals(text.message, "bare");
});

Deno.test("isThenable tells promises and thenables from plain values", () => {
	// Given: a promise, a hand-made thenable, and plain values
	const thenable = {
		// biome-ignore lint/suspicious/noThenProperty: a thenable is the subject under test
		then: () => {},
	};
	const notCallable = {
		// biome-ignore lint/suspicious/noThenProperty: a non-callable then
		then: 1,
	};

	// When / Then: only the first two are thenables
	assert(isThenable(Promise.resolve()));
	assert(isThenable(thenable));
	assert(!isThenable<unknown>(undefined));
	assert(!isThenable<unknown>(notCallable));
});

Deno.test("installDisposers installs each disposer only under a symbol the runtime defines", () => {
	// Given: symbol tables with both, one, or neither of the well-known symbols
	const dispose = Symbol("dispose");
	const asyncDispose = Symbol("asyncDispose");
	const tables = [
		{ dispose, asyncDispose },
		{ dispose },
		{ asyncDispose: undefined },
	];
	const disposer = (): void => {};
	const asyncDisposer = (): Promise<void> => Promise.resolve();

	// When: each table installs on a fresh target
	const targets = tables.map((symbols) => {
		const target = {};
		installDisposers({
			target,
			symbols,
			dispose: disposer,
			asyncDispose: asyncDisposer,
		});
		return target;
	});

	// Then: only defined symbols got a disposer, and no string key appeared
	const [both, syncOnly, neither] = targets;
	assert(Reflect.get(both ?? {}, dispose) === disposer);
	assert(Reflect.get(both ?? {}, asyncDispose) === asyncDisposer);
	assert(Reflect.get(syncOnly ?? {}, dispose) === disposer);
	assertEquals(Reflect.ownKeys(syncOnly ?? {}).length, 1);
	assertEquals(Reflect.ownKeys(neither ?? {}), []);
});

Deno.test("Lifetime's disposers are installed under the runtime's own symbols", () => {
	// Given: the runtime's well-known symbols
	const symbols = [
		Reflect.get(Symbol, "dispose"),
		Reflect.get(Symbol, "asyncDispose"),
	];

	// When: Lifetime's prototype is inspected
	const keys = Reflect.ownKeys(Lifetime.prototype);

	// Then: each defined symbol has a disposer; no "undefined" key exists
	for (const symbol of symbols) {
		if (typeof symbol === "symbol") {
			assert(keys.includes(symbol));
		}
	}
	assert(!keys.includes("undefined"));
});
