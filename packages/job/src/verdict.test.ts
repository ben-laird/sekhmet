import { assertEquals } from "@std/assert";
import {
	Blocked,
	Cancelled,
	Failed,
	Skipped,
	Succeeded,
} from "@/src/end/main/mod.ts";
import { passed } from "@/src/verdict.ts";

Deno.test("passed: every job is passing, or failed with continueOnError", () => {
	// Given: outcomes of each kind
	const ok = { outcome: Succeeded(1), continueOnError: false };
	const skipped = { outcome: Skipped(), continueOnError: false };
	const optional = { outcome: Failed("flaky"), continueOnError: true };
	const failed = { outcome: Failed("boom"), continueOnError: false };
	const blocked = { outcome: Blocked(["x"]), continueOnError: true };
	const cancelled = { outcome: Cancelled(), continueOnError: true };

	// When: each set is judged
	// Then: only passing outcomes and optional failures keep it passing
	assertEquals(passed([]), true);
	assertEquals(passed([ok, skipped, optional]), true);
	assertEquals(passed([ok, failed]), false);
	assertEquals(passed([blocked]), false);
	assertEquals(passed([cancelled]), false);
});
