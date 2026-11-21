---
kind: explanation
---

# Concepts

The ideas behind `@sekhmet/issue`, and why issues behave the way they do. The
[recipes](./recipes.md) show how to put them to work, and the
[API reference on JSR](https://jsr.io/@sekhmet/issue/doc) documents each
export. The
[decision record](https://github.com/ben-laird/sekhmet/blob/main/docs/decisions/issue.md)
keeps the history behind each choice.

## An issue is one occurrence

An `Issue<T, R>` describes one thing that went wrong, once. Its words are for
people: a `code` that never changes (`config/NotFound`), a `message`, and an
optional `hint` and `docs` link. Its **value**, of type `T`, is for code: the
typed facts about the problem, such as the path that was missing.

The issue doesn't say how bad it is. Whether to panic, log, retry or fail is
a property of the place that treats the issue, not of the issue itself: the
same missing file is fatal to one program and routine to another.

## Handling yields a residue, in place

An issue is either `Unhandled(value)` or `Handled(residue)`. The **residue**,
of type `R`, is what handling yields: for a missing config, the config to use
instead. Handling switches the issue's state **in place**, once, and it never
switches back. Everyone holding the issue sees the switch, and nobody needs a
new value threaded back to them.

Handling drops the value: a handled issue holds its residue only. So
`value()` is `Some` only while the issue is unhandled, and `residue()` only
once it is handled. `state()` reads a snapshot, which handling leaves as it
was.

## Why an issue is invariant

Most Sekhmet enums, like `Result` and `Attempt`, are covariant: an
`Attempt<number, never>` fits where an `Attempt<number, string>` is
expected. An issue can't be, because it changes in place. If an
`Issue<Path, Config>` could be viewed as an `Issue<Path, unknown>`, handling
it through that view could write any residue, and the holder of the original
would read something that isn't a `Config`. So `Issue` is invariant in both
`T` and `R` (written `in out`), and the widening doesn't type-check. Rust
makes `&mut T` invariant for the same reason; see #98 for the same hole in
`Option` and `Latch`.

## A recovery is a typed repair

A `Recovery<T, R, E>` wraps `(value: T) => Vow<Result<R, E>>`. Its type says
which issues it fits: those whose value is a `T` and whose residue is an `R`.
So it never needs to look at an issue and decline at runtime; the compiler
already checked that it applies.

A recovery can be sync or async. A sync one returns an already-resolved
`Vow`, so attempting it settles at once, in the same call stack, with no
microtask. `sync`, `succeed` and `fail` build sync ones; `fromPromise` builds
an async one, and carries a rejection as an `Err`, as `@sekhmet/vow`'s
`fromPromise` does, so a rejection is never unhandled.

Recoveries compose like `Result`s do. `orElse` tries the next when one fails,
and drops the first error, like Rust's `Result::or_else`. `firstOf` behaves
as `orElse` folded over a list, and `retry` runs one again, keeping the last
error. Both run their recoveries in a loop that doesn't nest the stack, so a
long list or a large `times` is safe, sync or async. `map`, `mapErr` and
`andThen` change what it yields, and `mapInput` changes what it repairs.

`orElse` keeps the residue type of the recovery it is called on. A recovery
built with `fail` yields no residue (`never`), so give it the residue type it
stands in for, as in
`const readBackup: Recovery<Path, Config, string> = fail("…")`, before
calling `.orElse(succeed(config))` on it.

## How an attempt ends

`attempt(issue, recovery)` returns a `Vow<Attempt<R, E>>`:

- **`Handled(residue)`:** this attempt handled the issue, which switched in
  place;
- **`AlreadyHandled(residue)`:** the issue was handled before this attempt,
  or by another attempt that finished first;
- **`Failed(error)`:** the recovery failed, and the issue stays unhandled.

A handled issue doesn't run the recovery at all. An unhandled one runs it on
its value and, when it settles, **reads the state again**. Between attempts
running at the same time, the first to finish wins: a later success reports
`AlreadyHandled` with the winner's residue, and so does a later failure,
since the issue is handled either way.

`handle(issue, residue)` is an attempt with no recovery: `Handled`, or
`AlreadyHandled` if the issue already was.

## A cause lives in the value

An issue has no `cause` field. An issue caused by another holds it in its
value, as in `Issue<{ readonly cause: Issue<Path, Config> }, Config>`. The
cause is then typed like any other fact, recoveries can reach it, and an
issue with no cause pays nothing for the possibility. `wrap` builds that
shape, starting a new, unhandled issue whatever the state of its cause, and
`render` follows a `cause` that is an issue down the chain while each issue
is unhandled, printing each issue once.

Handling a wrapper never handles its cause, or the other way round. To
recover a wrapper through its cause, attempt the cause inside the wrapper's
recovery and hand its residue up (see the recipes).

## Unwrapping panics

`expectResidue` and `unwrapResidue` (and an attempt's `expect`, `unwrap`,
`expectFailed` and `unwrapFailed`) throw a `Panic` from `@sekhmet/panic` when
the value isn't there, with the issue or attempt as its cause. A panic means
a broken invariant: use them where handling is guaranteed, and `residueOr`,
`residueOrElse` or `toResult` everywhere else.
