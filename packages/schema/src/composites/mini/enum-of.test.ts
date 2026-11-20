import { unwrap, unwrapErr } from "@sekhmet/enum/result/mini";
import { definePanicRuntime } from "@sekhmet/panic";
import { resume } from "@sekhmet/panic/outcome/mini";
import { wait } from "@sekhmet/vow";
import { assertEquals } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import { InvalidValue } from "@/src/core/mini/issue.ts";
import { type Output, parse, parseSync } from "@/src/core/mini/schema.ts";
import { enumOf } from "./enum-of.ts";

const panics = definePanicRuntime();

Deno.test("enumOf accepts exactly its values", async (t) => {
	// Given: an enum of mixed literals
	const values = ["red", 1, 2n, true, null, undefined, Number.NaN] as const;
	const literal = enumOf(values);

	for (const value of values) {
		await t.step(`accepts ${String(value)}`, () => {
			// When: parsing one of its values
			// Then: it is accepted unchanged
			assertEquals(unwrap(parseSync(literal, value)), value);
		});
	}
});

Deno.test("enumOf rejects anything else with InvalidValue listing its values", async () => {
	// Given: an enum of colors
	const color = enumOf(["red", "green"]);

	// When: parsing another string and a look-alike
	const blue = unwrapErr(
		resume(await wait(parse(color, { input: "blue", panics }))),
	);
	const boxed = unwrapErr(
		resume(await wait(parse(color, { input: new String("red"), panics }))),
	);

	// Then: both fail with InvalidValue listing the allowed values
	assertEquals(
		blue,
		InvalidValue({ input: "blue", expected: ["red", "green"] }),
	);
	assertEquals(
		boxed,
		InvalidValue({ input: new String("red"), expected: ["red", "green"] }),
	);
});

Deno.test("enumOf infers the union of its values", () => {
	// Given: an enum of colors
	const color = enumOf(["red", "green"]);

	// When: reading its output type
	// Then: it is the union of the literals
	assertType<IsExact<Output<typeof color>, "red" | "green">>(true);
});
