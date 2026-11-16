/**
 * The runtimes a smoke run targets, and how a user of each one installs and
 * runs a JSR package.
 *
 * @module
 */

/** Every runtime a smoke run can target, as named on the command line. */
export const RUNTIMES: readonly [
	"node",
	"bun",
	"chromium",
	"firefox",
	"webkit",
	"workerd",
] = ["node", "bun", "chromium", "firefox", "webkit", "workerd"];

/** A runtime named on the command line. */
export type Runtime = (typeof RUNTIMES)[number];

/** A browser engine Playwright drives. */
export type BrowserEngine = "chromium" | "firefox" | "webkit";

/**
 * Where the probe runs, which decides how packages are installed and how the
 * probe is built:
 * - `server`: Node or Bun, installed with that runtime's `jsr add` and
 *   imported from `node_modules` by the runtime itself
 * - `browser`: installed from JSR's npm registry and bundled with esbuild
 * - `workerd`: installed like `browser`, bundled as one Worker module and run
 *   by Miniflare
 */
export type Target =
	| { readonly kind: "server"; readonly runtime: "node" | "bun" }
	| { readonly kind: "browser"; readonly engine: BrowserEngine }
	| { readonly kind: "workerd" };

/**
 * Whether a string names a runtime.
 *
 * @param text - The candidate name
 * @returns `true` when `text` is a runtime
 */
export function isRuntime(text: string): text is Runtime {
	return RUNTIMES.some((runtime) => runtime === text);
}

/**
 * The target a runtime runs the probe on.
 *
 * @param runtime - The runtime
 * @returns Its target
 */
export function targetOf(runtime: Runtime): Target {
	switch (runtime) {
		case "node":
		case "bun":
			return { kind: "server", runtime };
		case "chromium":
		case "firefox":
		case "webkit":
			return { kind: "browser", engine: runtime };
		case "workerd":
			return { kind: "workerd" };
	}
}
