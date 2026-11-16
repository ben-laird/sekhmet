import { Err, Ok, type Result } from "@sekhmet/enum/result/mini";
import { z } from "zod";

/**
 * A package whose current version has no git tag yet, as `dv` reports it.
 */
export interface AwaitingRelease {
	/** Package name, e.g. `@sekhmet/enum`. */
	package: string;
	/** The version to release. */
	version: string;
	/** The tag `dv release` mints for it. */
	tag: string;
	/** The package's CHANGELOG section for this version (may be empty). */
	releaseNotes: string;
}

/**
 * The slice of `dv status --json` (dv 0.11, `urn:dv:schema:v1:plan`) the
 * release driver reads.
 */
export interface StatusPlan {
	/** Packages with pending Records, i.e. what `dv version` will bump. */
	pending: { package: string }[];
	/** Packages whose current version is untagged. */
	awaitingRelease: AwaitingRelease[];
}

/**
 * One package's `release` op outcome.
 */
export interface ReleaseOutcome {
	/** Package name. */
	package: string;
	/** The tag released. */
	tag: string;
	/** Whether the package is on JSR at that version. */
	ok: boolean;
	/** True when this run uploaded it. */
	published?: boolean | undefined;
}

/**
 * A package dv tracks, with the version its manifest holds.
 */
export interface TrackedPackage {
	/** Package name. */
	package: string;
	/** The manifest's current version (the one just released). */
	currentVersion: string;
	/** Package directory, relative to the repo root. */
	path: string;
}

/**
 * The slice of `dv release --json` (dv 0.11,
 * `urn:dv:schema:v1:release-result`) the release driver reads.
 */
export interface ReleaseResult {
	/**
	 * The executed plan. `awaitingRelease` is computed from tags, so a
	 * `--force` run, whose tags all exist, has none.
	 */
	plan: { awaitingRelease: AwaitingRelease[]; tracked: TrackedPackage[] };
	/** Tags this run created. */
	mintedTagNames: string[];
	/** Per-package publish outcomes, in publish order. */
	releaseOpOutcomes: ReleaseOutcome[];
}

const awaitingReleaseSchema = z.object({
	package: z.string(),
	version: z.string(),
	tag: z.string(),
	releaseNotes: z.string(),
});

const statusPlanSchema: z.ZodType<StatusPlan> = z.object({
	schema: z.literal("urn:dv:schema:v1:plan"),
	pending: z.array(z.object({ package: z.string() })),
	awaitingRelease: z.array(awaitingReleaseSchema),
});

const releaseResultSchema: z.ZodType<ReleaseResult> = z.object({
	schema: z.literal("urn:dv:schema:v1:release-result"),
	plan: z.object({
		awaitingRelease: z.array(awaitingReleaseSchema),
		tracked: z.array(
			z.object({
				package: z.string(),
				currentVersion: z.string(),
				path: z.string(),
			}),
		),
	}),
	mintedTagNames: z.array(z.string()),
	releaseOpOutcomes: z.array(
		z.object({
			package: z.string(),
			tag: z.string(),
			ok: z.boolean(),
			published: z.boolean().optional(),
		}),
	),
});

function parseJson<T>({
	text,
	schema,
}: {
	text: string;
	schema: z.ZodType<T>;
}): Result<T, string> {
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch (caught: unknown) {
		return Err(caught instanceof Error ? caught.message : String(caught));
	}
	const parsed = schema.safeParse(value);
	return parsed.success ? Ok(parsed.data) : Err(z.prettifyError(parsed.error));
}

/**
 * Parses `dv status --json` output.
 *
 * @param text The command's stdout.
 * @returns The plan, or why it did not match dv 0.11's contract.
 */
export function parseStatusPlan(text: string): Result<StatusPlan, string> {
	return parseJson({ text, schema: statusPlanSchema });
}

/**
 * Parses `dv release --json` output.
 *
 * @param text The command's stdout.
 * @returns The result, or why it did not match dv 0.11's contract.
 */
export function parseReleaseResult(
	text: string,
): Result<ReleaseResult, string> {
	return parseJson({ text, schema: releaseResultSchema });
}

/**
 * Which `dv` commands a release run needs.
 */
export interface ReleaseSteps {
	/** Run `dv version` (and push the bump) because Records are pending. */
	version: boolean;
	/** Run `dv release` because something is, or will be, untagged. */
	release: boolean;
}

