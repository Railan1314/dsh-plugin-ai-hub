# AI 调度台（dsh-plugin-ds-console）

DSH 的左栏调度插件：把本机的模组流水线、地图、贴图、平衡、免费池、QQbot 和本机工具集中到一个面板里。

最初只想写个进程守护，让免费 AI 帮忙写模组；后来发现免费池效率不够，就把守护做成了调度台。再后来不想直接做模组内容，于是拆成两个插件：

- `ai-hub`（本仓库）：调度台
- `task-mod`：可选模组控制台，负责地图/贴图/平衡

不需要模组的人只装调度台即可。

> 当前版本：`2.1.0`（个人自用 / beta）
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
