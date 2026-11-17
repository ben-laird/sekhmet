/**
 * The panic every invariant check throws: one header, the expected behavior,
 * a line per offending value of the check that failed, and the issue URL.
 *
 * @module
 */

import { guardedMessage, textField, urlField } from "../workflow-panic/read.ts";
import {
	issueLine,
	messageLines,
	WorkflowPanic,
} from "../workflow-panic/workflow-panic.ts";
import type { InvariantCause, InvariantCheck } from "./invariant.ts";

/**
 * Panics as `Panic (Invariant)` for the failed `check`, reading the expected
 * behavior and issue URL off the caller's `options` without throwing.
 *
 * @param params.check Which check failed, with its offending value(s)
 * @param params.options The caller's options, typed or not
 * @returns Never; it always panics
 */
export function violated({
	check,
	options,
}: {
	check: InvariantCheck;
	options: unknown;
}): never {
	const expectedBehavior =
		textField({ from: options, key: "expectedBehavior" }) ?? NOT_GIVEN;
	const issueUrl = urlField({ from: options, key: "issueUrl" });
	throw new WorkflowPanic<InvariantCause>({
		kind: "Invariant",
		message: guardedMessage({
			header: HEADER,
			build: () => {
				return messageLines([
					HEADER,
					`Expected behavior: ${expectedBehavior}`,
					...checkLines(check),
					issueLine(issueUrl),
				]);
			},
		}),
		cause: { check, expectedBehavior, issueUrl },
	});
}

/** The lines a failed check adds to the message, after the expected behavior. */
function checkLines(check: InvariantCheck): readonly string[] {
	switch (check.kind) {
		case "condition": {
			return [];
		}
	}
}

const HEADER = "an invariant was violated";

/** The expected behavior shown when an untyped caller gave none. */
const NOT_GIVEN = "(not given)";
