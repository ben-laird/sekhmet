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
	views: (target) => target === "Option",
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
		"return Result.fromMini(f()).map(($value0) => { return Option.fromMini($value0); }).mapErr(($value0) => { return Option.fromMini($value0); });",
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
		named: false,
		target: "A",
	} as const;
	const b = {
		kind: "value",
		apply: (e: string) => `B.fromMini(${e})`,
		named: false,
		target: "B",
	} as const;

	// When: keying them, and a conversion like a that binds its value first
	const keys = [
		conversionKey(a),
		conversionKey(b),
		conversionKey({ kind: "none" }),
		conversionKey({ ...a, named: true }),
	];

	// Then: every key differs
	assertEquals(new Set(keys).size, 4);
});

const promise = (inner: TypeNode): TypeNode => ({
	kind: "ref",
	name: "Promise",
	args: [inner],
	resolution: { kind: "global" },
});

const fn = (
	returnType: TypeNode,
	typeParams: { name: string }[] = [],
): TypeNode => ({
	kind: "function",
	constructor: false,
	typeParams: typeParams.map(({ name }) => ({
		name,
		constraint: undefined,
		default: undefined,
	})),
	params: [{ kind: "rest", name: "args", type: ref("A") }],
	returnType,
});

/** CONTEXT, also rendering function and global types. */
const FUNCTION_CONTEXT: ConvertContext = {
	...CONTEXT,
	render: (type) => {
		if (type.kind === "function") {
			return `(...args: mini.A) => ${FUNCTION_CONTEXT.render(type.returnType)}`;
		}
		if (type.kind === "ref" && type.resolution.kind === "global") {
			const args = type.args.map(FUNCTION_CONTEXT.render);

			return args.length === 0 ? type.name : `${type.name}<${args.join(", ")}>`;
		}

		return CONTEXT.render(type);
	},
};

const bodyOf = (type: TypeNode): { text: string; body: string } => {
	const planned = convertReturn({ type, context: FUNCTION_CONTEXT });
	assert(planned.ok);

	return {
		text: planned.value.text,
		body: convertedBody({
			call: "f()",
			conversion: planned.value.conversion,
			isVoid: false,
			indent: "",
		}),
	};
};

Deno.test("convertReturn converts a promise's fulfilled value", () => {
	// Given: Promise<Result<A, E>>
	const type = promise(ref("Result", [ref("A"), ref("E")]));

	// When: planning it and rendering its body
	const { text, body } = bodyOf(type);

	// Then: the result converts once the promise fulfills
	assertEquals(text, "Promise<Result<mini.A, mini.E>>");
	assertEquals(
		body,
		"return f().then(($value0) => { return Result.fromMini($value0); });",
	);
});

Deno.test("convertReturn converts what a returned function returns", () => {
	// Given: (...args: A) => Result<A, E>
	const type = fn(ref("Result", [ref("A"), ref("E")]));

	// When: planning it and rendering its body
	const { text, body } = bodyOf(type);

	// Then: the mini call runs once, and each call of its function converts
	assertEquals(text, "(...args: mini.A) => Result<mini.A, mini.E>");
	assertEquals(
		body,
		"const $converted = f();\nreturn (...$args0) => { return Result.fromMini($converted(...$args0)); };",
	);
});

Deno.test("convertReturn converts a returned function's promise", () => {
	// Given: (...args: A) => Promise<Option<A>>
	const type = fn(promise(ref("Option", [ref("A")])));

	// When: planning it and rendering its body
	const { text, body } = bodyOf(type);

	// Then: each call's promise converts its value when it fulfills
	assertEquals(text, "(...args: mini.A) => Promise<Option<mini.A>>");
	assertEquals(
		body,
		"const $converted = f();\nreturn (...$args0) => { return $converted(...$args0).then(($value1) => { return Option.fromMini($value1); }); };",
	);
});

Deno.test("convertReturn converts functions and promises nested in a wrap target", () => {
	// Given: Result<() => Option<A>, Promise<Option<E>>>
	const type = ref("Result", [
		fn(ref("Option", [ref("A")])),
		promise(ref("Option", [ref("E")])),
	]);

	// When: planning it and rendering its body
	const { body } = bodyOf(type);

	// Then: each mapper converts its argument, reading the mapped value by name
	assertEquals(
		body,
		"return Result.fromMini(f()).map(($value0) => { return (...$args1) => { return Option.fromMini($value0(...$args1)); }; }).mapErr(($value0) => { return $value0.then(($value1) => { return Option.fromMini($value1); }); });",
	);
});

