# Auracle DJ Radio

AI 电台 DJ：实时语音对话 + 能量曲线编排 + 用户记忆。Demo 阶段为单用户 Web 应用。

## 架构概览（Demo — 单 TypeScript 后端）

```
apps/web (React)
  · WS binary PCM ↔ Live DJ
  · REST ↔ sessions / tracks
  · Web Audio（曲库 mp3 + fade）
       │
       ▼
apps/api (Fastify + TypeScript)  :3000
  · Gemini Live WS 中继
  · Flow 重排 · mem0 · SQLite
```

**一个进程、一种语言** — Live 与编排同仓，无 Go 双后端。  
Gemini 协议可参考 [thinkinbig/rt_llm_proxy](https://github.com/thinkinbig/rt_llm_proxy)，但 Demo **不依赖**该仓库。

详细设计见 [`doc/`](doc/)。曲库检索 MVP 为确定性结构化打分（[`docs/adr/0001-deterministic-structured-selection.md`](docs/adr/0001-deterministic-structured-selection.md)）；日后可演进 **text embedding**（`gemini-embedding-001`，同模态 tag↔query，与 mem0 共用 embed 模型）。**跨 session 用户记忆仍走 mem0**（`memory-service` + Qdrant；见 [`doc/auracle_memory_decision.md`](doc/auracle_memory_decision.md)）。

## 本地开发

```bash
git clone https://github.com/thinkinbig/auracle-dj-radio.git
cd auracle-dj-radio

# 曲库 mp3 走 Git LFS（首次 clone 需已安装 git-lfs）
git lfs install
git lfs pull

cp .env.example .env          # GEMINI_API_KEY；本地 pnpm dev 与 Docker 共用

pnpm install

# 全本机一条命令：music-engine(3010)+memory-service(3020)+agent-harness(3030)+proxy(:8090)+web(:5173)
# 从根 .env 读出 GEMINI_API_KEY 注入服务；Ctrl-C 整组退出。端口可 override（PROXY_PORT 等）。
pnpm dev                      # → http://localhost:5173
```

曲库 seed：`pnpm --filter @auracle/music-engine seed`（SQLite 元数据标签，无 embedding 建库步骤）。

### Docker 全栈（答辩 / 单机部署）

```bash
pnpm docker:prod                   # 构建并启动全栈（读 .env）
# 浏览器打开 http://localhost:8080  （WEB_PORT 可改）
pnpm docker:down                   # 停止容器，保留 volumes
```

Compose：`docker-compose.prod.yml`（答辩/部署，全栈含 **Qdrant for mem0**，仅暴露 web）。

Phase 1 Demo：**Desktop Chrome**。见 `doc/auracle_pwa_audio_notes.md`。

## 文档索引

| 文档 | 内容 |
|------|------|
| [auracle_architecture_storage.md](doc/auracle_architecture_storage.md) | 总架构、Demo vs 生产、SQLite、Gemini 分工 |
| [auracle_gemini_integration.md](doc/auracle_gemini_integration.md) | **Gemini 深度嵌入**（对照 Group 24 四支柱） |
| [auracle_api_protocol.md](doc/auracle_api_protocol.md) | REST + Live WS 协议、实现清单 |
| [auracle_flow_prompt_design.md](doc/auracle_flow_prompt_design.md) | 检索 + Flow 重排 + Live DJ |
| [auracle_memory_decision.md](doc/auracle_memory_decision.md) | mem0 OSS 自部署决策（已拍板） |
| [auracle_evaluation_design.md](doc/auracle_evaluation_design.md) | 用户实验与 objective 指标 |
| [auracle_pwa_audio_notes.md](doc/auracle_pwa_audio_notes.md) | Web Audio fade、PCM WS、平台限制 |
| [auracle_ui_design.md](doc/auracle_ui_design.md) | Web UI 风格、Design Tokens、组件与数据绑定 |

## License

See [LICENSE](LICENSE).
