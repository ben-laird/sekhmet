export type StepStatus = "passed" | "failed" | "skipped";

export type StepCondition =
	| "success" // Run if all dependencies succeeded (default)
	| "failure" // Run if any dependency failed
	| "always" // Always run regardless of dependency status
	| ((context: StepContext) => boolean); // Custom function
// {}

export interface StepContext {
	// Access to all completed steps
	steps: ReadonlyMap<string, StepStatus>;

	// Output mechanisms
	outputs: {
		// Environment variables shared between steps
		env: ReadonlyMap<string, string>;

		// Arbitrary structured data shared between steps
		context: ReadonlyMap<string, unknown>;

		// Path to artifacts directory for file-based sharing
		artifactsDir: string;
	};

	// Helper methods for common conditions
	hasFailure(): boolean;
	allSucceeded(): boolean;
	succeeded(stepName: string): boolean;
	failed(stepName: string): boolean;
}

export interface StepOutputs {
	// Export environment variables for subsequent steps
	env?: Record<string, string>;

	// Store arbitrary data in shared context
	context?: Record<string, unknown>;
}

export interface WorkflowStep {
	name: string;
	command: Deno.Command;

	// Optional configuration
	condition?: StepCondition;
	dependsOn?: string[]; // Explicit dependencies on other steps
	continueOnError?: boolean; // Continue workflow even if this step fails
	showOutput?: boolean | ((status: StepStatus) => boolean);
	exitCode?: number; // Exit code to use if this step fails (defaults to 1)

	// Capture outputs from this step for use in later steps
	captureOutputs?: (
		output: Deno.CommandOutput,
		context: StepContext,
	) => StepOutputs;
}

export interface StepResult {
	name: string;
	status: StepStatus;
	output?: Deno.CommandOutput | undefined;
	outputs?: StepOutputs | undefined;
}

export interface WorkflowResult {
	success: boolean;
	steps: StepResult[];
}

// Internal types for implementation
export interface AccumulatedOutputs {
	env: Map<string, string>;
	context: Map<string, unknown>;
}

export interface StepContextParams {
	completedSteps: Map<string, StepResult>;
	accumulatedOutputs: AccumulatedOutputs;
	artifactsDir: string;
}

export interface StepExecution {
	step: WorkflowStep;
	completedSteps: Map<string, StepResult>;
	accumulatedOutputs: AccumulatedOutputs;
	artifactsDir: string;
}
