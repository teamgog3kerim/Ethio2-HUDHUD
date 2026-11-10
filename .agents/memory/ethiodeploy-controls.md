---
name: EthioDeploy deployment controls
description: Limits of the EthioDeploy CLI and dashboard controls relevant to production setup.
---

The EthioDeploy CLI can inspect projects, deploy commits, and set encrypted environment values. It does not expose controls for enabling external database access or attaching custom domains. The CLI may also reject the documented runtime-only environment option; verify its actual capabilities before sending production secrets.

**Why:** The project database's internal hostname was unreachable from the workspace, and the CLI rejected the runtime-only flag. Sending sensitive values as build-time variables would not meet the platform's runtime-only guidance.

**How to apply:** Before a production cutover, confirm secrets are runtime-only through a supported control, attach the custom domain, and enable external database access before migrating records. Do not launch against an empty target when preserving source data is required.
