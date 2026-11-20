---
type: feat!
packages:
  - "@sekhmet/job"
---

Rename JobOutcome to JobEnd and JobOutcomeVariants to JobEndVariants, and move the @sekhmet/job/outcome export paths to @sekhmet/job/end, freeing "Outcome" for @sekhmet/panic's Outcome; the types Outcomes, NeedOutcomes and OutcomeView become JobEnds, NeedEnds and EndView, while the report.outcomes, outcomes and view.outcome fields keep their names (#87)
