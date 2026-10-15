# REA 6.5.0 integration plan — Mr Mobiles

**Status:** Preparation only; no live MCP registration or production deployment is implied by this document.

Upstream source: [morluto/rea release rea-agents-6.5.0](https://github.com/morluto/rea/releases/tag/rea-agents-6.5.0).
REA is a **local stdio MCP server**, not a hosted website or a GitHub repository connection. Each coding-client host needs its own installation/registration.
Version is intentionally pinned to `6.5.0` (not `latest`). npm package availability must be checked first.

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

Restart Codex and confirm the `rea` MCP tools appear. `doctor` checks local files and prerequisites, not the already-running client's MCP connection. Local REA installation is **not** automatic just because GitHub is connected to ChatGPT.

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

- [ ] Confirm `rea-agents@6.5.0` actually exists in npm.
- [ ] Run manual GitHub readiness check and record output.
- [ ] Codex local `doctor --client codex` and active REA tool discovery succeed.
- [ ] Check Termux Node version and host/provider compatibility separately.
- [ ] Connect ChatGPT only using a supported, secured remote-MCP app path if one becomes available and is explicitly authorized.
- [ ] Keep Vercel/Cloudflare/Razorpay/Telegram production untouched.

To remove local REA-owned Codex registration/skill, review `npx -y rea-agents@6.5.0 uninstall` **before** confirming. Uninstall may affect other REA client registrations on that host; read upstream scope details.
