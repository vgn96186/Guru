# Stitch MCP OAuth Setup (Cursor)

Stitch MCP tools (e.g. generate screens, edit designs) require **OAuth**; API key only works for health checks. Follow these steps to use OAuth so Cursor can call Stitch.

---

## 1. Install Google Cloud CLI (gcloud)

On macOS with Homebrew (already done if you ran setup):

```bash
brew update && brew install --cask gcloud-cli
```

Then add to your shell (e.g. `~/.zshrc`) and reload:

```bash
# Google Cloud SDK
source "$(brew --prefix)/share/google-cloud-sdk/path.zsh.inc"
source "$(brew --prefix)/share/google-cloud-sdk/completion.zsh.inc"
```

Reload: `source ~/.zshrc`

---

## 2. Run Stitch MCP init (interactive)

In a terminal:

```bash
cd /Users/vishnugnair/Guru/Guru
npx @_davideast/stitch-mcp init -c cursor
```

When prompted:

1. **Authentication Mode** → choose **OAuth** (arrow down, Enter).
2. The wizard will:
   - Run `gcloud auth login` (browser opens; sign in with your Google account).
   - Run `gcloud auth application-default login` (browser again; allows Stitch to use your credentials).
   - Optionally create/select a Google Cloud project and enable the Stitch API.
3. It will write the updated MCP config (e.g. `~/.cursor/mcp.json`) to use OAuth instead of the API key.

---

## 3. Restart Cursor

Quit Cursor fully and reopen so it reloads MCP servers with the new OAuth-based config.

---

## 4. Verify

In a terminal:

```bash
npx @_davideast/stitch-mcp doctor
```

You should see OAuth/Application Default Credentials reported as OK instead of (or in addition to) API Key.

---

## Notes

- **API key** in `~/.zshrc` (`STITCH_API_KEY`) is only used when the MCP is configured for API key. After switching to OAuth via `init`, the proxy uses gcloud credentials and the key is ignored for MCP.
- If `init` fails with “Stitch API not enabled”, ensure you have a Google Cloud project and that the Stitch API is enabled for that project (the wizard may offer to do this).
