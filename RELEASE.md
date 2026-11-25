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
dsh-plugin-ds-console/
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
  "name": "dsh-plugin-ds-console",
  "version": "2.1.0",
  "description": "DSH 左栏调度台：任务、并发、免费池、地图/贴图/平衡工具",
  "keywords": ["dsh", "dsh-plugin", "scheduler", "dashboard"]
}
```

## 4. 插件市场索引

市场清单是公开 JSON，条目大致：

```json
{
  "name": "dsh-plugin-ds-console",
  "title": { "en": "DSH Console", "zh": "AI 调度台" },
  "description": {
    "en": "Task, concurrency and local tool dashboard for DSH.",
    "zh": "DSH 左栏调度台：任务、并发、免费池和本机工具。"
  },
  "repo": "https://github.com/<you>/dsh-plugin-ds-console",
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

## 6. 关于“被嘲笑”

公开项目被看的是：

- 能不能解决一个真实问题
- README 是否说清楚
- 出问题是否有日志/复现方式

代码不完美很常见。你这个插件的价值是**模组流水线 + 免费池 + 本机工具**这一整套，不是代码风格。先从 beta 开始，写明“个人自用、按现状提供”，比假装成熟更稳。
