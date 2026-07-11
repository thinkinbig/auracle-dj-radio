# Azure Blob 歌单迁移 + VM HTTPS 部署 — 设计

**日期**: 2026-07-11
**状态**: 已批准设计,待写实现计划
**运维文档**: 主 runbook 见 [`doc/auracle_deployment_runbook.md`](../../doc/auracle_deployment_runbook.md)
**订阅**: Azure for Students (`cf1f480e-562c-4428-978e-5182874bcb0b`),角色 Owner
**区域**: swedencentral

## 背景

Auth 与 session events 已迁至 Supabase。本轮把 **歌单媒体** 从烘焙进 web 镜像的静态文件迁到 **Azure Blob Storage**,并把整个 compose 栈搬到一台 **Azure VM**,前置 **Caddy + Let's Encrypt** 提供 HTTPS——满足浏览器 `getUserMedia`(barge-in 麦克风)的 secure-context 要求。

两条工作流一份 spec:
- **A** — 歌单迁 Blob(本地即可完整验证)
- **B** — Caddy TLS + VM 上线

## 现状(已核实)

- `docker-compose.prod.yml`:`music-engine`(3010)、`profile-service`(3020,`PROFILE_EVENTS_STORE=supabase`)、`agent-harness`(3030)、`rt-llm-proxy`(8090 HTTP 信令 + `WEBRTC_UDP_PORT_MIN-MAX/udp` 媒体)、`web`(nginx,宿主 `8080:80`)。
- `apps/web/nginx.conf` 用 `alias` 把相对路径映射到镜像内烘焙的静态文件:
  - `GET /tracks/:id/audio` → `/usr/share/nginx/html/media/tracks/<id>.mp3`
  - `GET /(covers|artists)/*` → root 下同名文件
  - `GET /catalog/tracks`、`/catalog/genres`、`GET /tracks/:id` → catalog JSON
- `apps/web/Dockerfile` runner 阶段烘焙(源 `packages/catalog/data/`):
  - `catalog/tracks.json`、`catalog/genres.json`、`catalog/track/`(JSON)
  - `tracks/`(mp3)、`covers/`、`artists/`(图片)
- 客户端用 **相对路径** `el.src = /tracks/${track.id}/audio`([apps/web/src/features/radio/playback/LocalPlayer.ts](../../../apps/web/src/features/radio/playback/LocalPlayer.ts))。
- `rt-llm-proxy` 是 WebRTC bridge/gateway:浏览器 UDP 直连它广播的 host candidate,**本身即实时媒体服务器,无需额外服务器**。

## 决策

| 议题 | 决定 | 理由 |
|---|---|---|
| 实时/媒体是否加服务器 | **否**,`rt-llm-proxy` 直接承担 | 它是 bridge 不是 mesh;单 VM 公网 IP + 开放 UDP 范围即可直连 |
| TURN | **暂不做** | Demo/少量已知用户,网络多正常;连不上再同机补 coturn,不改架构 |
| Blob 供频方式 | **nginx `proxy_pass` 反代 Blob** | client 相对路径零改动;同源无 CORS、无混合内容;demo 带宽走 VM 可接受 |
| Blob 容器权限 | **公开只读(blob read)** | 非版权敏感素材;免签名、缓存友好 |
| 本轮迁移范围 | **仅 `mp3 + covers/artists` 图片**;`catalog JSON` 仍烘焙 | JSON 由 music-engine 启动时读入内存,改其加载源是另一件事 |
| HTTPS 方案 | **Caddy + Let's Encrypt**,域名用 Azure 免费 `*.cloudapp.azure.com` DNS label | $0、自动续期、不用买域名;Azure 托管 HTTPS(Front Door/App Gateway/Container Apps)是 L7/HTTP-only,盖不住 WebRTC UDP 媒体且费额度 |

## 目标拓扑

```
浏览器 ──HTTPS 443──▶ Caddy(VM,自动 Let's Encrypt HTTP-01)
                        └─▶ web/nginx(仅 compose 内网)
                              ├ /sessions → agent-harness:3030
                              ├ /auth     → profile-service:3020 → Supabase
                              ├ /proxy/   → rt-llm-proxy:8090（SDP 信令）
                              └ /tracks /covers /artists → 反代公开只读 Blob
浏览器 ──WebRTC UDP────▶ rt-llm-proxy（同一 VM 公网 IP，不经 Caddy，与 TLS 无关）
FQDN: auracle-demo.swedencentral.cloudapp.azure.com
```

## 工作流 A — 歌单迁 Blob

### A1. 建资源
- StorageV2 / `Standard_LRS` 存储账户(swedencentral)。
- Container `catalog-media`,public access = **blob**(匿名只读)。
- Blob 目录对齐 nginx 现有路径语义:
  - `tracks/<id>.mp3`
  - `covers/<file>`
  - `artists/<file>`

### A2. 上传脚本
- `scripts/upload-catalog-media.sh`,幂等(可重复执行),用 `az storage blob upload-batch`:
  - `packages/catalog/data/tracks/`  → `catalog-media/tracks/`
  - `packages/catalog/data/covers/`  → `catalog-media/covers/`
  - `packages/catalog/data/artists/` → `catalog-media/artists/`
