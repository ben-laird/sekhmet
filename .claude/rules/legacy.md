# Retired patterns

Sekhmet's older code uses patterns the current standards have retired. Code
nearby is **not** precedent: new code follows the standard, and code you touch
is brought up to it. Do the fix for the function or type you're editing (plus
its direct callers when its signature changes) in a separate
`refactor(scope): modernize …` commit before the feature commit. Anything
wider goes to the tracking issue, not inline. The packages are pre-1.0, so a
retired public API is removed outright, with no alias or shim.

| Retired                                                                                                                                                                                                                                   | Use instead                                                                                                                                                                                                                                                           | Tracking |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `runtime.catchUnwindAsync(fn)`, and the sync `catchUnwind`'s "use catchUnwindAsync for promises" rest-parameter guard                                                                                                                     | One `catchUnwind(fn)` for sync and async work: it returns a `Vow<Outcome<T, never, unknown>>`, settled before the call returns when `fn` is sync, and adopts a returned thenable. Read sync work with `expectReady(poll(vow), …)`; wait for async work with `wait`    | #114     |
| A package's own alias for a slice of the runtime: `LifetimePanics`, schema's `PanicBoundary` (`Pick<PanicRuntime, "catchUnwind" \| "catchUnwindAsync">`), dispatch's `CatchUnwind`, or a whole `PanicRuntime` parameter that only catches | `@sekhmet/panic`'s `PanicBoundary` (`Pick<PanicRuntime, "catchUnwind" \| "resumeUnwind">`), taken as `panics: PanicBoundary` and passed the runtime itself. A private `guard` over `catchUnwind` is gone too: call `panics.catchUnwind` and flatten with `fromCaught` | #114     |
| A caught panic as `Result<_, Panic<unknown>>` (lifetime's old `Resource.start`), or as `Err`                                                                                                                                              | `Outcome`'s `Panicked(payload: unknown)`, or a variant named `Panicked` with an `unknown` payload in an enum with its own terminal for it. Combinators pass it through; `unwrap` rethrows the payload                                                                 | #114     |
| `fromPromise({ promise, panics })` from `@sekhmet/vow`                                                                                                                                                                                    | `panics.catchUnwind(() => promise)`, whose rejection is `Panicked`; for an expected failure, `catchUnwind(() => promise.then(Ok, Err))`, then `fromCaught`                                                                                                            | #114     |

When a standard changes or a new lesson retires a pattern, add a row here in
the same change.
