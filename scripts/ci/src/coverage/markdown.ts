import {
	type Coverage,
	type CoverageSummary,
	MEASURES,
	percent,
	type Tally,
} from "./coverage.ts";

/**
 * Renders a tally as `92.5% (37/40)`, or `n/a` when there is nothing to
 * cover.
 */
export function formatTally(tally: Tally): string {
	const share = percent(tally);
	return share === undefined
		? "n/a"
		: `${share.toFixed(1)}% (${tally.covered}/${tally.total})`;
}

/**
 * Renders a coverage summary as a markdown table for a CI job summary: a
 * bold row per package, a row per file (relative to its package) under it,
 * and a bold total row.
 */
export function renderCoverageMarkdown(summary: CoverageSummary): string {
	const row = (label: string, coverage: Coverage): string =>
		`| ${label} | ${MEASURES.map((m) => formatTally(coverage[m])).join(" | ")} |`;
	const bold = (label: string, coverage: Coverage): string =>
		`| **${label}** | ${MEASURES.map((m) => `**${formatTally(coverage[m])}**`).join(" | ")} |`;

	const lines = [
		"## Coverage",
		"",
		"| File | Lines | Branches | Functions |",
		"| :--- | ---: | ---: | ---: |",
	];
	for (const pkg of summary.packages) {
		lines.push(bold(escapeCell(pkg.name), pkg));
		for (const file of pkg.files) {
			const path =
				pkg.dir === "" ? file.path : file.path.slice(pkg.dir.length + 1);
			lines.push(row(`&nbsp;&nbsp;${escapeCell(path)}`, file));
		}
	}
	lines.push(bold("Total", summary));
	return `${lines.join("\n")}\n`;
}

function escapeCell(text: string): string {
	return text.replaceAll("|", "\\|");
}
