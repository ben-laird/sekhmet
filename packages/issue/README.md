# @sekhmet/issue

Issues that describe a problem, and typed recoveries that handle them. An
`Issue` is one occurrence of something going wrong: a permanent `code`, a
`message`, an optional `hint` and `docs` link, and a state that switches in
place, once, from `Unhandled(value)` to `Handled(residue)`. A `Recovery` is a
typed repair, sync or async, that turns an issue's value into its residue.
Attempting one ends in an `Attempt`: `Handled`, `AlreadyHandled` or `Failed`.

It answers "what goes inside a panic?", and inside an `Err`. It was inspired
by Erika Florist's
[What's in a good error](https://erika.florist/articles/gooderrors/).

## Install

The package is published on [JSR](https://jsr.io/@sekhmet/issue).

```sh
deno add jsr:@sekhmet/issue
```

For Node.js, Bun and other npm-compatible runtimes, install through JSR's npm
compatibility layer:

```sh
npx jsr add @sekhmet/issue      # npm
pnpm dlx jsr add @sekhmet/issue # pnpm
yarn dlx jsr add @sekhmet/issue # yarn
bunx jsr add @sekhmet/issue     # bun
```

## Example

```ts
import { issue } from "@sekhmet/issue/issue";
import { fail, succeed } from "@sekhmet/issue/recovery";
import { wait } from "@sekhmet/vow";
import { assertEquals } from "@std/assert";

interface Config {
	readonly port: number;
}

const notFound = issue<{ readonly path: string }, Config>({
	value: { path: "app.json" },
	code: "config/NotFound",
	message: "No config file at `app.json`.",
	hint: "Create one, or run with the default config.",
});

const useDefault = fail("`app.bak` can't be read.").or(succeed({ port: 8080 }));

const ended = await wait(notFound.attempt(useDefault));

assertEquals(ended.isHandled(), true);
assertEquals(notFound.unwrapResidue(), { port: 8080 });
assertEquals(
	notFound.render(),
	[
		"config/NotFound (handled): No config file at `app.json`.",
		"  hint: Create one, or run with the default config.",
	].join("\n"),
);
```

## API

There is no root export, since names like `map` clash across features.
Import a feature: `@sekhmet/issue/issue`, `@sekhmet/issue/state`,
`@sekhmet/issue/recovery` or `@sekhmet/issue/attempt` for method chaining, or
its `/mini` barrel (and `/mini/<module>`) for tree-shakable free functions.

| Export                                              | Does                                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------ |
| `issue({ value, code, message, hint?, docs? })`     | a new, unhandled `Issue<T, R>`                                           |
| `code`, `message`, `hint`, `docs`, `state`          | read the wording, and the current `IssueState`                           |
| `value`, `residue`                                  | `Some` while unhandled, or once handled                                  |
| `isUnhandled(And)`, `isHandled(And)`                | test the issue (a boolean) or its state snapshot (narrows the variant)   |
| `attempt(issue, recovery)`                          | a `Vow<Attempt>`; switches the issue in place on success                 |
| `handle(issue, residue)`                            | handles it directly: `Handled`, or `AlreadyHandled`                      |
| `expectResidue`, `unwrapResidue`, `residueOr(Else)` | get the residue out; the first two panic while unhandled                 |
| `toResult`, `wrap`, `render`, `recoverWith`         | as a `Result`; as a new issue's cause; as text; recover an `Err`'s issue |
| `new Recovery(fn)`, `succeed`, `fail`, `sync`       | build a recovery, `(value: T) => Vow<Result<R, E>>`                      |
| `fromPromise({ repair, panics })`                   | a recovery from a promise; a rejection is `Err`, a `Panic` is reported   |
| `run`, `or(Else)`, `firstOf`, `retry`, `when`       | run and compose recoveries; `orElse` builds the next from the error      |
| `map`, `mapErr`, `andThen`, `mapInput`, `inspect*`  | transform a recovery's residue, error, or the value it repairs           |
| `AlreadyHandled`, `Handled`, `Failed`               | the `Attempt<R, E>` variants                                             |
| `isAlreadyHandled`, `isHandled`, `isFailed`, …      | test an attempt; `isResolved` is either handled variant                  |
| `residue`, `error`, `toResult`, `unwrap`, …         | read and unwrap an attempt                                               |

## Learn more

- **Tutorial:** [Getting started](./docs/getting-started.md) builds a config
  loader step by step: an issue for a missing file, a default, a backup to
  try first, a remote fetch, and a load failure that wraps the cause.
- **How-to guides:** [Recipes](./docs/recipes.md) for trying recoveries in
  order, retrying a flaky one, recovering only some values, recovering the
  cause of a wrapped issue, recovering an `Err`, handling an issue without a
  recovery, narrowing an issue's state, and rendering an issue for a person.
- **Explanation:** [Concepts](./docs/concepts.md) covers issues, residues and
  the in-place switch, why the predicates narrow the state and not the
  issue, why an issue is invariant, why a cause lives in the
  value, how concurrent attempts settle, and why severity is not on the
  issue.
- **Reference:** the [API reference on JSR](https://jsr.io/@sekhmet/issue/doc)
  documents every export.

The guides are also on the
[docs site](https://ben-laird.github.io/sekhmet/issue/).

## Design record

The
[decision record](https://github.com/ben-laird/sekhmet/blob/main/docs/decisions/issue.md)
keeps the history of the package's design decisions and the alternatives they
replaced.

## License

MIT. See
[LICENSE.md](https://github.com/ben-laird/sekhmet/blob/main/packages/issue/LICENSE.md).
