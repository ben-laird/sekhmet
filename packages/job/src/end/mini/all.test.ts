import { assertEquals } from "@std/assert";
import { all } from "./all.ts";
import { Blocked, Cancelled, Failed, Skipped, Succeeded } from "./core.ts";

Deno.test("all: every success gives the values, keyed the same", () => {
	// Given: two successes
	const outcomes = {
		version: Succeeded("1.2.0"),
		build: Succeeded({ outDir: "dist" }),
	};

	// When: they're combined
	const combined = all(outcomes);

	// Then: one success holding both
	assertEquals(
		combined,
		Succeeded({ version: "1.2.0", build: { outDir: "dist" } }),
	);
});

Deno.test("all: an empty record succeeds, as Promise.all([]) does", () => {
	// Given: no outcomes
	// When: they're combined
	// Then: an empty success
	assertEquals(all({}), Succeeded({}));
});

Deno.test("all: unhealthy beats cancelled beats skipped", () => {
	// Given: a mix of every non-success
	const outcomes = {
		lint: Failed(new Error("lint")),
		skipped: Skipped(),
		cancelled: Cancelled(),
		test: Blocked(["lint"]),
	};

	// When: they're combined
	// Then: Blocked, naming the unhealthy keys in order
	assertEquals(all(outcomes), Blocked(["lint", "test"]));

	// Then: without the unhealthy ones, cancelled wins; without it, skipped
	assertEquals(all({ s: Skipped(), c: Cancelled() }), Cancelled());
	assertEquals(all({ ok: Succeeded(1), s: Skipped() }), Skipped());
});
