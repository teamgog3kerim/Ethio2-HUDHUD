---
name: Deleted identity sessions
description: Preventing data recreation by old app sessions after account deletion.
---

Revoke app sessions and retain a minimal deleted-identity tombstone before
resolving learner data for a deleted account.

**Why:** A deleted account must not be recreated by a still-valid token or stale
learner records while the app's username/password identity model evolves.

**How to apply:** Check deleted/suspended account state before every learner or
administrator route. Preserve the deletion barrier across data resets and
restarts, and exclude deleted identities from active-user statistics.
