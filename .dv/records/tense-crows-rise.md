---
type: feat!
packages:
  - "@sekhmet/lifetime"
---

Resource.start settles a Vow<Outcome<Lifetime<T, C>, never, unknown>>: Ok(lifetime), or Panicked(payload) when init panicked, in place of Result<Lifetime<T, C>, Panic<unknown>>. Read it with @sekhmet/panic/outcome's isPanicked, unwrapPanicked and unwrap, which throws the payload again (#114)
