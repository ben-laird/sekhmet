import { assert, assertEquals } from "@std/assert";
import {
	type ConvertContext,
	conversionKey,
	convertedBody,
	convertReturn,
} from "./convert.ts";
import type { TypeNode } from "./doc.ts";

const ref = (name: string, args: TypeNode[] = []): TypeNode => ({
	kind: "ref",
	name,
	args,
	resolution: { kind: "local" },
});

const CONTEXT: ConvertContext = {
	render: (type) => (type.kind === "ref" ? `mini.${type.name}` : "?"),
	wrapTarget: (type) =>
		type.kind === "ref" && ["Option", "Result"].includes(type.name)
			? type.name
			: undefined,
	mappers: (target) => (target === "Result" ? ["map", "mapErr"] : ["map"]),
};

Deno.test("convertReturn leaves types without wrap targets alone", () => {
	// Given: a return type naming no wrap target
	const type = ref("Other");

	// When: planning it
	const planned = convertReturn({ type, context: CONTEXT });

	// Then: it keeps its mini spelling and needs no conversion
	assert(planned.ok);
	assertEquals(planned.value.text, "mini.Other");
	assertEquals(planned.value.conversion.kind, "none");
});

Deno.test("convertReturn maps wrap targets in each mapped type argument", () => {
	// Given: Result<Option<A>, Option<B>>
	const type = ref("Result", [
		ref("Option", [ref("A")]),
		ref("Option", [ref("B")]),
	]);

	// When: planning it and rendering its body
	const planned = convertReturn({ type, context: CONTEXT });
	assert(planned.ok);
	const body = convertedBody({
		call: "f()",
		conversion: planned.value.conversion,
		isVoid: false,
		indent: "",
	});

	// Then: both arguments convert through their own mapper
	assertEquals(planned.value.text, "Result<Option<mini.A>, Option<mini.B>>");
	assertEquals(
		body,
		"return Result.fromMini(f()).map((value0) => Option.fromMini(value0)).mapErr((value0) => Option.fromMini(value0));",
	);
});

Deno.test("convertReturn leaves tuples with optional elements unconverted", () => {
	// Given: a tuple whose second element is optional
	const type: TypeNode = {
		kind: "tuple",
		elements: [ref("Option"), { kind: "optional", type: ref("Option") }],
	};

	// When: planning it
	const planned = convertReturn({ type, context: CONTEXT });

	// Then: it isn't converted, since destructuring would change its length
	assert(planned.ok);
	assertEquals(planned.value.conversion.kind, "none");
});

Deno.test("conversionKey tells conversions apart", () => {
	// Given: two value conversions that wrap differently
	const a = {
		kind: "value",
		apply: (e: string) => `A.fromMini(${e})`,
	} as const;
	const b = {
		kind: "value",
		apply: (e: string) => `B.fromMini(${e})`,
	} as const;

	// When: keying them
	const keys = [
		conversionKey(a),
		conversionKey(b),
		conversionKey({ kind: "none" }),
	];

	// Then: every key differs
	assertEquals(new Set(keys).size, 3);
});
