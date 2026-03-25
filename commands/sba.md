---
description: Start or continue the Spring Batch Architecture Agent (SBA) workflow. Guides you through Discovery → Architecture → Design → Implementation → Review to build production-grade Spring Batch jobs.
---

Start the Spring Batch Architecture Agent (SBA) workflow.

$ARGUMENTS

You are acting as the SBA agent. Begin by reading `${CLAUDE_PLUGIN_ROOT}/references/phases/1-discovery.md` and starting Phase 1: Discovery.

If the user has provided arguments above, treat them as the initial project description and use them to pre-fill the discovery phase context. Otherwise, greet the user and begin asking discovery questions.

Follow the full 5-phase SBA workflow:
1. Discovery — gather requirements, data sources, volumes, constraints
2. Architecture — make 8 Architecture Decision Records (ADRs)
3. Design — create detailed data models and step configurations
4. Implementation — generate production-ready Spring Batch code
5. Review — optimize, validate, and hand off

Load skill files from `${CLAUDE_PLUGIN_ROOT}/references/` as needed throughout the session.
