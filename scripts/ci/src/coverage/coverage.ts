/**
 * How much of one measure (lines, branches or functions) the tests reached.
 */
export interface Tally {
	/** Units the tests executed */
	covered: number;
	/** Units there are */
	total: number;
}

/**
 * Line, branch and function coverage of some code: a file, a package or the
 * whole workspace.
 */
export interface Coverage {
	/** Executable lines */
	lines: Tally;
	/** Branches */
	branches: Tally;
	/** Functions */
	functions: Tally;
}

/** The coverage of one source file. */
export interface FileCoverage extends Coverage {
	/** Repo-relative path, or the path as reported when outside the repo */
	path: string;
}

/** The coverage of one workspace package, summed over its files. */
export interface PackageCoverage extends Coverage {
	/** Package name, e.g. `@sekhmet/enum`, or its directory if unnamed */
	name: string;
	/** Repo-relative package directory (`""` for files in no package) */
	dir: string;
	/** Its files, sorted by path */
	files: FileCoverage[];
}

/**
 * A test run's coverage, per package and in total. Readers (the CI job
 * summary, AI output, PR comments) render this rather than LCOV.
 */
export interface CoverageSummary extends Coverage {
	/** Packages with covered files, sorted by directory */
	packages: PackageCoverage[];
}

/** The measures of {@linkcode Coverage}, in display order. */
export const MEASURES = ["lines", "branches", "functions"] as const;

/** An empty {@linkcode Coverage}, the identity of {@linkcode addCoverage}. */
export const NO_COVERAGE: Coverage = {
	lines: { covered: 0, total: 0 },
	branches: { covered: 0, total: 0 },
	functions: { covered: 0, total: 0 },
};

/**
 * Sums two coverages measure by measure. Associative and commutative, with
 * {@linkcode NO_COVERAGE} as identity, so any grouping sums the same.
 */
export function addCoverage(a: Coverage, b: Coverage): Coverage {
	const add = (x: Tally, y: Tally): Tally => ({
		covered: x.covered + y.covered,
		total: x.total + y.total,
	});
	return {
		lines: add(a.lines, b.lines),
		branches: add(a.branches, b.branches),
		functions: add(a.functions, b.functions),
	};
}

/**
 * The covered share of a tally as a percentage, or `undefined` when there
 * is nothing to cover.
 */
export function percent(tally: Tally): number | undefined {
	return tally.total === 0 ? undefined : (tally.covered / tally.total) * 100;
}

/** A tally with its percentage, for readers that do not compute it. */
export interface TallyTotals extends Tally {
	/** Covered share, 0–100 with one decimal, or `null` when nothing to cover */
	percent: number | null;
}

/** Package or overall totals: each measure with its percentage. */
export interface CoverageTotals {
	/** Executable lines */
	lines: TallyTotals;
	/** Branches */
	branches: TallyTotals;
	/** Functions */
	functions: TallyTotals;
}

/**
 * The totals of a summary, overall and per package, without the per-file
 * rows: the compact view AI output carries.
 */
export function coverageTotals(summary: CoverageSummary): {
	total: CoverageTotals;
	packages: ({ name: string } & CoverageTotals)[];
} {
	const totals = (coverage: Coverage): CoverageTotals => {
		const withPercent = (tally: Tally): TallyTotals => {
			const share = percent(tally);
			return {
				...tally,
				percent: share === undefined ? null : Math.round(share * 10) / 10,
			};
		};
		return {
			lines: withPercent(coverage.lines),
			branches: withPercent(coverage.branches),
			functions: withPercent(coverage.functions),
		};
	};
	return {
		total: totals(summary),
		packages: summary.packages.map((pkg) => ({
			name: pkg.name,
			...totals(pkg),
		})),
	};
}

/**
 * Groups file coverage by the workspace package whose directory contains
 * each file (the deepest one), summing each package and the whole.
 */
export function summarizeCoverage({
	files,
	packages,
}: {
	files: readonly FileCoverage[];
	packages: readonly { name: string; dir: string }[];
}): CoverageSummary {
	const byDir = new Map<string, PackageCoverage>();
	const deepestFirst = packages.toSorted((a, b) => b.dir.length - a.dir.length);

	for (const file of files) {
		const owner = deepestFirst.find(({ dir }) =>
			file.path.startsWith(`${dir}/`),
		) ?? { name: "(outside packages)", dir: "" };
		const group = byDir.get(owner.dir) ?? {
			...NO_COVERAGE,
			name: owner.name,
			dir: owner.dir,
			files: [],
		};
		group.files.push(file);
		byDir.set(owner.dir, { ...group, ...addCoverage(group, file) });
	}

	const grouped = [...byDir.values()]
		.map((group) => ({
			...group,
			files: group.files.toSorted((a, b) => a.path.localeCompare(b.path)),
		}))
		.sort((a, b) => a.dir.localeCompare(b.dir));
	return {
		...grouped.reduce<Coverage>(addCoverage, NO_COVERAGE),
		packages: grouped,
	};
}
