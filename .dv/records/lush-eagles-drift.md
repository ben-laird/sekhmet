---

type: fix
packages:

- '@sekhmet/effect'
- '@sekhmet/panic'

---

Generate IDs with crypto.getRandomValues instead of crypto.randomUUID, so fork() and panics work on plain-HTTP browser pages
