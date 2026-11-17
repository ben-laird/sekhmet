import { Panic } from "@sekhmet/panic/mini/core";
import { assertEquals, assertThrows } from "@std/assert";
import { invariant } from "@/src/invariant/invariant.ts";
import { todo, unimplemented } from "@/src/todo/todo.ts";
import { unreachable } from "@/src/unreachable/unreachable.ts";
import {
	flagField,
	guardedMessage,
	listField,
	readField,
	textField,
	urlField,
} from "@/src/workflow-panic/read.ts";

const boom = (): never => {
	throw new Error("caller code ran");
};

/** An object whose every Proxy trap throws. */
const hostileProxy = new Proxy(
	{},
	{ has: boom, get: boom, ownKeys: boom, getPrototypeOf: boom },
);

/** Options whose every field is a throwing getter. */
const throwingGetters = {
	get description(): never {
		return boom();
	},
	get subtasks(): never {
		return boom();
	},
	get trackingUrl(): never {
		return boom();
	},
	get issueUrl(): never {
		return boom();
	},
	get expectedBehavior(): never {
		return boom();
	},
	get value(): never {
		return boom();
	},
};

Deno.test("readField tells present, absent and unreadable fields apart", () => {
	// Given: a present field, a missing one, a non-object and a throwing getter
	const sources: unknown[] = [{ a: 1 }, {}, null, "a", throwingGetters];

	// When: reading `a` (and `value` from the getters)
	const reads = sources.map((from) => {
		return readField({ from, key: from === throwingGetters ? "value" : "a" });
	});

	// Then: each read says which it was
	assertEquals(reads, [
		{ kind: "present", value: 1 },
		{ kind: "absent" },
		{ kind: "absent" },
		{ kind: "absent" },
		{ kind: "unreadable" },
	]);
});

Deno.test("the typed readers never throw and fall back by type", () => {
	// Given: well-formed fields and hostile ones
	const url = new URL("https://example.com/");
	const good = { text: "t", count: 3, url, flag: true, list: [1, 2] };

	// When: reading each through its typed reader
	const read = {
		text: [
			textField({ from: good, key: "text" }),
			textField({ from: good, key: "count" }),
			textField({ from: good, key: "missing" }),
			textField({ from: throwingGetters, key: "description" }),
		],
		url: [
			urlField({ from: good, key: "url" }),
			urlField({ from: good, key: "text" }),
			urlField({ from: hostileProxy, key: "url" }),
		],
		flag: [
			flagField({ from: good, key: "flag" }),
			flagField({ from: good, key: "count" }),
		],
		list: [
			listField({ from: good, key: "list" }),
			listField({ from: { list: "abc" }, key: "list" }),
			listField({ from: { list: null }, key: "list" }),
			listField({ from: { list: new Proxy([1], { get: boom }) }, key: "list" }),
		],
	};

	// Then: each falls back to undefined, the unrenderable marker, false or []
	assertEquals(read, {
		text: ["t", "3", undefined, "[unrenderable value]"],
		url: [url, undefined, undefined],
		flag: [true, false],
		list: [[1, 2], [], [], []],
	});
});

Deno.test("guardedMessage falls back to the header when building throws", () => {
	// Given: a builder that works and one that throws
	// When: building each
	const messages = [
		guardedMessage({ header: "h", build: () => "h\nbody" }),
		guardedMessage({ header: "h", build: boom }),
	];

	// Then: the throwing one yields the header alone
	assertEquals(messages, ["h\nbody", "h"]);
});

Deno.test("every helper panics, never throws something else, on hostile options", () => {
	// Given: each helper with options no typed caller could pass
	const subtaskGetters = {
		subtasks: [
			{
				get description(): never {
					return boom();
				},
				get complete(): never {
					return boom();
				},
			},
		],
	};
	const calls: [string, () => unknown][] = [
		["todo(null)", () => Reflect.apply(todo, undefined, [null])],
		["todo(getters)", () => Reflect.apply(todo, undefined, [throwingGetters])],
		["todo(Proxy)", () => Reflect.apply(todo, undefined, [hostileProxy])],
		[
			"todo(subtask getters)",
			() => Reflect.apply(todo, undefined, [subtaskGetters]),
		],
		[
			"todo(subtasks: null)",
			() => Reflect.apply(todo, undefined, [{ subtasks: null }]),
		],
		[
			'todo(subtasks: "abc")',
			() => Reflect.apply(todo, undefined, [{ subtasks: "abc" }]),
		],
		[
			"todo(subtasks: Proxy)",
			() =>
				Reflect.apply(todo, undefined, [
					{ subtasks: new Proxy([], { get: boom }) },
				]),
		],
		[
			"unimplemented(getters)",
			() => Reflect.apply(unimplemented, undefined, [throwingGetters]),
		],
		["unreachable(null)", () => Reflect.apply(unreachable, undefined, [null])],
		[
			"unreachable(getters)",
			() => Reflect.apply(unreachable, undefined, [throwingGetters]),
		],
		[
			"unreachable(Proxy)",
			() => Reflect.apply(unreachable, undefined, [hostileProxy]),
		],
		[
			"invariant(false, undefined)",
			() => Reflect.apply(invariant, undefined, [false, undefined]),
		],
		[
			"invariant(false, getters)",
			() => Reflect.apply(invariant, undefined, [false, throwingGetters]),
		],
		[
			"invariant(false, Proxy)",
			() => Reflect.apply(invariant, undefined, [false, hostileProxy]),
		],
	];

	// When: calling each
	const names = calls.map(([label, call]) => {
		return [label, assertThrows(call, Panic).name];
	});

	// Then: each threw its own Panic
	assertEquals(
		names.map(([, name]) => name),
		[
			...Array(7).fill("Panic (Todo)"),
			"Panic (Unimplemented)",
			...Array(3).fill("Panic (Unreachable)"),
			...Array(3).fill("Panic (Invariant)"),
		],
	);
});

Deno.test("hostile options render as markers, not as thrown errors", () => {
	// Given: getters that throw on every field
	// When: each helper panics with them
	const messages = [
		assertThrows(() => Reflect.apply(todo, undefined, [throwingGetters]), Panic)
			.message,
		assertThrows(
			() => Reflect.apply(unreachable, undefined, [throwingGetters]),
			Panic,
		).message,
		assertThrows(
			() => Reflect.apply(invariant, undefined, [false, undefined]),
			Panic,
		).message,
	];

	// Then: unreadable parts show the marker, and missing ones say so
	assertEquals(messages, [
		"a code path that is not implemented yet was executed\nTodo: [unrenderable value]",
		"an unreachable code path was executed\nImpossible value: [unrenderable value]",
		"an invariant was violated\nExpected behavior: (not given)",
	]);
});
