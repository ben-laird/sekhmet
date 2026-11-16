/**
 * The commands a smoke run executes in its temporary project: install the
 * packages the way a user of the target would, bundle the probe, run it.
 *
 * @module
 */

import { ENTRY_FILE } from "@/src/entry.ts";
import { npmName, type PublishedPackage } from "@/src/package.ts";
import type { Target } from "@/src/runtime.ts";

/**
 * The exact tool versions a run installs. Bump them together with
 * `.github/workflows/compat-smoke.yml`, which installs Playwright's system
 * dependencies at the same version.
 */
export const TOOLS: {
	readonly jsr: string;
	readonly esbuild: string;
	readonly playwright: string;
	readonly miniflare: string;
} = {
	jsr: "0.14.3",
	esbuild: "0.28.2",
	playwright: "1.65.1",
	miniflare: "4.20260730.0",
};

/**
 * The Workers compatibility date the probe runs under: the pinned Miniflare's
 * release date, which Miniflare must know. It equals the unit suite's
 * (`scripts/compat/src/runtime.ts`); `scripts/compat/src/pins.test.ts`
 * fails when they drift.
 */
export const WORKERD_COMPATIBILITY_DATE = "2026-07-30";

/** JSR's npm-compatible registry, which serves `@jsr/<scope>__<name>`. */
export const JSR_NPM_REGISTRY = "https://npm.jsr.io";

/** A program and its arguments, run in the temporary project. */
export interface Command {
	/** The executable */
	readonly program: string;
	/** Its arguments */
	readonly args: readonly string[];
}

/** Everything a run executes, in order. */
export interface Plan {
	/** The `.npmrc` to write first, if the install needs one */
	readonly npmrc: string | undefined;
	/** Installs the packages and the tools */
	readonly install: readonly Command[];
	/** Bundles the probe into `dist/` */
	readonly build: Command;
	/** Runs the probe; its stdout carries the report */
	readonly run: Command;
}

function esbuild({
	target,
	runner,
}: {
	target: Target;
	runner: Command;
}): Command {
	const common = [
		"esbuild",
		`src/${ENTRY_FILE}`,
		"--bundle",
		"--format=esm",
		"--target=es2022",
		"--log-level=warning",
	];
	const specific: Record<Target["kind"], string[]> = {
		// Packages stay external: the runtime resolves them from node_modules.
		server: [
			"--splitting",
			"--outdir=dist",
			"--platform=node",
			"--packages=external",
		],
		browser: ["--splitting", "--outdir=dist", "--platform=browser"],
		workerd: [
			"--outfile=dist/worker.js",
			"--platform=neutral",
			"--conditions=workerd,worker,browser",
		],
	};
	return {
		program: runner.program,
		args: [...runner.args, ...common, ...specific[target.kind]],
	};
}

/**
 * The install specs for `npm install` straight from JSR's npm registry:
 * `@sekhmet/enum@npm:@jsr/sekhmet__enum@0.1.0`.
 *
 * @param packages - The packages to install
 * @returns One spec per package
 */
export function npmSpecs(packages: readonly PublishedPackage[]): string[] {
	return packages.map(
		({ name, version }) => `${name}@npm:${npmName(name)}@${version}`,
	);
}

/**
 * The commands a run executes for a target.
 *
 * @param params - The target and the packages under test
 * @returns The plan
 */
export function planFor({
	target,
	packages,
}: {
	target: Target;
	packages: readonly PublishedPackage[];
}): Plan {
	const jsrSpecs = packages.map(({ name, version }) => `${name}@${version}`);
	const npx: Command = { program: "npx", args: ["--no-install"] };

	switch (target.kind) {
		case "server": {
			if (target.runtime === "node") {
				return {
					npmrc: undefined,
					install: [
						{
							program: "npx",
							args: ["--yes", `jsr@${TOOLS.jsr}`, "add", ...jsrSpecs],
						},
						{
							program: "npm",
							args: [
								"install",
								"--save-dev",
								"--save-exact",
								`esbuild@${TOOLS.esbuild}`,
							],
						},
					],
					build: esbuild({ target, runner: npx }),
					run: { program: "node", args: ["dist/entry.js"] },
				};
			}
			return {
				npmrc: undefined,
				install: [
					{ program: "bunx", args: [`jsr@${TOOLS.jsr}`, "add", ...jsrSpecs] },
					{
						program: "bun",
						args: ["add", "--dev", "--exact", `esbuild@${TOOLS.esbuild}`],
					},
				],
				build: esbuild({ target, runner: { program: "bunx", args: [] } }),
				run: { program: "bun", args: ["dist/entry.js"] },
			};
		}
		case "browser":
			return {
				npmrc: `@jsr:registry=${JSR_NPM_REGISTRY}\n`,
				install: [
					{
						program: "npm",
						args: [
							"install",
							"--save-exact",
							...npmSpecs(packages),
							`esbuild@${TOOLS.esbuild}`,
							`playwright@${TOOLS.playwright}`,
						],
					},
					{
						program: "npx",
						args: ["--no-install", "playwright", "install", target.engine],
					},
				],
				build: esbuild({ target, runner: npx }),
				run: {
					program: "node",
					args: ["runners/browser.mjs", target.engine, "dist"],
				},
			};
		case "workerd":
			return {
				npmrc: `@jsr:registry=${JSR_NPM_REGISTRY}\n`,
				install: [
					{
						program: "npm",
						args: [
							"install",
							"--save-exact",
							...npmSpecs(packages),
							`esbuild@${TOOLS.esbuild}`,
							`miniflare@${TOOLS.miniflare}`,
						],
					},
				],
				build: esbuild({ target, runner: npx }),
				run: {
					program: "node",
					args: [
						"runners/workerd.mjs",
						"dist/worker.js",
						WORKERD_COMPATIBILITY_DATE,
					],
				},
			};
	}
}
