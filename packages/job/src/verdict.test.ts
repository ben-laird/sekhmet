import { Blocked, Cancelled, Failed, Skipped, Succeeded } from "@sekhmet/job";
import { assertEquals } from "@std/assert";
import { decideFromNeeds, passed } from "@/src/verdict.ts";

Deno.test("decideFromNeeds: what a job's needs force before it runs", async (t) => {
	await t.step("no needs, or all succeeded: the body may run", () => {
		// Given / When / Then: nothing is forced
		assertEquals(decideFromNeeds([]), undefined);
		assertEquals(
			decideFromNeeds([{ name: "a", outcome: Succeeded(1) }]),
			undefined,
		);
	});

	await t.step("a failed or blocked need blocks, named in order, once", () => {
		// Given: two unhealthy needs, one declared twice, and a success
		const needs = [
			{ name: "b", outcome: Blocked(["x"]) },
			{ name: "ok", outcome: Succeeded(1) },
			{ name: "a", outcome: Failed(new Error("boom")) },
			{ name: "b", outcome: Blocked(["x"]) },
		];

		// When: deciding
		const forced = decideFromNeeds(needs);

		// Then: Blocked by b then a
		assertEquals(forced, Blocked(["b", "a"]));
	});

	await t.step("Blocked outranks Cancelled, which outranks Skipped", () => {
		// Given / When / Then: precedence between mixed needs
		assertEquals(
			decideFromNeeds([
				{ name: "c", outcome: Cancelled() },
				{ name: "f", outcome: Failed(0) },
			]),
			Blocked(["f"]),
		);
		assertEquals(
			decideFromNeeds([
				{ name: "s", outcome: Skipped() },
				{ name: "c", outcome: Cancelled() },
			]),
			Cancelled(),
		);
		assertEquals(
			decideFromNeeds([{ name: "s", outcome: Skipped() }]),
			Skipped(),
		);
	});
});

Deno.test("passed: the run's verdict", () => {
	// Given: outcomes with and without continueOnError
	const ok = { outcome: Succeeded(1), continueOnError: false };
	const failed = { outcome: Failed(0), continueOnError: false };
	const tolerated = { outcome: Failed(0), continueOnError: true };
	const blocked = { outcome: Blocked(["x"]), continueOnError: false };
	const cancelled = { outcome: Cancelled(), continueOnError: true };
	const skipped = { outcome: Skipped(), continueOnError: false };

	// When / Then: only an untolerated failure or a cancellation fails the run
	assertEquals(passed([ok, skipped, tolerated, blocked]), true);
	assertEquals(passed([ok, failed]), false);
	assertEquals(passed([ok, cancelled]), false);
});
