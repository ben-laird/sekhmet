import { isErr, unwrap } from "@sekhmet/enum/result/mini";
import { assert, assertEquals } from "@std/assert";
import {
	gitHubReleases,
	parseReleaseResult,
	parseStatusPlan,
	type ReleaseResult,
	releaseSteps,
} from "./plan.ts";

const ENUM = {
	package: "@sekhmet/enum",
	version: "0.1.0",
	tag: "@sekhmet/enum@0.1.0",
	releaseNotes: "",
};
const VOW = {
	package: "@sekhmet/vow",
	version: "0.2.0",
	tag: "@sekhmet/vow@0.2.0",
	releaseNotes: "### Added\n\n- map\n",
};

Deno.test("releaseSteps releases untagged versions even without Records", () => {
	// Given: the first release, with no Records and every package untagged
	const status = { pending: [], awaitingRelease: [ENUM] };

	// When: deciding the steps
	const steps = releaseSteps({ status, force: false });

	// Then: dv version is skipped and dv release runs
	assertEquals(steps, { version: false, release: true });
});

Deno.test("releaseSteps versions and releases when Records are pending", () => {
	// Given: pending Records on a fully tagged repo
	const status = {
		pending: [{ package: "@sekhmet/vow" }],
		awaitingRelease: [],
	};

	// When: deciding the steps
	const steps = releaseSteps({ status, force: false });

	// Then: both steps run
	assertEquals(steps, { version: true, release: true });
});

Deno.test("releaseSteps is a no-op on a quiet main unless forced", () => {
	// Given: nothing pending and everything tagged
	const status = { pending: [], awaitingRelease: [] };

	// When / Then: only a forced recovery releases
	assertEquals(releaseSteps({ status, force: false }), {
		version: false,
		release: false,
	});
	assertEquals(releaseSteps({ status, force: true }), {
		version: false,
		release: true,
	});
});

Deno.test("gitHubReleases covers minted or uploaded packages that succeeded", () => {
	// Given: enum minted and published, vow minted but failed
	const result: ReleaseResult = {
		plan: { awaitingRelease: [ENUM, VOW] },
		mintedTagNames: [ENUM.tag, VOW.tag],
		releaseOpOutcomes: [
			{ package: ENUM.package, tag: ENUM.tag, ok: true, published: true },
			{ package: VOW.package, tag: VOW.tag, ok: false },
		],
	};

	// When: choosing Releases
	const releases = gitHubReleases(result);

	// Then: only enum gets one, with fallback notes
	assertEquals(releases, [{ tag: ENUM.tag, notes: `Release ${ENUM.tag}.` }]);
});

Deno.test("gitHubReleases covers a forced retry that finally uploads", () => {
	// Given: a --force run that reused vow's tag and uploaded it, and skipped enum
	const result: ReleaseResult = {
		plan: { awaitingRelease: [ENUM, VOW] },
		mintedTagNames: [],
		releaseOpOutcomes: [
			{ package: ENUM.package, tag: ENUM.tag, ok: true, published: false },
			{ package: VOW.package, tag: VOW.tag, ok: true, published: true },
		],
	};

	// When: choosing Releases
	const releases = gitHubReleases(result);

	// Then: vow gets its Release with the CHANGELOG notes
	assertEquals(releases, [{ tag: VOW.tag, notes: VOW.releaseNotes }]);
});

Deno.test("parseStatusPlan reads dv 0.11 status output", () => {
	// Given: a dv 0.11 status envelope with extra fields
	const text = JSON.stringify({
		schema: "urn:dv:schema:v1:plan",
		command: "status",
		pending: [],
		awaitingRelease: [{ ...ENUM, firstStable: false }],
		tracked: [],
	});

	// When: parsing it
	const plan = parseStatusPlan(text);

	// Then: the slice the driver needs is extracted
	const { pending, awaitingRelease } = unwrap(plan);
	assertEquals(
		{ pending, awaitingRelease },
		{ pending: [], awaitingRelease: [ENUM] },
	);
});

Deno.test("parseReleaseResult rejects another contract and non-JSON", () => {
	// Given: a status envelope and garbage, neither a release result
	const wrongSchema = JSON.stringify({ schema: "urn:dv:schema:v1:plan" });

	// When / Then: both are errors, not throws
	assert(isErr(parseReleaseResult(wrongSchema)));
	assert(isErr(parseReleaseResult("not json")));
});
