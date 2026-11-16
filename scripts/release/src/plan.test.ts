import { isErr, unwrap } from "@sekhmet/enum/result/mini";
import { assert, assertEquals } from "@std/assert";
import {
	changelogSection,
	gitHubReleases,
	parseReleaseResult,
	parseStatusPlan,
	releasedPackages,
	releaseSteps,
} from "./plan.ts";

// Real `dv` 0.11 output: a first release where @fx/b failed to publish, the
// `--force` recovery run after it, and `dv status` on this repo before its
// first release.
function fixture(name: string): string {
	return Deno.readTextFileSync(new URL(`./fixtures/${name}`, import.meta.url));
}
const PARTIAL_FAILURE = unwrap(
	parseReleaseResult(fixture("release-partial-failure.json")),
);
const FORCE_RECOVERY = unwrap(
	parseReleaseResult(fixture("release-force-recovery.json")),
);
const FIRST_RELEASE_STATUS = unwrap(
	parseStatusPlan(fixture("status-first-release.json")),
);

const ENUM = {
	package: "@sekhmet/enum",
	version: "0.1.0",
	tag: "@sekhmet/enum@0.1.0",
	releaseNotes: "",
};

Deno.test("releaseSteps releases untagged versions even without Records", () => {
	// Given: this repo's first release: no Records, every package untagged
	const status = FIRST_RELEASE_STATUS;

	// When: deciding the steps
	const steps = releaseSteps({ status, force: false });

	// Then: dv version is skipped and dv release runs
	assertEquals(status.pending, []);
	assertEquals(status.awaitingRelease.length, 6);
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

Deno.test("releasedPackages lists only packages this run uploaded", () => {
	// Given: a run where @fx/a published and @fx/b failed
	const result = PARTIAL_FAILURE;

	// When: listing what reached JSR
	const released = releasedPackages(result);

	// Then: only @fx/a, located through the tracked packages
	assertEquals(released, [
		{
			package: "@fx/a",
			tag: "@fx/a@0.1.0",
			version: "0.1.0",
			path: "packages/a",
		},
	]);
});

Deno.test("gitHubReleases uses dv's release notes on a normal run", () => {
	// Given: the partial failure run, whose plan carries @fx/a's notes
	const result = PARTIAL_FAILURE;

	// When: choosing Releases with no CHANGELOGs read
	const releases = gitHubReleases({ result, changelogs: new Map() });

	// Then: @fx/a gets one with its notes; the failed @fx/b gets none
	assertEquals(releases, [
		{ tag: "@fx/a@0.1.0", notes: "### Added\n\n- Add the first thing" },
	]);
});

Deno.test("gitHubReleases covers a forced recovery run, whose plan is empty", () => {
	// Given: the --force run: no awaiting entries, @fx/a skipped, @fx/b uploaded
	const result = FORCE_RECOVERY;
	assertEquals(result.plan.awaitingRelease, []);
	const changelogs = new Map([
		[
			"packages/b",
			"# Changelog\n\n## [0.1.0] - 2026-11-16\n\n### Fixed\n\n- b\n",
		],
	]);

	// When: choosing Releases
	const releases = gitHubReleases({ result, changelogs });

	// Then: @fx/b gets its Release, notes taken from its CHANGELOG
	assertEquals(releases, [{ tag: "@fx/b@0.1.0", notes: "### Fixed\n\n- b" }]);
});

Deno.test("gitHubReleases falls back when there is no changelog section", () => {
	// Given: the --force run with no CHANGELOG for @fx/b
	const result = FORCE_RECOVERY;

	// When: choosing Releases
	const releases = gitHubReleases({ result, changelogs: new Map() });

	// Then: the body is the fallback
	assertEquals(releases, [
		{ tag: "@fx/b@0.1.0", notes: "Release @fx/b@0.1.0." },
	]);
});

Deno.test("changelogSection slices one version's section out of a Keep a Changelog file", () => {
	// Given: a CHANGELOG with two releases
	const changelog = [
		"# Changelog",
		"",
		"## [0.2.0] - 2026-12-01",
		"",
		"### Added",
		"",
		"- two",
		"",
		"## [0.1.0] - 2026-11-16",
		"",
		"- one",
		"",
	].join("\n");

	// When / Then: each version's body comes back trimmed; unknown is undefined
	assertEquals(
		changelogSection({ changelog, version: "0.2.0" }),
		"### Added\n\n- two",
	);
	assertEquals(changelogSection({ changelog, version: "0.1.0" }), "- one");
	assertEquals(changelogSection({ changelog, version: "0.3.0" }), undefined);
	assertEquals(changelogSection({ changelog, version: "0.1" }), undefined);
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
