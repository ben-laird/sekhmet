import { Err, Ok, type Result } from "@sekhmet/enum/result";
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
 * The slice of `dv release --json` (dv 0.11,
 * `urn:dv:schema:v1:release-result`) the release driver reads.
 */
export interface ReleaseResult {
	/** The executed plan. */
	plan: { awaitingRelease: AwaitingRelease[] };
	/** Tags this run created. */
	mintedTagNames: string[];
	/** Per-package publish outcomes. */
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
	plan: z.object({ awaitingRelease: z.array(awaitingReleaseSchema) }),
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
 * Picks the GitHub Releases a `dv release` run earned: one per package that
 * is on JSR and was tagged or uploaded by this run. Failed publishes get no
 * Release until a `--force` recovery run succeeds.
 *
 * @param result The `dv release --json` result.
 * @returns The Releases to create, in plan order.
 */
export function gitHubReleases(result: ReleaseResult): GitHubRelease[] {
	const minted = new Set(result.mintedTagNames);
	const outcomes = new Map(
		result.releaseOpOutcomes.map((outcome) => [outcome.tag, outcome]),
	);
	return result.plan.awaitingRelease.flatMap((entry) => {
		const outcome = outcomes.get(entry.tag);
		if (outcome === undefined || !outcome.ok) return [];
		if (!minted.has(entry.tag) && outcome.published !== true) return [];
		const notes =
			entry.releaseNotes.trim().length > 0
				? entry.releaseNotes
				: `Release ${entry.tag}.`;
		return [{ tag: entry.tag, notes }];
	});
}
