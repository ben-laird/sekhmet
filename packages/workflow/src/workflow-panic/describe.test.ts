import { assertEquals } from "@std/assert";
import { describeValue, displayText } from "@/src/workflow-panic/describe.ts";

Deno.test("describeValue renders primitives the way a debugger shows them", () => {
	// Given: one value of every primitive type
	const values: unknown[] = [
		"text",
		42,
		-0,
		Number.NaN,
		10n,
		true,
		undefined,
		null,
		Symbol("tag"),
	];

	// When: describing each
	const described = values.map(describeValue);

	// Then: strings are quoted, -0 and BigInts are kept apart
	assertEquals(described, [
		'"text"',
		"42",
		"-0",
		"NaN",
		"10n",
		"true",
		"undefined",
		"null",
		"Symbol(tag)",
	]);
});

Deno.test("describeValue renders objects, arrays and class instances shallowly", () => {
	// Given: a plain object, an array, a class instance and a function
	class Point {
		x = 1;
		y = 2;
	}
	function area(): number {
		return 0;
	}

	// When: describing each
	const described = [
		describeValue({ kind: "triangle", "two words": [1, "a"] }),
		describeValue([]),
		describeValue({}),
		describeValue(new Point()),
		describeValue(area),
		describeValue(() => 0),
	];

	// Then: each reads like an object literal, prefixed by its class
	assertEquals(described, [
		'{ kind: "triangle", "two words": [1, "a"] }',
		"[]",
		"{}",
		"Point { x: 1, y: 2 }",
		"[Function: area]",
		"[Function: (anonymous)]",
	]);
});

Deno.test("describeValue stops at a depth and an entry limit", () => {
	// Given: a deeply nested object and a long array
	const deep = { a: { b: { c: { d: 1 } } }, list: [[[1]]] };
	const long = Array.from({ length: 12 }, (_, index) => index);

	// When: describing them
	const described = [describeValue(deep), describeValue(long)];

	// Then: deep levels are summarized and extra entries counted
	assertEquals(described, [
		"{ a: { b: [Object] }, list: [[Array]] }",
		"[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, … 2 more]",
	]);
});

Deno.test("describeValue never throws on hostile values", () => {
	// Given: a cycle, a throwing getter, a throwing toJSON, a revoked Proxy and
	// a Proxy whose every trap throws
	const cycle: { self?: unknown } = {};
	cycle.self = cycle;
	const getter = {
		get boom(): never {
			throw new Error("getter ran");
		},
	};
	const json = {
		toJSON(): never {
			throw new Error("toJSON ran");
		},
	};
	const revocable = Proxy.revocable({}, {});
	revocable.revoke();
	const trap = (): never => {
		throw new Error("trap ran");
	};
	const hostile = new Proxy(
		{},
		{ getPrototypeOf: trap, ownKeys: trap, getOwnPropertyDescriptor: trap },
	);

	// When: describing each
	const described = [
		describeValue(cycle),
		describeValue(getter),
		describeValue(json),
		describeValue(revocable.proxy),
		describeValue(hostile),
	];

	// Then: each renders without running user code or throwing
	assertEquals(described, [
		"{ self: [Circular] }",
		"{ boom: [Getter] }",
		"{ toJSON: [Function: toJSON] }",
		"[unrenderable value]",
		"[unrenderable value]",
	]);
});

Deno.test("describeValue survives a property whose descriptor trap throws", () => {
	// Given: a Proxy that lists keys but throws when one is read
	const proxy = new Proxy(
		{ a: 1 },
		{
			getOwnPropertyDescriptor: (): never => {
				throw new Error("trap ran");
			},
		},
	);

	// When: describing it
	const described = describeValue(proxy);

	// Then: only that entry is unrenderable
	assertEquals(described, "{ a: [unrenderable value] }");
});

Deno.test("displayText keeps strings and stringifies the rest", () => {
	// Given: a string, a URL, a symbol and an object whose toString throws
	const throwing = {
		toString(): never {
			throw new Error("toString ran");
		},
	};

	// When: displaying each
	const displayed = [
		displayText("plain"),
		displayText(new URL("https://example.com/issues/1")),
		displayText(Symbol("s")),
		displayText(throwing),
	];

	// Then: strings pass through, and a throwing toString falls back to a description
	assertEquals(displayed, [
		"plain",
		"https://example.com/issues/1",
		"Symbol(s)",
		"{ toString: [Function: toString] }",
	]);
});
