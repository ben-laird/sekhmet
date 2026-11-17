/**
 * `todo` and `unimplemented`: panics that mark code that does not exist.
 * `todo` is work still to do; `unimplemented` is a path deliberately left
 * unsupported. Both describe the work with an optional description, a
 * tracking URL and a checklist of subtasks.
 *
 * @module
 */

import type { Panic } from "@sekhmet/panic/mini/core";
import {
	flagField,
	guardedMessage,
	listField,
	textField,
	urlField,
} from "../workflow-panic/read.ts";
import {
	messageLines,
	WorkflowPanic,
	type WorkflowPanicKind,
} from "../workflow-panic/workflow-panic.ts";

/** One item of a {@linkcode todo}'s or {@linkcode unimplemented}'s checklist. */
export interface Subtask {
	/** What the subtask does */
	readonly description: string;
	/** Whether it is done; absent means not done */
	readonly complete?: boolean;
}

/** What {@linkcode todo} is given about the missing work. Every part is optional. */
export interface TodoOptions {
	/** What is missing */
	readonly description?: string;
	/** The checklist of subtasks, rendered `- [x]` when complete, else `- [ ]` */
	readonly subtasks?: readonly Subtask[];
	/** Where the work is tracked, such as an issue */
	readonly trackingUrl?: URL;
}

/** What {@linkcode unimplemented} is given; the same shape as {@linkcode TodoOptions}. */
export type UnimplementedOptions = TodoOptions;

/**
 * The cause of the panic {@linkcode todo} throws: its options, with absent
 * parts as `undefined` and an absent checklist as `[]`.
 */
export interface TodoCause {
	/** What is missing, if given */
	readonly description: string | undefined;
	/** The checklist, empty when none was given */
	readonly subtasks: readonly Subtask[];
	/** Where the work is tracked, if given */
	readonly trackingUrl: URL | undefined;
}

/** The cause of the panic {@linkcode unimplemented} throws; the same shape as {@linkcode TodoCause}. */
export type UnimplementedCause = TodoCause;

/**
 * Panics as `Panic (Todo)`: this code path is not written yet, but will be.
 * Use it as a placeholder while building; `deno task ci` rejects importing it in
 * published package source.
 *
 * The message opens with a header line, then the description with its
 * tracking URL, then the checklist; absent parts leave no line behind:
 *
 * ```txt
 * a code path that is not implemented yet was executed
 * Todo: parse the config file (tracked at https://example.com/issues/1)
 *   - [x] read the file
 *   - [ ] validate it
 * ```
 *
 * @param options What is missing, all optional
 * @returns Never; it always panics
 *
 * @example
 * ```ts
 * import { isTodoPanic, todo } from "@sekhmet/workflow/todo";
 * import { assert, assertEquals, assertThrows } from "@std/assert";
 *
 * function parseConfig(_text: string): Record<string, string> {
 *   return todo({
 *     description: "parse the config file",
 *     subtasks: [{ description: "read the file", complete: true }],
 *   });
 * }
 *
 * const thrown = assertThrows(() => parseConfig("port = 80"));
 * assert(isTodoPanic(thrown));
 * assertEquals(thrown.name, "Panic (Todo)");
 * assertEquals(thrown.cause.description, "parse the config file");
 * ```
 */
export function todo(options: TodoOptions = {}): never {
	throw workPanic({ kind: "Todo", options });
}

/**
 * Panics as `Panic (Unimplemented)`: this code path is deliberately not
 * supported, and is not planned. Unlike {@linkcode todo}, it may ship.
 *
 * The message has the same layout as {@linkcode todo}'s:
 *
 * ```txt
 * a code path that is deliberately not implemented was executed
 * Unimplemented: writing to a read-only store
 * ```
 *
 * @param options What is not supported, all optional
 * @returns Never; it always panics
 *
 * @example
 * ```ts
 * import {
 *   isUnimplementedPanic,
 *   unimplemented,
 * } from "@sekhmet/workflow/todo";
 * import { assert, assertEquals, assertThrows } from "@std/assert";
 *
 * const readOnlyStore = {
 *   get: (key: string): string => key,
 *   set: (_key: string, _value: string): void => {
 *     unimplemented({ description: "writing to a read-only store" });
 *   },
 * };
 *
 * const thrown = assertThrows(() => readOnlyStore.set("a", "b"));
 * assert(isUnimplementedPanic(thrown));
 * assertEquals(
 *   thrown.message,
 *   "a code path that is deliberately not implemented was executed\n" +
 *     "Unimplemented: writing to a read-only store",
 * );
 * ```
 */
