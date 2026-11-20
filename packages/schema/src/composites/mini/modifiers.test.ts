import { unionKinds } from "@sekhmet/enum/core/mini/exit";
import { Some } from "@sekhmet/enum/option/mini";
import { Err, Ok, unwrap, unwrapErr } from "@sekhmet/enum/result/mini";
import { definePanicRuntime } from "@sekhmet/panic";
import { Panicked, resume } from "@sekhmet/panic/outcome/mini";
import { value, wait } from "@sekhmet/vow";
import { assertEquals, assertStrictEquals } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import type { SchemaIssue } from "@/src/core/mini/issue.ts";
import { entries, type Issues } from "@/src/core/mini/issues.ts";
import {
	type ErrorOf,
	type Input,
	type Output,
	parse,
	parseSync,
	Schema,
} from "@/src/core/mini/schema.ts";
import { array } from "./array.ts";
import { lazy, nullable, optional } from "./modifiers.ts";
import { object } from "./object.ts";

const panics = definePanicRuntime();

const text: Schema<unknown, string, "not text"> = new Schema({
	parse: (input) => {
		return typeof input === "string" ? Ok(input) : Err("not text");
	},
});
const laterText: Schema<unknown, string, "not text"> = new Schema({
	parse: (input) => {
		return Promise.resolve(
			typeof input === "string" ? Ok(input) : Err("not text"),
		);
	},
});

Deno.test("optional passes undefined through and parses anything else", async () => {
	// Given: an optional text schema
	const maybe = optional(text);

	// When: parsing undefined, a string and a number
	// Then: undefined and the string pass; the number fails as text would
	assertEquals(unwrap(parseSync(maybe, undefined)), undefined);
	assertEquals(unwrap(parseSync(maybe, "a")), "a");
	assertEquals(
		unwrapErr(resume(await wait(parse(maybe, { input: 1, panics })))),
		"not text",
	);
});

Deno.test("nullable passes null through and parses anything else", async () => {
	// Given: a nullable text schema
	const maybe = nullable(text);

	// When: parsing null, a string and undefined
	// Then: null and the string pass; undefined fails as text would
	assertEquals(unwrap(parseSync(maybe, null)), null);
	assertEquals(unwrap(parseSync(maybe, "a")), "a");
	assertEquals(
		unwrapErr(resume(await wait(parse(maybe, { input: undefined, panics })))),
		"not text",
	);
});

Deno.test("optional and nullable keep the inner schema's timing", () => {
	// Given: optional and nullable async schemas
	const maybe = optional(laterText);
	const orNull = nullable(laterText);

	// When: parsing the empty value and a string
	// Then: the empty value is resolved; anything else runs the async schema
	assertEquals(
		unionKinds(parse(maybe, { input: undefined, panics })),
		"Resolved",
	);
	assertEquals(unionKinds(parse(maybe, { input: "a", panics })), "Pending");
	assertEquals(unionKinds(parse(orNull, { input: null, panics })), "Resolved");
	assertEquals(unionKinds(parse(orNull, { input: "a", panics })), "Pending");
});

Deno.test("optional and nullable widen the input and output types", () => {
	// Given: optional and nullable text schemas
	const maybe = optional(
		new Schema({ parse: (input: string) => Ok(input.length) }),
	);
	const orNull = nullable(text);

	// When: reading their types
	// Then: undefined or null joins the input and output, the error is kept
	assertType<IsExact<Input<typeof maybe>, string | undefined>>(true);
	assertType<IsExact<Output<typeof maybe>, number | undefined>>(true);
	assertType<IsExact<Output<typeof orNull>, string | null>>(true);
	assertType<IsExact<ErrorOf<typeof orNull>, "not text">>(true);
});

interface Tree {
	label: string;
	children: Tree[];
}

const tree: Schema<unknown, Tree, Issues<"not text" | SchemaIssue>> = object({
	shape: {
		label: text,
		children: array({ item: lazy(() => tree) }),
	},
});

Deno.test("lazy builds recursive schemas such as trees", () => {
	// Given: a recursive tree schema
	const input = {
		label: "root",
		children: [{ label: "leaf", children: [] }],
	};

	// When: parsing a two-level tree
	const parsed = unwrap(parseSync(tree, input));

	// Then: the whole tree is parsed
	assertEquals(parsed, input);
});

Deno.test("lazy locates issues deep in a recursive schema", async () => {
	// Given: a recursive tree schema
	const input = {
		label: "root",
		children: [{ label: "leaf", children: [{ label: 3, children: [] }] }],
	};

	// When: parsing a tree with a bad label two levels down
	const issues = unwrapErr(resume(await wait(parse(tree, { input, panics }))));

	// Then: the issue's path runs through every level
	assertEquals(entries(issues), [
		{ path: ["children", 0, "children", 0, "label"], error: "not text" },
	]);
});

Deno.test("lazy panics the parse when its getter throws", () => {
	// Given: a lazy schema whose getter throws, under a recording runtime
	const recording = definePanicRuntime();
	const reported: unknown[] = [];
	recording.setHook(({ payload }) => reported.push(payload));
	const bug = new Error("bug");
	const broken = lazy((): Schema<unknown, string, "not text"> => {
		throw bug;
	});

	// When: parsing it inside an object
	const parsing = parse(object({ shape: { name: broken } }), {
		input: { name: "Ada" },
		panics: recording,
	});

	// Then: the parse settles synchronously as the getter's panic
	assertEquals(value(parsing), Some(Panicked(bug)));
	assertEquals(reported, [bug]);
});

Deno.test("lazy keeps the deferred schema's types", () => {
	// Given: the recursive tree schema
	// When: reading its output type
	// Then: it is the recursive Tree
	assertType<IsExact<Output<typeof tree>, Tree>>(true);
});

Deno.test("optional, nullable and lazy view the schema they wrap, exactly as passed", () => {
	// Given: a mini schema with a view, to wrap
	const named = object({ shape: { name: text } });

	// When: wrapping it each way
	const maybe = optional(named);
	const orNull = nullable(maybe);
	const later = lazy(() => named);

	// Then: each view is the schema passed, typed with its own view, and
	// the mini child stays mini
	assertStrictEquals(maybe.inner, named);
	assertStrictEquals(orNull.inner.inner.shape.name, text);
	assertStrictEquals(later.getter(), named);
	assertType<IsExact<typeof maybe.inner, typeof named>>(true);
	assertType<IsExact<typeof orNull.inner, typeof maybe>>(true);
	assertType<IsExact<ReturnType<typeof later.getter>, typeof named>>(true);
	assertEquals(Object.getPrototypeOf(maybe.inner), Schema.prototype);
	assertType<
		IsExact<Output<typeof orNull>, { name: string } | undefined | null>
	>(true);
});
