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

_Limited by [19](#19-the-main-classes-leave-a-method-bivariance-gap): a
structural view of the main class can still widen `R`._

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

_Refined by 18: the vow now carries an `Outcome<R, E, unknown>`._

### 5. Attempt: how an attempt ended

`Attempt<out R, out E>` is `AlreadyHandled(residue) | Handled(residue) |
Failed(error)`. `issue.attempt(recovery)` returns `Vow<Attempt<R, E>>`. When
the recovery settles, the state is read again: if the issue is already
handled, the result is `AlreadyHandled(thatResidue)` whatever this attempt's
own result was; otherwise `Ok` switches the issue and gives `Handled`, and
`Err` gives `Failed`. Between concurrent attempts, the first to finish wins.

_Refined by 18: a fourth variant, `Panicked(payload)`._

### 6. `orElse` drops the first error

`orElse(self, next)` tries `next` when `self` fails, and drops `self`'s error,
like Rust's `Result::or_else`. `firstOf` behaves as `orElse` folded over
its list, and `retry` keeps the last error the same way. Both run their
recoveries in one loop of their own (decision 16) rather than nesting
`orElse`.

_Renamed by [21](#21-or-takes-a-recovery-orelse-builds-one-from-the-error):
this combinator is now `or`, and `orElse` builds the next from the error._

_Refined by [20](#20-orelse-and-firstof-take-the-wider-residue-without-a-union):
the composite takes the wider residue._

### 7. Severity is not on the issue

Whether to panic, log or fail is a property of the place that treats the
issue.

### 8. Three main/mini features, no root export

`issue`, `recovery` and `attempt` each have a generated main (method
chaining) and a mini barrel. There is no root `.` export, because names like
`map` clash across features, as in `@sekhmet/enum`.

_Extended by [17](#17-issue-predicates-are-booleans-narrow-the-state-snapshot):
`IssueState` is now a fourth feature, `state`._

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

_Refined by [18](#18-a-panic-in-an-async-repair-goes-to-the-panic-hook-and-settles-as-panicked):
a `Panic` rejection is reported, and settles as `Panicked`, not as an `Err`._

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

### 17. Issue predicates are booleans; narrow the state snapshot

2026-11-20. `isUnhandled`, `isHandled` and their `…And` forms on an `Issue`
return a plain `boolean`, not a type guard. Handling replaces the issue's
state in place, and TypeScript keeps a narrowing on a `const` across
`await`s and calls, so a guard on the issue would go stale once an attempt
switched it in between. Invariance in `R` also rules out a guard such as
`self is Issue<T, never>`.

A state read with `state()` is an immutable snapshot (handling assigns a new
`IssueState`, never mutates one), so narrowing it is sound. `IssueState` and
`IssueStateVariants` moved to their own main/mini feature, `state`
(`@sekhmet/issue/state`), whose `isUnhandled` and `isHandled` are type
guards in the shape of `isSome`/`isOk` and Attempt's predicates
(`self is Enum<Isolate<IssueStateVariants<T, R>, "Unhandled">> &
IssueState<T, R>`). They narrow the variant only: the type parameters stay,
since a state is invariant. Its `isUnhandledAnd` and `isHandledAnd` are
guards of the same type: they narrow the variant, and take a plain boolean
predicate, since a type-guard predicate couldn't narrow an invariant
parameter (owner's choice, 2026-11-21; the first cut returned a plain
`boolean`). A separate feature keeps the names, which clash with Issue's
predicates. The main `Issue.state()` returns the main `IssueState`, so
`notFound.state().isUnhandled()` narrows. Pre-1.0, the move is clean: the
`issue` feature no longer exports `IssueState`.

Refined 2026-11-21 (the owner's call, #104): a guard's false branch
removes the guarded type, so an `…And` guard collapsed an already-narrowed
state to `never` when its predicate failed, though it was still a live
`Unhandled` state. IssueState's and Attempt's `…And` forms are now
overloaded: on a value already narrowed to their variant they return a
plain `boolean`, keeping it in both branches; on any other value they
narrow as before. gen-main learned to take such a narrowed receiver as a
method's `this` parameter and to keep overloaded guards. `@sekhmet/enum`'s
`…And` forms have the same hole, tracked in #104.

### 18. A panic in an async repair goes to the panic hook, and settles as `Panicked`

2026-11-21, the owner's call. `fromPromise` carried every rejection as
`Err(reason)`, so a `Panic` thrown in an async repair was an ordinary
failure that `orElse` and `firstOf` moved past. Now a rejection whose reason
is a `Panic` (`instanceof Panic`) unwinds to a `panics.catchUnwind`
boundary around the `then` callback, the top of the async task, as vow's
`fromPromise` treats a throwing dependent there; the hook reports it,
unless this runtime already did. Every other rejection stays `Err`.

Reversed 2026-11-21, the owner's call: after reporting, the recovery's vow
settles with the boundary's `Panicked(payload)`. _First cut: the vow stayed
pending for good, like a panicked task that never returns. Reversed because
a vow that never settles means no answer has come, not an error state, and
because `@sekhmet/machine` settles a send whose handler panics as
`Panicked`, reporting it once._ So:

- A recovery's vow carries `Outcome<R, E, unknown>` (`Ok | Err | Panicked`,
  what a panic boundary returns) instead of `Result<R, E>`: `Recovery<T, R,
  E>` wraps `(value: T) => Vow<Outcome<R, E, unknown>>`, and `run` returns
  that vow. `succeed`, `fail` and `sync` (which still takes a
  `Result`-returning repair) give `Ok` and `Err`; only `fromPromise` gives
  `Panicked`. A synchronous throw from a repair still propagates to whoever
  ran it.
- `or`, `orElse`, `firstOf` and `retry` stop at `Panicked`: no fallback and
  no further runs, and they settle with it. `when`, `map`, `mapErr`,
  `andThen` and the inspectors pass it through. `andThen`'s step returns a
  vow of an `Outcome`, as a recovery does.
- `Attempt` gains a fourth variant, `Panicked(payload)`, with `isPanicked`,
  `isPanickedAnd` (the overload pair of 17) and `panicked()`. `isResolved`
  stays true only for `AlreadyHandled` and `Handled`. `map` and `mapErr`
  leave it alone. Every unwrap resumes it (throws the payload again), as
  `Outcome`'s do, and so does `toResult`, which has no room for it; the new
  `toOutcome` keeps it.
- `attempt` settles a `Panicked` outcome as `Panicked(payload)` and leaves
  the issue unhandled, even if another attempt handled it meanwhile: a bug
  is never hidden behind `AlreadyHandled`.
- `recoverWith` settles as `Outcome<R, Issue<T, R>, unknown>`: the panic
  resurfaces as `Panicked` rather than being swallowed into an `Err`. Its
  input stays a `Result`.

The panic is reported exactly once, as before. Nothing rejects, so no
unhandled rejection follows, unless the hook itself throws (see
`@sekhmet/vow`'s `fromPromise`): the boundary then throws
`Panic (PanicHook)` out of the `then` callback, by design. A `fromPromise`
built directly on vow's would have turned the rejection into an `Err`
first, so the recovery builds its vow itself, with the same boundaries.

### 19. The main classes leave a method-bivariance gap

2026-11-21. Mini `Issue<in out T, in out R>` is invariant, and so is the
generated main class, but TypeScript checks a method's parameters
bivariantly. A structural type with a wider residue, such as
`{ handle(residue: unknown): unknown }`, therefore accepts a main
`Issue<T, Config>`, and `view.handle("not a config")` type-checks, then
leaves the issue holding a string as its `Config`. The variance annotation
can't close it, since it governs only instantiations of the class itself.
The fix belongs in gen-main (emitting writers in a form checked
contravariantly), not in this package, and is tracked under
[#98](https://github.com/ben-laird/sekhmet/issues/98). Until then the docs
say to pass the class, not a structural view, and the mini free functions,
which take the class, have no such gap.

### 20. `orElse` and `firstOf` take the wider residue, without a union

2026-11-21, the owner's call. A recovery is covariant in its residue, so the
composite's residue is the wider of its parts', never `R | S`: a union of
residues couldn't be untangled again. Mini `orElse` and `firstOf` already
inferred it (`orElse(fail("x"), useDefault)` is a `Config` recovery, and
`number` with `Config` is a type error), but the main `orElse` method fixed
`R` from its class, so `fail("x").orElse(useDefault)` needed the `fail`
annotated. Mini `orElse` now takes `self: Recovery<T, R, unknown>`, since
`self`'s error is dropped anyway, and gen-main emits that receiver as a
`this` parameter (as for enum's receiver-constrained methods, #76):
`orElse<T, R, F>(this: Recovery<T, R, unknown>, next: mini.Recovery<T, R,
F>): Recovery<T, R, F>`. Both orders now infer, with no annotation.
`firstOf` needed no change: its tuple already infers the widest residue,
and rejects unrelated ones. (`orElse` here is today's `or`; see 21.)

### 21. `or` takes a recovery, `orElse` builds one from the error

2026-11-21, the owner's call. Recovery follows Rust's and `@sekhmet/enum`'s
`or`/`orElse` convention: `or` takes the next value itself, and `orElse`
produces it lazily from what failed. So the eager combinator of 6 and 20 is
renamed `or(self, next: Recovery<T, R, F>)`, with its typing unchanged
(pre-1.0, no alias), and a new `orElse(self, next: (error: E) =>
Recovery<T, R, F>)` builds the next recovery from `self`'s error, as
`Result.orElse` does. It passes the error only, not the value: the built
recovery already receives the value when it runs, and choosing by value is
`when`'s job.

`orElse` widens the residue the same way, with no union, in mini and main.
Its receiver passes distinct type parameters (`Recovery<T, R, E>`, since
`E` feeds the callback), which gen-main would make the class's, fixing `R`.
So gen-main gained a per-feature `constrained` list that forces the
`this`-parameter form, and recovery lists `orElse`:
`orElse<T, R, E, F>(this: Recovery<T, R, E>, next: (error: E) =>
mini.Recovery<T, R, F>): Recovery<T, R, F>`. `firstOf` stays an eager list.

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
