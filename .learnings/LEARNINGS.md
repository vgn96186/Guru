## [LRN-20260320-001] knowledge_gap

**Logged**: 2026-03-20T19:59:27Z
**Priority**: medium
**Status**: pending
**Area**: config

### Summary
Google Stitch MCP may require OAuth or pre-issued bearer auth rather than API-key headers alone, and Codex's built-in `mcp login` can fail when the server does not support dynamic client registration.

### Details
During Stitch MCP setup in Codex, the initial assumption was that `X-Goog-Api-Key` headers might be sufficient. The user recalled that OAuth was needed in Claude Code. Testing `codex mcp login stitch` confirmed an OAuth-related limitation with the error: `Dynamic client registration not supported`. This means the remote server may require externally acquired OAuth credentials or a different client flow than Codex's automatic MCP login path.

### Suggested Action
When configuring Google-hosted MCP endpoints, prefer verifying auth mode before recommending API-key headers. If `codex mcp login` fails with dynamic registration errors, pivot to bearer-token env vars or port the exact working config from the other client.

### Metadata
- Source: user_feedback
- Related Files: /Users/vishnugnair/.codex/config.toml
- Tags: mcp, oauth, stitch, codex

---
