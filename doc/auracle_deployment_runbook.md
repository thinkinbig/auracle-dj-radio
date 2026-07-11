# Auracle Deployment Runbook

Operational guide for running the full Auracle stack in production or demo defense. For architecture rationale (Blob proxy, Caddy TLS, WebRTC UDP), see [`docs/superpowers/specs/2026-07-11-azure-blob-and-vm-https-deployment-design.md`](../docs/superpowers/specs/2026-07-11-azure-blob-and-vm-https-deployment-design.md).

## Overview

| Mode | Entry point | TLS | Catalog media |
|------|-------------|-----|---------------|
| Local dev | `pnpm dev` → `:5173` | No (localhost) | Local files via Vite |
| Docker demo (same machine) | `pnpm docker:prod` | Optional Caddy on `:443` if `SITE_DOMAIN` set | Azure Blob via nginx proxy, or misconfigured if `BLOB_*` blank |
| Azure VM (production demo) | `https://<SITE_DOMAIN>` | Caddy + Let's Encrypt | Azure Blob |

The production stack is defined in [`docker-compose.prod.yml`](../docker-compose.prod.yml):

```
Browser ──HTTPS 443──▶ Caddy ──▶ web/nginx (compose internal)
                              ├ /sessions  → agent-harness:3030
                              ├ /auth      → profile-service:3020
                              ├ /proxy/    → rt-llm-proxy:8090
                              └ /tracks, /covers, /artists → Azure Blob (proxy_pass)

Browser ──WebRTC UDP──▶ rt-llm-proxy (VM public IP, not through Caddy)
```

Services: `music-engine` (3010), `profile-service` (3020), `agent-harness` (3030), `rt-llm-proxy` (8090 + UDP), `web` (nginx, internal), `caddy` (80/443).

---

## Prerequisites

- **Repo**: clone with Git LFS (`git lfs install && git lfs pull`) for catalog mp3s.
- **Secrets**: root [`.env`](../.env.example) — never commit; on the VM it lives beside the cloned repo.
- **Supabase**: Auth providers (Google, Spotify) configured; production redirect URL must include `https://<SITE_DOMAIN>/**`.
- **Gemini**: `GEMINI_API_KEY` with Live API access.
- **Azure CLI** (for provisioning): `az login`, subscription with Compute + Storage quota.

---

## Environment variables

Copy [`.env.example`](../.env.example) to `.env`. Production-required keys:

| Variable | When required | Notes |
|----------|---------------|-------|
| `GEMINI_API_KEY` | Always | Live DJ + Flow |
| `PROXY_REGISTER_SECRET` | Production | Shared secret for proxy register/inject control endpoints |
| `SUPABASE_URL` | Production | profile-service backend |
| `SUPABASE_SECRET_KEY` | Production | Server-only; `PROFILE_EVENTS_STORE=supabase` in compose |
| `VITE_SUPABASE_URL` | Web image build | Build arg in `docker-compose.prod.yml` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Web image build | Same |
| `WEBRTC_PUBLIC_IP` | Production | **Must equal the VM's public IPv4** |
| `WEBRTC_UDP_PORT_MIN` / `MAX` | Production | NSG must allow the same UDP range |
| `BLOB_BASE_URL` | Production | e.g. `https://<account>.blob.core.windows.net/catalog-media` |
| `BLOB_HOST` | Production | e.g. `<account>.blob.core.windows.net` |
| `SITE_DOMAIN` | Production | Caddy site block; e.g. `auracle-demo.swedencentral.cloudapp.azure.com` |

Local Docker demo can use `WEBRTC_PUBLIC_IP=127.0.0.1` and skip Blob if you only test API paths (audio will fail without Blob).

---

## First-time Azure setup

### 1. Blob storage (catalog media)

```bash
chmod +x ops/azure/provision-storage.sh
STORAGE_ACCOUNT=auracledjmedia$RANDOM ./ops/azure/provision-storage.sh | tee /tmp/blob-env.txt
```

Add printed `BLOB_BASE_URL` and `BLOB_HOST` to `.env`.

Upload media (idempotent):

```bash
# After provision-storage, note STORAGE_ACCOUNT from the script output URL
STORAGE_ACCOUNT=<account> ./scripts/upload-catalog-media.sh
```

Catalog JSON stays baked into the web image; after manifest edits run `pnpm --filter @auracle/catalog export-catalog` and rebuild.

### 2. VM + network

```bash
export SSH_CIDR="$(curl -s ifconfig.me)/32"   # restrict SSH to your IP
chmod +x ops/azure/provision-vm.sh
./ops/azure/provision-vm.sh | tee /tmp/vm-env.txt
```

Script creates Ubuntu 22.04 VM, public IP with Azure DNS label, NSG rules for 22/tcp (your IP), 80+443/tcp, and WebRTC UDP range.

Record `VM_PUBLIC_IP` and `SITE_DOMAIN` from output → set `WEBRTC_PUBLIC_IP` and `SITE_DOMAIN` in VM `.env`.

### 3. VM bootstrap (one time)

SSH as `azureuser` (or your `ADMIN`):

