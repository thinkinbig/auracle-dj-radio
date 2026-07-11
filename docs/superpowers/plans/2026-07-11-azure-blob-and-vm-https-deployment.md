# Azure Blob 歌单迁移 + VM HTTPS 部署 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把歌单媒体(mp3 + 封面/艺人图)从烘焙进 web 镜像迁到 Azure Blob 并由 nginx 反代;把整个 compose 栈部署到 Azure VM,前置 Caddy + Let's Encrypt 提供 HTTPS。

**Architecture:** web/nginx 用 `proxy_pass` 把 `/tracks/:id/audio`、`/covers`、`/artists` 反代到公开只读 Blob 容器(client 相对路径零改动、同源无 CORS);catalog JSON 仍烘焙。VM 上 Caddy 占 80/443,用 Azure 免费 `*.cloudapp.azure.com` DNS label 自动签发 Let's Encrypt 证书,反代内网 web;`rt-llm-proxy` 的 WebRTC UDP 媒体直连 VM 公网 IP,不经 Caddy。

**Tech Stack:** Docker Compose、nginx 1.27-alpine(templates + envsubst)、Caddy 2-alpine、Azure CLI(Storage / Compute / Network)、Go(rt-llm-proxy,不改动)。

## Global Constraints

- 订阅:`Azure for Students` = `cf1f480e-562c-4428-978e-5182874bcb0b`;区域 `swedencentral`;角色 Owner。
- Blob 容器:公开只读(`--public-access blob`),**不做** SAS。
- 迁移范围:仅 `tracks/*.mp3` + `covers/*` + `artists/*`;`catalog/*.json`(含 `catalog/track/<id>.json`)**保持烘焙**。
- client 音频路径固定为相对 `/tracks/${track.id}/audio`,**不得改动 client 代码**。
- nginx envsubst 必须用 `NGINX_ENVSUBST_FILTER=^BLOB_`,只替换 `BLOB_*`,避免误伤 `$host`/`$1`/`$http_upgrade`。
- 反代 Blob 的 `Host` 头必须是 blob 账户主机名,不能是 `$host`。
- **不做**:TURN/coturn、CDN、浏览器直连 Blob、catalog JSON 迁移、Front Door/App Gateway/Container Apps、私有容器/SAS。
- Storage account 名全局唯一、3–24 位小写字母数字。
- 存储账户名、VM/DNS label 等作为脚本变量,禁止散落硬编码。

---

## File Structure

- `ops/azure/provision-storage.sh` — 创建存储账户 + 公开只读容器,打印 `BLOB_BASE_URL`/`BLOB_HOST`(Task 1)
- `scripts/upload-catalog-media.sh` — 幂等上传本地媒体到 Blob(Task 2)
- `apps/web/default.conf.template` — 由 `apps/web/nginx.conf` 重命名改造,媒体路由改反代 Blob(Task 3)
- `apps/web/Dockerfile` — 改用 templates 机制、删除媒体 COPY(Task 3)
- `docker-compose.prod.yml` — web 加 `BLOB_*` env;加 `caddy` 服务、web 去宿主端口(Task 3、Task 4)
- `.env.example` — 增加 `BLOB_BASE_URL`/`BLOB_HOST`(Task 3)
- `ops/caddy/Caddyfile` — Caddy 反代内网 web(Task 4)
- `ops/azure/provision-vm.sh` — 创建 RG/VM/公网 IP+DNS label/NSG 规则(Task 5)

---

### Task 1: 建 Azure Storage 账户 + 公开只读容器

**Files:**
- Create: `ops/azure/provision-storage.sh`

**Interfaces:**
- Produces: 一个可匿名 GET 的 Blob 容器 `catalog-media`;脚本 stdout 打印两行 `BLOB_BASE_URL=https://<account>.blob.core.windows.net/catalog-media` 与 `BLOB_HOST=<account>.blob.core.windows.net`,供 Task 2/3 使用。

- [ ] **Step 1: 写 provisioning 脚本**

Create `ops/azure/provision-storage.sh`:

