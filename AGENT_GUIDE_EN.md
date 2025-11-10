---
title: "AGENT_GUIDE — Development & Agent Rules"
project: "Electron AI Assistant"
language: "en"
version: "1.0"
last_updated: "2025-10-21"
---

# Goal
This document sets **long‑term development direction**, architecture/coding conventions, and the **rules of engagement for automated agents and humans**. The aim is to scale features quickly while **preserving public APIs, security, and performance**.

## Scope
- Electron app with layers: **UI (HTML/CSS)** ↔ **renderer (TS)** ↔ **preload (bridge)** ↔ **main (IPC handlers)**.
- LLM integrations (OpenAI/Gemini) go through IPC (renderer should not talk to the network directly unless justified).
- Screenshot management, clipboard, file dialogs, preferences, model settings.

---

# Architecture Principles
1. **Separation of concerns**: UI (presentation) · renderer (UI logic) · preload (type‑safe bridge) · main (I/O & IPC handlers).
2. **Stable public API**: Functions on `window.electronAPI.*` are **public**. Any change must be backward‑compatible.
3. **Domain‑based IPC**: group handlers under `models/`, `screenshots/`, `files/`, `clipboard/`, `preferences/`, `window/`.
4. **Type‑first**: Declare `ElectronAPI` in `preload/types.d.ts`. Renderer never ad‑hoc strings for channels.
5. **Content safety**: Any HTML coming from LLM/Markdown **must be sanitized** before `innerHTML` assignment.
6. **Lightweight feature flags** via `preferences` (e.g., default model, answer style).
7. **No cloud lock‑in**: Secrets/API keys stored locally (electron‑store). Never log sensitive data.

---

# Stack & Versions (adapt per project)
- Electron, Node.js, TypeScript.
- `marked` + `highlight.js` (can swap to Markdown‑it). **Sanitize** before rendering.
- `electron-store` for local config.

> Keep exact versions in `package.json` and CI. Avoid major bumps without an ADR.

---

# Standard Folder Structure
```
/src
  /main
    app.ts
    shortcuts.ts
    store.ts
    /ipc
      models.ts
      screenshots.ts
      files.ts
      clipboard.ts
      preferences.ts
      window.ts
  /preload
    index.ts
    types.d.ts
  /renderer
    index.ts
    /lib
      markdown.ts
      ipc.ts
      dom.ts
    /ui
      tabs.ts
      toast.ts
      responses.ts
      screenshots.ts
      prompt.ts
      settings.ts
/styles
  app.css
index.html
```

---

# Naming & API Conventions
- **IPC channels**: `domain:action` (e.g., `models:send-openai`, `screenshots:take-region`). In renderer, call via `window.electronAPI.*`.
- **Public API source of truth**: `preload/types.d.ts`. Adding a new API ⇒ update this file and this guide.
- **Event subscriptions** (`on*`) return an **unsubscribe function**.

---

# Security & Privacy
- **Sanitize** Markdown/HTML (recommend DOMPurify). If not added yet → add TODO and restrict risky features.
- **CSP**: no `unsafe-inline` scripts; move JS/CSS out of HTML.
- **No eval**/Function constructor/remote code execution.
- **Secrets**: never log keys/tokens. Data flow: preload ↔ main ↔ store only.

---

# Performance & UX
- **Drag window** only in the header; allow **text selection** in content.
- **Shortcuts** must not capture keys while an input/textarea is focused.
- **Render Markdown** once and **apply highlighting**; avoid redundant reflows.

---

# Testing & CI (adapt commands)
- Lint: `npm run lint`
- Build: `npm run build`
- Test: `npm test`
- E2E (optional): `npm run e2e`

**Quality gates** (default; tune per module):
- No severe lint errors.
- Test pass ratio ≥ 90% (or module‑specific threshold).
- No new files tripping security rules (see `agent.config.yaml`).

---

# Release & Versioning
- **SemVer**. Breaking changes in public API ⇒ bump **major** + ADR.
- Tag releases; changelog grouped by `feat/fix/docs/refactor/chore`.

---

# Definition of Done (DoD)
- Code + tests + docs (update `AGENT_GUIDE.md` and `preload/types.d.ts` if API changes).
- Build/lint/test pass.
- Manual verification against the feature checklist.

---

# Rules for Agents (Output Contract)
Agents **must** follow:
0. Read-first requirement: Before any change, read `AGENT_GUIDE_EN.md` and `agent.config.en.yaml` and confirm constraints (invariants, constraints, output contract, priority paths). Do not proceed if unsure; ask clarifying questions.
1. **Propose → Apply**: briefly describe changes, then **return full file contents** as code blocks.
2. Each file block must start with:  
   `// path: <relative/file/path>`  
   followed by the **complete file** (no pseudo‑code, no “omitted for brevity”).
3. If altering a **public API**, ship backward‑compatible shims and include **migration notes**.
4. Update docs: `AGENT_GUIDE.md`, `agent.config.yaml`, and any relevant ADR.
5. Do not add dependencies without a reasoned security note and ADR (if significant).

---

# Growth Roadmap (suggestions)
- Add **adapter layer** for more models (Anthropic, local LLM) via `models.ts`.
- **I18N** for UI (externalize strings to resource JSON).
- **Theming** (dark/light) via CSS variables.
- **Opt‑in anonymous telemetry** (generic events, never content).

---

# PR Checklist
- [ ] No invariant violations per `agent.config.yaml`
- [ ] Public API unchanged or shimmed + ADR provided
- [ ] Lint/build/test pass
- [ ] New rendering paths sanitized
- [ ] Docs updated (guide/config/ADR)

---

# ADR (Architecture Decision Records)
- Place under `docs/adr/ADR-0001-title.md` for major decisions (models, build, security, APIs).
- Include: **Context → Decision → Consequences → Alternatives**.
