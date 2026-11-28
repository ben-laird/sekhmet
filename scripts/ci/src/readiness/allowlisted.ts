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
		"dispatch/src/controller.ts",
		"DispatchController.prototype.dispatch",
		"Option",
	),
	privateTypeRef(
		"dispatch/src/signal.ts",
		"DispatchSignal.prototype.poll",
		"Poll",
	),
	privateTypeRef(
		"dispatch/src/signal.ts",
		"DispatchSignal.prototype.toVow",
		"Vow",
	),
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
	privateTypeRef("job/src/need.ts", "Need", "Struct"),
	privateTypeRef("job/src/need.ts", "Field", "Struct"),
	privateTypeRef("job/src/end/mini/core.ts", "JobEnd", "Enum"),
	privateTypeRef("job/src/end/mini/accessors.ts", "value", "Option"),
	privateTypeRef("job/src/end/mini/accessors.ts", "error", "Option"),
	privateTypeRef("job/src/end/mini/accessors.ts", "blockedBy", "Option"),
	...[
		"isSucceeded",
		"isSucceededAnd",
		"isFailed",
		"isSkipped",
		"isBlocked",
		"isCancelled",
		"isPassing",
		"isFailing",
		"isHealthy",
		"isUnhealthy",
	].flatMap((predicate) => {
		return [
			privateTypeRef("job/src/end/mini/predicates.ts", predicate, "Enum"),
			privateTypeRef("job/src/end/mini/predicates.ts", predicate, "Isolate"),
		];
	}),
	privateTypeRef("job/src/end/mini/transform.ts", "toResult", "Result"),
	privateTypeRef("job/src/end/mini/transform.ts", "catchFailure", "Enum"),
	privateTypeRef("job/src/end/mini/transform.ts", "catchFailure", "Eliminate"),
	privateTypeRef("job/src/end/mini/transform.ts", "catchFailure", "Result"),
	privateTypeRef("job/src/end/main/mod.ts", "JobEnd.prototype.value", "Option"),
	privateTypeRef(
		"job/src/end/main/mod.ts",
		"JobEnd.prototype.isSucceeded",
		"Enum",
	),
	privateTypeRef(
		"job/src/end/main/mod.ts",
		"JobEnd.prototype.isSucceeded",
		"Isolate",
	),
	privateTypeRef(
		"job/src/end/main/mod.ts",
		"JobEnd.prototype.toResult",
		"Result",
	),
	privateTypeRef(
		"job/src/end/main/mod.ts",
		"JobEnd.prototype.catchFailure",
		"Eliminate",
	),
	privateTypeRef(
		"job/src/end/main/mod.ts",
		"JobEnd.prototype.catchFailure",
		"Result",
	),
	privateTypeRef("job/src/plan.ts", "planJobs", "Result"),
	privateTypeRef("job/src/run.ts", "runJobs", "Result"),
	privateTypeRef("lifetime/src/adoption.ts", "Variants", "Split"),
	privateTypeRef("lifetime/src/adoption.ts", "Adoption", "Enum"),
	privateTypeRef(
		"lifetime/src/lifetime.ts",
		"Lifetime.prototype.ending",
		"DispatchSignal",
	),
	privateTypeRef(
		"lifetime/src/lifetime.ts",
		"Lifetime.prototype.value",
		"Option",
	),
	privateTypeRef(
		"lifetime/src/lifetime.ts",
		"Lifetime.prototype.endWhen",
		"Unsubscribe",
	),
	privateTypeRef("lifetime/src/phase.ts", 'EndFailure["panics"]', "Panic"),
	privateTypeRef("lifetime/src/phase.ts", "EndReport", "Result"),
	privateTypeRef("lifetime/src/phase.ts", "Variants", "Split"),
	privateTypeRef("lifetime/src/phase.ts", "Phase", "Enum"),
	...["Split", "Unsubscribe", "Vow", "Result", "Panic"].map((privateType) => {
		return privateTypeRef(
			"lifetime/src/registration.ts",
			"Variants",
			privateType,
		);
	}),
	privateTypeRef("lifetime/src/registration.ts", "Registration", "Enum"),
	privateTypeRef("lifetime/src/resource.ts", "Variants", "Split"),
	privateTypeRef("lifetime/src/resource.ts", "Variants", "Panic"),
	privateTypeRef("lifetime/src/resource.ts", "SetupEnd", "Enum"),
	privateTypeRef(
		"lifetime/src/resource.ts",
		'SetupTeardownFailure["init"]',
		"Panic",
	),
	privateTypeRef("lifetime/src/resource.ts", "isSetupTeardownPanic", "Panic"),
	...["Vow", "Outcome", "PanicBoundary"].map((privateType) => {
		return privateTypeRef(
			"lifetime/src/resource.ts",
			"Resource.prototype.start",
			privateType,
		);
	}),
	privateTypeRef(
		"panic/src/mini/runtime.ts",
		'PanicRuntime["catchUnwind"]',
		"Vow",
	),
	privateTypeRef("panic/src/outcome/mini/core.ts", "Variants", "Split"),
	privateTypeRef("panic/src/outcome/mini/core.ts", "Outcome", "Enum"),
	...[
		"isOk",
		"isOkAnd",
		"isErr",
		"isErrAnd",
		"isPanicked",
		"isPanicAnd",
	].flatMap((predicate) => {
		return [
			privateTypeRef("panic/src/outcome/mini/predicates.ts", predicate, "Enum"),
			privateTypeRef(
				"panic/src/outcome/mini/predicates.ts",
				predicate,
				"Isolate",
			),
		];
	}),
	...["ok", "err", "transpose"].map((name) => {
		return privateTypeRef(
			"panic/src/outcome/mini/combinators.ts",
			name,
			"Option",
		);
	}),
	privateTypeRef(
		"panic/src/outcome/mini/combinators.ts",
		"flattenResult",
		"Either",
	),
	privateTypeRef(
		"panic/src/outcome/mini/combinators.ts",
		"flattenResult",
		"Result",
	),
	privateTypeRef(
		"panic/src/outcome/mini/combinators.ts",
		"flattenEither",
		"Either",
	),
	...[
		"fromResult",
		"intoResult",
		"panicResult",
		"intoNested",
		"fromCaught",
	].map((name) => {
		return privateTypeRef("panic/src/outcome/mini/convert.ts", name, "Result");
	}),
	privateTypeRef("panic/src/outcome/mini/panic.ts", "panicked", "Option"),
	privateTypeRef("panic/src/outcome/mini/panic.ts", "recover", "Result"),
	privateTypeRef("panic/src/outcome/mini/panic.ts", "recover", "Either"),
	privateTypeRef("panic/src/outcome/mini/panic.ts", "resume", "Result"),
	...(
		[
			["Outcome.prototype.isOk", "Enum"],
			["Outcome.prototype.isOk", "Isolate"],
			["Outcome.prototype.ok", "Option"],
			["Outcome.prototype.transpose", "Option"],
			["Outcome.prototype.flattenResult", "Either"],
			["Outcome.prototype.flattenResult", "Result"],
			["Outcome.prototype.intoResult", "Result"],
			["fromResult", "Result"],
		] as const
	).map(([publicType, privateType]) => {
		return privateTypeRef(
			"panic/src/outcome/main/mod.ts",
			publicType,
			privateType,
		);
	}),
	...["Outcome", "Vow"].map((privateType) => {
		return privateTypeRef(
			"schema/src/core/main/mod.ts",
			"Schema.prototype.parse",
			privateType,
		);
	}),
	privateTypeRef(
		"schema/src/core/main/mod.ts",
		"Schema.prototype.parseSync",
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
	privateTypeRef("schema/src/core/mini/schema.ts", "Parser", "Result"),
	privateTypeRef("schema/src/core/mini/schema.ts", "Schema", "Struct"),
	privateTypeRef("schema/src/core/mini/guard.ts", "is", "PanicBoundary"),
	privateTypeRef(
		"schema/src/core/mini/schema.ts",
		'ParseOptions["panics"]',
		"PanicBoundary",
	),
	...["parse", "Runner"].flatMap((publicType) => {
		return ["Outcome", "Vow"].map((privateType) => {
			return privateTypeRef(
				"schema/src/core/mini/schema.ts",
				publicType,
				privateType,
			);
		});
	}),
	...["ToStandardSchema", "ToStandardOptions"].map((options) => {
		return privateTypeRef(
			"schema/src/standard/mini/to-standard.ts",
			`${options}["panics"]`,
			"PanicBoundary",
		);
	}),
	privateTypeRef(
		"schema/src/core/mini/schema.ts",
		"ParseSyncErrorVariants",
		"Split",
	),
	privateTypeRef("schema/src/core/mini/schema.ts", "ParseSyncError", "Enum"),
	privateTypeRef("schema/src/core/mini/schema.ts", "parseSync", "Result"),
	privateTypeRef("vow/src/mini/accessors.ts", "value", "Option"),
	privateTypeRef("vow/src/mini/accessors.ts", "poll", "Poll"),
	privateTypeRef("vow/src/mini/core.ts", "Variants", "Split"),
	privateTypeRef("vow/src/mini/core.ts", "Vow", "Enum"),
	...["isResolved", "isPending"].flatMap((predicate) => {
		return [
			privateTypeRef("vow/src/mini/predicates.ts", predicate, "Enum"),
			privateTypeRef("vow/src/mini/predicates.ts", predicate, "Isolate"),
		];
	}),
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