```bash
#!/usr/bin/env bash
# 幂等创建存储账户 + 公开只读容器,打印 BLOB_BASE_URL / BLOB_HOST。
set -euo pipefail

SUBSCRIPTION="${SUBSCRIPTION:-cf1f480e-562c-4428-978e-5182874bcb0b}"
LOCATION="${LOCATION:-swedencentral}"
RG="${RG:-auracle-demo-rg}"
# 全局唯一、3-24 位小写字母数字。可用 STORAGE_ACCOUNT 覆盖。
STORAGE_ACCOUNT="${STORAGE_ACCOUNT:-auracledjmedia$RANDOM}"
CONTAINER="${CONTAINER:-catalog-media}"

az account set --subscription "$SUBSCRIPTION"
az provider register --namespace Microsoft.Storage --wait

az group create --name "$RG" --location "$LOCATION" -o none

az storage account create \
  --name "$STORAGE_ACCOUNT" --resource-group "$RG" --location "$LOCATION" \
  --sku Standard_LRS --kind StorageV2 \
  --allow-blob-public-access true -o none

KEY="$(az storage account keys list --account-name "$STORAGE_ACCOUNT" \
  --resource-group "$RG" --query '[0].value' -o tsv)"

az storage container create \
  --name "$CONTAINER" --account-name "$STORAGE_ACCOUNT" \
  --account-key "$KEY" --public-access blob -o none

echo "BLOB_BASE_URL=https://${STORAGE_ACCOUNT}.blob.core.windows.net/${CONTAINER}"
echo "BLOB_HOST=${STORAGE_ACCOUNT}.blob.core.windows.net"
```

- [ ] **Step 2: 运行脚本创建资源**

```bash
chmod +x ops/azure/provision-storage.sh
STORAGE_ACCOUNT=auracledjmedia$RANDOM ./ops/azure/provision-storage.sh | tee /tmp/blob-env.txt
```

Expected: 末尾打印 `BLOB_BASE_URL=...` 与 `BLOB_HOST=...`。记下这两行(后续 `.env` 用)。

- [ ] **Step 3: 验证容器匿名可读**

先放一个探针 blob 再匿名 GET:

```bash
source /tmp/blob-env.txt
ACCOUNT="$(echo "$BLOB_HOST" | cut -d. -f1)"
KEY="$(az storage account keys list --account-name "$ACCOUNT" --resource-group auracle-demo-rg --query '[0].value' -o tsv)"
echo probe > /tmp/probe.txt
az storage blob upload --account-name "$ACCOUNT" --account-key "$KEY" \
  --container-name catalog-media --name _probe.txt --file /tmp/probe.txt --overwrite -o none
curl -fsS "$BLOB_BASE_URL/_probe.txt"
```

Expected: 输出 `probe`(匿名读成功)。

- [ ] **Step 4: Commit**

```bash
git add ops/azure/provision-storage.sh
git commit -m "feat(ops): provision Azure Blob container for catalog media"
```

---

### Task 2: 上传歌单媒体到 Blob

**Files:**
- Create: `scripts/upload-catalog-media.sh`

**Interfaces:**
- Consumes: Task 1 的容器 `catalog-media`;环境变量 `STORAGE_ACCOUNT`(账户名)。
- Produces: Blob 中 `tracks/<id>.mp3`、`covers/<file>`、`artists/<file>`,匿名可读。

- [ ] **Step 1: 核实本地源目录文件命名**

```bash
ls packages/catalog/data/tracks | head
ls packages/catalog/data/covers | head
ls packages/catalog/data/artists | head
```

Expected: `tracks/` 下是 `<id>.mp3`(与 nginx 路由 `^/tracks/([^/]+)/audio$` → `tracks/$1.mp3` 对应)。若命名不符,在下一步 `--source`/目标路径按实际调整。

- [ ] **Step 2: 写上传脚本**

Create `scripts/upload-catalog-media.sh`:

```bash
#!/usr/bin/env bash
# 幂等把本地歌单媒体推到 Blob(mp3 + 封面 + 艺人图)。catalog JSON 不上传。
set -euo pipefail

RG="${RG:-auracle-demo-rg}"
STORAGE_ACCOUNT="${STORAGE_ACCOUNT:?set STORAGE_ACCOUNT}"
CONTAINER="${CONTAINER:-catalog-media}"
DATA_DIR="${DATA_DIR:-packages/catalog/data}"

KEY="$(az storage account keys list --account-name "$STORAGE_ACCOUNT" \
  --resource-group "$RG" --query '[0].value' -o tsv)"

upload() { # $1 本地子目录  $2 blob 目标前缀
  az storage blob upload-batch \
    --account-name "$STORAGE_ACCOUNT" --account-key "$KEY" \
    --destination "$CONTAINER/$2" --source "$DATA_DIR/$1" \
    --overwrite -o none
  echo "uploaded $1 -> $CONTAINER/$2"
}

upload tracks  tracks
upload covers  covers
upload artists artists
```

