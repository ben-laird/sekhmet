import { unionKinds } from "@sekhmet/enum/core/mini/exit";
import { Err, Ok, unwrap, unwrapErr } from "@sekhmet/enum/result/mini";
import { assertEquals } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import type { SchemaIssue } from "@/src/core/mini/issue.ts";
import { entries, type Issues } from "@/src/core/mini/issues.ts";
import {
	type ErrorOf,
	type Input,
	type Output,
	parse,
	parseAsync,
	parseSync,
	Schema,
} from "@/src/core/mini/schema.ts";
import { array } from "./array.ts";
import { lazy, nullable, optional } from "./modifiers.ts";
import { object } from "./object.ts";

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
	assertEquals(unwrapErr(await parseAsync(maybe, 1)), "not text");
});

Deno.test("nullable passes null through and parses anything else", async () => {
	// Given: a nullable text schema
	const maybe = nullable(text);

	// When: parsing null, a string and undefined
	// Then: null and the string pass; undefined fails as text would
	assertEquals(unwrap(parseSync(maybe, null)), null);
	assertEquals(unwrap(parseSync(maybe, "a")), "a");
	assertEquals(unwrapErr(await parseAsync(maybe, undefined)), "not text");
});

Deno.test("optional and nullable keep the inner schema's timing", () => {
	// Given: optional and nullable async schemas
	const maybe = optional(laterText);
	const orNull = nullable(laterText);

	// When: parsing the empty value and a string
	// Then: the empty value is Sync; anything else runs the async schema
	assertEquals(unionKinds(parse(maybe, undefined)), "Sync");
	assertEquals(unionKinds(parse(maybe, "a")), "Async");
	assertEquals(unionKinds(parse(orNull, null)), "Sync");
	assertEquals(unionKinds(parse(orNull, "a")), "Async");
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
	const issues = unwrapErr(await parseAsync(tree, input));

	// Then: the issue's path runs through every level
	assertEquals(entries(issues), [
		{ path: ["children", 0, "children", 0, "label"], error: "not text" },
	]);
});

Deno.test("lazy keeps the deferred schema's types", () => {
	// Given: the recursive tree schema
	// When: reading its output type
	// Then: it is the recursive Tree
	assertType<IsExact<Output<typeof tree>, Tree>>(true);
});
