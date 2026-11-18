import type { AllowlistEntry } from "./allowlist.ts";

/**
 * Readiness failures known on `main` that wait on tracked work. Each entry
 * names its issue; remove it when the issue lands (a stale entry fails the
 * gate). Never add an entry to get a new failure past the gate.
 */
export const ALLOWLIST: readonly AllowlistEntry[] = [
	// Cross-package types (Struct, Enum, Split, Result) in public signatures
	// that the package does not re-export; how to resolve them is undecided
	privateTypeRef(
		"effect/src/continuation/continuation.ts",
		"ContinuationVariants",
		"Split",
	),
	privateTypeRef(
		"effect/src/continuation/continuation.ts",
		"Continuation",
		"Enum",
	),
	privateTypeRef(
		"effect/src/effect/mini/effect.ts",
		"EffectErrorVariants",
		"Split",
	),
	privateTypeRef("effect/src/effect/mini/effect.ts", "EffectError", "Enum"),
	privateTypeRef("effect/src/effect/mini/effect.ts", "EffectResult", "Result"),
	privateTypeRef("effect/src/effect/mini/effect.ts", "Effect", "Struct"),
	privateTypeRef(
		"effect/src/fiber/mini/fiber-error.ts",
		"FiberErrorVariants",
		"Split",
	),
	privateTypeRef("effect/src/fiber/mini/fiber-error.ts", "FiberError", "Enum"),
	privateTypeRef(
		"effect/src/fiber/mini/fiber-error.ts",
		"FiberResult",
		"Result",
	),
	privateTypeRef(
		"effect/src/fiber/mini/fiber.ts",
		"FiberStateVariants",
		"Split",
	),
	privateTypeRef("effect/src/fiber/mini/fiber.ts", "FiberState", "Enum"),
	privateTypeRef("effect/src/fiber/mini/fiber.ts", "Fiber", "Struct"),
	privateTypeRef("effect/src/runtime/runtime.ts", "Runtime", "Struct"),
	privateTypeRef("effect/src/runtime/runtime.ts", "ExecutionContext", "Struct"),
	privateTypeRef(
		"effect/src/scheduler/scheduler.ts",
		"SchedulerStateVariants",
		"Split",
	),
	privateTypeRef("effect/src/scheduler/scheduler.ts", "SchedulerState", "Enum"),
	privateTypeRef("enum/src/core/mini/core.ts", "Enum", "Struct"),
	privateTypeRef("job/src/event.ts", "JobEvent", "Enum"),
	privateTypeRef("job/src/graph-error.ts", "GraphError", "Enum"),
	privateTypeRef("job/src/job.ts", "Job", "Struct"),
	privateTypeRef("job/src/job.ts", "Handle", "Struct"),
	privateTypeRef("job/src/job.ts", "Skip", "Struct"),
	privateTypeRef("job/src/job.ts", "NeedResult", "Result"),
	privateTypeRef("job/src/outcome.ts", "JobOutcome", "Enum"),
	privateTypeRef("job/src/plan.ts", "JobPlan", "Enum"),
	privateTypeRef("job/src/plan.ts", "planJobs", "Result"),
	privateTypeRef("job/src/run.ts", "runJobs", "Result"),
	privateTypeRef(
		"panic/src/mini/runtime.ts",
		'PanicRuntime["catchUnwind"]',
		"Result",
	),
	privateTypeRef(
		"schema/src/core/main/mod.ts",
		"Schema.prototype.parse",
		"Result",
	),
	privateTypeRef(
		"schema/src/core/main/mod.ts",
		"Schema.prototype.parseAsync",
		"Result",
	),
	privateTypeRef(
		"schema/src/core/mini/issue.ts",
		"SchemaIssueVariants",
		"Split",
	),
	privateTypeRef("schema/src/core/mini/issue.ts", "SchemaIssue", "Enum"),
	privateTypeRef("schema/src/core/mini/annotation.ts", "annotation", "Option"),
	privateTypeRef("schema/src/core/mini/issues.ts", "Issues", "Struct"),
	privateTypeRef("schema/src/core/mini/node.ts", "SchemaNode", "Enum"),
	privateTypeRef("schema/src/core/mini/node.ts", "customData", "Option"),
	privateTypeRef(
		"schema/src/core/mini/potential.ts",
		"PotentialVariants",
		"Split",
	),
	privateTypeRef("schema/src/core/mini/potential.ts", "Potential", "Enum"),
	privateTypeRef("schema/src/core/mini/schema.ts", "Parser", "Result"),
	privateTypeRef("schema/src/core/mini/schema.ts", "Schema", "Struct"),
	privateTypeRef("schema/src/core/mini/schema.ts", "parse", "Result"),
	privateTypeRef(
		"schema/src/core/mini/schema.ts",
		"ParseSyncErrorVariants",
		"Split",
	),
	privateTypeRef("schema/src/core/mini/schema.ts", "ParseSyncError", "Enum"),
	privateTypeRef("schema/src/core/mini/schema.ts", "parseSync", "Result"),
	privateTypeRef("schema/src/core/mini/schema.ts", "parseAsync", "Result"),
	privateTypeRef("vow/src/mini/core.ts", "Variants", "Split"),
	privateTypeRef("vow/src/mini/core.ts", "Vow", "Enum"),
	privateTypeRef("vow/src/mini/impl.ts", "fromPromise", "Result"),
	// The workflow guards narrow to @sekhmet/panic's Panic<Cause> (#38)
	privateTypeRef(
		"workflow/src/invariant/invariant.ts",
		"isInvariantPanic",
		"Panic",
	),
	privateTypeRef("workflow/src/todo/todo.ts", "isTodoPanic", "Panic"),
	privateTypeRef("workflow/src/todo/todo.ts", "isUnimplementedPanic", "Panic"),
	privateTypeRef(
		"workflow/src/unreachable/unreachable.ts",
		"isUnreachablePanic",
		"Panic",
	),
];

function privateTypeRef(
	file: string,
	publicType: string,
	privateType: string,
): AllowlistEntry {
	return {
		check: "doc-lint",
		file: `packages/${file}`,
		message: `private-type-ref: public type '${publicType}' references private type '${privateType}'`,
		until: "#11",
	};
}