```bash
ssh azureuser@<VM_PUBLIC_IP>

# Docker + Compose plugin
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2 git
sudo usermod -aG docker "$USER"
# log out and back in so docker group applies

git clone https://github.com/thinkinbig/auracle-dj-radio.git
cd auracle-dj-radio
git lfs install && git lfs pull

cp .env.example .env
# Edit .env: GEMINI_*, SUPABASE_*, WEBRTC_*, BLOB_*, SITE_DOMAIN, VITE_*
```

### 4. Supabase Auth redirect

In Supabase Dashboard → Authentication → URL configuration, add:

- Site URL: `https://<SITE_DOMAIN>`
- Redirect URLs: `https://<SITE_DOMAIN>/**`

Without this, OAuth login will fail after redirect.

### 5. Start stack

On the VM:

```bash
docker compose -f docker-compose.prod.yml up -d --build --wait --wait-timeout 180
docker compose -f docker-compose.prod.yml ps
```

---

## Verification checklist

After deploy, confirm:

- [ ] `https://<SITE_DOMAIN>` loads with a valid TLS certificate (Caddy / Let's Encrypt).
- [ ] Sign-in (Google / Spotify) completes and returns to the app.
- [ ] Start a radio session; local catalog track audio plays (`/tracks/:id/audio` → Blob proxy).
- [ ] DJ voice connects (WebRTC); check browser console for ICE / UDP errors.
- [ ] Microphone / barge-in works (requires HTTPS secure context).
- [ ] `docker compose -f docker-compose.prod.yml ps` shows all services healthy where healthchecks exist.

Quick curls from your laptop:

```bash
curl -I "https://<SITE_DOMAIN>/"
curl -I "https://<SITE_DOMAIN>/catalog/tracks"
```

---

## Ongoing deploys (GitHub Actions)

Workflow: [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) — **manual only** (`workflow_dispatch`).

The VM must already have the repo cloned and a populated `.env`. The job SSHs in, `git fetch` + `reset --hard origin/<ref>`, bootstraps `PROXY_REGISTER_SECRET` when it is missing, then rebuilds the stack and waits for all configured healthchecks before reporting success.

### GitHub Environment: `production`

Configure under **Settings → Environments → production**:

| Kind | Name | Purpose |
|------|------|---------|
| Secret | `VM_HOST` | VM public IP or hostname |
| Secret | `VM_SSH_PRIVATE_KEY` | Private key matching VM `authorized_keys` |
| Variable | `VM_USER` | SSH user (default `azureuser`) |
| Variable | `VM_APP_DIR` | Repo path on VM relative to home (default `auracle-dj-radio`) |

Run: **Actions → Deploy (Azure VM) → Run workflow**, set `ref` (default `main`).

For ad-hoc deploys, SSH to the VM and run the same compose command after `git pull`.

---

## Local Docker full stack

```bash
cp .env.example .env
# Fill GEMINI_API_KEY; for full audio set BLOB_* after Blob provisioning
pnpm docker:prod
```

With production-like TLS locally, set `SITE_DOMAIN` and ensure ports 80/443 are free for Caddy. Without Caddy config, you can exec into `web` or temporarily publish `web` ports for debugging — the checked-in compose expects Caddy as the external entry.

Stop:

```bash
pnpm docker:down
```

---

## VM cost control

After a demo, deallocate the VM (stops compute billing; disk + static IP remain):

```bash
./ops/azure/vm-stop.sh
```

Before the next demo:

```bash
./ops/azure/vm-start.sh
# Containers use restart: unless-stopped; HTTPS should return in ~30–60s
```

If the VM gets a new public IP after reprovision, update `WEBRTC_PUBLIC_IP` in `.env` and redeploy — ICE host candidates must match.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| OAuth redirect error | Supabase redirect URL missing FQDN | Add `https://<SITE_DOMAIN>/**` in Supabase |
| Audio 502 / empty | `BLOB_BASE_URL` wrong or media not uploaded | Re-run `upload-catalog-media.sh`; check nginx template env |
| WebRTC connects but no voice | `WEBRTC_PUBLIC_IP` ≠ VM IP | Fix `.env`, recreate `rt-llm-proxy` container |
| WebRTC fails on corporate Wi‑Fi | UDP blocked | Demo on open network; TURN not implemented yet |
| profile-service unhealthy | Missing `SUPABASE_SECRET_KEY` | Set server secret in `.env` |
| LE certificate fails | Port 80 blocked or wrong `SITE_DOMAIN` | NSG 80/tcp open; DNS label matches Caddyfile |

Proxy-only deployment (without full stack) is documented in [`services/rt_llm_proxy/docs/DEPLOYMENT.md`](../services/rt_llm_proxy/docs/DEPLOYMENT.md).

---

## Related docs

| Doc | Content |
|-----|---------|
| [auracle_technical_report.md §12](auracle_technical_report.md#12-deployment-model) | Deployment model summary |
| [docs/superpowers/specs/2026-07-11-azure-blob-and-vm-https-deployment-design.md](../docs/superpowers/specs/2026-07-11-azure-blob-and-vm-https-deployment-design.md) | Design decisions (Blob, Caddy, NSG) |
| [docs/superpowers/plans/2026-07-11-azure-blob-and-vm-https-deployment.md](../docs/superpowers/plans/2026-07-11-azure-blob-and-vm-https-deployment.md) | Implementation task checklist |
| [auracle_pwa_audio_notes.md](auracle_pwa_audio_notes.md) | HTTPS / secure context for microphone |