- [ ] **Step 3: 运行上传**

```bash
chmod +x scripts/upload-catalog-media.sh
STORAGE_ACCOUNT=<你的账户名> ./scripts/upload-catalog-media.sh
```

Expected: 打印三行 `uploaded ...`,无报错。

- [ ] **Step 4: 验证一条真实 mp3 与一张封面匿名可读**

```bash
source /tmp/blob-env.txt
TRACK_ID="$(ls packages/catalog/data/tracks | head -1 | sed 's/\.mp3$//')"
curl -fsS -o /dev/null -w "audio %{http_code} %{content_type}\n" "$BLOB_BASE_URL/tracks/$TRACK_ID.mp3"
COVER="$(ls packages/catalog/data/covers | head -1)"
curl -fsS -o /dev/null -w "cover %{http_code}\n" "$BLOB_BASE_URL/covers/$COVER"
```

Expected: `audio 200 audio/mpeg`(或 `application/octet-stream`)与 `cover 200`。

- [ ] **Step 5: Commit**

```bash
git add scripts/upload-catalog-media.sh
git commit -m "feat(ops): idempotent upload of catalog media to Blob"
```

---

### Task 3: web 从 Blob 供频(nginx 模板反代 + 镜像瘦身 + env)

**Files:**
- Create: `apps/web/default.conf.template`(由 `apps/web/nginx.conf` 内容改造)
- Delete: `apps/web/nginx.conf`
- Modify: `apps/web/Dockerfile`(改用 templates、删除媒体 COPY)
- Modify: `docker-compose.prod.yml`(web 加 `BLOB_*` env)
- Modify: `.env.example`(加 `BLOB_BASE_URL`/`BLOB_HOST`)

**Interfaces:**
- Consumes: Task 1 的 `BLOB_BASE_URL`、`BLOB_HOST`。
- Produces: 本地 compose 下 `GET /tracks/:id/audio`、`/covers/*`、`/artists/*` 回源 Blob;`/catalog/*` 仍走烘焙 JSON。

- [ ] **Step 1: 由 nginx.conf 生成 template,改造媒体路由**

