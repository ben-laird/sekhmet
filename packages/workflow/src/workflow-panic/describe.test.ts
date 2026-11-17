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

Deno.test("describeValue renders maps, sets, errors and typed arrays", () => {
	// Given: one of each built-in collection, and errors
	const map = new Map<unknown, unknown>([
		["a", 1],
		[{ k: 1 }, [2]],
	]);
	const set = new Set([1, "two"]);

	// When: describing each
	const described = [
		describeValue(map),
		describeValue(set),
		describeValue(new Map()),
		describeValue(new TypeError("bad input")),
		describeValue(new Error("")),
		describeValue(new Uint8Array([1, 2, 3])),
		describeValue(new BigInt64Array([5n])),
		describeValue({ nested: new Set([1]) }),
	];

	// Then: each shows its kind, size and first entries
	assertEquals(described, [
		'Map(2) { "a" => 1, { k: 1 } => [2] }',
		'Set(2) { 1, "two" }',
		"Map(0) {}",
		"[TypeError: bad input]",
		"[Error]",
		"Uint8Array(3) [1, 2, 3]",
		"BigInt64Array(1) [5n]",
		"{ nested: Set(1) { 1 } }",
	]);
});

Deno.test("describeValue and displayText cut long strings and keys", () => {
	// Given: a 5 MB string and an object with a 1M-character key
	const huge = "a".repeat(5_000_000);
	const keyed = { [huge.slice(0, 1_000_000)]: 1 };

	// When: rendering them
	const described = describeValue(huge);
	const key = describeValue(keyed);
	const text = displayText(huge);

	// Then: each keeps a bounded prefix and counts the rest
	assertEquals(described, `"${"a".repeat(200)}"… 4999800 more chars`);
	assertEquals(key, `{ "${"a".repeat(200)}"… 999800 more chars: 1 }`);
	assertEquals(text, `${"a".repeat(1000)}… 4999000 more chars`);
});

Deno.test("describeValue stays fast and small on huge collections", () => {
	// Given: a 10M-element typed array, and a 100k-element array and Map
	const bytes = new Uint8Array(10_000_000);
	const list = new Array<number>(100_000).fill(7);
	const map = new Map(list.map((n, index) => [index, n]));

	// When: describing them, timed
	const started = performance.now();
	const described = [bytes, list, map].map(describeValue);
	const elapsed = performance.now() - started;

	// Then: each shows at most ten entries and a count, well within a second
	assertEquals(described, [
		"Uint8Array(10000000) [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, … 9999990 more]",
		"[7, 7, 7, 7, 7, 7, 7, 7, 7, 7, … 99990 more]",
		"Map(100000) { 0 => 7, 1 => 7, 2 => 7, 3 => 7, 4 => 7, 5 => 7, 6 => 7, 7 => 7, 8 => 7, 9 => 7, … 99990 more }",
	]);
	assertEquals(elapsed < 250, true, `took ${elapsed} ms`);
});

Deno.test("describeValue examines at most a hundred keys of an object", () => {
	// Given: a Proxy reporting 300k own keys, none of them enumerable, so each
	// examined key costs a trap call
	const keys = Array.from({ length: 300_000 }, (_, index) => `k${index}`);
	let examined = 0;
	const proxy = new Proxy(
		{},
		{
			ownKeys: () => keys,
			getOwnPropertyDescriptor: () => {
				examined++;
				return undefined;
			},
		},
	);

	// When: describing it
	const described = describeValue(proxy);

	// Then: a hundred keys were examined and the rest only counted
	assertEquals([described, examined], ["{ … 299900 more }", 100]);
});

Deno.test("describeValue shows holes in arrays", () => {
	// Given: a sparse array
	const sparse = new Array<number>(3);
	sparse[0] = 1;
	sparse[2] = 3;

	// When: describing it
	const described = describeValue(sparse);

	// Then: the hole is marked
	assertEquals(described, "[1, <empty>, 3]");
});
