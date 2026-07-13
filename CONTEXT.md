# Clutch 架构梳理

> 基于 codegraph 索引(488 文件 / 8149 符号)的整体架构速览。2026-07 生成,细节以代码为准。

Clutch 是"桌面壳 + React 前端 + Python 编排 sidecar"的三层架构,核心思想是 **LangGraph 状态为唯一事实源(SSOT),前端只是它的投影**。

## 整体结构

```
┌─ apps/desktop ──────────────────────────────────────────┐
│  src-tauri (Rust, Tauri 2)          src (React 19)      │
│  · 启动时生成 UUID token             · App.tsx → AppGate  │
│  · spawn_sidecar 拉起 Python 进程    · ClutchStateStore   │
│  · 等待 8123 端口就绪                 (WebSocket 客户端)   │
└──────────────┬───────────────────────────┬──────────────┘
               │ 进程管理                    │ HTTP + WS (Bearer token)
┌──────────────▼───────────────────────────▼──────────────┐
│  services/orchestrator (FastAPI sidecar, ~104 个模块)     │
│  main.py → compiler → engine_router → adapters/PTY       │
└──────────────────────────────────────────────────────────┘
               │ 子进程 / PTY
        本地 CLI 工具(claude、codex、agy、zcode、ollama…)
```

## 三层职责

### 1. Tauri 壳(`apps/desktop/src-tauri/src/lib.rs`)

很薄,只做三件事:

- 注册少量 invoke 命令(选目录、查 OS、sidecar 补丁更新)
- 启动时生成一次性 token 并 `spawn_sidecar` 拉起打包好的 Python 进程,等 8123 端口就绪才放行 UI
- 通过 `SidecarState` 管理子进程生命周期

sidecar 鉴权在 Python 侧由 `SidecarAuthMiddleware` + `sidecar_auth.py`(OSR-08,`secrets.compare_digest`)校验。

### 2. React 前端(`apps/desktop/src`)

没有 Redux/Zustand,状态核心是手写的 `ClutchStateStore` 单例(`services/clutchState.ts`):持有 WebSocket 连接,接收 `state_patch` 等事件后合并进本地 `ClutchState` 再通知订阅者——前端不产生业务状态,只投影后端推送。

UI 大块划分:

- `ChatFeed` / `ChatInputBar` — 对话
- `WorkflowOrchestration` — React Flow 画布
- `terminal-orchestra/*` — D34 多 PTY 并行车道(dispatch 日志、handoff)
- `onboarding/*` — 首次引导向导
- 各类 Manager — Agent / Models / MCP / Skills / Theme
- `services/*Api.ts` — 按领域切分的瘦 HTTP 客户端

### 3. Python 编排器(`services/orchestrator/src`)

真正的大脑,分几条线:

- **状态契约**:`state.py` 的 `ClutchState` TypedDict,与 `packages/shared-types/index.ts` 手工保持一致(前后端唯一共享合同)。
- **工作流编译**:`compiler/compiler.py` 的 `WorkflowCompiler` 把画布导出的 workflow JSON(nodes + edges)编译成 LangGraph `StateGraph`——条件边走 `add_conditional_edges`,`human_gate` 节点用 `interrupt_before` + `MemorySaver` checkpointer 实现人工审批暂停/恢复(`begin_workflow` / `resume_workflow`)。
- **引擎路由**:`engine_router.py` 的 `route_engine` 按 agent 配置分发到具体执行引擎,输出统一为 `EngineResult` 并 sanitize。引擎实现在 `adapters/`(claude / agy / zcode / codex CLI、ollama、OpenAI images、视频)和 `llm/`(直连 HTTP completion 的 provider router)。
- **Hybrid PTY 运行时**(最重的一块):
  - `shell_session.py` — 长驻 bash PTY 池 + marker 协议判断命令结束
  - `interactive_pty_runtime.py` — 交互式 PTY 会话(Windows 走 winpty)
  - `claude_hybrid_output_parser.py` — 从 ANSI 终端噪音里解析 assistant 输出
  - `plain_chat_pool_queue.py` — 全局 shell 池排队
  - `terminal_orchestra.py` — 多车道调度
- **外围能力**:MCP 客户端与风险审批(`mcp_*.py`)、凭据管理(`credentials/`,含 Keychain)、workspace 沙箱路径校验(`workspace.py`,`apply_patch.py` 写文件必须经 `resolve_allowed_path`)、运行历史与快照(`run_history.py` / `run_state_store.py` / `session_snapshot.py`)。

## 值得参考的设计点

- **SSOT 单向数据流**:后端 LangGraph 状态 → WebSocket `state_patch` → 前端 store 合并 → React 渲染。前端零业务逻辑,状态同步问题被结构性消灭。
- **JSON → LangGraph 编译器**:零代码画布和执行引擎之间用显式编译层隔开;human-in-the-loop 直接复用 LangGraph 的 interrupt 机制,没有自造暂停逻辑。
- **CLI 适配层**:把"驱动本地 AI CLI"的脏活收敛到 adapters + 输出解析器,上层只见 `EngineResult`;PTY marker 协议(`__CLUTCH_DONE_x__` + prompt 检测)解决"怎么知道 CLI 跑完了"。
- **sidecar 安全模型**:Tauri 每次启动生成一次性 token 注入子进程环境,loopback HTTP/WS 全部要求 Bearer,常数时间比较。

## 注意

`services/orchestrator/src/graph.py` 里的 `build_minimal_graph` 是 M1 里程碑的骨架残留,真正的运行时是 `compiler/compiler.py`,读代码时别被它误导。