export function unimplemented(options: UnimplementedOptions = {}): never {
	throw workPanic({ kind: "Unimplemented", options });
}

/**
 * Whether `value` is the panic {@linkcode todo} throws. It runs no Proxy trap,
 * and a `Panic` built by hand with the same name is not one.
 *
 * @param value Any caught value
 * @returns True if `todo` threw `value`, narrowing it to `Panic<TodoCause>`
 *
 * @example
 * ```ts
 * import { definePanicRuntime } from "@sekhmet/panic";
 * import { isTodoPanic, todo } from "@sekhmet/workflow/todo";
 * import { assertEquals } from "@std/assert";
 *
 * const runtime = definePanicRuntime();
 * const unfinished: string[] = [];
 * runtime.setHook(({ payload }) => {
 *   if (isTodoPanic(payload)) unfinished.push(payload.cause.description ?? "");
 * });
 *
 * runtime.catchUnwind(() => todo({ description: "retry on timeout" }));
 *
 * assertEquals(unfinished, ["retry on timeout"]);
 * ```
 */
export function isTodoPanic(value: unknown): value is Panic<TodoCause> {
	return WorkflowPanic.kindOf(value) === "Todo";
}

/**
 * Whether `value` is the panic {@linkcode unimplemented} throws. It runs no
 * Proxy trap, and a `Panic` built by hand with the same name is not one.
 *
 * @param value Any caught value
 * @returns True if `unimplemented` threw `value`, narrowing it to
 *   `Panic<UnimplementedCause>`
 *
 * @example
 * ```ts
 * import {
 *   isTodoPanic,
 *   isUnimplementedPanic,
 *   unimplemented,
 * } from "@sekhmet/workflow/todo";
 * import { assert, assertFalse, assertThrows } from "@std/assert";
 *
 * const thrown = assertThrows(() => unimplemented());
 *
 * assert(isUnimplementedPanic(thrown));
 * assertFalse(isTodoPanic(thrown));
 * ```
 */
export function isUnimplementedPanic(
	value: unknown,
): value is Panic<UnimplementedCause> {
	return WorkflowPanic.kindOf(value) === "Unimplemented";
}

/** The header line of each kind of missing work. */
const HEADERS = {
	Todo: "a code path that is not implemented yet was executed",
	Unimplemented:
		"a code path that is deliberately not implemented was executed",
} as const satisfies Record<WorkKind, string>;

type WorkKind = Extract<WorkflowPanicKind, "Todo" | "Unimplemented">;

function workPanic({
	kind,
	options,
}: {
	kind: WorkKind;
	options: TodoOptions;
}): WorkflowPanic<TodoCause> {
	const cause: TodoCause = {
		description: textField({ from: options, key: "description" }),
		subtasks: listField({ from: options, key: "subtasks" }).map(subtaskOf),
		trackingUrl: urlField({ from: options, key: "trackingUrl" }),
	};
	return new WorkflowPanic({
		kind,
		message: guardedMessage({
			header: HEADERS[kind],
			build: () => workMessage({ kind, cause }),
		}),
		cause,
	});
}

/** A subtask copied out of the caller's checklist, read without throwing. */
function subtaskOf(item: unknown): Subtask {
	return {
		description: textField({ from: item, key: "description" }) ?? "",
		complete: flagField({ from: item, key: "complete" }),
	};
}

function workMessage({
	kind,
	cause: { description, subtasks, trackingUrl },
}: {
	kind: WorkKind;
	cause: TodoCause;
}): string {
	const hidden = subtasks.length - MAX_SUBTASK_LINES;
	return messageLines([
		HEADERS[kind],
		workLine({ kind, description, trackingUrl }),
		...subtasks.slice(0, MAX_SUBTASK_LINES).map((subtask) => {
			return `  - [${subtask.complete ? "x" : " "}] ${subtask.description}`;
		}),
		hidden > 0 ? `  … ${hidden} more subtasks` : undefined,
	]);
}

/** How many subtasks a message lists; the cause keeps them all. */
const MAX_SUBTASK_LINES = 50;

/** `Todo: <description> (tracked at <url>)`, `Tracked at <url>`, or nothing. */
function workLine({
	kind,
	description,
	trackingUrl,
}: {
	kind: WorkKind;
	description: string | undefined;
	trackingUrl: URL | undefined;
}): string | undefined {
	const url = trackingUrl?.href;
	if (description === undefined) {
		return url === undefined ? undefined : `Tracked at ${url}`;
	}
	const suffix = url === undefined ? "" : ` (tracked at ${url})`;
	return `${kind}: ${description}${suffix}`;
}