用 `git mv apps/web/nginx.conf apps/web/default.conf.template`,然后把文件改成下面内容(仅媒体三块改动 + 顶部加 resolver;其余保持):

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 80;
    server_name _;

    # 反代 Blob 需运行时 DNS 解析(public resolver 本地/Azure 皆可用)
    resolver 1.1.1.1 8.8.8.8 valid=300s;

    root /usr/share/nginx/html;
    index index.html;

    gzip on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;

    add_header X-Frame-Options SAMEORIGIN;
    add_header X-Content-Type-Options nosniff;
    add_header Referrer-Policy strict-origin-when-cross-origin;

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location /sessions {
        proxy_pass http://agent-harness:3030;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /auth {
        proxy_pass http://profile-service:3020;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /proxy/ {
        proxy_pass http://rt-llm-proxy:8090/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # ── Catalog JSON(仍烘焙,不迁 Blob)──
    location = /catalog/tracks {
        default_type application/json;
        alias /usr/share/nginx/html/catalog/tracks.json;
    }
    location = /catalog/genres {
        default_type application/json;
        alias /usr/share/nginx/html/catalog/genres.json;
    }

    # ── 音频:反代 Blob ──
    location ~ ^/tracks/([^/]+)/audio$ {
        proxy_pass ${BLOB_BASE_URL}/tracks/$1.mp3;
        proxy_ssl_server_name on;
        proxy_set_header Host ${BLOB_HOST};
        proxy_set_header Authorization "";
        proxy_hide_header x-ms-request-id;
        proxy_hide_header x-ms-version;
        add_header Cache-Control "public, immutable";
    }

    # 单曲 meta JSON(仍烘焙)— 必须在音频块之后
    location ~ ^/tracks/([^/]+)$ {
        default_type application/json;
        alias /usr/share/nginx/html/catalog/track/$1.json;
    }

    # ── 封面/艺人图:反代 Blob ──
    location ~ ^/(covers|artists)/(.*)$ {
        proxy_pass ${BLOB_BASE_URL}/$1/$2;
        proxy_ssl_server_name on;
        proxy_set_header Host ${BLOB_HOST};
        proxy_set_header Authorization "";
        add_header Cache-Control "public, immutable";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

- [ ] **Step 2: Dockerfile 改 templates + 删媒体 COPY**

Modify `apps/web/Dockerfile` runner 阶段。把:

```dockerfile
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# Catalog + media baked in so nginx serves them statically (api+web merge).
# Run `pnpm --filter @auracle/catalog export-catalog` after editing the manifest.
COPY packages/catalog/data/catalog/tracks.json /usr/share/nginx/html/catalog/tracks.json
COPY packages/catalog/data/catalog/genres.json /usr/share/nginx/html/catalog/genres.json
COPY packages/catalog/data/catalog/track       /usr/share/nginx/html/catalog/track
COPY packages/catalog/data/tracks              /usr/share/nginx/html/media/tracks
COPY packages/catalog/data/covers              /usr/share/nginx/html/covers
COPY packages/catalog/data/artists             /usr/share/nginx/html/artists
```

改成(nginx:alpine 会在启动时对 `/etc/nginx/templates/*.template` 跑 envsubst → `/etc/nginx/conf.d/`;媒体不再烘焙,仅保留 catalog JSON):

```dockerfile
COPY apps/web/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# 仅 catalog JSON 烘焙;媒体(mp3/covers/artists)已迁至 Blob,由 nginx 反代。
# Run `pnpm --filter @auracle/catalog export-catalog` after editing the manifest.
COPY packages/catalog/data/catalog/tracks.json /usr/share/nginx/html/catalog/tracks.json
COPY packages/catalog/data/catalog/genres.json /usr/share/nginx/html/catalog/genres.json
COPY packages/catalog/data/catalog/track       /usr/share/nginx/html/catalog/track
```

- [ ] **Step 3: compose 注入 BLOB env + envsubst filter**

Modify `docker-compose.prod.yml` 的 `web` 服务,在 `build:` 后加 `environment:`(若已存在则并入):

```yaml
  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
      args:
        VITE_SUPABASE_URL: ${VITE_SUPABASE_URL:-}
        VITE_SUPABASE_PUBLISHABLE_KEY: ${VITE_SUPABASE_PUBLISHABLE_KEY:-}
        VITE_SUPABASE_ANON_KEY: ${VITE_SUPABASE_ANON_KEY:-}
    restart: unless-stopped
    environment:
      BLOB_BASE_URL: ${BLOB_BASE_URL:?BLOB_BASE_URL is required}
      BLOB_HOST: ${BLOB_HOST:?BLOB_HOST is required}
      NGINX_ENVSUBST_FILTER: "^BLOB_"
    ports:
      - "${WEB_PORT:-8080}:80"
    depends_on:
      agent-harness:
        condition: service_started
      profile-service:
        condition: service_healthy
      rt-llm-proxy:
        condition: service_started
```

- [ ] **Step 4: `.env.example` 增加 Blob 变量**

在 `.env.example` 的 WebRTC 段附近追加:

```bash
# ── Azure Blob (catalog media: mp3 / covers / artists) ──
# 由 ops/azure/provision-storage.sh 打印。
BLOB_BASE_URL=
BLOB_HOST=
```

- [ ] **Step 5: 本地起栈**

用 Task 1/2 得到的值(临时 export 或写入根 `.env`):

```bash
export BLOB_BASE_URL=<Task1 输出> BLOB_HOST=<Task1 输出>
docker compose -f docker-compose.prod.yml up -d --build web
docker compose -f docker-compose.prod.yml exec web sh -c 'cat /etc/nginx/conf.d/default.conf | grep -n blob.core.windows.net'
```

Expected: envsubst 后配置里出现真实 `https://<account>.blob.core.windows.net/...`,且 `$host`/`$1`/`$2` 未被替换(仍是字面 `$1`)。

- [ ] **Step 6: 验证音频/封面反代 + catalog JSON 仍本地**

```bash
TRACK_ID="$(ls packages/catalog/data/tracks | head -1 | sed 's/\.mp3$//')"
curl -fsS -o /dev/null -w "audio %{http_code} %{content_type}\n" "http://localhost:${WEB_PORT:-8080}/tracks/$TRACK_ID/audio"
curl -fsS -o /dev/null -w "catalog %{http_code}\n" "http://localhost:${WEB_PORT:-8080}/catalog/tracks"
```

Expected: `audio 200 audio/mpeg`(经 nginx→Blob)与 `catalog 200`(本地烘焙 JSON)。

- [ ] **Step 7: Commit**

```bash
git add apps/web/default.conf.template apps/web/Dockerfile docker-compose.prod.yml .env.example
git rm apps/web/nginx.conf 2>/dev/null || true
git commit -m "feat(web): serve catalog media via nginx reverse-proxy to Blob"
```

---

### Task 4: compose 加 Caddy TLS 前置

**Files:**
- Create: `ops/caddy/Caddyfile`
- Modify: `docker-compose.prod.yml`(加 `caddy` 服务;`web` 去掉宿主端口发布)

**Interfaces:**
- Consumes: 内网 `web:80`。
- Produces: 一个占宿主 80/443 的 `caddy` 服务;VM 上对 `${SITE_DOMAIN}` 自动签发 Let's Encrypt 并反代 web。

- [ ] **Step 1: 写 Caddyfile**

Create `ops/caddy/Caddyfile`:

```
{$SITE_DOMAIN} {
    reverse_proxy web:80
}
```

- [ ] **Step 2: compose 加 caddy、web 去宿主端口**

Modify `docker-compose.prod.yml`:web 服务**删除** `ports:` 段(退回内网),新增 `caddy` 服务:

```yaml
  web:
    # ...(保留 build/environment/depends_on;删除 ports 段)...

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    environment:
      SITE_DOMAIN: ${SITE_DOMAIN:?SITE_DOMAIN is required}
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./ops/caddy/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      web:
        condition: service_started

volumes:
  caddy_data:
  caddy_config:
```

（若文件已有顶层 `volumes:`,把 `caddy_data`/`caddy_config` 并入,勿重复键。）

- [ ] **Step 3: `.env.example` 增加 SITE_DOMAIN**

在 WebRTC 段附近追加:

```bash
# Caddy 站点域名(Azure 免费 DNS label,VM 部署时填)
SITE_DOMAIN=auracle-demo.swedencentral.cloudapp.azure.com
```

- [ ] **Step 4: 本地验证 compose 配置合法 + Caddy 转发**

本地不会签发真证书(FQDN 未指向本机);仅验证配置合法与 HTTP 转发:

```bash
docker compose -f docker-compose.prod.yml config >/dev/null && echo "compose OK"
SITE_DOMAIN=localhost docker compose -f docker-compose.prod.yml up -d --build caddy web
curl -fsS -o /dev/null -w "caddy->web %{http_code}\n" http://localhost/
```

Expected: `compose OK`;`caddy->web 200`(Caddy 80 端口转发到内网 web)。

- [ ] **Step 5: Commit**

```bash
git add ops/caddy/Caddyfile docker-compose.prod.yml .env.example
git commit -m "feat(ops): front compose stack with Caddy for auto HTTPS"
```

---

### Task 5: 供应 Azure VM(RG/VM/DNS label/NSG)

**Files:**
- Create: `ops/azure/provision-vm.sh`

**Interfaces:**
- Produces: Ubuntu VM,公网 IP 带 DNS label `${DNS_LABEL}` → FQDN `${DNS_LABEL}.swedencentral.cloudapp.azure.com`;NSG 放行 22/80/443/tcp + UDP 媒体范围;脚本打印 VM 公网 IP 与 FQDN。

- [ ] **Step 1: 写 VM 供应脚本**

Create `ops/azure/provision-vm.sh`:

```bash
#!/usr/bin/env bash
# 幂等创建 VM + 公网 IP(带 DNS label)+ NSG 规则。打印公网 IP / FQDN。
set -euo pipefail

SUBSCRIPTION="${SUBSCRIPTION:-cf1f480e-562c-4428-978e-5182874bcb0b}"
LOCATION="${LOCATION:-swedencentral}"
RG="${RG:-auracle-demo-rg}"
VM="${VM:-auracle-demo-vm}"
DNS_LABEL="${DNS_LABEL:-auracle-demo}"
SIZE="${SIZE:-Standard_B2als_v2}"
ADMIN="${ADMIN:-azureuser}"
UDP_MIN="${WEBRTC_UDP_PORT_MIN:-10000}"
UDP_MAX="${WEBRTC_UDP_PORT_MAX:-10100}"
SSH_CIDR="${SSH_CIDR:?set SSH_CIDR to your public IP/CIDR, e.g. 1.2.3.4/32}"

az account set --subscription "$SUBSCRIPTION"
az provider register --namespace Microsoft.Compute --wait
az group create --name "$RG" --location "$LOCATION" -o none

az vm create \
  --resource-group "$RG" --name "$VM" --image Ubuntu2204 \
  --size "$SIZE" --admin-username "$ADMIN" \
  --generate-ssh-keys --public-ip-address-dns-name "$DNS_LABEL" \
  --public-ip-sku Standard -o none

NSG="$(az network nsg list --resource-group "$RG" \
  --query "[?contains(name,'${VM}')].name | [0]" -o tsv)"

az network nsg rule create -g "$RG" --nsg-name "$NSG" -n allow-ssh \
  --priority 1001 --access Allow --protocol Tcp --direction Inbound \
  --destination-port-ranges 22 --source-address-prefixes "$SSH_CIDR" -o none
az network nsg rule create -g "$RG" --nsg-name "$NSG" -n allow-http \
  --priority 1002 --access Allow --protocol Tcp --direction Inbound \
  --destination-port-ranges 80 443 -o none
az network nsg rule create -g "$RG" --nsg-name "$NSG" -n allow-webrtc-udp \
  --priority 1003 --access Allow --protocol Udp --direction Inbound \
  --destination-port-ranges "${UDP_MIN}-${UDP_MAX}" -o none

IP="$(az vm show -d -g "$RG" -n "$VM" --query publicIps -o tsv)"
echo "VM_PUBLIC_IP=$IP"
echo "SITE_DOMAIN=${DNS_LABEL}.${LOCATION}.cloudapp.azure.com"
```

- [ ] **Step 2: 运行供应**

```bash
chmod +x ops/azure/provision-vm.sh
SSH_CIDR="$(curl -fsS https://api.ipify.org)/32" ./ops/azure/provision-vm.sh | tee /tmp/vm-env.txt
```

Expected: 打印 `VM_PUBLIC_IP=...` 与 `SITE_DOMAIN=auracle-demo.swedencentral.cloudapp.azure.com`。

- [ ] **Step 3: 验证 DNS + SSH + NSG**

```bash
source /tmp/vm-env.txt
getent hosts "$SITE_DOMAIN" || nslookup "$SITE_DOMAIN"
ssh -o StrictHostKeyChecking=accept-new azureuser@"$SITE_DOMAIN" 'echo ssh-ok; lsb_release -ds'
az network nsg rule list -g auracle-demo-rg \
  --nsg-name "$(az network nsg list -g auracle-demo-rg --query '[0].name' -o tsv)" \
  --query "[].{n:name,proto:protocol,ports:destinationPortRange}" -o table
```

Expected: FQDN 解析到 `VM_PUBLIC_IP`;SSH 打印 `ssh-ok` 与 Ubuntu 版本;NSG 列出 ssh/http/webrtc-udp 三条规则。

- [ ] **Step 4: Commit**

```bash
git add ops/azure/provision-vm.sh
git commit -m "feat(ops): provision Azure VM with DNS label and WebRTC NSG rules"
```

---

### Task 6: 部署到 VM + 端到端验证

**Files:**（无新增文件;操作 VM)

**Interfaces:**
- Consumes: Task 3/4 的镜像与 compose;Task 5 的 VM/FQDN;Blob(Task 1/2)。
- Produces: `https://${SITE_DOMAIN}` 可访问的完整 demo。

- [ ] **Step 1: VM 装 Docker + compose plugin**

```bash
source /tmp/vm-env.txt
ssh azureuser@"$SITE_DOMAIN" 'curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker $USER'
```

Expected: 无报错;重开一个 ssh 会话使 docker 组生效。

- [ ] **Step 2: 上传代码到 VM**

```bash
source /tmp/vm-env.txt
git ls-files -z | rsync -az --files-from=- -0 ./ azureuser@"$SITE_DOMAIN":~/auracle/
```

Expected: 仓库文件同步到 VM `~/auracle`(仅已跟踪文件)。

- [ ] **Step 3: 在 VM 写生产 `.env`**

在 VM `~/auracle/.env` 写入(用真实值替换):

```bash
WEBRTC_PUBLIC_IP=<VM_PUBLIC_IP>
WEBRTC_UDP_PORT_MIN=10000
WEBRTC_UDP_PORT_MAX=10100
SITE_DOMAIN=<SITE_DOMAIN>
BLOB_BASE_URL=<Task1 输出>
BLOB_HOST=<Task1 输出>
SUPABASE_URL=<...>
SUPABASE_SECRET_KEY=<...>
VITE_SUPABASE_URL=<...>
VITE_SUPABASE_PUBLISHABLE_KEY=<...>
```

- [ ] **Step 4: Supabase Auth 加 redirect 白名单**

在 Supabase Dashboard → Authentication → URL Configuration,把 `https://<SITE_DOMAIN>` 加入 Site URL / Redirect URLs。

Expected: 白名单含新 HTTPS FQDN(否则登录回跳失败)。

- [ ] **Step 5: 起栈**

```bash
ssh azureuser@"$SITE_DOMAIN" 'cd ~/auracle && docker compose -f docker-compose.prod.yml up -d --build'
```

Expected: 所有服务 `Up`;`docker compose ps` 无 `Exit`。

- [ ] **Step 6: 验证 HTTPS 证书 + 音频回源 Blob**

```bash
source /tmp/vm-env.txt
curl -fsS -o /dev/null -w "tls %{http_code} (cert:%{ssl_verify_result})\n" "https://$SITE_DOMAIN/"
curl -fsS -o /dev/null -w "catalog %{http_code}\n" "https://$SITE_DOMAIN/catalog/tracks"
TRACK_ID="$(ls packages/catalog/data/tracks | head -1 | sed 's/\.mp3$//')"
curl -fsS -o /dev/null -w "audio %{http_code} %{content_type}\n" "https://$SITE_DOMAIN/tracks/$TRACK_ID/audio"
```

Expected: `tls 200 (cert:0)`(Let's Encrypt 验证通过)、`catalog 200`、`audio 200 audio/mpeg`。首次签发可能需等 ~30s。

- [ ] **Step 7: 浏览器端手动验证实时链路**

打开 `https://<SITE_DOMAIN>`:
- 地址栏出现锁(有效证书)。
- 登录成功(Supabase 回跳正常)。
- 开始一个 session,DJ 语音出声(WebRTC 媒体 UDP 直连 VM 通)。
- 对麦克风说话触发 barge-in(`getUserMedia` 在 secure context 下可用)。

Expected: 以上全部通过。若 DJ 无声/连不上,先查 NSG UDP 范围与 `WEBRTC_PUBLIC_IP` 是否等于 VM 公网 IP。

- [ ] **Step 8: 记录部署信息(不提交密钥)**

在本地 `docs/` 追加一条部署记录(FQDN、区域、资源组名),`.env` 与密钥不入库。

```bash
git add docs/ 2>/dev/null || true
git commit -m "docs: record VM deployment coordinates" || echo "nothing to commit"
```

---

## 附:回滚 / 排障速查

- **音频 404 经 nginx**:确认 Blob 中该 `tracks/<id>.mp3` 存在(`curl $BLOB_BASE_URL/tracks/<id>.mp3`);确认 envsubst 未替换 `$1`(`NGINX_ENVSUBST_FILTER=^BLOB_`)。
- **音频 502/超时**:nginx `resolver` 不可达 → 确认用的是公共 DNS(1.1.1.1/8.8.8.8)。
- **Blob 403**:容器非公开 → `az storage container set-permission --public-access blob`。
- **证书签发失败**:80/443 未放行或 FQDN 未解析到 VM;Caddy 日志 `docker compose logs caddy`;LE 限流则等待或复用 `caddy_data` 卷。
- **DJ 无声**:NSG UDP 范围未开 / `WEBRTC_PUBLIC_IP` 不等于 VM 公网 IP。
- **回滚媒体到烘焙**:还原 `apps/web/Dockerfile` 的媒体 COPY 与旧 `nginx.conf`(git revert Task 3 提交)。
