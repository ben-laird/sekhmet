import { isNone, Some } from "@sekhmet/enum/option/mini";
import { Ready } from "@sekhmet/enum/poll/mini";
import { definePanicRuntime, Panic, type PanicRuntime } from "@sekhmet/panic";
import {
	assert,
	assertEquals,
	assertInstanceOf,
	assertThrows,
} from "@std/assert";
import { DispatchController } from "@/mod.ts";

/** A panic runtime whose reports the test can read. */
function recordingPanics(): {
	readonly panics: PanicRuntime;
	readonly reported: unknown[];
} {
	const panics = definePanicRuntime();
	const reported: unknown[] = [];
	panics.setHook(({ payload }) => {
		reported.push(payload);
	});
	return { panics, reported };
}

type Cause =
	| { readonly kind: "done" }
	| { readonly kind: "cancelled"; readonly by: string };
// {}

Deno.test("a dispatch carries a typed value, and the first one wins", () => {
	// Given: a controller for a typed cause
	const { panics } = recordingPanics();
	const controller = new DispatchController<Cause>(panics.catchUnwind);

	// When: it's dispatched twice
	const first = controller.dispatch({ kind: "cancelled", by: "user" });
	const second = controller.dispatch({ kind: "done" });

	// Then: each returns the value already there; the first value stays
	assert(isNone(first));
	assertEquals(second, Some({ kind: "cancelled", by: "user" }));
	assertEquals(
		controller.signal.poll(),
		Ready({ kind: "cancelled", by: "user" }),
	);
});

Deno.test("a listener added after the dispatch still runs (AbortSignal's would not)", () => {
	// Given: an AbortSignal and a dispatch signal, both already fired
	const abort = new AbortController();
	abort.abort("gone");
	const { panics } = recordingPanics();
	const controller = new DispatchController<string>(panics.catchUnwind);
	controller.dispatch("gone");
	let abortHeard = false;
	let dispatchHeard: string | undefined;

	// When: a listener is added to each afterwards
	abort.signal.addEventListener("abort", () => {
		abortHeard = true;
	});
	controller.signal.whenDispatched((reason) => {
		dispatchHeard = reason;
	});

	// Then: the AbortSignal listener never fires; the dispatch listener runs at once
	assert(!abortHeard);
	assertEquals(dispatchHeard, "gone");
});

Deno.test("unsubscribing before the dispatch stops the listener", () => {
	// Given: two listeners, one unsubscribed
	const { panics } = recordingPanics();
	const controller = new DispatchController<number>(panics.catchUnwind);
	const heard: string[] = [];
	const stopA = controller.signal.whenDispatched(() => void heard.push("a"));
	controller.signal.whenDispatched(() => void heard.push("b"));
	const removed = stopA();

	// When: it dispatches
	controller.dispatch(1);

	// Then: only the subscribed one ran; unsubscribing afterwards reports false
	assert(removed);
	assertEquals(heard, ["b"]);
	assertEquals(stopA(), false);
});

Deno.test("a throwing listener is a reported panic; the others still run and dispatch doesn't throw", () => {
	// Given: three listeners, the middle one throwing
	const { panics, reported } = recordingPanics();
	const controller = new DispatchController<string>(panics.catchUnwind);
	const heard: string[] = [];
	controller.signal.whenDispatched(() => void heard.push("first"));
	controller.signal.whenDispatched(() => {
		throw new Error("listener bug");
	});
	controller.signal.whenDispatched(() => void heard.push("third"));

	// When: it dispatches
	const result = controller.dispatch("go");

	// Then: dispatch succeeded, both other listeners ran, and the throw reached the hook
	assert(isNone(result));
	assertEquals(heard, ["first", "third"]);
	assertEquals(reported.length, 1);
	assert(
		reported[0] instanceof Error && reported[0].message === "listener bug",
	);
});

Deno.test("a throwing listener added after the dispatch is a reported panic too", () => {
	// Given: a controller that has already dispatched
	const { panics, reported } = recordingPanics();
	const controller = new DispatchController<string>(panics.catchUnwind);
	controller.dispatch("go");

	// When: a throwing listener is added
	const stop = controller.signal.whenDispatched(() => {
		throw new Error("late bug");
	});

	// Then: it ran at once inside the boundary, and there's nothing to unsubscribe
	assertEquals(reported.length, 1);
	assertEquals(stop(), false);
});

Deno.test("a listener added while dispatching runs after the ones already waiting", () => {
	// Given: a listener that adds another when it runs, then a second listener
	const { panics } = recordingPanics();
	const controller = new DispatchController<string>(panics.catchUnwind);
	const heard: string[] = [];
	controller.signal.whenDispatched((v) => {
		heard.push(`outer ${v}`);
		controller.signal.whenDispatched((w) => void heard.push(`inner ${w}`));
	});
	controller.signal.whenDispatched((v) => void heard.push(`second ${v}`));

	// When: it dispatches
	controller.dispatch("x");

	// Then: the late listener heard it, in order, after the one already waiting
	assertEquals(heard, ["outer x", "second x", "inner x"]);
});

Deno.test("a listener can unsubscribe a later one mid-dispatch, which then never runs", () => {
	// Given: a first listener that unsubscribes the second when it runs
	const { panics } = recordingPanics();
	const controller = new DispatchController<string>(panics.catchUnwind);
	const heard: string[] = [];
	const removed: boolean[] = [];
	controller.signal.whenDispatched(() => {
		heard.push("first");
		removed.push(stopSecond());
	});
	const stopSecond = controller.signal.whenDispatched(() => {
		heard.push("second");
	});
	controller.signal.whenDispatched(() => void heard.push("third"));

	// When: it dispatches
	controller.dispatch("x");

	// Then: the second was removed before its turn, and the rest still ran
	assertEquals(heard, ["first", "third"]);
	assertEquals(removed, [true]);
});

Deno.test("a listener that dispatches again mid-dispatch gets the first value back", () => {
	// Given: a listener that dispatches a second value while the first drains
	const { panics } = recordingPanics();
	const controller = new DispatchController<string>(panics.catchUnwind);
	const again: unknown[] = [];
	controller.signal.whenDispatched(() => {
		again.push(controller.dispatch("second"));
	});

	// When: it dispatches
	controller.dispatch("first");

	// Then: the re-entrant dispatch changed nothing and returned the first value
	assertEquals(again, [Some("first")]);
	assertEquals(controller.signal.poll(), Ready("first"));
});

Deno.test("a throwing panic hook (a double fault) propagates, but the dispatch still completes", () => {
	// Given: a runtime whose hook throws, and a throwing listener between two others
	const panics = definePanicRuntime();
	panics.setHook(() => {
		throw new Error("hook bug");
	});
	const controller = new DispatchController<string>(panics.catchUnwind);
	const heard: string[] = [];
	controller.signal.whenDispatched(() => void heard.push("first"));
	controller.signal.whenDispatched(() => {
		throw new Error("listener bug");
	});
	controller.signal.whenDispatched(() => void heard.push("third"));

	// When: it dispatches, then a listener is added afterwards
	const thrown = assertThrows(() => controller.dispatch("go"));
	controller.signal.whenDispatched(() => void heard.push("late"));

	// Then: the double fault reached the caller as a panic, yet every listener ran and the queue drained
	assertInstanceOf(thrown, Panic);
	assertEquals(heard, ["first", "third", "late"]);
	assertEquals(controller.signal.poll(), Ready("go"));
	assertEquals(controller.dispatch("next"), Some("go"));
});
