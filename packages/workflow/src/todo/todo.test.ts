import { isErr } from "@sekhmet/enum/result/mini/predicates";
import { unwrapErr } from "@sekhmet/enum/result/mini/unwrap";
import { definePanicRuntime } from "@sekhmet/panic";
import { Panic } from "@sekhmet/panic/mini/core";
import { assert, assertEquals, assertFalse, assertThrows } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import {
	isTodoPanic,
	isUnimplementedPanic,
	type Subtask,
	type TodoCause,
	type TodoOptions,
	todo,
	type UnimplementedCause,
	unimplemented,
} from "@/src/todo/todo.ts";

const TRACKING_URL = new URL("https://example.com/issues/1");

Deno.test("todo renders a header, the description and the checklist", () => {
	// Given: every option
	const options: TodoOptions = {
		description: "parse the config file",
		subtasks: [
			{ description: "read the file", complete: true },
			{ description: "validate it" },
			{ description: "cache it", complete: false },
		],
		trackingUrl: TRACKING_URL,
	};

	// When: todo runs
	const thrown = assertThrows(() => todo(options), Panic);

	// Then: the message has a line per part, in order
	assertEquals(
		thrown.message,
		[
			"a code path that is not implemented yet was executed",
			"Todo: parse the config file (tracked at https://example.com/issues/1)",
			"  - [x] read the file",
			"  - [ ] validate it",
			"  - [ ] cache it",
		].join("\n"),
	);
	assertEquals(thrown.name, "Panic (Todo)");
});

Deno.test("todo leaves absent parts out of the message", async (t) => {
	await t.step("with no options, only the header", () => {
		// Given: no options
		// When: todo runs
		const thrown = assertThrows(() => todo(), Panic);

		// Then: the message is the header alone
		assertEquals(
			thrown.message,
			"a code path that is not implemented yet was executed",
		);
	});

	await t.step("with a description only, no tracking suffix", () => {
		// Given: a description without a URL
		// When: todo runs
		const thrown = assertThrows(() => todo({ description: "retry" }), Panic);

		// Then: the description line has no "(tracked at …)"
		assertEquals(
			thrown.message,
			"a code path that is not implemented yet was executed\nTodo: retry",
		);
	});

	await t.step("with a URL only, a tracking line", () => {
		// Given: a URL without a description
		// When: todo runs
		const thrown = assertThrows(
			() => todo({ trackingUrl: TRACKING_URL }),
			Panic,
		);

		// Then: the URL gets a line of its own
		assertEquals(
			thrown.message,
			"a code path that is not implemented yet was executed\nTracked at https://example.com/issues/1",
		);
	});

	await t.step("with subtasks only, the checklist under the header", () => {
		// Given: a checklist alone
		// When: todo runs
		const thrown = assertThrows(
			() => todo({ subtasks: [{ description: "a", complete: true }] }),
			Panic,
		);

		// Then: no description line sits between them
		assertEquals(
			thrown.message,
			"a code path that is not implemented yet was executed\n  - [x] a",
		);
	});
});

Deno.test("todo's cause holds its options, with absent parts filled in", () => {
	// Given: a description and subtasks, and no options at all
	const subtasks: readonly Subtask[] = [{ description: "a" }];

	// When: todo runs with each
	const full = assertThrows(() => todo({ description: "d", subtasks }));
	const empty = assertThrows(() => todo());

	// Then: the causes are plain objects, undefined and [] where absent
	assert(isTodoPanic(full) && isTodoPanic(empty));
	assertEquals(full.cause, {
		description: "d",
		subtasks,
		trackingUrl: undefined,
	});
	assertEquals(empty.cause, {
		description: undefined,
		subtasks: [],
		trackingUrl: undefined,
	});
});

Deno.test("unimplemented is todo's layout under its own name and header", () => {
	// Given: a description, a URL and a subtask
	const options: TodoOptions = {
		description: "writing to a read-only store",
		subtasks: [{ description: "decide on a policy" }],
		trackingUrl: TRACKING_URL,
	};

	// When: unimplemented runs
	const thrown = assertThrows(() => unimplemented(options), Panic);

	// Then: it is a distinct panic with the same message layout
	assertEquals(thrown.name, "Panic (Unimplemented)");
	assertEquals(
		thrown.message,
		[
			"a code path that is deliberately not implemented was executed",
			"Unimplemented: writing to a read-only store (tracked at https://example.com/issues/1)",
			"  - [ ] decide on a policy",
		].join("\n"),
	);
	assert(isUnimplementedPanic(thrown));
	assertEquals(thrown.cause.description, "writing to a read-only store");
});

