# REA 6.5.0 integration plan — Mr Mobiles

**Status (2026-10-15):** User verified a **live REA v6.5.0 ↔ Codex CLI v0.162.1 connection** on Ubuntu 26.04 ARM64 under Termux/PRoot. REA standalone MCP doctor reported `healthy: true`, `207/207 tools`, `6/6 prompts` and a successful `binary_session` request. Codex `/mcp` reported `rea: connected (207 tools)` and subsequently called `rea.binary_session` successfully. This GitHub PR remains a **review-only integration artifact**; no merge, GitHub workflow run or production deployment is implied.

Upstream source: [morluto/rea release rea-agents-6.5.0](https://github.com/morluto/rea/releases/tag/rea-agents-6.5.0).
REA is a **local stdio MCP server**, not a hosted website or a GitHub repository connection. Each coding-client host needs its own installation/registration.
Version is intentionally pinned to `6.5.0` (not `latest`). npm availability was verified on the user's Termux setup; check the package again on any new host.

## Prerequisites (every local host)

Use a machine with Node.js **22.19+**, **24.11+**, or **26+**, and npm. Check:

```sh
node --version
npm --version
npm view rea-agents@6.5.0 version
```

If the last command cannot find 6.5.0, **stop**; a GitHub release tag does not guarantee an npm package is published. Do not silently substitute another version.

## OpenAI Codex (local machine / development environment)

First preview *without changing agent configuration*:

```sh
npx -y rea-agents@6.5.0 setup --client codex --dry-run
```

Review proposed paths and tool-installation prompts. Only after approving the plan:

```sh
npx -y rea-agents@6.5.0 setup --client codex
npx -y rea-agents@6.5.0 doctor --client codex --json
```

Restart Codex and confirm the `rea` MCP tools appear. `doctor` checks local files and prerequisites, not the already-running client's MCP connection. Local REA installation is **not** automatic just because GitHub is connected to ChatGPT. On the user's Android/PRoot host, the Codex *daemon* fails to start; use the verified non-daemon launcher documented below.

## Verified Android Ubuntu PRoot launcher (next user-side step)

Ubuntu 26.04 ARM64 environment: Node.js 22.22.1, npm 9.2.0, Codex CLI 0.162.1, REA 6.5.0. This is the user's actual verified host; additional native providers may still be unavailable on ARM64.

The following **session** command worked with Codex, where bare `codex` initially failed to connect to `app-server-control.sock` and REA had failed its Codex MCP startup before the timeout extension:

```sh
codex --no-daemon \
  -c 'mcp_servers.rea.startup_timeout_sec=60' \
  -c 'mcp_optional_startup_grace_ms=30000'
```

For convenient recurring use, this PR supplies [`scripts/codex-rea-termux.sh`](../scripts/codex-rea-termux.sh), which runs the **same verified command** and forwards any arguments. It is a wrapper, not a persistent background daemon. After reviewing the script, install a private copy inside the Ubuntu environment, using this branch's raw file:

```sh
mkdir -p "$HOME/.local/bin"
curl -fsSL 'https://raw.githubusercontent.com/mrmobiles-murali/app.mrmobiles/integrations/rea-6-5-0-readiness/scripts/codex-rea-termux.sh' \
  -o "$HOME/.local/bin/codex-rea"
chmod 755 "$HOME/.local/bin/codex-rea"
"$HOME/.local/bin/codex-rea"
```

Once Codex opens, enter `/mcp` and verify `rea: connected (207 tools)`. For permanent command-line convenience, add `export PATH="$HOME/.local/bin:$PATH"` to `~/.bashrc` **only if that line is not already present**. In future Ubuntu sessions, run `codex-rea`.

**Persistent MCP startup timeout (optional):** Back up `/root/.codex/config.toml` and insert `startup_timeout_sec = 60` within the existing `[mcp_servers.rea]` table if not present. This keeps the REA startup allowance for other Codex launches. Do not append the key to the wrong TOML section or duplicate it. The wrapper above avoids altering the original config and also bypasses the Android/PRoot daemon problem.

Keep REA pinned to `rea-agents@6.5.0`. Do not install Hopper or Ghidra on Android/ARM64 merely to satisfy optional diagnostics. Disable app access to sensitive store credentials unless explicitly needed and approved.

## GitHub Copilot CLI (optional local coding client)

On the computer running GitHub Copilot CLI, preview `npx -y rea-agents@6.5.0 setup --client copilot_cli --dry-run`. Review and then run the same command without `--dry-run`. Restart Copilot CLI and confirm its REA tools. This is separate from the GitHub repository and GitHub app connector.

## Android Termux / Ubuntu proot

REA advertises runtime support based on Node.js versions and **host/architecture-specific providers**. Android arm64 / proot compatibility for many native workflows is **not established** by the upstream project's Linux x64 tests. Do not install Ghidra, Hopper, root packages, or modify Android to test this.

In Termux, check before trying any setup:

```sh
pkg install nodejs-lts procps
node --version
npm --version
npm view rea-agents@6.5.0 version
```

Only if Node is compatible and npm exposes the pinned package, run a limited read-only diagnostic:

```sh
npx -y rea-agents@6.5.0 doctor --json
```

The doctor report may show missing native providers even when a non-native workflow is possible. Keep the existing Telegram bot, Vercel, Cloudflare DNS, and payment services unchanged. Use a supported x64 Linux/macOS/Windows workstation for native REA analysis when necessary. No installation on the user's phone is performed by merging this document.

## MR MOBILES GitHub (this repository)

The optional manual [REA readiness workflow](../.github/workflows/rea-readiness.yml) checks pinned npm package availability and basic CLI invocation in an isolated GitHub runner. It does **not** register REA on your phone, OpenAI Codex, or ChatGPT; it does not analyze the Next.js source (TypeScript is not a prebuilt JavaScript application bundle).

After merging the PR, open GitHub **Actions → REA readiness (manual) → Run workflow**. Inspect output before choosing further actions. No cron, automatic deploy, secrets, production payment, webhooks, DNS, or Vercel commands are in this workflow.

If performing a real static JavaScript investigation, first build or supply a suitable **authorized JavaScript application bundle**, select that target explicitly, and run the CLI locally. Never send private `.env` files, Telegram tokens, Razorpay credentials, customer records, or production network traffic to unrelated tools or logs.

## ChatGPT app and MCP

The GitHub connector in ChatGPT lets the assistant read/update accessible repositories; **it does not automatically install arbitrary local MCP servers**. REA's local stdio MCP protocol cannot be registered directly through the existing GitHub connection. ChatGPT custom MCP connections are plan/workspace dependent and configured on the **web**, not the Android app. Where custom MCP connections are permitted, ChatGPT requires a remote HTTPS MCP endpoint or a supported **Secure MCP Tunnel**; its GitHub connector cannot substitute for one. REA runs a local stdio MCP server, so a compatible secured adapter/tunnel would need to be designed and approved separately. Do **not** publicly expose REA or a local file-analysis MCP endpoint just to connect it to ChatGPT. See [OpenAI: connecting custom MCP servers](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt).

## Acceptance and rollback

- [x] Confirm `rea-agents@6.5.0` is available on the user's Termux/npm installation.
- [ ] Run manual GitHub readiness check and record output.
- [x] Codex registration and skill were aligned; REA MCP doctor and live Codex `rea.binary_session` succeeded.
- [x] Verify Termux and Ubuntu PRoot Node version and host/provider limitations (Linux ARM64, optional native providers unavailable).
- [ ] User-side: install/verify a convenient `codex-rea` launcher and confirm it starts a new session.
- [ ] ChatGPT direct MCP **paused at user request**; consider a secure supported path only with new authorization.
- [ ] Keep Vercel/Cloudflare/Razorpay/Telegram production untouched.

To remove local REA-owned Codex registration/skill, review `npx -y rea-agents@6.5.0 uninstall` **before** confirming. Uninstall may affect other REA client registrations on that host; read upstream scope details.
