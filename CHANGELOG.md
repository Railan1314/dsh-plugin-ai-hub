# Changelog

## 2.9.0

- 新增「会话雷达」：主页按工作区分组展示运行中/最近会话，含状态、轮次、ctx%、最后活跃；支持投递和打断，不显示对话内容
- 总指挥切换 DeepSeek V4 Pro，只做拆解与验收；新增独立 Pro 限流、Provider fallback 日志和可执行验收校验
- 新增 quota_type（daily/decay/paid）调度排序，AMD 按 /v1/usage 剩余额度选 key，paid job 标记
- 新增 WorkBuddy 原生账号/积分读取、XD Pool 网关控制和单 key 统一免费入口原型
- 免费模型评测支持 provider/keyName、latency_ms、tokens 和单次延时/token 探测
- 情报雷达新增 B站搜索、小米社区热议、热门榜和多源均衡
- 修复 DeepSeek 官方 `deepseek-flash` 显示为 V4f 的缩写问题

## 2.8.1

- 隐藏后台 PowerShell/Python 子进程窗口，减少偶发弹窗

## 2.8.0

- 统一进度/队列/日志/总指挥 API 与页面
- 模型评测 9 维与自动刷新
- health_guard 定期冒烟、辅助进程热重载
- 免费额度熔断、空输出判失败、job 历史清理

## 2.7.0

- 统一定位/进度 API、MCP、A2A agent card
- 模型评测 9 维、模型模块三态、OpenCode 免费模型动态读取
- job 幂等/失败换模型账号/健康守护/自动恢复
- 模组页 AI 任务和模型选择、DSH 会话进度
- 注册入口、API 清单、冒烟 15 项

## 2.6.2

- job 状态改为彩色徽标，running/succeeded/failed/cancelled 更易区分
- 表格列对比增强

## 2.6.1

- 工作流新增总指挥卡片：目标、状态、报告
- 总指挥状态每 15 秒刷新

## 2.6.0

- 新增 /api/commander，总指挥状态和报告可被 QQ bot/脚本读取
- 修复 worker 非零退出误报 succeeded，历史错误记录自动纠正

## 2.5.9

- 修复 worker returncode 非零却显示 succeeded：已成功记录也会自动纠正为 failed
- OpenCode 免费模型并入模型模块三态显示

## 2.5.8

- OpenCode 免费模型并入模型模块，使用同样的启用/备选/不启用三态
- 只显示去重后的模型，不按账号重复
- 异步派发只列出已启用/备选模型

## 2.5.7

- OpenCode 免费模型从客户端动态读取，不再按账号显示 9 个同名模型
- 工作流新增 OpenCode 免费模型启用开关
- 异步派发可选择免费模型

## 2.5.6

- 新增 free job：AMD headless worker，支持 audit/review 免费执行
- worker 非零退出正确标记 failed，不再误报 succeeded
- free 失败自动回退 OpenCode

## 2.5.5

- 修复 /api/local-search 多行 JSON 解析，冒烟全 PASS
- job 账号轮换与模型冷却
- commander 验收汇总

## 2.5.4

- 异步 job 支持指定 OpenCode account
- 调度失败重试时轮换免费模型和账号
- 健康守护/本地检索/commander 工具

## 2.5.3

- 所有模型使用带版本/档位缩写：V4.1f、V4p、GLM-5.3f、Gemma-4-31B
- 表格列区分、统一 API、健康守护

## 2.5.2

- /api/manifest 随插件发布，统一 API 清单
- /api/local-search 本地资料检索
- 表格列区分与模型简称

## 2.5.1

- 表格列分隔/表头对比优化
- 新增 /api/manifest 与 /api/local-search 本地资料检索
- GLM-5.3f 等模型简称

## 2.5.0

- 表格列增加分隔线和表头对比，矩阵供应商段更清晰
- 模型简称 GLM-5.3f；OpenCode 1~9 加入模型模块
- 新 provider 自动 IQ 探针；主动调度器按角色路由
- GitHub 生态调研报告归档

## 2.4.9

- GLM 显示为带版本号缩写（GLM-5.3f）
- 新接入 provider 自动跑鹈鹕 IQ，分数写入 dsh_config.model_iq
- 新增主动调度器 auto_scheduler.py，按 IQ 分数派发队列任务

