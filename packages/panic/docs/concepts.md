---
kind: explanation
---

# Concepts

The ideas behind `@sekhmet/panic`, and why it is built the way it is. The
[recipes](./recipes.md) show how to put them to work, and the
[API reference](https://jsr.io/@sekhmet/panic/doc) maps each Rust
`std::panic` item to its counterpart here.

## A panic is not an error value

In Sekhmet, errors are values: a function that can fail in an expected way
returns a `Result`, and its caller has to deal with the failure because the
type says so. `throw` is kept for something else, a panic: something happened
that cannot happen unless the program is wrong. A broken invariant has no
sensible caller-side recovery, so it isn't part of the return type.

`Panic` gives that throw a structure: a message, an optional name to
categorize it, a typed cause, a unique id and a timestamp. Throw one with
`panic` (or `panicWithoutCause`); return a `Result` for anything a caller is
expected to handle.

## Reporting and recovery are separate

Rust's `std::panic` splits what happens to a panic in two. The panic hook
reports it: it writes the message, sends telemetry, records metadata. A
`catch_unwind` boundary recovers from it: it stops the unwind and hands the
caller a value. This package keeps the split. A runtime's hook reports, and
its boundaries (`catchUnwind`, `catchUnwindAsync`) recover, returning
`Ok` of the work's value or `Err` of what it threw.

The hook never decides the outcome. It returns nothing, and what the program
does next is the caller's call, made on the `Result` the boundary returns:
turning a payload into an app error is a `mapErr` away. Keeping the two apart
means a reporter can be swapped without changing how the program recovers,
and recovery code never has to know where reports go.

A boundary catches every throw, not only `Panic`s, and hands back the thrown
value unchanged, typed `unknown`, as Rust's payload is `Box<dyn Any>`. A throw
from code you don't own still has to be reported and recovered from.

## One runtime per program, and no global state

There is no global hook and no default runtime. Rust has one process-wide
hook; a JavaScript module-level hook would be shared by every library that
imports this package, and by every test in a run. Any of them could replace
it, and none could tell whose it was.

So a runtime is a value you create, with `definePanicRuntime()`, where your
program starts, and you run everything inside its boundaries. Runtimes are
independent: a hook set on one never sees a panic that only another runtime
catches. Tests can each create their own runtime without interfering, and a
library can keep its own runtime without touching yours.

## Reported once per runtime

A payload may pass through several boundaries on its way out: a nested
`catchUnwind`, an inner boundary that gives up and resumes the unwind, a
library's boundary inside yours. Reporting it at each would repeat the same
report.

Each runtime holds a private record, a `WeakSet`, of the object payloads it
has reported or resumed. The hook runs at the runtime's innermost boundary
that catches an unwind; that boundary records the payload, and every other
boundary of the same runtime skips the hook for it. The payload itself is
never touched: nothing is written onto it, so a frozen object or a `Panic`
from another library is safe to record.

`resumeUnwind` re-throws a caught payload without reporting it, and records
it too, so no boundary of the same runtime reports it afterwards.

The record belongs to the runtime, so reporting is per runtime. A payload
that passes through a library's runtime and then yours is reported once by
each, through each runtime's own hook. One runtime can never silence another,
and two copies of this package simply act as two runtimes.

This is the first difference from Rust. Rust calls its one global hook where
`panic!` runs. Here the hook runs at the boundary, not at the throw, since
only a boundary knows which runtime is catching.

## Why primitives are reported every time

Primitives (strings, numbers, `undefined` and so on) can't go in a `WeakSet`.
Recording them in a `Set` instead would leak, and worse, would silence every
later throw of an equal value, which is a different unwind. So every boundary
that catches a primitive reports it, even after `resumeUnwind`: a duplicate
report is safer than a lost one. Throw a `Panic` (or another `Error`) to get
the once-only guarantee.

## When the hook throws

A hook that throws is a panic while panicking. Rust aborts the process when
that happens. JavaScript has no portable abort, and killing the host would be
wrong in a browser or a server anyway, so the boundary instead stops
recovering: it throws a new `Panic` named `Panic (PanicHook)`, whose cause is
`{ payload, thrown }`, the payload it was reporting and what the hook threw.

The runtime still records the original payload as reported. An outer
boundary then reports and catches the `Panic (PanicHook)` like any other
unwind; with no outer boundary, the host reports it as an uncaught error.

This is the second difference from Rust: a throwing hook doesn't abort, it
escalates to the next boundary out. `isPanicHookFailure` recognizes the
escalated panic, and accepts only one a boundary threw.
