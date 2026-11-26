# AI 调度台（dsh-plugin-ai-hub）

DSH 的左栏调度插件：把本机的模组流水线、地图、贴图、平衡、免费池、QQbot 和本机工具集中到一个面板里。

> 当前版本：`2.9.8`（个人自用 / beta）
> 适配：DSH Desktop，Windows；依赖本机 Python 3.11、Node/DSH runtime。

## 功能

- **任务总览**：代码、地图、贴图、平衡四类任务的状态、批次、进度、worker/key 占用
- **并发矩阵**：本地 key 池 × 模型（V4.1 / V4 / GLM / Gemma），显示实际占用和空闲槽位
- **自动扩展**：按空闲槽位拉起扩展会话，支持阈值和上限
- **免费池侦察**：解析公开 GitHub 清单的免费 LLM provider，输出 base URL / 额度 / key 页面
- **地图工具**：许愿式命名、硬规则校验（出生点数量、矿、命名、差异化）
- **素材工具**：GitHub 地图/模组搜索、桌面 maps 索引、国内 rtsbox 社区抓取
- **浏览器搜索**：本机 Edge 无头搜索，截图 + DOM 文本，不走搜索 API
- **任务遥测**：按任务类型记录 token / 耗时，每小时找异常批次
- **自检**：插件语法、配置、token 账本、地图规则、监控状态
- **QQbot 接口**：`/hub`、`/githubmaps`、`/mapvalidate`、`/power` 等

## 2.9.x 新增

- **会话雷达**：控制台卡片 + DSH 右侧面板入口（开始页「更多」菜单），只列运行中/最近活跃会话（标题、轮次、ctx%），点一行原地切会话，不展示对话内容
- **MCP 层**：`tools/aihub_mcp_server.py` 为纯 HTTP 壳，17 个工具；`--stdio` 给本地客户端、`--sse --port 8790` 给远程 Agent（一次性 token）
- **新 API**：`GET /api/quota`（额度按供应商）、`GET /api/tool-stats`（工具调用失败率/耗时/失败原因聚类）、`GET /api/token-curve`（7 天 token 曲线）
- **429 熔断器**：`tools/circuit_breaker.py`，首次 429 冷却 300s、30 分钟内 3 次进冷宫 24h；默认关闭，`pipeline_config.json → circuit_breaker.enabled` 开启
- **一句话拆任务**：`tools/commander_llm.py`（V4 Pro → JSON 任务卡，schema 校验/重试/兜底）+ `tools/verify_acceptance.py`（可执行断言、陈旧产物判定）
- **发版辅助**：`tools/pack_plugin.py` 打 zip + sha256；`docs/release-checklist.md` 发版清单

## 接口一览

| 类型 | 端点 |
|---|---|
| 状态 | `/dsh-console/api/status`、`/api/health`、`/api/progress`、`/api/sessions` |
| 任务 | `POST /api/jobs`、`GET /api/jobs`、`POST /api/event`、`POST /api/pipeline` |
| 新增 | `GET /api/quota`、`GET /api/tool-stats?days=7`、`GET /api/token-curve?days=7` |
| 会话 | `GET /api/sessions`、`POST /api/inject`、`POST /api/session/interrupt` |

> MCP 基址解析：环境变量 `AIHUB_API_BASE` → `tools/ds_console_url.txt` → 默认 `127.0.0.1:57181/dsh-console`。

## 安装

1. 安装 DSH Desktop 和本机 Python 3.11
2. 把 `ai-hub` 目录作为 bundle 安装：

```text
DSH → 设置 → 插件 → 安装本地 bundle → 选择 插件/ai-hub
```

3. 需要模组控制台时再安装 `task-mod`

## 配置

主配置：

```text
tools\ds_console_settings.json
```

常用项：

```json
{
  "auto": true,
  "idleThreshold": 0.3,
  "expandTasks": 8,
  "mapAuto": true,
  "balanceAuto": true,
  "qqNotify": true
}
```

路径通过 `tools\` 下的脚本配置，不需要改插件源码。

## 本机 API

只监听回环地址：

```text
GET  /dsh-console/api/status
GET  /dsh-console/api/tasks
POST /dsh-console/api/tasks   {id, op}
POST /dsh-console/api/tool    {action, ...}
```

工具动作：

```text
github / github-mods / community / community-scout
browser-search / assets / asset-index / mapvalidate
self-check / power / resource / task
```

## 安全

- 插件**不读取、不写入 API key**；key 在 `tools\dsh_config.json`，不要提交到公开仓库
- `/dsh-console/api/*` 只绑本机回环，不做 token 鉴权；不要把 DSH 暴露到公网
- 发布前删除 `tools\notify_config.json`、`tools\paid_takeover.json`、`tools\token_ledger.json` 等个人数据
- 个人自用版本，按现状提供，不保证跨 DSH 版本兼容

## 开发

```text
index.js         Host：状态快照、任务控制、工具 API
client.js        Client：左栏面板与页面
cordis.patch.yml bundle 入口
locale/         中英文
```

改完 JS 后至少跑：

```powershell
node --check 插件\ai-hub\index.js
node --check 插件\ai-hub\client.js
python -X utf8 tools\self_check.py
```

## 已知限制

- 并发矩阵的 key 名称是本地映射，不对应真实账号
- 地图校验里的“矿”目前只检查非空资源格，不是严格资源池类型
- 浏览器搜索在无头模式下可能被 Bing/百度反爬隐藏结果，DOM 文本仍会保存
- 不是通用任务看板；任务模型偏模组流水线

## 反馈

带以下信息提 issue：

- 版本号
- 失败的任务类型 / 批次
- `tools\self_check.json` 和 `tools\telemetry_report.md` 的相关片段
- 不要贴完整 API key

## License

个人项目，未声明开源许可证；公开发布前请先决定 License（MIT / Apache-2.0 / 自用保留）。

---

## 项目核心目标

本项目围绕三件事持续迭代：

1. **代码能不能跑起来** —— 能装、能启动、能复现，比功能多更重要。
2. **README 写得清不清楚** —— 别人照着文档能跑通，不用来问你。
3. **有没有解决实际问题** —— 不做演示型功能，只解决真实的调度、额度、容灾问题。

## 开源与商业许可（Dual Licensing）

本项目默认遵循 **AGPL-3.0** 协议开源，个人使用、学习、开源项目集成都免费。

如果你所在的公司或团队希望在**闭源产品**或**SaaS 服务**中使用本项目，需要获取商业授权（Commercial License）。欢迎联系作者沟通：1453875289@qq.com。我们乐意用对双方都合适的方式合作。

## 贡献与免责

- 提交 PR 即视为同意将所提交代码的版权及商业化授权一并授予原作者（CLA 声明），以便项目在双许可模式下持续维护。
- 本项目仅供合法用途。**严禁**将本项目用于违规批量注册、账号农场、绕过平台风控等黑灰产场景；由此产生的一切后果由使用者自行承担，与作者无关。
