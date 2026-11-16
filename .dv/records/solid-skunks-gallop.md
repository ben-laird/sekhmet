---

type: fix
packages:

- '@sekhmet/effect'

---

Call a custom Scheduler schedule function without a receiver, so built-ins like queueMicrotask work on Cloudflare Workers
