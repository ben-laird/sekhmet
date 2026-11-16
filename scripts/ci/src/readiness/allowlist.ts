import type { CheckId, Finding } from "./finding.ts";

/**
 * A known failure that does not fail the gate until its tracking issue is
 * done. An entry matches findings of its check at its file, and, when it
 * gives one, with exactly its message. An entry that matches nothing is
 * itself an error, so fixed failures leave the list.
 */
export interface AllowlistEntry {
	/** The check the finding comes from */
	check: CheckId;
	/** Repo-relative file of the finding */
	file: string;
	/** The finding's exact message; omit to match every finding at `file` */
	message?: string;
	/** The issue that removes this entry, e.g. `#8` */
	until: `#${number}`;
}

/**
 * The findings a run reports as errors, and those it reports as warnings
 * because an entry allowlists them.
 */
export interface Triage {
	/** Findings that fail the gate, including stale allowlist entries */
	errors: Finding[];
	/** Findings an allowlist entry holds back, with the issue it waits on */
	allowlisted: { finding: Finding; until: string }[];
}

/**
 * Splits findings into errors and allowlisted warnings. Entries for a check
 * this run does not cover are ignored; an entry for a covered check that
 * matches no finding becomes an `allowlist` error at `allowlistPath`.
 */
export function triage({
	findings,
	allowlist,
	checks,
	allowlistPath,
}: {
	findings: readonly Finding[];
	allowlist: readonly AllowlistEntry[];
	checks: ReadonlySet<CheckId>;
	allowlistPath: string;
}): Triage {
	const entries = allowlist.filter((entry) => checks.has(entry.check));
	const used = new Set<AllowlistEntry>();
	const result: Triage = { errors: [], allowlisted: [] };

	for (const finding of findings) {
		const entry = entries.find((candidate) =>
			matches({ entry: candidate, finding }),
		);
		if (entry === undefined) {
			result.errors.push(finding);
		} else {
			used.add(entry);
			result.allowlisted.push({ finding, until: entry.until });
		}
	}

	for (const entry of entries) {
		if (used.has(entry)) continue;
		const what = entry.message === undefined ? "" : ` "${entry.message}"`;
		result.errors.push({
			check: "allowlist",
			file: allowlistPath,
			message: `stale entry: no ${entry.check} finding${what} at ${entry.file}; remove it (it was waiting on ${entry.until})`,
		});
	}
	return result;
}

function matches({
	entry,
	finding,
}: {
	entry: AllowlistEntry;
	finding: Finding;
}): boolean {
	return (
		entry.check === finding.check &&
		entry.file === finding.file &&
		(entry.message === undefined || entry.message === finding.message)
	);
}
