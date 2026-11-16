import { relative } from "@std/path/posix";
import type { FileCoverage, Tally } from "./coverage.ts";

/**
 * Why an LCOV text could not be read.
 */
export type LcovError =
	| { kind: "outside-record"; line: number; text: string }
	| { kind: "bad-number"; line: number; text: string }
	| { kind: "unterminated-record"; path: string };

/**
 * Parses an LCOV tracefile (`lcov.info`) into per-file coverage. Paths
 * under `repoRoot` become repo-relative.
 *
 * Totals come from the `LF/LH`, `BRF/BRH` and `FNF/FNH` summary records;
 * a record without them is counted from its `DA`, `BRDA` and `FN/FNDA`
 * entries instead.
 */
export function parseLcov({
	text,
	repoRoot,
}: {
	text: string;
	repoRoot: string;
}): { ok: true; value: FileCoverage[] } | { ok: false; error: LcovError } {
	const files: FileCoverage[] = [];
	let record: RecordState | undefined;
	const lines = text.split(/\r?\n/);

	for (const [index, raw] of lines.entries()) {
		const line = raw.trim();
		if (line === "" || line.startsWith("TN:")) continue;
		const at = { line: index + 1, text: raw };

		if (line.startsWith("SF:")) {
			record = newRecord(line.slice(3));
			continue;
		}
		if (record === undefined) return fail({ kind: "outside-record", ...at });
		if (line === "end_of_record") {
			files.push(finish({ record, repoRoot }));
			record = undefined;
			continue;
		}

		const colon = line.indexOf(":");
		const tag = colon < 0 ? line : line.slice(0, colon);
		const fields = colon < 0 ? [] : line.slice(colon + 1).split(",");
		const count = (field: string | undefined): number | undefined => {
			if (field === undefined || field === "-") return 0;
			const value = Number(field);
			return Number.isInteger(value) && value >= 0 ? value : undefined;
		};

		switch (tag) {
			case "LF":
			case "LH":
			case "BRF":
			case "BRH":
			case "FNF":
			case "FNH": {
				const value = count(fields[0]);
				if (value === undefined) return fail({ kind: "bad-number", ...at });
				record.summary[tag] = value;
				break;
			}
			case "DA": {
				const hits = count(fields[1]);
				if (hits === undefined) return fail({ kind: "bad-number", ...at });
				record.derived.lines.total++;
				if (hits > 0) record.derived.lines.covered++;
				break;
			}
			case "BRDA": {
				const taken = count(fields[3]);
				if (taken === undefined) return fail({ kind: "bad-number", ...at });
				record.derived.branches.total++;
				if (taken > 0) record.derived.branches.covered++;
				break;
			}
			case "FN": {
				record.derived.functions.total++;
				break;
			}
			case "FNDA": {
				const hits = count(fields[0]);
				if (hits === undefined) return fail({ kind: "bad-number", ...at });
				if (hits > 0) record.derived.functions.covered++;
				break;
			}
			default: {
				// Other records (VER, FNL, …) carry nothing the summary uses
				break;
			}
		}
	}

	if (record !== undefined) {
		return fail({ kind: "unterminated-record", path: record.path });
	}
	return { ok: true, value: files };
}

type SummaryTag = "LF" | "LH" | "BRF" | "BRH" | "FNF" | "FNH";

interface RecordState {
	path: string;
	summary: Partial<Record<SummaryTag, number>>;
	derived: { lines: Tally; branches: Tally; functions: Tally };
}

function newRecord(path: string): RecordState {
	return {
		path,
		summary: {},
		derived: {
			lines: { covered: 0, total: 0 },
			branches: { covered: 0, total: 0 },
			functions: { covered: 0, total: 0 },
		},
	};
}

function finish({
	record,
	repoRoot,
}: {
	record: RecordState;
	repoRoot: string;
}): FileCoverage {
	const { summary, derived } = record;
	const tally = (found: SummaryTag, hit: SummaryTag, fallback: Tally): Tally =>
		summary[found] === undefined
			? fallback
			: { covered: summary[hit] ?? 0, total: summary[found] };
	const inRepo = record.path.startsWith(`${repoRoot}/`);
	return {
		path: inRepo ? relative(repoRoot, record.path) : record.path,
		lines: tally("LF", "LH", derived.lines),
		branches: tally("BRF", "BRH", derived.branches),
		functions: tally("FNF", "FNH", derived.functions),
	};
}

function fail(error: LcovError): { ok: false; error: LcovError } {
	return { ok: false, error };
}

/** A one-line description of an {@linkcode LcovError}. */
export function describeLcovError(error: LcovError): string {
	switch (error.kind) {
		case "outside-record": {
			return `line ${error.line}: "${error.text}" is outside an SF:…end_of_record record`;
		}
		case "bad-number": {
			return `line ${error.line}: "${error.text}" has a count that is not a non-negative integer`;
		}
		case "unterminated-record": {
			return `the record for ${error.path} has no end_of_record`;
		}
	}
}
