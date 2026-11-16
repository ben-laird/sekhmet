import { assertEquals, assertStringIncludes } from "@std/assert";
import { releaseResponse } from "./publish.ts";

const RUN = { name: "@sekhmet/enum", version: "0.1.0" };

Deno.test("releaseResponse reports a successful upload", () => {
	// Given: a publish that exited 0 and uploaded
	const run = { ...RUN, exitCode: 0, output: "Successfully published" };

	// When: building the response
	const response = releaseResponse(run);

	// Then: it is published, not skipped
	assertEquals(response, {
		ok: true,
		published: true,
		skipped: false,
		message: "published @sekhmet/enum@0.1.0 to JSR",
	});
});

Deno.test("releaseResponse reports an already-published version as skipped", () => {
	// Given: a recovery re-run where JSR already has the version
	const run = {
		...RUN,
		exitCode: 0,
		output: "Warning: Skipping, already published @sekhmet/enum@0.1.0",
	};

	// When: building the response
	const response = releaseResponse(run);

	// Then: it is ok and skipped
	assertEquals(response.ok, true);
	assertEquals(response.skipped, true);
	assertEquals(response.published, false);
});

Deno.test("releaseResponse turns a failed publish into data, not a crash", () => {
	// Given: a publish that failed
	const run = { ...RUN, exitCode: 1, output: "error: missing permissions\n" };

	// When: building the response
	const response = releaseResponse(run);

	// Then: ok is false and the message carries the cause
	assertEquals(response.ok, false);
	assertStringIncludes(response.message, "exit 1");
	assertStringIncludes(response.message, "missing permissions");
});
