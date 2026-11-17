/**
 * The panic every workflow helper throws: a {@linkcode Panic} branded with the
 * helper that threw it, so the `is…Panic` guards recognize it without
 * running a Proxy trap and never mistake a hand-built `Panic` for one.
 *
 * @module
 */

import { Panic } from "@sekhmet/panic/mini/core";
import { displayText } from "./describe.ts";

/**
 * Which workflow helper threw a panic. It is also the panic's name, so the panic
 * surfaces as `Panic (Todo)`, `Panic (Unreachable)` and so on.
 */
export type WorkflowPanicKind =
	| "Todo"
	| "Unimplemented"
	| "Unreachable"
	| "Invariant";

/** A {@linkcode Panic} thrown by a workflow helper; the private brand is its kind. */
export class WorkflowPanic<C> extends Panic<C> {
	constructor({
		kind,
		message,
		cause,
	}: {
		kind: WorkflowPanicKind;
		message: string;
		cause: C;
	}) {
		super({ name: kind, message, cause });
		this.#kind = kind;
	}

	#kind: WorkflowPanicKind;

	/** The helper that threw `value`, if a workflow helper did. */
	static kindOf(value: unknown): WorkflowPanicKind | undefined {
		if (typeof value !== "object" || value === null || !(#kind in value)) {
			return undefined;
		}
		return value.#kind;
	}
}

/** Joins a message's lines, leaving out the parts that are absent. */
export function messageLines(lines: readonly (string | undefined)[]): string {
	return lines.filter(isPresent).join("\n");
}

function isPresent(line: string | undefined): line is string {
	return line !== undefined;
}

/** `Please file an issue at <url>`, or nothing without a URL. */
export function issueLine(issueUrl: URL | undefined): string | undefined {
	if (issueUrl === undefined) {
		return undefined;
	}
	return `Please file an issue at ${displayText(issueUrl)}`;
}
