# Changelog

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
