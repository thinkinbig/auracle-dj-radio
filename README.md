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

详细设计见 [`doc/`](doc/)。

## 本地开发

```bash
git clone https://github.com/thinkinbig/auracle-dj-radio.git
cd auracle-dj-radio

cp .env.example .env   # GEMINI_API_KEY；mem0 自部署见下方

docker compose up -d qdrant   # mem0 OSS 向量库（持久化 ./data/qdrant）

pnpm install
pnpm dev               # api :3000 + web :5173（规划）
```

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
