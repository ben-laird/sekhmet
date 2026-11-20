import { assertEquals } from "@std/assert";
import { always, cancelled, failure, success } from "@/src/condition.ts";
import {
	Blocked,
	Cancelled,
	Failed,
	Skipped,
	Succeeded,
} from "@/src/end/main/mod.ts";

const FINE = { build: Succeeded("dist") };
const BROKEN = { build: Failed(new Error("boom")), test: Blocked(["build"]) };

Deno.test("success() holds when all needs succeeded and the run goes on", () => {
	// Given: successful, skipped and cancelled needs
	// When: success() is tested
	// Then: only all-succeeded needs in a live run pass
	assertEquals(success().test({ cancelled: false, outcomes: FINE }), true);
	assertEquals(success().test({ cancelled: false, outcomes: {} }), true);
	assertEquals(success().test({ cancelled: true, outcomes: FINE }), false);
	assertEquals(
		success().test({ cancelled: false, outcomes: { s: Skipped() } }),
		false,
	);
});

Deno.test("failure() holds when some need is unhealthy", () => {
	// Given: unhealthy, cancelled and fine needs
	// When: failure() is tested
	// Then: only an unhealthy need passes; a cancel alone doesn't
	assertEquals(failure().test({ cancelled: false, outcomes: BROKEN }), true);
	assertEquals(failure().test({ cancelled: true, outcomes: FINE }), false);
	assertEquals(
		failure().test({ cancelled: true, outcomes: { c: Cancelled() } }),
		false,
	);
});

Deno.test("cancelled() and always() read only the cancel flag", () => {
	// Given: a live run and a cancelled one
	// When: each condition is tested
	// Then: cancelled() follows the flag; always() always holds
	assertEquals(cancelled().test({ cancelled: true, outcomes: FINE }), true);
	assertEquals(cancelled().test({ cancelled: false, outcomes: BROKEN }), false);
	assertEquals(always().test({ cancelled: true, outcomes: BROKEN }), true);
});

Deno.test("each condition describes itself for a dry run", () => {
	// Given: every built-in
	// When: their descriptions are read
	// Then: each names itself, and only success() is of kind success
	assertEquals(
		[success(), failure(), cancelled(), always()].map((c) => [
			c.describe,
			c.kind,
		]),
		[
			["success()", "success"],
			["failure()", "any"],
			["cancelled()", "any"],
			["always()", "any"],
		],
	);
});
