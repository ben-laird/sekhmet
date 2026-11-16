import { Err, Ok } from "@sekhmet/enum/result/mini";
import { assertEquals } from "@std/assert";
import { parseRuntime, RUNTIMES } from "./runtime.ts";

Deno.test("parseRuntime() accepts exactly one known runtime", async (t) => {
	await t.step("every listed runtime parses to itself", () => {
		// Given/When/Then: each runtime name round-trips
		for (const runtime of RUNTIMES) {
			assertEquals(parseRuntime([runtime]), Ok(runtime));
		}
	});

	await t.step("a missing, unknown or extra argument is an error", () => {
		// Given/When/Then: each malformed argument list says what is wrong
		assertEquals(parseRuntime([]), Err("missing <runtime>"));
		assertEquals(parseRuntime(["deno"]), Err("unknown runtime 'deno'"));
		assertEquals(
			parseRuntime(["node", "--watch"]),
			Err("unexpected arguments: --watch"),
		);
	});
});
