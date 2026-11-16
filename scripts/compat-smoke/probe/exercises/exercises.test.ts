import { assertThrows } from "@std/assert";
import { expectEqual } from "@/probe/check.ts";
import { EXERCISES } from "@/probe/exercises/mod.ts";

Deno.test("every exercise passes against the workspace source", async (t) => {
	for (const [pkg, load] of Object.entries(EXERCISES)) {
		await t.step(pkg, async () => {
			// Given: the package's exercise, importing the workspace source
			const { exercise } = await load();

			// When: it runs
			// Then: it completes without a failed check
			await exercise();
		});
	}
});

Deno.test("expectEqual throws on a mismatch, naming the check", () => {
	// Given: two different values

	// When: they are compared
	// Then: the failure names the label and both values
	assertThrows(
		() => expectEqual({ label: "sum", actual: 3, expected: 4 }),
		Error,
		"sum: expected 4, got 3",
	);
});
