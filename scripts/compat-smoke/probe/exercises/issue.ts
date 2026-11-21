/**
 * Exercises `@sekhmet/issue`: an issue handled in place by a composed
 * recovery, sync and async (through `fromPromise` and a rejection that must
 * stay handled); concurrent attempts, where the first to finish wins;
 * `render` over a wrapped chain; `recoverWith`; and each feature through its
 * main entrypoint, its mini barrel and its single-module paths.
 *
 * @module
 */

import { unionKinds } from "@sekhmet/enum/core/mini";
import {
	Err,
	Ok,
	type Result,
	unwrap,
	unwrapErr,
} from "@sekhmet/enum/result/mini";
import { Failed, Handled } from "@sekhmet/issue/attempt";
import { isResolved, map as mapAttempt } from "@sekhmet/issue/attempt/mini";
import { toResult as attemptToResult } from "@sekhmet/issue/attempt/mini/accessors";
import { AlreadyHandled } from "@sekhmet/issue/attempt/mini/core";
import { isFailed } from "@sekhmet/issue/attempt/mini/predicates";
import { mapErr as mapAttemptErr } from "@sekhmet/issue/attempt/mini/transform";
import { unwrapOr } from "@sekhmet/issue/attempt/mini/unwrap";
import { issue } from "@sekhmet/issue/issue";
import { attempt, handle, issue as miniIssue } from "@sekhmet/issue/issue/mini";
import { code } from "@sekhmet/issue/issue/mini/accessors";
import { Issue } from "@sekhmet/issue/issue/mini/core";
import { recoverWith } from "@sekhmet/issue/issue/mini/handling";
import { isHandled } from "@sekhmet/issue/issue/mini/predicates";
import { render } from "@sekhmet/issue/issue/mini/render";
import { wrap } from "@sekhmet/issue/issue/mini/transform";
import { unwrapResidue } from "@sekhmet/issue/issue/mini/unwrap";
import { fail, type Recovery, succeed } from "@sekhmet/issue/recovery";
import { firstOf, orElse } from "@sekhmet/issue/recovery/mini";
import { retry } from "@sekhmet/issue/recovery/mini/combinators";
import {
	Recovery as MiniRecovery,
	run,
} from "@sekhmet/issue/recovery/mini/core";
import { fromPromise } from "@sekhmet/issue/recovery/mini/promise";
import { map as mapRecovery } from "@sekhmet/issue/recovery/mini/transform";
import { IssueState } from "@sekhmet/issue/state";
import { IssueState as MiniIssueState } from "@sekhmet/issue/state/mini/core";
import { definePanicRuntime } from "@sekhmet/panic";
import { vowWithResolver, wait } from "@sekhmet/vow";
import { expectEqual } from "../check.ts";

interface Config {
	readonly port: number;
}

function notFound(path: string): Issue<string, Config> {
	return miniIssue<string, Config>({
		value: path,
		code: "config/NotFound",
		message: `No config file at \`${path}\`.`,
		hint: "Create one.",
	});
}

async function exerciseMain(): Promise<void> {
	const subject = issue<string, Config>({
		value: "app.json",
		code: "config/NotFound",
		message: "No config file.",
	});
	const before = subject.state();
	const readBackup: Recovery<string, Config, string> = fail("no backup");
	const ended = await wait(
		subject.attempt(readBackup.orElse(succeed({ port: 8080 }))),
	);
	expectEqual({
		label: "main Issue attempts a main Recovery, and switches in place",
		actual: [
			ended.isHandled(),
			subject.residue().unwrap(),
			subject.isHandled(),
			Handled(1)
				.map((n) => n + 1)
				.unwrap(),
			Failed("offline")
				.mapErr((e) => e.length)
				.error()
				.unwrap(),
		],
		expected: [true, { port: 8080 }, true, 2, 7],
	});
	expectEqual({
		label: "main state() is a main IssueState snapshot, left as it was",
		actual: [
			before instanceof IssueState,
			before instanceof MiniIssueState,
			unionKinds(before),
			unionKinds(subject.state()),
		],
		expected: [true, true, "Unhandled", "Handled"],
	});
}

async function exerciseMini(): Promise<void> {
	const panics = definePanicRuntime();
	const remote = fromPromise({
		repair: async (path: string): Promise<Config> => {
			await Promise.resolve();
			if (path === "remote.json") return { port: 9000 };
			throw new Error("offline");
		},
		panics,
	});
	const rejected = await wait(run(remote, "app.json"));
	const fetched = await wait(run(remote, "remote.json"));
	const viaRemote = notFound("remote.json");
	const remoteEnded = await wait(
		attempt(
			viaRemote,
			mapRecovery(retry(remote, { times: 1 }), (c) => c),
		),
	);
	expectEqual({
		label: "fromPromise carries fulfilment as Ok and a rejection as Err",
		actual: [
			unwrap(fetched),
			unwrapErr(rejected) instanceof Error,
			isResolved(remoteEnded),
			unwrapResidue(viaRemote),
		],
		expected: [{ port: 9000 }, true, true, { port: 9000 }],
	});

	const raced = notFound("app.json");
	const slow = vowWithResolver<Result<Config, string>>();
	const first = attempt(raced, new MiniRecovery((_: string) => slow.vow));
	handle(raced, { port: 1 });
	slow.resolve(Ok({ port: 2 }));
	const lost = await wait(first);
	expectEqual({
		label: "the first to finish handles the issue",
		actual: [
			unionKinds(lost),
			unwrap(attemptToResult(lost)),
			isFailed(mapAttemptErr(lost, String)),
			unwrapOr(
				mapAttempt(lost, (c) => c.port),
				0,
			),
			unionKinds(AlreadyHandled(1)),
		],
		expected: ["AlreadyHandled", { port: 1 }, false, 1, "AlreadyHandled"],
	});

	const cause = notFound("app.json");
	const top = wrap(cause, { code: "config/LoadFailed", message: "No config." });
	expectEqual({
		label: "render follows a wrapped chain",
		actual: [render(top), code(top), cause instanceof Issue],
		expected: [
			[
				"config/LoadFailed: No config.",
				"caused by config/NotFound: No config file at `app.json`.",
				"  hint: Create one.",
			].join("\n"),
			"config/LoadFailed",
			true,
		],
	});

	const loaded = await wait(
		recoverWith(
			Err<Config, Issue<string, Config>>(notFound("app.json")),
			firstOf([
				fail<string, string>("no"),
				succeed<string, Config>({ port: 3 }),
			]),
		),
	);
	const failing: Recovery<string, Config, string> = fail("no");
	const recovered = notFound("app.json");
	await wait(attempt(recovered, orElse(failing, succeed({ port: 4 }))));
	expectEqual({
		label: "recoverWith turns a handled Err into Ok",
		actual: [unwrap(loaded), isHandled(recovered)],
		expected: [{ port: 3 }, true],
	});
}

/** Runs the exercise. */
export async function exercise(): Promise<void> {
	await exerciseMain();
	await exerciseMini();
}
