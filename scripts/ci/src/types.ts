/**
 * Possible status values for a workflow step execution.
 */
export type StepStatus = "passed" | "failed" | "skipped";

/**
 * Condition that determines when a workflow step should execute.
 * Can be a predefined string or a custom function that receives the step context.
 */
export type StepCondition =
	| "success" // Run if all dependencies succeeded (default)
	| "failure" // Run if any dependency failed
	| "always" // Always run regardless of dependency status
	| ((context: StepContext) => boolean); // Custom function
// {}

/**
 * Context object passed to workflow steps, providing access to step history,
 * shared outputs, and helper methods for making execution decisions.
 */
export interface StepContext {
	/** Read-only map of all completed step names to their execution status */
	steps: ReadonlyMap<string, StepStatus>;

	/** Output mechanisms for sharing data between workflow steps */
	outputs: {
		/** Environment variables shared between steps */
		env: ReadonlyMap<string, string>;

		/** Arbitrary structured data shared between steps */
		context: ReadonlyMap<string, unknown>;

		/** Path to artifacts directory for file-based sharing */
		artifactsDir: string;
	};

	/**
	 * Checks if any completed step has failed.
	 *
	 * @returns true if at least one step has failed, false otherwise
	 */
	hasFailure(): boolean;

	/**
	 * Checks if all completed steps have succeeded.
	 *
	 * @returns true if all steps passed, false otherwise
	 */
	allSucceeded(): boolean;

	/**
	 * Checks if a specific step succeeded.
	 *
	 * @param stepName - Name of the step to check
	 * @returns true if the step exists and passed, false otherwise
	 */
	succeeded(stepName: string): boolean;

	/**
	 * Checks if a specific step failed.
	 *
	 * @param stepName - Name of the step to check
	 * @returns true if the step exists and failed, false otherwise
	 */
	failed(stepName: string): boolean;
}

/**
 * Output data that a workflow step can produce for use by subsequent steps.
 */
export interface StepOutputs {
	/** Environment variables to export for subsequent steps */
	env?: Record<string, string>;

	/** Arbitrary data to store in shared context for subsequent steps */
	context?: Record<string, unknown>;
}

/**
 * Configuration for a single step in a workflow.
 * Each step executes a command and can depend on other steps.
 */
export interface WorkflowStep {
	/** Unique name identifying this step in the workflow */
	name: string;
	/** Deno command to execute for this step */
	command: Deno.Command;

	/** Condition determining when this step should execute (defaults to "success") */
	condition?: StepCondition;
	/** Names of other steps that must complete before this step runs */
	dependsOn?: string[];
	/** If true, workflow continues even if this step fails (defaults to false) */
	continueOnError?: boolean;
	/** Whether to show command output (boolean or function based on step status) */
	showOutput?: boolean | ((status: StepStatus) => boolean);
	/** Exit code to use if this step fails (defaults to 1) */
	exitCode?: number;

	/**
	 * Function to extract outputs from this step's execution for use in later steps.
	 *
	 * @param output - The command execution output
	 * @param context - Current step context
	 * @returns Outputs to share with subsequent steps
	 */
	captureOutputs?: (
		output: Deno.CommandOutput,
		context: StepContext,
	) => StepOutputs;
}

/**
 * Result of executing a single workflow step.
 */
export interface StepResult {
	/** Name of the executed step */
	name: string;
	/** Final execution status of the step */
	status: StepStatus;
	/** Command output if the step was executed (undefined if skipped) */
	output?: Deno.CommandOutput | undefined;
	/** Outputs captured from this step's execution */
	outputs?: StepOutputs | undefined;
}

/**
 * Overall result of executing a complete workflow.
 */
export interface WorkflowResult {
	/** true if all steps passed or were skipped, false if any step failed */
	success: boolean;
	/** Results from each step in execution order */
	steps: StepResult[];
}

/**
 * Internal type for tracking accumulated outputs across workflow execution.
 */
export interface AccumulatedOutputs {
	/** Mutable map of accumulated environment variables */
	env: Map<string, string>;
	/** Mutable map of accumulated context data */
	context: Map<string, unknown>;
}

/**
 * Parameters for constructing a StepContext instance.
 */
export interface StepContextParams {
	/** Map of completed step results */
	completedSteps: Map<string, StepResult>;
	/** Accumulated outputs from all previous steps */
	accumulatedOutputs: AccumulatedOutputs;
	/** Path to the artifacts directory */
	artifactsDir: string;
}

/**
 * Internal type representing the execution state for a workflow step.
 */
export interface StepExecution {
	/** The workflow step configuration to execute */
	step: WorkflowStep;
	/** Map of all previously completed step results */
	completedSteps: Map<string, StepResult>;
	/** Accumulated outputs from all previous steps */
	accumulatedOutputs: AccumulatedOutputs;
	/** Path to the artifacts directory */
	artifactsDir: string;
}
