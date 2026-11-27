---
type: feat!
packages:
  - "@sekhmet/vow"
---

Remove fromPromise and FromPromiseOptions: vow no longer depends on @sekhmet/panic. Bridge a promise with a panic runtime's catchUnwind(() => promise) instead, whose rejection is Panicked; classify an expected failure with promise.then(Ok, Err) and flatten it with fromCaught (#114)
