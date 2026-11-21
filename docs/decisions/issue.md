# Issue design

> The decision record for `@sekhmet/issue`, kept as project history. The user
> docs are the package's [README](../../packages/issue/README.md) and its
> [`docs/`](../../packages/issue/docs/) pages, and the API reference is on
> [JSR](https://jsr.io/@sekhmet/issue/doc).

Status: **Proposed** (2026-11-20). The first implementation is on the
`feat/issue` branch, for review.
[#93](https://github.com/ben-laird/sekhmet/issues/93) is the tracker; this
file is the source of truth for the decisions.

`@sekhmet/issue` is a batteries-included answer to "what goes inside a
panic?", and inside an `Err`: issues that describe a problem, and typed
recoveries that handle them. It was inspired by Erika Florist's
[What's in a good error](https://erika.florist/articles/gooderrors/)
(Astro's error system).

The decisions are numbered in the order they were made. Later ones refine or
replace earlier ones; where they do, the earlier text stays, marked
_superseded_ with a link to its successor.

## Decisions (owner, 2026-11-20)

The design grew from the owner's `playground/start.test.ts` sketch, whose
semantics the package keeps exactly. Simple constructs build complex ones
through generics of generics, which is Sekhmet's philosophy.

### 1. An issue is one occurrence, with a state that switches in place

`Issue<T, R>` has a permanent `code`, a `message`, an optional `hint` and
`docs` link (plain optional fields, not `Option`s), and a state:
`Unhandled(value: T)` or `Handled(residue: R)`. Handling switches the state in
place and never back. The value is the typed facts about the problem; the
residue is what handling yields.

### 2. Issue is invariant

`Issue<in out T, in out R>` is invariant because it changes in place: a
widened view could otherwise write the wrong residue
([#98](https://github.com/ben-laird/sekhmet/issues/98)). A `@ts-expect-error`
test keeps it so.

### 3. A cause is part of `T`, not a field

An issue caused by another holds it in its value, as in
`Issue<{ cause: Issue<Path, Config> }, Config>`. `wrap` builds that shape and
`render` follows it.

### 4. A recovery is a typed repair

`Recovery<T, R, E>` is a `Struct` wrapping `(value: T) => Vow<Result<R, E>>`,
built with `new Recovery(fn)`. It can be sync or async; a sync one returns an
already-resolved vow. Its type decides which issues it fits, so it never
needs to decline at runtime. There is no `recovery()` helper: the owner
removed it on purpose.

### 5. Attempt: how an attempt ended

`Attempt<out R, out E>` is `AlreadyHandled(residue) | Handled(residue) |
Failed(error)`. `issue.attempt(recovery)` returns `Vow<Attempt<R, E>>`. When
the recovery settles, the state is read again: if the issue is already
handled, the result is `AlreadyHandled(thatResidue)` whatever this attempt's
own result was; otherwise `Ok` switches the issue and gives `Handled`, and
`Err` gives `Failed`. Between concurrent attempts, the first to finish wins.

### 6. `orElse` drops the first error

`orElse(self, next)` tries `next` when `self` fails, and drops `self`'s error,
like Rust's `Result::or_else`. `firstOf` behaves as `orElse` folded over
its list, and `retry` keeps the last error the same way. Both run their
recoveries in one loop of their own (decision 16) rather than nesting
`orElse`.

### 7. Severity is not on the issue

Whether to panic, log or fail is a property of the place that treats the
issue.

### 8. Three main/mini features, no root export

`issue`, `recovery` and `attempt` each have a generated main (method
chaining) and a mini barrel. There is no root `.` export, because names like
`map` clash across features, as in `@sekhmet/enum`.

## Decisions taken while building v1 (2026-11-20, for review)

These weren't settled by the issue; each is open to the owner's review.

### 9. `firstOf` takes a non-empty list

`firstOf(recoveries)` takes `readonly [Recovery<T, R, E>, ...Recovery<T, R,
E>[]]`, so `firstOf([])` doesn't type-check: with nothing to try there is no
error to fail with. The alternatives were an `Option<E>` error (`None` for an
empty list) or a dedicated "nothing tried" error, both of which would burden
every non-empty call with a case it can't hit.

### 10. `fromPromise` mirrors vow's contract

`fromPromise({ repair, panics })` takes a `(value: T) => Promise<R>` and
gives `Recovery<T, R, unknown>`: fulfilment is `Ok(residue)`, and a rejection
is `Err(reason)` typed `unknown`, as `@sekhmet/vow`'s `fromPromise` does (it
is built on it). The rejection is always handled, and a dependent that
throws is reported to the panic runtime's hook. A synchronous throw from
`repair` is a bug and propagates.

### 11. `retry`'s `times` counts retries

`retry(self, { times })` runs `self` at most `times + 1` times: `times` is
how many more runs follow a failure, so `times: 0` is `self`. It keeps the
last error. A `times` that isn't a non-negative integer panics
(`InvalidRetryTimes`) when the recovery is built.

### 12. `wrap` always starts unhandled

`wrap(self, wording)` returns a new, unhandled issue whose value is
`Wrapped<T, R>` (`{ readonly cause: Issue<T, R> }`), whatever the state of
its cause. Handling one never handles the other.

### 13. `render` stops at a handled issue and at a repeat

A handled issue no longer holds its value, so `render` can't follow its
cause, and the chain stops there. The chain also stops at an issue already
printed, so a cycle prints each issue once. Handled issues are marked
`(handled)` after their code.

### 14. Unwrapping panics through `@sekhmet/panic`

A failing `expectResidue`/`unwrapResidue` and an attempt's `expect`,
`unwrap`, `expectFailed` and `unwrapFailed` throw a `Panic` (via `panic()`)
with the issue or attempt as its cause, and the messages follow Option's and
Result's (`"Issue unwrap failed!"`, `"Attempt unwrap failed!"`). Option and
Result throw a plain `Error`; a `Panic` is an `Error`, so `assertThrows(…,
Error, …)` holds for both.

### 15. Attempt's `inspect` and `inspectErr` return the attempt

As Option's `inspect` and Issue's do, rather than `void` as Result's do, so
they chain in main.

### 16. `firstOf` and `retry` loop instead of nesting

Built as nested `orElse`/`andThen` vows, `retry(…, { times: 1000 })` and a
`firstOf` list of about 10k overflowed the stack, since each sync run nested
another vow (found in review, 2026-11-20). Both now run through one loop:
it carries on while each run's vow is already resolved, and subscribes only
to a pending one, resuming the loop when it settles. A sync run still
settles at once, and neither a long sync nor a long async run nests the
stack.

## Later

JSON rendering, restarts ([#94](https://github.com/ben-laird/sekhmet/issues/94)),
and a collection of issues if one is needed. Schema keeps its own `Issues`
([#95](https://github.com/ben-laird/sekhmet/issues/95)).

## Considered and dropped (2026-11-20)

- **The first sketch:** `Issue<K>` wrapping a per-domain `Enum`, with a
  separate wording table, traits, `Recovery<Accepts, T, Leaves>` and a
  catalog. It needed casts, phantom types and too much machinery.
- **The second sketch:** issue definitions (`defineIssue<P, R>`) with wording
  rendered from the payload, and untyped recoveries that took any issue and
  could decline. Recoveries couldn't say what they resolved to, and only a
  definition could resolve its own issues. The owner found it unwieldy.
- **An aggregate issue:** issues managed together form a collection, not an
  issue.

## Prior art

- **The owner's earlier attempts:** red-sandbox `archive/src/issue`
  (`Issue<U, H>` as Handled/Unhandled, the closest ancestor);
  `@red/problem`, `@red/workflow`'s `Panic<T, M>`, `@red/issue`; dv's
  `CliError`, maat's assists, `@sekhmet/schema`'s `SchemaIssue`.
- **Rust:** miette, rustc diagnostics, snafu, error-stack, `Result::or_else`.
- **TypeScript:** Astro's `AstroError`, Effect (`catchTag`), Zod, Valibot and
  ArkType issues, neverthrow.
- **Other languages:** Zig's error codes, Swift's `RecoverableError`, Common
  Lisp's conditions and restarts.
