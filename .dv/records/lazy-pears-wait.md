---

type: fix
packages:

- '@sekhmet/panic'

---

defaultPanicHook prints the same 'panicked: Name: message' header on every engine (V8, Bun, Firefox, WebKit), followed by the stack frames
