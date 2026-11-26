# 发布清单

## 1. 先决定范围

建议先发 **ai-hub 单插件**：

- 依赖少，安装即可看到调度台
- `task-mod` 作为可选增强，单独仓库/目录
- 地图、平衡、贴图相关脚本是外部工具，不塞进插件包

## 2. 上线前必须清理

- [ ] `tools\dsh_config.json`（API key）
- [ ] `tools\notify_config.json`（webhook/token）
- [ ] `tools\token_ledger.json` / `token_usage.json`（个人用量）
- [ ] `tools\paid_takeover.json`
- [ ] 日志、`_relay`、`生成地图`、`参考` 等个人产物
- [ ] 截图里不要出现 key、手机号、QQ、openid

## 3. 仓库建议

```text
dsh-plugin-ai-hub/
  package.json
  index.js
  client.js
  cordis.patch.yml
  icon.svg
  locale/
  README.md
  .gitignore
  docs/screenshots/
```

`package.json` 关键字段：

```json
{
  "name": "dsh-plugin-ai-hub",
  "version": "2.1.0",
  "description": "DSH 左栏调度台：任务、并发、免费池、地图/贴图/平衡工具",
  "keywords": ["dsh", "dsh-plugin", "scheduler", "dashboard"]
}
```

## 4. 插件市场索引

市场清单是公开 JSON，条目大致：

```json
{
  "name": "dsh-plugin-ai-hub",
  "title": { "en": "DSH Console", "zh": "AI 调度台" },
  "description": {
    "en": "Task, concurrency and local tool dashboard for DSH.",
    "zh": "DSH 左栏调度台：任务、并发、免费池和本机工具。"
  },
  "repo": "https://github.com/<you>/dsh-plugin-ai-hub",
  "category": "tools"
}
```

提交前先看市场索引仓库的 `index.json` 格式和 PR 规则。

## 5. 发布节奏

1. 先发 GitHub **private**，自己按安装流程装一遍
2. 录一张截图 + 一段 30 秒使用说明
3. 改 public，发 v2.1.0
4. 再提交市场索引
5. issue 模板要求附 `self_check.json`，不要附 key

## 7. 下一个版本的变更草稿（未发布，勿外发）

> 版本号待定（建议 2.9.9 小修 或 3.0.0 含新能力）。发布前需按 `docs\release-checklist.md` 走。

**新增能力**
- 会话雷达：控制台卡片 + DSH 右侧面板入口（`sidebarRightTabs` / `sidebar.right.pane.tab` / 开始页「更多」菜单），点击原地切会话
- MCP 层：`aihub_mcp_server.py` 改为纯 HTTP 壳，工具 13 → 17（新增 session_radar / start / stop_pipeline / quota），支持 `--stdio` 与 `--sse --port 8790`，SSE 一次性 token
- API：新增 `GET /api/quota`、`GET /api/tool-stats`、`GET /api/token-curve`
- 429 熔断器 `tools/circuit_breaker.py`（默认关闭，`pipeline_config.json → circuit_breaker.enabled` 开启）
- 总指挥 LLM 拆解 `tools/commander_llm.py` + 自动验收 `tools/verify_acceptance.py`（含陈旧产物判定）
- 工具统计 `tools/tool_stats.mjs`、平衡变化摘要 `tools/balance_rank_summary.py`

**修复**
- 桥接进程风暴（端口单实例锁 + manager 退避 + 插件 spawn 节流）
- 浏览器搜索乱码/查询丢失（`--query` + 编码探测）
- 流水线 paid 阶段静默失败（cmd.exe stdin + UTF-8 中文 → 改 PowerShell 管道）
- GBK 配置解码崩溃（`read_text_any`）
- 结束通知迟到/标题乱码、running 误判、key 数量口径（此前版本已修）

**资源清理**
- [ ] `~/.dsh/aihub-mcp-token`
- [ ] `tools\dsh_failure_debug.log`、`tools\paid_result_watch.json`、`tools\commander_plans\`
- [ ] `tools\commander_reports\` 中个人试验报告
- [ ] `tools\opencode_bridge_*.lock`、`opencode_bridge_state.json`
- [ ] `*.bak_*` 备份文件

## 6. 关于“被嘲笑”

公开项目被看的是：

- 能不能解决一个真实问题
- README 是否说清楚
- 出问题是否有日志/复现方式

代码不完美很常见。你这个插件的价值是**模组流水线 + 免费池 + 本机工具**这一整套，不是代码风格。先从 beta 开始，写明“个人自用、按现状提供”，比假装成熟更稳。