- 实现第一步先核实源目录真实文件命名(尤其 `<id>.mp3` 与路由正则的对应)。

### A3. nginx.conf 反代
把三块从 `alias 本地` 改 `proxy_pass ${BLOB_BASE_URL}/…`:
- `location ~ ^/tracks/([^/]+)/audio$` → `proxy_pass ${BLOB_BASE_URL}/tracks/$1.mp3;`
- `location ~ ^/(covers|artists)/` → `proxy_pass ${BLOB_BASE_URL}/$1/…;`(保持路径透传)

反代要点:
- `resolver`(如 `168.63.129.16` Azure DNS 或公共 DNS)——proxy_pass 含变量需运行时解析。
- `proxy_ssl_server_name on;`(SNI,反代到 `https://<account>.blob.core.windows.net`)。
- `proxy_set_header Host <account>.blob.core.windows.net;`
- 透传 `Range`(音频拖动),保留/设定缓存头 `Cache-Control: public, immutable`。
- `catalog JSON` 三条路由 **不动**(继续 alias 本地烘焙文件)。

### A4. 参数注入
- nginx 改用 `templates/` 机制:`default.conf.template` + `NGINX_ENVSUBST_FILTER=^BLOB_`,只替换 `${BLOB_BASE_URL}`,避免误伤 `$host` / `$1` / `$http_upgrade`。
- `BLOB_BASE_URL = https://<account>.blob.core.windows.net/catalog-media`。

### A5. 镜像瘦身
- `apps/web/Dockerfile` runner 阶段**删除** `tracks/`、`covers/`、`artists/` 三条 COPY;**保留** `catalog/*.json` 与 `catalog/track/` 的 COPY。

### A6. compose / env
- `web` 服务 environment 增加 `BLOB_BASE_URL`、`NGINX_ENVSUBST_FILTER=^BLOB_`。
- `.env.example` 增加 `BLOB_BASE_URL`。

## 工作流 B — Caddy TLS + VM 上线

### B1. compose 加 Caddy
- 新 `caddy` 服务:`caddy:2-alpine`,`ports: 80:80, 443:443`;volumes 持久化 `/data`(证书,防 LE 限流)与 `/config`,挂载 `Caddyfile`;`depends_on: web`。
- `web` 服务**去掉** `ports: 8080:80`,退回 compose 内网(仅 Caddy 反代它)。

### B2. Caddyfile
```
auracle-demo.swedencentral.cloudapp.azure.com {
    reverse_proxy web:80
}
```
Caddy 自动 HTTP-01 签发 + 续期。

### B3. VM 供应
- Ubuntu 22.04,`Standard_B2als_v2`(2 vCPU / 4 GB;配额 `Total Regional vCPUs 0/6`,充足)。
- 公网 IP 配 DNS name label `auracle-demo` → FQDN `auracle-demo.swedencentral.cloudapp.azure.com`。
- NSG 入站放行:
  - `22/tcp`(SSH,限操作者 IP)
  - `80/tcp`、`443/tcp`(Caddy / LE 挑战)
  - `WEBRTC_UDP_PORT_MIN-WEBRTC_UDP_PORT_MAX/udp`(WebRTC 媒体)
- 装 docker + compose plugin。

### B4. VM .env
- `WEBRTC_PUBLIC_IP` = **VM 真实公网 IP**
- `WEBRTC_UDP_PORT_MIN` / `WEBRTC_UDP_PORT_MAX`
- `SUPABASE_SECRET_KEY`、`SUPABASE_URL`、`VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY`
- `BLOB_BASE_URL`
- 部署:`docker compose -f docker-compose.prod.yml up -d --build`

### B5. 必记联动
- `WEBRTC_PUBLIC_IP` 必须等于 VM 公网 IP,否则 ICE host candidate 不可达。
- **Supabase Auth redirect 白名单加该 HTTPS FQDN**,否则登录回跳失败。
- 页面 HTTPS + 全相对路径 API/音频 → 无混合内容;Blob 反代对浏览器同源。

## 交付顺序与验证

1. **A(本地)**:上传 Blob → 改 nginx/Dockerfile/compose → 本地 `docker compose up` → 验证音频照常播放、封面照常显示(网络面板确认 `/tracks/:id/audio` 命中反代且回源 Blob)。
2. **B(VM)**:建 VM/NSG/DNS label → 部署 → 验证 `https://…cloudapp.azure.com` 出证书、登录成功、WebRTC 语音连通、barge-in 麦克风可用。

## 范围边界(YAGNI)

- **不做** TURN / coturn(demo 阶段)。
- **不做** CDN / 浏览器直连 Blob(带宽走 VM 可接受)。
- **不做** catalog JSON 迁移(仍烘焙;新增/改元数据仍需重建镜像)。
- **不做** Front Door / App Gateway / Container Apps。
- **不做** 私有容器 / SAS 签名。