## 2.4.8

- 模型简称：V4.1f / V4f / GLM / Gemma，用于并发矩阵和工作流
- OpenCode token 统计并入 bridge 台账，cache_read 计入
- Token 缓存会随 ledger 变更失效

## 2.4.7

- 模型模块新增 OpenCode 1~9 桥接分组
- 删除工作流底部显示列区域
- OpenCode token 台账并入供应商统计，包含 cache_read
- 文档补充异步任务/密钥接入/npm 安装

## 2.4.6

- 模型模块新增 OpenCode 1~9 桥接分组
- 删除工作流底部无用的显示列区域
- OpenCode token 统计包含 cache_read，修复 step_finish 解析

## 2.4.5

- 首屏状态缓存：Token/额度快照冷启动直接读盘
- OpenCode 子进程统一隐藏控制台窗口
- 并发矩阵按供应商独立列

## 2.4.4

- OpenCode 桥接会话复用：后续请求只带最后一条用户消息 + --session
- OpenCode 免费模型 fallback 到 big-pickle/tidepool/flint/mimo
- OpenCode 产出的模型按钮选中态样式合并

## 2.4.3

- OpenCode 任务派发表单：标题 + 提示词 + 一键派发
- 桥接免费模型 fallback：DeepSeek 限额后自动切 big-pickle / tidepool / flint
- 并发矩阵按供应商独立模型列

## 2.4.2

- 异步 job 总线：/api/jobs、/api/event、取消、进程回收、OpenCode worker
- OpenCode 1~4 本地桥接与四端口
- 并发矩阵表头改为「模型供应商/可选项」+「密钥/模型」两行
- 未知 Token 历史归入 AMD，OpenCode 单独统计

## 2.4.1

- 免费池侦察档案置顶显示，侦察空结果不覆盖旧数据
- 新增按供应商/每日 Token 消耗表，未知历史消耗归入 AMD
- 并发矩阵模型按钮移入各密钥供应商分组
- 密钥输入框可注册 DSH provider，支持直连/本地 OpenCode 桥接自动选择
- Token 统计与异步任务规划

## 2.4.0

- XD Pool 伴侣：只读账号池、模型、聚合渠道
- 统一模型来源 API：`/dsh-console/api/providers`
- 免费模型登记页：搜索、验证状态、绑卡、额度、IQ
- 定时任务页：读取 DSH schedule 并支持删除
- 三态模型选择：不启用 / 备选 / 启用，所有池子模型都列出
- 并发矩阵支持按模型显示/关闭
- key 角色分工：amd1–7 代码，amd8–13 地图/平衡，借用可识别
- 修复 `/api/sessions` 标题读取，QQ `/sessions` 可列出主对话
- 注册抓取回填、IQ 429 退避队列、统一 source provider 接口

## 2.3.0

- 模型三态：不启用 / 备选 / 启用，点击循环切换
- 调用列表展示所有池子：AMD 免费池与 DeepSeek 官方
- 首次只启用 V4.1，其余模型显示但不启用
- 并发矩阵恢复按模型列显示/关闭
- 工作流新增「模型模块」：调用与显示分离
- 新增「定时」页：读取 DSH schedule 服务并支持删除
- DSH 状态接口缓存，降低插件打开延迟
- 复盘页、任务历史、工时/验收字段

## 2.2.0

- 工单卡统一字段：工种、批次、验收
- 工作流表新增「工种 / 批次 / 验收」列
- 新增「复盘」页：按任务类型看 token / 耗时 / 异常
- 任务历史与操作记录进入状态快照
- 遥测分析可手动重新生成
- task-mod 批次字段：地图、贴图、平衡

## 2.1.0

- 任务控制 API：`status / soft-stop / stop / takeover / resume / review / approve`
- 任务历史归档：`tools/task_history.json`
- 批次字段：地图、贴图、平衡显示批次
- 工具接口扩充：GitHub、社区素材、浏览器搜索、素材索引、自检
- 免费池候选解析：provider、base URL、免费额度
- 任务遥测：按任务类型记录 token / 耗时
- README / RELEASE 发布材料