/**
 * Decides the release run from the pending plan.
 *
 * `dv release` is needed whenever a version is untagged, not only after a
 * bump: the first publish cuts every package's existing manifest version
 * with no Record at all, and a run that bumped but failed before tagging is
 * finished by the next one.
 *
 * @param args.status The plan captured before anything ran.
 * @param args.force Whether recovery was requested (`dv release --force`).
 * @returns The steps to run.
 */
export function releaseSteps({
	status,
	force,
}: {
	status: StatusPlan;
	force: boolean;
}): ReleaseSteps {
	const version = status.pending.length > 0;
	return {
		version,
		release: version || status.awaitingRelease.length > 0 || force,
	};
}

/**
 * A GitHub Release to create.
 */
export interface GitHubRelease {
	/** The tag (also the release title). */
	tag: string;
	/** The release body. */
	notes: string;
}

/**
 * A package a `dv release` run uploaded to JSR.
 */
export interface ReleasedPackage {
	/** Package name. */
	package: string;
	/** The released tag. */
	tag: string;
	/** The released version. */
	version: string;
	/** Package directory, relative to the repo root. */
	path: string;
}

/**
 * Lists the packages a run uploaded: release-op outcomes with
 * `published: true`. Outcomes, not `plan.awaitingRelease`, are the source:
 * the plan comes from tags, which dv pushes even when a publish fails, so a
 * `--force` recovery run has an empty plan.
 *
 * @param result The `dv release --json` result.
 * @returns The uploaded packages, in publish order.
 */
export function releasedPackages(result: ReleaseResult): ReleasedPackage[] {
	const tracked = new Map(
		result.plan.tracked.map((entry) => [entry.package, entry]),
	);
	return result.releaseOpOutcomes.flatMap((outcome) => {
		const entry = tracked.get(outcome.package);
		if (!outcome.ok || outcome.published !== true || entry === undefined) {
			return [];
		}
		return [
			{
				package: outcome.package,
				tag: outcome.tag,
				version: entry.currentVersion,
				path: entry.path,
			},
		];
	});
}

/**
 * Slices one version's body out of a Keep a Changelog file: the lines under
 * `## [<version>]` up to the next `## ` heading.
 *
 * @param args.changelog The CHANGELOG text.
 * @param args.version The version whose section to return.
 * @returns The trimmed section body, or `undefined` when absent or empty.
 */
export function changelogSection({
	changelog,
	version,
}: {
	changelog: string;
	version: string;
}): string | undefined {
	const lines = changelog.split("\n");
	const heading = `## [${version}]`;
	const start = lines.findIndex(
		(line) => line === heading || line.startsWith(`${heading} `),
	);
	if (start === -1) return undefined;
	const rest = lines.slice(start + 1);
	const end = rest.findIndex((line) => line.startsWith("## "));
	const body = (end === -1 ? rest : rest.slice(0, end)).join("\n").trim();
	return body.length > 0 ? body : undefined;
}

/**
 * Picks the GitHub Releases a `dv release` run earned: one per package it
 * uploaded (see {@linkcode releasedPackages}). Failed publishes get none
 * until a `--force` recovery run uploads them.
 *
 * Notes come from dv's `releaseNotes` when the plan carries them, else from
 * the version's section of the package CHANGELOG, else a one-line fallback.
 *
 * @param args.result The `dv release --json` result.
 * @param args.changelogs CHANGELOG text by package path, for the packages
 *   that have one.
 * @returns The Releases to create, in publish order.
 */
export function gitHubReleases({
	result,
	changelogs,
}: {
	result: ReleaseResult;
	changelogs: ReadonlyMap<string, string>;
}): GitHubRelease[] {
	const planNotes = new Map(
		result.plan.awaitingRelease.map((entry) => [entry.tag, entry.releaseNotes]),
	);
	return releasedPackages(result).map(({ tag, version, path }) => {
		const fromPlan = planNotes.get(tag)?.trim();
		const changelog = changelogs.get(path);
		const notes =
			fromPlan !== undefined && fromPlan.length > 0
				? fromPlan
				: changelog === undefined
					? undefined
					: changelogSection({ changelog, version });
		return { tag, notes: notes ?? `Release ${tag}.` };
	});
}
