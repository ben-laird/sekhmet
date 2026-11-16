/**
 * The `release` op's response: the per-package publish outcome dv records.
 *
 * Unlike every other op, `ok: false` here is data, not a crash: dv has already
 * minted the tag, records the failure, and `dv release --force` retries.
 */
export interface ReleaseResponse {
	/** Whether the package is on JSR at the requested version. */
	ok: boolean;
	/** True when this run uploaded the version. */
	published: boolean;
	/** True when JSR already had the version (an idempotent re-run). */
	skipped: boolean;
	/** Human-readable summary. */
	message: string;
}

/**
 * What a finished `deno publish` process reported.
 */
export interface PublishRun {
	/** The package name, e.g. `@sekhmet/enum`. */
	name: string;
	/** The version being published. */
	version: string;
	/** The process exit code. */
	exitCode: number;
	/** Combined stdout and stderr. */
	output: string;
}

const ALREADY_PUBLISHED = /already published/i;

/**
 * Turns a `deno publish` run into the `release` response.
 *
 * `deno publish` exits 0 and warns when the version is already on JSR; that is
 * reported as `skipped`, so a recovery re-run with `--force` stays green.
 *
 * @param run The finished publish process.
 * @returns The response to print for dv.
 */
export function releaseResponse(run: PublishRun): ReleaseResponse {
	const label = `${run.name}@${run.version}`;
	if (run.exitCode !== 0) {
		const output = run.output.trim();
		return {
			ok: false,
			published: false,
			skipped: false,
			message: `deno publish failed for ${label} (exit ${run.exitCode}): ${
				output.length > 0 ? output : "<no output>"
			}`,
		};
	}
	if (ALREADY_PUBLISHED.test(run.output)) {
		return {
			ok: true,
			published: false,
			skipped: true,
			message: `${label} is already on JSR`,
		};
	}
	return {
		ok: true,
		published: true,
		skipped: false,
		message: `published ${label} to JSR`,
	};
}
