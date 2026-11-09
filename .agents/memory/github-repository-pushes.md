---
name: GitHub repository pushes
description: Replit workspace behavior when pushing to a connected private GitHub repository.
---

For a user-authorized push, check the destination with `git ls-remote` first, push only the intended branch without force, then verify its ref points to the local commit. HTTPS GitHub URLs may be rewritten through Replit's internal Git mirror, and the GitHub API connector can still report `connect` even when the Git transport succeeds.

**Why:** In this workspace, a push to the supplied GitHub HTTPS URL was routed through the Replit internal host while `git ls-remote` against the GitHub URL confirmed the resulting branch and commit.

**How to apply:** Trust verified remote refs rather than the displayed transport host alone; if the ref cannot be verified, report that push status is uncertain and do not claim completion.