Deno.test("the guards tell todo, unimplemented and other panics apart", () => {
	// Given: a todo panic, an unimplemented panic, and a hand-built Panic
	// with the Todo name and a valid cause
	const fromTodo = assertThrows(() => todo());
	const fromUnimplemented = assertThrows(() => unimplemented());
	const forged = new Panic<TodoCause>({
		name: "Todo",
		message: "",
		cause: { description: undefined, subtasks: [], trackingUrl: undefined },
	});

	// When: asking each guard about each value
	const verdicts = [fromTodo, fromUnimplemented, forged, "Todo"].map(
		(value) => {
			return [isTodoPanic(value), isUnimplementedPanic(value)];
		},
	);

	// Then: each guard accepts only its own helper's panic
	assertEquals(verdicts, [
		[true, false],
		[false, true],
		[false, false],
		[false, false],
	]);
});

Deno.test("options cannot override the panic's name", () => {
	// Given: options carrying a name, passed through a wider variable
	const options = { description: "d", name: "Evil" };

	// When: todo and unimplemented run with them
	const fromTodo = assertThrows(() => todo(options), Panic);
	const fromUnimplemented = assertThrows(() => unimplemented(options), Panic);

	// Then: the names stay the helpers' own, and the cause has no name
	assertEquals(fromTodo.name, "Panic (Todo)");
	assertEquals(fromUnimplemented.name, "Panic (Unimplemented)");
	assertFalse("name" in Object(fromTodo.cause));
});

Deno.test("todo never throws while building its message", () => {
	// Given: untyped input whose description's toString throws
	const hostile = JSON.parse('{ "description": {} }');
	hostile.description.toString = (): never => {
		throw new Error("toString ran");
	};

	// When: todo runs
	const thrown = assertThrows(() => todo(hostile), Panic);

	// Then: it still panics as a todo, with the description rendered safely
	assertEquals(
		thrown.message,
		"a code path that is not implemented yet was executed\nTodo: { toString: [Function: (anonymous)] }",
	);
});

Deno.test("a runtime's hook and catchUnwind see a todo panic", () => {
	// Given: a runtime whose hook records what it sees
	const runtime = definePanicRuntime();
	const seen: string[] = [];
	runtime.setHook(({ payload }) => {
		if (isTodoPanic(payload)) {
			seen.push(payload.cause.description ?? "");
		}
	});

	// When: todo runs inside the boundary
	const result = runtime.catchUnwind(() => todo({ description: "later" }));

	// Then: the hook saw it once, and the boundary returned it as Err
	assertEquals(seen, ["later"]);
	assert(isErr(result));
	assert(isTodoPanic(unwrapErr(result)));
});

Deno.test("todo and its guards have exact types", () => {
	// Given: a caught value
	const value: unknown = assertThrows(() => todo());

	// When: the guards narrow it
	// Then: each narrows to a Panic of its cause, and the helpers return never
	if (isTodoPanic(value)) {
		assertType<IsExact<typeof value, Panic<TodoCause>>>(true);
	}
	if (isUnimplementedPanic(value)) {
		assertType<IsExact<typeof value, Panic<UnimplementedCause>>>(true);
	}
	assertType<IsExact<ReturnType<typeof todo>, never>>(true);
	assertType<IsExact<ReturnType<typeof unimplemented>, never>>(true);
	assertType<
		IsExact<
			TodoCause,
			{
				readonly description: string | undefined;
				readonly subtasks: readonly Subtask[];
				readonly trackingUrl: URL | undefined;
			}
		>
	>(true);
});

Deno.test("todo rejects options it does not define", () => {
	// Given: calls that must not compile, never run
	const neverRun = (): void => {
		// When: passing a name, a string URL or a subtask without a description
		// Then: each is a type error
		// @ts-expect-error options have no name: they cannot rename the panic
		todo({ name: "Evil" });
		// @ts-expect-error the tracking URL is a URL, not a string
		todo({ trackingUrl: "https://example.com" });
		// @ts-expect-error a subtask needs a description
		todo({ subtasks: [{ complete: true }] });
		// @ts-expect-error an absent field is left out, not set to undefined
		unimplemented({ description: undefined });
	};

	assertEquals(typeof neverRun, "function");
});

Deno.test("a todo panic widens to a Panic of unknown, never the reverse", () => {
	// Given: a narrowed todo panic and a Panic of unknown cause
	const narrow = assertThrows(() => todo());
	assert(isTodoPanic(narrow));
	const wide = new Panic<unknown>({ message: "", cause: 1 });

	// When: assigning between them both ways
	const widened: Panic<unknown> = narrow;
	// @ts-expect-error a Panic of unknown cause is not a todo panic
	const narrowed: Panic<TodoCause> = wide;
	const widenedAgain: Panic<unknown> = narrow;

	// Then: only widening compiles
	assertEquals([widened, widenedAgain].length, 2);
	assertEquals(narrowed, wide);
});
