# Auracle DJ Radio

AI 电台 DJ：实时语音对话 + 能量曲线编排 + Spotify 品味个性化。Demo 阶段为单用户 Web 应用。

## 架构概览（当前多服务 Demo）

```
apps/web (React)
  · Spotify OAuth / taste summary / playback adapter
  · REST ↔ agent-harness
  · Web Audio（本地曲库 mp3 + DJ voice）
       │
       ▼
agent-harness · music-engine · rt_llm_proxy · memory-service
  · live session / queue / replan
  · deterministic planning
  · Live DJ media bridge
  · auth + session_events
```

详细设计见 [`doc/`](doc/)。曲库检索 MVP 为确定性结构化打分（[`docs/adr/0001-deterministic-structured-selection.md`](docs/adr/0001-deterministic-structured-selection.md)）。跨 session taste 由 Spotify 提供；Auracle 只维护当前 live session 与 eval/events。旧 mem0/Qdrant 记忆方案已退休，见 [`doc/auracle_memory_decision.md`](doc/auracle_memory_decision.md)。

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

曲库无需 seed：music-engine 启动时直接把 `packages/catalog/data` 的 manifest 加载进内存(曲库为空则拒绝启动)。编辑曲库后只需重新导出浏览器用的 `tracks.json`：`pnpm --filter @auracle/catalog export-catalog`。

### Docker 全栈（答辩 / 单机部署）

```bash
pnpm docker:prod                   # 构建并启动全栈（读 .env）
# 浏览器打开 http://localhost:8080  （WEB_PORT 可改）
pnpm docker:down                   # 停止容器，保留 volumes
```

Compose：`docker-compose.prod.yml`（答辩/部署，仅暴露 web；旧 Qdrant/mem0 依赖正在从产品路径移除）。

Phase 1 Demo：**Desktop Chrome**。见 `doc/auracle_pwa_audio_notes.md`。

## 文档索引

| 文档 | 内容 |
|------|------|
| [auracle_architecture_storage.md](doc/auracle_architecture_storage.md) | 总架构、Demo vs 生产、SQLite、Gemini 分工 |
| [auracle_gemini_integration.md](doc/auracle_gemini_integration.md) | **Gemini 深度嵌入**（对照 Group 24 四支柱） |
| [auracle_api_protocol.md](doc/auracle_api_protocol.md) | REST + Live WS 协议、实现清单 |
| [auracle_flow_prompt_design.md](doc/auracle_flow_prompt_design.md) | 检索 + Flow 重排 + Live DJ |
| [auracle_memory_decision.md](doc/auracle_memory_decision.md) | 旧 mem0/Qdrant 记忆方案退休决策 |
| [auracle_evaluation_design.md](doc/auracle_evaluation_design.md) | 用户实验与 objective 指标 |
| [auracle_pwa_audio_notes.md](doc/auracle_pwa_audio_notes.md) | Web Audio fade、PCM WS、平台限制 |
| [auracle_ui_design.md](doc/auracle_ui_design.md) | Web UI 风格、Design Tokens、组件与数据绑定 |

## License

See [LICENSE](LICENSE).