Deno.test("convertReturn leaves promises and functions of other types alone", () => {
	// Given: a promise and a function naming no wrap target
	const types = [promise(ref("Other")), fn(ref("Other"))];

	// When: planning each
	const kinds = types.map((type) => {
		const planned = convertReturn({ type, context: FUNCTION_CONTEXT });
		assert(planned.ok);
		return planned.value.conversion.kind;
	});

	// Then: neither needs a conversion
	assertEquals(kinds, ["none", "none"]);
});

Deno.test("convertReturn calls each level of a curried function once", () => {
	// Given: (...args: A) => (...args: A) => Result<A, E>
	const type = fn(fn(ref("Result", [ref("A"), ref("E")])));

	// When: planning it and rendering its body
	const { body } = bodyOf(type);

	// Then: each call binds its returned function before wrapping it, so the
	// outer call runs once per outer call, not once per inner call
	assertEquals(
		body,
		"const $converted = f();\nreturn (...$args0) => { const $converted0 = $converted(...$args0); return (...$args1) => { return Result.fromMini($converted0(...$args1)); }; };",
	);
});

Deno.test("convertReturn's curried wrapper runs each call once", () => {
	// Given: a curried mini function counting its outer and inner calls
	const calls = { outer: 0, inner: 0 };
	const curried = () => {
		calls.outer += 1;
		return () => {
			calls.inner += 1;
			return calls.inner;
		};
	};
	const { body } = bodyOf(fn(fn(ref("Result", [ref("A")]))));
	const Result = { fromMini: (value: number) => value };
	const wrap = new Function("f", "Result", body);

	// When: the wrapper's outer function is called once and its result twice
	const outer = wrap(() => curried, Result);
	const inner = outer();
	const results = [inner(), inner()];

	// Then: the outer mini call ran once, and each inner call ran once
	assertEquals(calls, { outer: 1, inner: 2 });
	assertEquals(results, [1, 2]);
});

Deno.test("convertReturn leaves generic function types alone", () => {
	// Given: <T>(...args: A) => Option<A>, whose wrapper couldn't stay generic
	const type = fn(ref("Option", [ref("A")]), [{ name: "T" }]);

	// When: planning it
	const planned = convertReturn({ type, context: FUNCTION_CONTEXT });

	// Then: it keeps its mini type
	assert(planned.ok);
	assertEquals(planned.value.conversion.kind, "none");
});

Deno.test("convertReturn converts an intersection's one wrap target through fromMiniView", () => {
	// Given: Option<A> & View<B>, Option's main class having fromMiniView
	const type: TypeNode = {
		kind: "intersection",
		types: [ref("Option", [ref("A")]), ref("View", [ref("B")])],
	};

	// When: planning it and rendering its body
	const planned = convertReturn({ type, context: CONTEXT });
	assert(planned.ok);
	const body = convertedBody({
		call: "f()",
		conversion: planned.value.conversion,
		isVoid: false,
		indent: "",
	});

	// Then: the target is spelled main, the view as it is, and the value
	// keeps its view's own properties
	assertEquals(planned.value.text, "Option<mini.A> & mini.View");
	assertEquals(body, "return Option.fromMiniView(f());");
});

Deno.test("convertReturn leaves an intersection without a wrap target alone", () => {
	// Given: A & B
	const type: TypeNode = { kind: "intersection", types: [ref("A"), ref("B")] };

	// When: planning it
	const planned = convertReturn({ type, context: CONTEXT });

	// Then: it needs no conversion
	assert(planned.ok);
	assertEquals(planned.value.text, "mini.A & mini.B");
	assertEquals(planned.value.conversion.kind, "none");
});

Deno.test("convertReturn rejects intersections it can't convert", async (t) => {
	const cases: { name: string; types: TypeNode[]; message: string }[] = [
		{
			name: "two wrap targets",
			types: [ref("Option"), ref("Result")],
			message:
				"an intersection may name one wrap target, the class its view is on",
		},
		{
			name: "a target without fromMiniView",
			types: [ref("Result", [ref("A"), ref("B")]), ref("View")],
			message:
				"Result & … needs Result.fromMiniView; set `views` on Result's feature or wrap target",
		},
		{
			name: "a target whose type arguments convert",
			types: [ref("Option", [ref("Option")]), ref("View")],
			message:
				"Option's type arguments name a main class, which an intersection with its view can't convert",
		},
	];

	for (const { name, types, message } of cases) {
		await t.step(name, () => {
			// Given: the intersection
			const type: TypeNode = { kind: "intersection", types };

			// When: planning it
			const planned = convertReturn({ type, context: CONTEXT });

			// Then: it fails, saying why
			assert(!planned.ok);
			assertEquals(planned.error, message);
		});
	}
});
