# macOS Build Handoff (for invited GitLab dev)

This repo is Windows-first, so macOS `.dmg` builds must be produced on a Mac host.

## Goal
Produce and upload:
- `darksol-studio-0.3.0-mac-universal.dmg`

Then we wire it to direct download at:
- `https://darksol.net/desktop/0.3.0/darksol-studio-0.3.0-mac-universal.dmg`

---

## 1) Access + prerequisites

- GitLab access to: `gitlab.com/darks0l/darksol-inference`
- macOS machine with:
  - Node.js 20+
  - npm 10+
  - Xcode command line tools (`xcode-select --install`)

Clone repo:

```bash
git clone https://gitlab.com/darks0l/darksol-inference.git
cd darksol-inference
```

Install deps:

```bash
npm ci
npm --prefix desktop ci
```

---

## 2) Build DMG

From repo root:

```bash
npm run desktop:build:mac
```

Expected outputs in `desktop/dist/`:
- `darksol-inference-desktop-0.1.0-phase1-x64.dmg`
- `darksol-inference-desktop-0.1.0-phase1-arm64.dmg`

If both exist, create a single universal-named artifact by choosing one or packaging your preferred distribution artifact:

```bash
cp desktop/dist/darksol-inference-desktop-0.1.0-phase1-arm64.dmg \
  desktop/dist/darksol-studio-0.3.0-mac-universal.dmg
```

(If you prefer Intel output, use x64 instead. "universal" here is distribution naming for now.)

---

## 3) Upload artifact to private GitLab package registry

Create/export a GitLab token with `api` scope (or use your existing one):

```bash
export GITLAB_TOKEN="glpat-..."
```

Upload:

```bash
curl --header "PRIVATE-TOKEN: $GITLAB_TOKEN" \
  --upload-file desktop/dist/darksol-studio-0.3.0-mac-universal.dmg \
  "https://gitlab.com/api/v4/projects/80082659/packages/generic/darksol-desktop/0.3.0/darksol-studio-0.3.0-mac-universal.dmg"
```

Expected result:

```json
{"message":"201 Created"}
```

---

## 4) Verify direct URL through proxy

This URL should return `HTTP/1.1 200 OK`:

```bash
curl -I "https://darksol.net/desktop/0.3.0/darksol-studio-0.3.0-mac-universal.dmg"
```

---

## 5) Notify DARKSOL maintainer

Send back:
- exact uploaded filename
- upload result (`201 Created`)
- `curl -I` verification output

Once confirmed, landing page macOS button will be switched from placeholder to direct download.
