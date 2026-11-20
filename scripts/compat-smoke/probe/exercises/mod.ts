/**
 * Every published package's exercise, keyed by package name. Each is
 * imported lazily, so a package that fails to load fails only its own
 * exercise.
 *
 * @module
 */

import type { Exercises } from "../probe.ts";

/** Each package's exercise module. */
export const EXERCISES: Exercises = {
	"@sekhmet/dispatch": () => import("./dispatch.ts"),
	"@sekhmet/effect": () => import("./effect.ts"),
	"@sekhmet/enum": () => import("./enum.ts"),
	"@sekhmet/job": () => import("./job.ts"),
	"@sekhmet/matrix": () => import("./matrix.ts"),
	"@sekhmet/panic": () => import("./panic.ts"),
	"@sekhmet/primordials": () => import("./primordials.ts"),
	"@sekhmet/schema": () => import("./schema.ts"),
	"@sekhmet/vow": () => import("./vow.ts"),
	"@sekhmet/workflow": () => import("./workflow.ts"),
};
