---
type: fix
packages:
  - "@sekhmet/schema"
---

toStandard's validate no longer catches, reports and resumes a panic in toIssue: toIssue runs where validate's caller waits, so its throw propagates out of validate unreported, for the caller's own boundary. A panic in the parse is still reported and resumed (#114)
