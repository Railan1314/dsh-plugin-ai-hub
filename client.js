/**
 * dsh-plugin-ds-console — 浏览器半（Client half）。
 *
 * 左栏「进程守护台」主面板，两个页签：
 *  - 流水线：状态、审计进度、工序、开关、启停、日志
 *  - 大肥鱼：QQ 官方机器人进程、白名单、群配置、主动推送、日志
 *
 * 数据只走宿主半的 /dsh-console/api/*，不读其它插件的 DOM。
 */
window.__ModuleLoader__.load({
  id: 'dsh-plugin-ai-hub',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'ds-console'
    const STATUS_URL = '/dsh-console/api/status'
    const ACTION_URL = '/dsh-console/api/action'
    const PANEL_ID = 'ds-console'
    const MODEL_GROUPS = [
      {
        name: 'AMD 免费池',
        models: ['V4.1', 'V4', 'V4 Vision', 'd3（V3）', 'd3-flash', 'Qwen3.8', 'GLM', 'MiMo', 'Gemma', 'MiniCPM5', 'MiniCPM-V 35B', 'MiniCPM-V 1B', 'Hy4', 'Clef'],
      },
      {
        name: 'DeepSeek 官方',
        models: ['deepseek-flash', 'deepseek-v4-pro'],
      },
    ]
    const ALL_MODELS = MODEL_GROUPS.flatMap((g) => g.models)
    const MATRIX_MODELS = ['V4.1', 'V4', 'GLM', 'Gemma']

    // 主机客户端给 DLC 用的模块注册表；DLC 的 client.js 往这里登记页签。
    window.__AI_HUB_UI__ = window.__AI_HUB_UI__ || (() => {
      const modules = []
      const listeners = new Set()
      const emit = () => listeners.forEach((fn) => fn(modules.slice()))
      return {
        registerModule(desc) {
          if (!desc || !desc.id) return () => {}
          const i = modules.findIndex((m) => m.id === desc.id)
          if (i >= 0) modules[i] = desc
          else modules.push(desc)
          emit()
          return () => {
            const j = modules.findIndex((m) => m.id === desc.id)
            if (j >= 0) modules.splice(j, 1)
            emit()
          }
        },
        listModules() {
          return modules.slice()
        },
        subscribe(fn) {
          listeners.add(fn)
          return () => listeners.delete(fn)
        },
      }
    })()

    const ZH = {
      panel: 'AI 调度台',
      title: 'AI 调度台',
      subtitle: '主机 · 密钥 / 并发 / 大肥鱼；任务由 DLC 注册',
      tabPipeline: '流水线',
      tabHome: '主页',
      tabWorkflow: '工作流',
      tabBot: '大肥鱼',
      running: '运行中',
      stopped: '已停止',
      refresh: '刷新',
      autoRefresh: '自动刷新',
      autoRefreshDesc: '每 3 秒读取一次状态，页面隐藏时暂停。',
      errorTitle: '连不上宿主半',
      errorHint: '请确认插件已启用、DSH 页面与宿主是同一个地址。',
      retry: '重试',
      auditProgress: '审计进度',
      checked: '已检查',
      phase: '当前阶段',
      round: '批次',
      cycle: '轮次',
      pid: 'PID',
      findings: '累计问题',
      version: '版本',
      lastTest: '上次测试',
      steps: '流水线工序',
      switches: '开关',
      actions: '操作',
      logs: '最近记录',
      watchdogLog: '守护记录',
      pipelineLog: '运行记录',
      noLog: '暂无记录。',
      refreshed: '已刷新',
      start: '启动流水线',
      stop: '优雅停止',
      clearStop: '清除 STOP',
      kill: '强制结束',
      killHint: '只结束守护台自己拉起的进程，并暂停自动守护。',
      loading: '读取中…',
      switchAuto: '自动守护',
      switchAutoDesc: '按间隔检查 pipeline.lock，没在跑就拉起流水线。',
      switchRestart: '异常自动重启',
      switchRestartDesc: '流水线非 0 退出时等待一段时间后重启；正常退出不重启。',
      switchNotify: '重启时手机通知',
      switchNotifyDesc: '重启或异常退出时调用 tools\\notify.py 发 PushPlus / 邮件。',
      on: '开',
      off: '关',
      bannerStop: 'STOP 文件存在：流水线会在当前步骤结束后停下，自动守护不会拉起新进程。',
      bannerExternal: '检测到外部启动的流水线，守护台只观察、不接管。',
      bannerSuppressed: '自动守护已暂停（刚被手动结束过），点“启动流水线”或重开“自动守护”恢复。',
      bannerAutoOff: '自动守护已关闭：守护台只显示状态，不会自己启动流水线。',
      pidNone: '—',
      stepFree: '免费审计',
      stepReview: '校对',
      stepPaid: '修复',
      stepRecheck: '复查',
      stepVersion: '版本 +0.001',
      stepTest: '第 2 次检测',
      stepSync: '同步',
      phaseFree: '免费审计',
      phaseReview: '校对',
      phasePaid: '修复',
      phaseRecheck: '复查',
      phaseDone: '已完成',
      phaseError: '出错',
      phaseStopped: '已停止',
      phaseIdle: '未开始',
      passed: '通过',
      failed: '失败',
      updatedAt: '更新于',
      toastStart: '已发送启动命令',
      toastGeneric: '已执行',
      rootPath: '工作区',
      restartCount: '重启次数',
      lastEvent: '最近事件',
      tasks: '四个任务',
      taskRunning: '工作中',
      taskIdle: '空闲',
      taskStopped: '已停止',
      taskUnwired: '待接入',
      taskStartBtn: '启动',
      taskStopBtn: '停止',
      tabOverview: '总览',
      tabCode: '代码',
      tabMap: '地图',
      tabArt: '贴图',
      tabBalance: '平衡',
      quotaTitle: '免费 AI 额度估算',
      quotaKeys: '可用密钥',
      quotaProviders: '路由',
      quotaSessions: '今日免费会话',
      quotaTokens: '估算 tokens',
      quotaPerKey: '每密钥均摊',
      quotaTotal: '累计估算',
      concurrency: '并发状态',
      concPipeline: '流水线',
      concAi: '贴图AI',
      concMap: '地图',
      concArt: '贴图',
      concKeys: '账户',
      concActual: '实际',
      concTheory: '理论最大',
      concTask: '任务',
      concTotal: '实际合计',
      sessionsTitle: '会话清理',
      sessionsTotal: '会话总数',
      sessionsCore: '核心对话（保留）',
      sessionsAuto: '检测/审批（可清）',
      sessionsArchived: '已归档',
      sessionsPreview: '预览要清的',
      sessionsClean: '清理检测会话',
      sessionsHint: '只清任务目录里流水线/检测/审批自动生成的会话；ds工作区主对话保留。清理是移到 _trash，不直接删。自动清理默认关闭。',
      sessionsDone: '已清理',
      balanceTitle: '总关联平衡调试',
      balanceUnits: '单位',
      balanceFactions: '阵营',
      balanceFactionRank: '阵营强度排序',
      balanceScore: '强度分',
      balanceTop: '性价比 Top',
      balanceSupply: '辎重 Top',
      balanceDesign: '地图设计标记',
      balanceRun: '重新计算',
      balanceSim: '关联模拟',
      balanceReport: '报告',
      deepProgress: '深做进度',
      currentItem: '当前',
      mapMines: '矿分类',
      mineMain: '主城',
      mineSquad: '小队',
      mineContested: '争夺',
      artDeep: '逐个深度理解',
      restrictionsTitle: '限制标注（可编辑）',
      restrictionsSave: '保存并重算',
      restrictionsHint: '格式：{"units": {"单位名": {"note": "原因", "extra": 25}}}；extra 越大，受限越多、有效强度越低。',
      tasksHint: '点卡片进入对应主页',
      openHint: '打开主页',
      taskMap: '地图',
      mapTitle: '地图任务',
      mapMaps: '地图数',
      mapMissing: '缺 tileset',
      mapBlank: '空 Ground 矿点',
      mapInvisible: '矿不可见',
      mapStart: '跑一次体检',
      mapStop: '停止',
      mapEmpty: '还没跑过，点「跑一次体检」。',
      mapReport: '报告',
      mapBalance: '平衡报告',
      mapSim: '关联平衡模拟',
      mapDesign: '设计平衡报告',
      mapLog: '地图任务日志',
      artTitle: '贴图任务',
      artTotal: '贴图总数',
      artIndexed: '已蒸馏',
      artRebuilt: '本轮更新',
      artStart: '开始蒸馏',
      artStop: '停止',
      artLog: '贴图任务日志',
      artReport: '报告',
      artPending: '持续跑：每 30 分钟增量蒸馏一轮（只做单位贴图，不做建筑）。',
      artHint: '已装 dsh-grsai-image（工具 image2_generate），在「设置 → 插件」里填 apiKey 后可用；像素图用提示词指定 pixel art + 透明背景。',
      botState: '机器人状态',
      botStart: '启动大肥鱼',
      botStop: '停止',
      botRestart: '重启',
      botAuto: '掉线自动拉起',
      botAutoDesc: '每隔一个巡检周期检查 --profile qqbot 进程，掉线就重新启动。',
      botConfig: '配置概览',
      appId: 'AppID',
      appSecret: 'AppSecret',
      model: '模型',
      cwd: '工作目录',
      botPatch: '配置文件',
      botWhitelist: '谁能跟它说话',
      accessHint: '一个格子填多个 ID 都行：换行、英文/中文逗号、分号、空格、竖线、顿号都能当分隔符。',
      c2cMode: '私聊模式',
      groupMode: '群聊模式',
      modeOpen: '所有人',
      modeAllowlist: '仅白名单',
      modeDisabled: '关闭',
      c2cAllow: '私聊白名单（用户 openid）',
      groupAllow: '群白名单（群 openid）',
      idsPlaceholder: '一行一个，或用逗号/分号隔开',
      saveAccess: '保存白名单',
      savedRestart: '保存成功，重启大肥鱼后生效。',
      groupCfg: '群与推送',
      groupNumber: '群号',
      groupOpenid: '群 openid',
      groupOpenidHint: '群里 @ 一次机器人，日志/model-prefs 里能拿到 group_openid，填这里才能主动往群里推。',
      saveGroup: '保存群配置',
      pushTarget: '推送到',
      pushGroup: '群',
      pushC2c: '私聊',
      pushId: '目标 ID',
      pushIdHint: '留空则用上面的群 openid / 私聊白名单第一个人。',
      pushText: '消息内容',
      pushSend: '发送',
      botQqNotify: '流水线异常时 QQ 通知',
      botQqNotifyDesc: '流水线异常退出的同时，用机器人应用私聊发一条给你。',
      botLogs: '机器人日志',
      botLastPush: '最近推送',
      botNoRun: '当前没在跑',
      botPids: '进程',
      botNotConfigured: '还没绑定：启动后在日志里找「扫码绑定链接」。',
      botHint: '大肥鱼是独立 profile（qqbot）里的 dsh 进程；控制台只负责启停、改白名单、推送。',
    }

    const EN = {
      panel: 'Console',
      title: 'Process Console',
      subtitle: 'ds workspace · pipeline + Fat Fish',
      tabPipeline: 'Pipeline',
      tabHome: 'Home',
      tabWorkflow: 'Workflows',
      tabBot: 'Fat Fish',
      running: 'Running',
      stopped: 'Stopped',
      refresh: 'Refresh',
      autoRefresh: 'Auto refresh',
      autoRefreshDesc: 'Reads status every 3 seconds; paused while the page is hidden.',
      errorTitle: 'Host half unreachable',
      errorHint: 'Check that the plugin is enabled and the page is served by the same DSH host.',
      retry: 'Retry',
      auditProgress: 'Audit progress',
      checked: 'Checked',
      phase: 'Phase',
      round: 'Batch',
      cycle: 'Cycle',
      pid: 'PID',
      findings: 'Findings',
      version: 'Version',
      lastTest: 'Last test',
      steps: 'Pipeline steps',
      switches: 'Switches',
      actions: 'Actions',
      logs: 'Recent records',
      watchdogLog: 'Watchdog log',
      pipelineLog: 'Run log',
      noLog: 'No records yet.',
      refreshed: 'Refreshed',
      start: 'Start pipeline',
      stop: 'Stop gracefully',
      clearStop: 'Clear STOP',
      kill: 'Force stop',
      killHint: 'Stops only the process this console started and pauses auto supervision.',
      loading: 'Loading…',
      switchAuto: 'Auto supervision',
      switchAutoDesc: 'Checks pipeline.lock on an interval and starts the pipeline when it is down.',
      switchRestart: 'Restart on failure',
      switchRestartDesc: 'Restarts after a non-zero exit; a clean exit stays stopped.',
      switchNotify: 'Phone notification',
      switchNotifyDesc: 'Calls tools\\notify.py on failure and restart.',
      on: 'On',
      off: 'Off',
      bannerStop: 'A STOP file exists: the pipeline stops after the current step and auto supervision stays idle.',
      bannerExternal: 'A pipeline started elsewhere is running; this console only observes it.',
      bannerSuppressed: 'Auto supervision is paused after a manual stop. Press Start, or toggle Auto supervision off and on.',
      bannerAutoOff: 'Auto supervision is off: the console only reports status.',
      pidNone: '—',
      stepFree: 'Free audit',
      stepReview: 'Review',
      stepPaid: 'Fixes',
      stepRecheck: 'Recheck',
      stepVersion: 'Version +0.001',
      stepTest: 'Second test',
      stepSync: 'Sync',
      phaseFree: 'Free audit',
      phaseReview: 'Review',
      phasePaid: 'Fixes',
      phaseRecheck: 'Recheck',
      phaseDone: 'Done',
      phaseError: 'Error',
      phaseStopped: 'Stopped',
      phaseIdle: 'Idle',
      passed: 'PASS',
      failed: 'FAIL',
      updatedAt: 'Updated',
      toastStart: 'Start command sent',
      toastGeneric: 'Done',
      rootPath: 'Workspace',
      restartCount: 'Restarts',
      lastEvent: 'Last event',
      tasks: 'Work streams',
      taskRunning: 'Working',
      taskIdle: 'Idle',
      taskStopped: 'Stopped',
      taskUnwired: 'Not wired',
      taskStartBtn: 'Start',
      taskStopBtn: 'Stop',
      tabOverview: 'Overview',
      tabCode: 'Code',
      tabMap: 'Maps',
      tabArt: 'Textures',
      tabBalance: 'Balance',
      quotaTitle: 'Free AI quota estimate',
      quotaKeys: 'Keys',
      quotaProviders: 'Routes',
      quotaSessions: 'Free sessions today',
      quotaTokens: 'Est. tokens',
      quotaPerKey: 'Per key',
      quotaTotal: 'Cumulative',
      concurrency: 'Concurrency',
      concPipeline: 'Pipeline',
      concAi: 'Texture AI',
      concMap: 'Maps',
      concArt: 'Textures',
      concKeys: 'Accounts',
      concActual: 'Actual',
      concTheory: 'Theoretical max',
      concTask: 'Task',
      concTotal: 'Actual total',
      sessionsTitle: 'Session cleanup',
      sessionsTotal: 'Sessions',
      sessionsCore: 'Core (kept)',
      sessionsAuto: 'Auto check/approval',
      sessionsArchived: 'Archived',
      sessionsPreview: 'Preview',
      sessionsClean: 'Clean auto sessions',
      sessionsHint: 'Only auto-generated pipeline/check/approval sessions under task folders are moved to _trash; ds workspace chats are kept. Auto cleanup is off by default.',
      sessionsDone: 'Cleaned',
      balanceTitle: 'Correlated balance',
      balanceUnits: 'Units',
      balanceFactions: 'Factions',
      balanceFactionRank: 'Faction strength ranking',
      balanceScore: 'Score',
      balanceTop: 'Best HP/cost',
      balanceSupply: 'Top supply',
      balanceDesign: 'Map design flags',
      balanceRun: 'Recompute',
      balanceSim: 'Simulation',
      balanceReport: 'Report',
      deepProgress: 'Deep progress',
      currentItem: 'Current',
      mapMines: 'Mines',
      mineMain: 'Home',
      mineSquad: 'Squad',
      mineContested: 'Contested',
      artDeep: 'Per-texture deep pass',
      restrictionsTitle: 'Restriction notes (editable)',
      restrictionsSave: 'Save & recompute',
      restrictionsHint: 'Format: {"units": {"unit": {"note": "why", "extra": 25}}}; bigger extra = more restricted, lower effective score.',
      tasksHint: 'Open a task page from a card',
      openHint: 'Open page',
      taskMap: 'Maps',
      mapTitle: 'Map task',
      mapMaps: 'Maps',
      mapMissing: 'Missing tilesets',
      mapBlank: 'Blank ground',
      mapInvisible: 'Invisible resources',
      mapStart: 'Run scan',
      mapStop: 'Stop',
      mapEmpty: 'Not run yet — press "Run scan".',
      mapReport: 'Report',
      mapBalance: 'Balance report',
      mapSim: 'Correlated simulation',
      mapDesign: 'Design balance report',
      mapLog: 'Map task log',
      artTitle: 'Texture task',
      artTotal: 'Textures',
      artIndexed: 'Distilled',
      artRebuilt: 'Re-indexed',
      artStart: 'Start distilling',
      artStop: 'Stop',
      artLog: 'Texture task log',
      artReport: 'Report',
      artPending: 'Continuous: incremental distillation every 30 minutes (unit textures only).',
      artHint: 'dsh-grsai-image is installed (tool image2_generate). Set apiKey in Settings → Plugins to use it; ask for pixel art with a transparent background.',
      botState: 'Bot state',
      botStart: 'Start bot',
      botStop: 'Stop',
      botRestart: 'Restart',
      botAuto: 'Restart when offline',
      botAutoDesc: 'Checks for the --profile qqbot process each cycle and starts it again when missing.',
      botConfig: 'Configuration',
      appId: 'AppID',
      appSecret: 'AppSecret',
      model: 'Model',
      cwd: 'Working directory',
      botPatch: 'Config file',
      botWhitelist: 'Who may talk to it',
      accessHint: 'Paste ids in any mix of newlines, commas, semicolons, spaces or pipes.',
      c2cMode: 'Direct messages',
      groupMode: 'Group messages',
      modeOpen: 'Everyone',
      modeAllowlist: 'Allowlist',
      modeDisabled: 'Off',
      c2cAllow: 'Direct allowlist (user openid)',
      groupAllow: 'Group allowlist (group openid)',
      idsPlaceholder: 'One per line, or separated by commas',
      saveAccess: 'Save allowlists',
      savedRestart: 'Saved. Restart the bot to apply.',
      groupCfg: 'Groups and push',
      groupNumber: 'Group number',
      groupOpenid: 'Group openid',
      groupOpenidHint: 'Mention the bot once in the group to learn its group_openid, then save it here for proactive pushes.',
      saveGroup: 'Save group config',
      pushTarget: 'Send to',
      pushGroup: 'Group',
      pushC2c: 'Direct',
      pushId: 'Target id',
      pushIdHint: 'Leave empty to use the group openid above or the first direct allowlist entry.',
      pushText: 'Message',
      pushSend: 'Send',
      botQqNotify: 'QQ alert on pipeline failure',
      botQqNotifyDesc: 'Sends a direct message with the bot credentials when the pipeline exits abnormally.',
      botLogs: 'Bot log',
      botLastPush: 'Last push',
      botNoRun: 'Not running',
      botPids: 'Processes',
      botNotConfigured: 'Not bound yet: start it and look for the QR link in the log.',
      botHint: 'Fat Fish is a dsh process in its own qqbot profile; this console only starts, stops, edits and pushes.',
    }

    const CSS = `
.dsc-root{box-sizing:border-box;height:100%;overflow-y:auto;color:var(--dsw-alias-label-primary)}
.dsc-inner{max-width:1020px;margin:0 auto;padding:calc(var(--dsh-frame-top-clearance,0px) + 18px) 28px 44px;display:flex;flex-direction:column;gap:16px}
.dsc-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}
.dsc-title{display:flex;gap:12px;align-items:center;min-width:0}
.dsc-logo{width:38px;height:38px;border-radius:11px;display:flex;align-items:center;justify-content:center;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-brand-primary);flex:none}
.dsc-h1{font-size:17px;font-weight:600;margin:0;line-height:1.3;letter-spacing:.2px}
.dsc-sub{font-size:12px;color:var(--dsw-alias-label-secondary);margin:3px 0 0;line-height:1.4}
.dsc-headright{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.dsc-pill{display:inline-flex;align-items:center;gap:7px;font-size:12px;padding:5px 11px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);white-space:nowrap}
.dsc-dot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-idle-primary);flex:none}
.dsc-pill.on{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary)}
.dsc-pill.on .dsc-dot{background:var(--dsw-alias-state-success-primary)}
.dsc-pill.muted{color:var(--dsw-alias-label-secondary)}
.dsc-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;padding:0 14px;border-radius:9px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:13px;font-family:inherit;cursor:pointer;transition:background .12s ease,border-color .12s ease}
.dsc-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}
.dsc-btn:disabled{opacity:.42;cursor:not-allowed}
.dsc-btn.primary{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
.dsc-btn.danger{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}
.dsc-tabs{display:inline-flex;gap:4px;padding:4px;border-radius:11px;background:var(--dsw-alias-bg-layer-2);align-self:flex-start}
.dsc-tab{font-family:inherit;font-size:13px;padding:6px 16px;border-radius:8px;border:none;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.dsc-tab.is-on{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);box-shadow:0 1px 3px rgba(0,0,0,.12)}
.dsc-card{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:14px;padding:16px 18px}
.dsc-hero{display:flex;gap:22px;align-items:center;flex-wrap:wrap}
.dsc-ring{flex:none;width:92px;height:92px}
.dsc-ringtext{font-size:17px;font-weight:600;fill:var(--dsw-alias-label-primary)}
.dsc-ringcap{font-size:9.5px;fill:var(--dsw-alias-label-secondary)}
.dsc-heroinfo{flex:1;min-width:240px;display:flex;flex-direction:column;gap:10px}
.dsc-herotop{display:flex;align-items:baseline;justify-content:space-between;gap:12px;font-size:12.5px;color:var(--dsw-alias-label-secondary)}
.dsc-herotop strong{font-size:14px;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums}
.dsc-bar{position:relative;height:8px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);overflow:hidden}
.dsc-bar i{position:absolute;inset:0 auto 0 0;border-radius:999px;background:var(--dsw-alias-brand-primary);transition:width .35s ease}
.dsc-chips{display:flex;gap:8px;flex-wrap:wrap}
.dsc-chip{font-size:11.5px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);border-radius:7px;padding:4px 9px;white-space:nowrap}
.dsc-chip b{color:var(--dsw-alias-label-primary);font-weight:600;font-variant-numeric:tabular-nums}
.dsc-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(148px,1fr));gap:12px}
.dsc-metric{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:13px;padding:13px 15px;display:flex;flex-direction:column;gap:6px;min-width:0}
.dsc-metric-k{font-size:11.5px;color:var(--dsw-alias-label-secondary)}
.dsc-metric-v{font-size:18px;font-weight:600;line-height:1.25;font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsc-metric-v.is-compact{font-size:12.5px;font-weight:500;line-height:1.45;white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-word}
.dsc-metric-h{font-size:11px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsc-sec-title{font-size:12.5px;font-weight:600;margin:0 0 12px;display:flex;align-items:center;justify-content:space-between;gap:12px}
.dsc-sec-title small{font-weight:400;color:var(--dsw-alias-label-secondary);font-size:11.5px}
.dsc-steps{display:flex;gap:8px;flex-wrap:wrap}
.dsc-step{display:inline-flex;align-items:center;gap:7px;font-size:12px;padding:6px 11px;border-radius:9px;border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);background:transparent}
.dsc-step i{width:16px;height:16px;border-radius:50%;border:1px solid var(--dsw-alias-border-l2);display:inline-flex;align-items:center;justify-content:center;font-size:9.5px;font-style:normal;flex:none}
.dsc-step.active{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}
.dsc-step.active i{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base)}
.dsc-step.done{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}
.dsc-step.done i{border-color:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-state-success-primary)}
.dsc-switchrow{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:13px 0;border-top:1px solid var(--dsw-alias-border-l1)}
.dsc-switchrow:first-child{border-top:none;padding-top:2px}
.dsc-rowtext{min-width:0}
.dsc-rowtitle{font-size:13.5px;font-weight:500}
.dsc-rowdesc{font-size:11.5px;color:var(--dsw-alias-label-secondary);margin-top:3px;line-height:1.45}
.dsc-switch{position:relative;flex:none;width:44px;height:25px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);cursor:pointer;padding:0;transition:background .15s ease,border-color .15s ease}
.dsc-switch:disabled{opacity:.5;cursor:not-allowed}
.dsc-switch.is-on{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}
.dsc-knob{position:absolute;top:2px;left:2px;width:19px;height:19px;border-radius:50%;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l1);transition:transform .16s ease}
.dsc-switch.is-on .dsc-knob{transform:translateX(19px)}
.dsc-actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.dsc-actions .dsc-hint{font-size:11.5px;color:var(--dsw-alias-label-secondary);margin-left:2px}
.dsc-banner{display:flex;gap:9px;align-items:flex-start;font-size:12px;line-height:1.5;padding:11px 13px;border-radius:11px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary)}
.dsc-banner.err{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}
.dsc-banner.warn{border-color:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-state-warn-primary)}
.dsc-logs{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.dsc-log{min-width:0}
.dsc-log h4{font-size:11.5px;font-weight:600;color:var(--dsw-alias-label-secondary);margin:0 0 8px}
.dsc-logpre{margin:0;max-height:190px;overflow:auto;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11px;line-height:1.65;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;word-break:break-word}
.dsc-toast{position:sticky;bottom:0;align-self:center;font-size:12px;padding:8px 14px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);box-shadow:0 6px 20px rgba(0,0,0,.16)}
.dsc-toast.err{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}
.dsc-kv{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px 18px}
.dsc-kvrow{display:flex;flex-direction:column;gap:2px;min-width:0}
.dsc-k{font-size:11px;color:var(--dsw-alias-label-secondary)}
.dsc-v{font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsc-v.mono{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11.5px}
.dsc-field{display:flex;flex-direction:column;gap:6px;margin-top:14px}
.dsc-label{font-size:12px;font-weight:500;display:flex;align-items:center;justify-content:space-between;gap:10px}
.dsc-label small{font-weight:400;color:var(--dsw-alias-label-secondary);font-size:11px}
.dsc-input,.dsc-textarea{width:100%;box-sizing:border-box;font-family:inherit;font-size:12.5px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l1);border-radius:9px;padding:8px 10px;outline:none}
.dsc-input:focus,.dsc-textarea:focus{border-color:var(--dsw-alias-brand-primary)}
.dsc-textarea{resize:vertical;line-height:1.6;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11.5px;min-height:64px}
.dsc-seg{display:inline-flex;gap:3px;padding:3px;border-radius:9px;background:var(--dsw-alias-bg-layer-2)}
.dsc-segbtn{font-family:inherit;font-size:12px;padding:5px 12px;border-radius:7px;border:none;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.dsc-segbtn.is-on{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}
.dsc-segbtn:disabled{opacity:.5;cursor:not-allowed}
.dsc-note{font-size:11px;color:var(--dsw-alias-label-secondary);line-height:1.55}
.dsc-tasks{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}
.dsc-task{display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-2);font-family:inherit;color:inherit;text-align:left;width:100%;cursor:pointer}
.dsc-task:hover{background:var(--dsw-alias-bg-layer-1)}
.dsc-taskdot{width:10px;height:10px;border-radius:50%;flex:none;background:var(--dsw-alias-state-idle-primary)}
.dsc-taskdot.is-running{background:var(--dsw-alias-state-success-primary);box-shadow:0 0 0 4px color-mix(in srgb,var(--dsw-alias-state-success-primary) 22%,transparent)}
.dsc-taskdot.is-stopped{background:var(--dsw-alias-state-warn-primary)}
.dsc-taskdot.is-unwired{background:var(--dsw-alias-border-l2)}
.dsc-taskname{font-size:13px;font-weight:600}
.dsc-taskstate{font-size:11px;color:var(--dsw-alias-label-secondary);margin-top:2px}
.dsc-taskbody{flex:1;min-width:0}
.dsc-mini{flex:none;font-family:inherit;font-size:11.5px;padding:4px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);cursor:pointer}
.dsc-mini:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}
.dsc-mini:disabled{opacity:.45;cursor:not-allowed}
.dsc-table{width:100%;border-collapse:collapse;font-size:12px;display:block;max-height:360px;overflow-y:auto;overflow-x:auto}.dsc-table thead{position:sticky;top:0;background:var(--dsw-alias-bg-layer-2)}.dsc-table tbody tr:nth-child(even){background:var(--dsw-alias-bg-layer-2)}.dsc-table tbody tr:nth-child(-n+3){background:color-mix(in srgb,var(--dsw-alias-brand-primary) 10%,transparent)}.dsc-table td:first-child,.dsc-table th:first-child{width:36px;color:var(--dsw-alias-label-secondary)}.dsc-table tbody{counter-reset:row}.dsc-table tbody tr{counter-increment:row}.dsc-table tbody td:first-child::before{content:counter(row) ". ";color:var(--dsw-alias-label-secondary);font-size:11px}
.dsc-table th,.dsc-table td{text-align:left;padding:5px 8px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.dsc-table th{color:var(--dsw-alias-label-secondary);font-weight:600}
.dsc-matrix td:first-child,.dsc-matrix th:first-child{width:auto;color:inherit}
.dsc-matrix tbody td:first-child::before{content:none}
.dsc-matrix td,.dsc-matrix th{text-align:center;white-space:nowrap}
.dsc-matrix td:first-child,.dsc-matrix th:first-child{text-align:left}
.dsc-matrix tbody tr:nth-child(even),.dsc-matrix tbody tr:nth-child(-n+3){background:transparent}
.dsc-matrix tbody tr:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsc-matrix .dsc-cell-busy{color:var(--dsw-alias-state-business-primary);font-weight:600}
.dsc-flaglist{margin:8px 0 0;padding-left:18px;font-size:12px;line-height:1.7;color:var(--dsw-alias-label-primary)}
.dsc-textarea{width:100%;min-height:180px;font-family:Consolas,monospace;font-size:12px;line-height:1.5;padding:10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);resize:vertical;box-sizing:border-box}
.dsc-row2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media (max-width:880px){.dsc-logs{grid-template-columns:1fr}.dsc-row2{grid-template-columns:1fr}.dsc-inner{padding-left:18px;padding-right:18px}}
`

    /* ------------------------------ 基础组件 ------------------------------ */

    function picker(t) {
      return function tr(key) {
        try {
          const value = t(key)
          if (typeof value === 'string' && value.trim() !== '') return value
        } catch (error) {
          /* 词典缺失时回退中文 */
        }
        return ZH[key] || key
      }
    }

    function ConsoleIcon(props) {
      const size = props && props.size ? props.size : 20
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
          focusable: 'false',
        },
        h('path', { d: 'M12 3.2l6.8 2.9v5.6c0 4.1-2.8 7.4-6.8 8.9-4-1.5-6.8-4.8-6.8-8.9V6.1L12 3.2z' }),
        h('path', { d: 'M8.7 12.2l2.3 2.3 4.4-4.6' }),
      )
    }

    function ProgressRing(props) {
      const value = Math.max(0, Math.min(100, Number(props.value) || 0))
      const r = 34
      const c = 2 * Math.PI * r
      return h(
        'svg',
        { className: 'dsc-ring', viewBox: '0 0 84 84', role: 'img', 'aria-label': props.label + ' ' + value + '%' },
        h('circle', { cx: 42, cy: 42, r: r, fill: 'none', stroke: 'var(--dsw-alias-bg-layer-2)', strokeWidth: 8 }),
        h('circle', {
          cx: 42,
          cy: 42,
          r: r,
          fill: 'none',
          stroke: 'var(--dsw-alias-brand-primary)',
          strokeWidth: 8,
          strokeLinecap: 'round',
          strokeDasharray: c + ' ' + c,
          strokeDashoffset: c * (1 - value / 100),
          transform: 'rotate(-90 42 42)',
          style: { transition: 'stroke-dashoffset .45s ease' },
        }),
        h('text', { x: 42, y: 40, textAnchor: 'middle', dominantBaseline: 'middle', className: 'dsc-ringtext' }, value + '%'),
        h('text', { x: 42, y: 55, textAnchor: 'middle', className: 'dsc-ringcap' }, props.caption || ''),
      )
    }

    function Switch(props) {
      return h(
        'button',
        {
          type: 'button',
          role: 'switch',
          'aria-checked': props.checked ? 'true' : 'false',
          'aria-label': props.label,
          className: 'dsc-switch' + (props.checked ? ' is-on' : ''),
          disabled: Boolean(props.disabled),
          onClick: () => props.onChange(!props.checked),
        },
        h('span', { className: 'dsc-knob' }),
      )
    }

    function SwitchRow(props) {
      return h(
        'div',
        { className: 'dsc-switchrow' },
        h(
          'div',
          { className: 'dsc-rowtext' },
          h('div', { className: 'dsc-rowtitle' }, props.title),
          props.desc ? h('div', { className: 'dsc-rowdesc' }, props.desc) : null,
        ),
        h(Switch, { checked: props.checked, disabled: props.disabled, label: props.title, onChange: props.onChange }),
      )
    }

    function Metric(props) {
      return h(
        'div',
        { className: 'dsc-metric' },
        h('div', { className: 'dsc-metric-k' }, props.label),
        h('div', { className: 'dsc-metric-v' + (props.compact ? ' is-compact' : '') }, props.value),
        props.hint ? h('div', { className: 'dsc-metric-h' }, props.hint) : null,
      )
    }

    function Card(props) {
      return h(
        'section',
        { className: 'dsc-card' },
        props.title
          ? h('h3', { className: 'dsc-sec-title' }, props.title, props.extra ? h('small', null, props.extra) : null)
          : null,
        props.children,
      )
    }

    function Segmented(props) {
      return h(
        'div',
        { className: 'dsc-seg' },
        props.options.map((option) =>
          h(
            'button',
            {
              key: option.value,
              type: 'button',
              disabled: props.disabled,
              className: 'dsc-segbtn' + (option.value === props.value ? ' is-on' : ''),
              onClick: () => props.onChange(option.value),
            },
            option.label,
          ),
        ),
      )
    }

    function TextArea(props) {
      return h('textarea', {
        className: 'dsc-textarea',
        value: props.value,
        rows: props.rows || 3,
        placeholder: props.placeholder || '',
        disabled: props.disabled,
        spellCheck: false,
        onChange: (event) => props.onChange(event.target.value),
      })
    }

    function TextInput(props) {
      return h('input', {
        className: 'dsc-input',
        type: 'text',
        value: props.value,
        placeholder: props.placeholder || '',
        disabled: props.disabled,
        spellCheck: false,
        onChange: (event) => props.onChange(event.target.value),
      })
    }

    function Field(props) {
      return h(
        'div',
        { className: 'dsc-field' },
        h('div', { className: 'dsc-label' }, h('span', null, props.label), props.hint ? h('small', null, props.hint) : null),
        props.children,
      )
    }

    const STEPS = ['free', 'review', 'paid', 'recheck', 'version', 'test', 'sync']
    const STEP_LABELS = {
      free: 'stepFree',
      review: 'stepReview',
      paid: 'stepPaid',
      recheck: 'stepRecheck',
      version: 'stepVersion',
      test: 'stepTest',
      sync: 'stepSync',
    }
    const PHASE_LABELS = {
      free: 'phaseFree',
      review: 'phaseReview',
      paid: 'phasePaid',
      recheck: 'phaseRecheck',
      done: 'phaseDone',
      error: 'phaseError',
      stopped: 'phaseStopped',
    }

    function stepState(phase) {
      if (phase === 'done') return { index: STEPS.length, complete: true }
      return { index: STEPS.indexOf(phase), complete: false }
    }

    async function call(url, init) {
      const response = await fetch(url, Object.assign({ cache: 'no-store' }, init || {}))
      if (!response.ok) throw new Error('HTTP ' + response.status)
      return response.json()
    }

    /* ------------------------------ 流水线页 ------------------------------ */

    function PipelineView(props) {
      const { snap, act, busy, tr } = props
      const pipeline = snap.pipeline || {}
      const watchdog = snap.watchdog || {}
      const settings = snap.settings || {}
      const logs = snap.logs || {}
      const wf = pipeline.workflow || {}
      const wfActive = Boolean(wf.stage && wf.total > 0 && (wf.stage === 'review' || wf.stage === 'fix'))
      let percent = pipeline.total > 0 ? Math.round((Number(pipeline.checked) || 0) / Number(pipeline.total) * 100) : 0
      if (wfActive) {
        percent = Math.round((wf.done / wf.total) * 100)
      }
      const progressLabel = wf.stage === 'fix' ? '修改进度' : wf.stage === 'review' ? '校对进度' : tr('auditProgress')
      const progressValue = wfActive
        ? `${wf.done || 0} / ${wf.total}`
        : `${pipeline.checked || 0} / ${pipeline.total || 0}`
      const phaseText = tr(PHASE_LABELS[pipeline.phase] || 'phaseIdle')
      const step = stepState(pipeline.phase)
      const running = Boolean(pipeline.running)

      const banners = []
      if (pipeline.stop) banners.push({ tone: 'warn', key: 'bannerStop', text: tr('bannerStop') })
      if (pipeline.external) banners.push({ tone: 'warn', key: 'bannerExternal', text: tr('bannerExternal') })
      if (watchdog.suppressed) banners.push({ tone: 'warn', key: 'bannerSuppressed', text: tr('bannerSuppressed') })
      if (!settings.auto && !pipeline.stop && !watchdog.suppressed) banners.push({ tone: 'plain', key: 'bannerAutoOff', text: tr('bannerAutoOff') })

      const logBox = (title, lines) =>
        h(
          'div',
          { className: 'dsc-log' },
          h('h4', null, title),
          h('pre', { className: 'dsc-logpre' }, lines && lines.length ? lines.slice(-14).join('\n') : tr('noLog')),
        )

      return h(
        React.Fragment,
        null,
        banners.map((banner) =>
          h('div', { key: banner.key, className: 'dsc-banner' + (banner.tone === 'err' ? ' err' : banner.tone === 'warn' ? ' warn' : '') }, banner.text),
        ),
        h(
          'section',
          { className: 'dsc-card dsc-hero' },
          h(ProgressRing, { value: percent, label: progressLabel, caption: '%' }),
          h(
            'div',
            { className: 'dsc-heroinfo' },
            h('div', { className: 'dsc-herotop' }, h('span', null, progressLabel), h('strong', null, progressValue)),
            h('div', { className: 'dsc-bar' }, h('i', { style: { width: percent + '%' } })),
            h(
              'div',
              { className: 'dsc-chips' },
              h('span', { className: 'dsc-chip' }, tr('phase'), ' ', h('b', null, phaseText)),
              h('span', { className: 'dsc-chip' }, tr('cycle'), ' ', h('b', null, String(pipeline.cycle || 0))),
              h('span', { className: 'dsc-chip' }, tr('round'), ' ', h('b', null, String(pipeline.round || 0))),
              h('span', { className: 'dsc-chip' }, tr('pid'), ' ', h('b', null, pipeline.pid ? String(pipeline.pid) : tr('pidNone'))),
            ),
            h(
              'div',
              { className: 'dsc-steps', style: { marginTop: '10px' } },
              STEPS.map((key, index) =>
                h(
                  'span',
                  {
                    key: key,
                    className: 'dsc-step' + (step.complete || index < step.index ? ' done' : '') + (!step.complete && index === step.index ? ' active' : ''),
                  },
                  h('i', null, step.complete || index < step.index ? '✓' : String(index + 1)),
                  tr(STEP_LABELS[key]),
                ),
              ),
            ),
          ),
        ),
        h(
          'section',
          { className: 'dsc-metrics' },
          h(Metric, { label: tr('findings'), value: String(pipeline.findings || 0), hint: tr('cycle') + ' ' + (pipeline.cycle || 0) }),
          h(Metric, { label: tr('version'), value: pipeline.version || '1.45', hint: tr('lastTest') + ' ' + (pipeline.lastTest || '—') }),
          h(Metric, { label: tr('restartCount'), value: String(watchdog.restarts || 0), hint: watchdog.lastExitAt || '—' }),
          h(Metric, { label: tr('lastEvent'), value: watchdog.lastEvent || '—', compact: true, hint: pipeline.updated ? tr('updatedAt') + ' ' + pipeline.updated : '' }),
        ),
        h(
          'section',
          { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, tr('switches')),
          h(SwitchRow, {
            title: tr('switchAuto'),
            desc: tr('switchAutoDesc'),
            checked: Boolean(settings.auto),
            disabled: Boolean(busy),
            onChange: (value) => act({ type: 'setting', key: 'auto', value: value }, value ? tr('on') : tr('off')),
          }),
          h(SwitchRow, {
            title: tr('switchRestart'),
            desc: tr('switchRestartDesc'),
            checked: Boolean(settings.restartOnFailure),
            disabled: Boolean(busy),
            onChange: (value) => act({ type: 'setting', key: 'restartOnFailure', value: value }, value ? tr('on') : tr('off')),
          }),
          h(SwitchRow, {
            title: tr('switchNotify'),
            desc: tr('switchNotifyDesc'),
            checked: Boolean(settings.notify),
            disabled: Boolean(busy),
            onChange: (value) => act({ type: 'setting', key: 'notify', value: value }, value ? tr('on') : tr('off')),
          }),
        ),
        h(
          'section',
          { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, tr('actions'), h('small', null, tr('killHint'))),
          h(
            'div',
            { className: 'dsc-actions' },
            h('button', { type: 'button', className: 'dsc-btn primary', disabled: Boolean(busy) || running, onClick: () => act({ type: 'start' }, tr('toastStart')) }, tr('start')),
            h('button', { type: 'button', className: 'dsc-btn', disabled: Boolean(busy) || Boolean(pipeline.stop), onClick: () => act({ type: 'stop' }, tr('stop')) }, tr('stop')),
            h('button', { type: 'button', className: 'dsc-btn', disabled: Boolean(busy) || !pipeline.stop, onClick: () => act({ type: 'clear-stop' }, tr('clearStop')) }, tr('clearStop')),
            h('button', { type: 'button', className: 'dsc-btn danger', disabled: Boolean(busy) || !watchdog.childPid, onClick: () => act({ type: 'kill' }, tr('kill')) }, tr('kill')),
          ),
        ),
        h(
          'section',
          { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, tr('logs'), h('small', null, snap.root || '')),
          h('div', { className: 'dsc-logs' }, logBox(tr('watchdogLog'), logs.watchdog), logBox(tr('pipelineLog'), logs.pipeline)),
        ),
      )
    }

    /* ------------------------------ 大肥鱼页 ------------------------------ */

    function BotView(props) {
      const { snap, act, busy, tr } = props
      const bot = snap.bot || {}
      const configured = bot.configured || {}
      const group = bot.group || {}
      const [draft, setDraft] = React.useState(null)

      React.useEffect(() => {
        if (draft || !snap.bot) return
        setDraft({
          c2cMode: configured.c2cMode || 'allowlist',
          c2cAllowText: (configured.c2cAllow || []).join('\n'),
          groupMode: configured.groupMode || 'open',
          groupAllowText: (configured.groupAllow || []).join('\n'),
          groupNumber: group.groupNumber || '',
          groupOpenid: group.groupOpenid || '',
          pushTarget: 'c2c',
          pushId: '',
          pushText: '',
        })
      }, [snap, draft, configured, group])

      if (!draft) return null
      const patch = (key, value) => setDraft(Object.assign({}, draft, { [key]: value }))
      const running = Boolean(bot.running)
      const modules = window.__AI_HUB_UI__ ? window.__AI_HUB_UI__.listModules() : []

      const saveAccess = () =>
        act(
          {
            type: 'bot-access',
            c2cMode: draft.c2cMode,
            c2cAllow: draft.c2cAllowText,
            groupMode: draft.groupMode,
            groupAllow: draft.groupAllowText,
          },
          tr('saveAccess'),
        )

      const saveGroup = () =>
        act({ type: 'bot-group', groupNumber: draft.groupNumber, groupOpenid: draft.groupOpenid }, tr('saveGroup'))

      const push = async () => {
        const result = await act(
          { type: 'bot-push', target: draft.pushTarget, id: draft.pushId, text: draft.pushText },
          tr('pushSend'),
        )
        if (result && result.ok) patch('pushText', '')
      }

      const kv = (label, value, mono) =>
        h(
          'div',
          { className: 'dsc-kvrow' },
          h('div', { className: 'dsc-k' }, label),
          h('div', { className: 'dsc-v' + (mono ? ' mono' : ''), title: String(value || '') }, value || '—'),
        )

      return h(
        React.Fragment,
        null,
        !configured.hasSecret
          ? h('div', { className: 'dsc-banner warn' }, tr('botNotConfigured'))
          : null,
        h(
          'section',
          { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, '远程能力', h('small', null, '通过主机工具调用 DLC')),
          h(
            'div',
            { className: 'dsc-chips' },
            ['hub_status', 'hub_task', 'hub_files', 'hub_read', 'hub_package', 'hub_restart', 'hub_code'].map((name) =>
              h('span', { key: name, className: 'dsc-chip' }, name)),
          ),
          h('div', { className: 'dsc-hint', style: { marginTop: '8px' } },
            'QQ 侧用 console.cmd -Action tool -Text \'{"action":"..."}\' 调用；打包后路径交给 qqbot_send_file 发回。'),
          h('div', { className: 'dsc-hint', style: { marginTop: '4px' } },
            '已接入模块：' + (modules.length ? modules.map((m) => m.title || m.id).join(' / ') : '插件任务')),
        ),
        h(
          'section',
          { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, tr('botState'), h('small', null, running ? tr('botPids') + ' ' + bot.pids.join(', ') : tr('botNoRun'))),
          h(
            'div',
            { className: 'dsc-actions', style: { marginBottom: '6px' } },
            h('button', { type: 'button', className: 'dsc-btn primary', disabled: Boolean(busy) || running, onClick: () => act({ type: 'bot-start' }, tr('botStart')) }, tr('botStart')),
            h('button', { type: 'button', className: 'dsc-btn', disabled: Boolean(busy) || !running, onClick: () => act({ type: 'bot-stop' }, tr('botStop')) }, tr('botStop')),
            h('button', { type: 'button', className: 'dsc-btn', disabled: Boolean(busy) || !running, onClick: () => act({ type: 'bot-restart' }, tr('botRestart')) }, tr('botRestart')),
          ),
          h(SwitchRow, {
            title: tr('botAuto'),
            desc: tr('botAutoDesc'),
            checked: Boolean(snap.settings && snap.settings.botAuto),
            disabled: Boolean(busy),
            onChange: (value) => act({ type: 'setting', key: 'botAuto', value: value }, value ? tr('on') : tr('off')),
          }),
          h(SwitchRow, {
            title: tr('botQqNotify'),
            desc: tr('botQqNotifyDesc'),
            checked: Boolean(snap.settings && snap.settings.qqNotify),
            disabled: Boolean(busy),
            onChange: (value) => act({ type: 'setting', key: 'qqNotify', value: value }, value ? tr('on') : tr('off')),
          }),
          h('div', { className: 'dsc-note', style: { marginTop: '8px' } }, tr('botHint'), bot.lastPush ? ' ' + tr('botLastPush') + ': ' + bot.lastPush : ''),
        ),
        h(
          'section',
          { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, tr('botConfig')),
          h(
            'div',
            { className: 'dsc-kv' },
            kv(tr('appId'), configured.appId, true),
            kv(tr('appSecret'), configured.appSecretMasked, true),
            kv(tr('model'), configured.model),
            kv(tr('cwd'), configured.cwd, true),
            kv(tr('botPatch'), configured.patchPath, true),
          ),
        ),
        h(
          'section',
          { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, tr('botWhitelist'), h('small', null, tr('accessHint'))),
          h('div', { className: 'dsc-row2' },
            h(
              'div',
              null,
              h('div', { className: 'dsc-label' }, tr('c2cMode')),
              h(Segmented, {
                value: draft.c2cMode,
                disabled: Boolean(busy),
                options: [
                  { value: 'open', label: tr('modeOpen') },
                  { value: 'allowlist', label: tr('modeAllowlist') },
                  { value: 'disabled', label: tr('modeDisabled') },
                ],
                onChange: (value) => patch('c2cMode', value),
              }),
              h(Field, { label: tr('c2cAllow') }, h(TextArea, { value: draft.c2cAllowText, rows: 3, placeholder: tr('idsPlaceholder'), onChange: (value) => patch('c2cAllowText', value) })),
            ),
            h(
              'div',
              null,
              h('div', { className: 'dsc-label' }, tr('groupMode')),
              h(Segmented, {
                value: draft.groupMode,
                disabled: Boolean(busy),
                options: [
                  { value: 'open', label: tr('modeOpen') },
                  { value: 'allowlist', label: tr('modeAllowlist') },
                  { value: 'disabled', label: tr('modeDisabled') },
                ],
                onChange: (value) => patch('groupMode', value),
              }),
              h(Field, { label: tr('groupAllow') }, h(TextArea, { value: draft.groupAllowText, rows: 3, placeholder: tr('idsPlaceholder'), onChange: (value) => patch('groupAllowText', value) })),
            ),
          ),
          h('div', { className: 'dsc-actions', style: { marginTop: '14px' } },
            h('button', { type: 'button', className: 'dsc-btn primary', disabled: Boolean(busy), onClick: saveAccess }, tr('saveAccess')),
            h('span', { className: 'dsc-hint' }, tr('savedRestart')),
          ),
        ),
        h(
          'section',
          { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, tr('groupCfg')),
          h('div', { className: 'dsc-row2' },
            h(Field, { label: tr('groupNumber') }, h(TextInput, { value: draft.groupNumber, placeholder: '1072804944', onChange: (value) => patch('groupNumber', value) })),
            h(Field, { label: tr('groupOpenid'), hint: tr('groupOpenidHint') }, h(TextInput, { value: draft.groupOpenid, placeholder: 'group_openid', onChange: (value) => patch('groupOpenid', value) })),
          ),
          h('div', { className: 'dsc-actions', style: { marginTop: '12px' } }, h('button', { type: 'button', className: 'dsc-btn', disabled: Boolean(busy), onClick: saveGroup }, tr('saveGroup'))),
          h('div', { className: 'dsc-field' },
            h('div', { className: 'dsc-label' }, tr('pushTarget')),
            h(Segmented, {
              value: draft.pushTarget,
              disabled: Boolean(busy),
              options: [
                { value: 'c2c', label: tr('pushC2c') },
                { value: 'group', label: tr('pushGroup') },
              ],
              onChange: (value) => patch('pushTarget', value),
            }),
          ),
          h(Field, { label: tr('pushId'), hint: tr('pushIdHint') }, h(TextInput, { value: draft.pushId, placeholder: '', onChange: (value) => patch('pushId', value) })),
          h(Field, { label: tr('pushText') }, h(TextArea, { value: draft.pushText, rows: 3, placeholder: '', onChange: (value) => patch('pushText', value) })),
          h('div', { className: 'dsc-actions', style: { marginTop: '12px' } }, h('button', { type: 'button', className: 'dsc-btn primary', disabled: Boolean(busy) || !draft.pushText.trim(), onClick: push }, tr('pushSend'))),
        ),
        h(
          'section',
          { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, tr('botLogs'), h('small', null, bot.logFile || '')),
          h('pre', { className: 'dsc-logpre' }, bot.logs && bot.logs.length ? bot.logs.slice(-18).join('\n') : tr('noLog')),
        ),
      )
    }

    /* ------------------------------ 总览 / 地图 / 贴图 ------------------------------ */

    function taskStateText(tr, state) {
      return tr('task' + state.charAt(0).toUpperCase() + state.slice(1)) || state
    }

    function TaskCard(props) {
      const task = props.task
      return h(
        'button',
        {
          type: 'button',
          className: 'dsc-task',
          onClick: props.onOpen,
          title: props.onOpen ? props.tr('openHint') : '',
        },
        h('span', { className: 'dsc-taskdot is-' + task.state }),
        h(
          'div',
          { className: 'dsc-taskbody' },
          h('div', { className: 'dsc-taskname' }, task.name),
          h(
            'div',
            { className: 'dsc-taskstate' },
            taskStateText(props.tr, task.state),
            task.pid ? ' · PID ' + task.pid : '',
            task.detail ? ' · ' + task.detail : '',
          ),
        ),
      )
    }

    function OverviewView(props) {
      const { snap, tr, onOpen, act, busy } = props
      const [cleanPreview, setCleanPreview] = React.useState(null)
      const [codeTask, setCodeTask] = React.useState('')
      const [codeResult, setCodeResult] = React.useState(null)
      const pipeline = snap.pipeline || {}
      const bot = snap.bot || {}
      const conc = snap.concurrency || {}
      const matrix = conc.matrix || { models: [], keys: [], cells: [] }
      const [selectedModels, setSelectedModels] = React.useState(matrix.models || [])
      const modelKey = (matrix.models || []).join('|') + '|' + ((snap.settings || {}).displayModels || []).join('|') + '|' + JSON.stringify((snap.settings || {}).modelStates || {})
      React.useEffect(() => {
        const settings = snap.settings || {}
        const planned = settings.displayModels
        const states = settings.modelStates || {}
        const active = (matrix.models || []).filter((m) => states[m] === 'active' || (!states[m] && m === 'V4.1'))
        const allowed = Array.isArray(planned) && planned.length ? planned : (active.length ? active : ['V4.1'])
        setSelectedModels((matrix.models || []).filter((m) => allowed.includes(m)))
      }, [modelKey])
      const visibleModels = (matrix.models || []).filter((m) => selectedModels.includes(m))
      const percent = pipeline.total > 0 ? Math.round((Number(pipeline.checked) || 0) / Number(pipeline.total) * 100) : 0
      const tabOf = { desc: 'code', map: 'map', art: 'art', balance: 'balance' }
      return h(
        React.Fragment,
        null,
        h(
          'section',
          { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, tr('tasks'), h('small', null, tr('tasksHint'))),
          h(
            'div',
            { className: 'dsc-tasks' },
            (snap.tasks || []).map((task) =>
              h(TaskCard, { key: task.id, task: task, tr: tr, onOpen: () => onOpen(tabOf[task.id] || 'code') }),
            ),
          ),
        ),
        h(
          'section',
          { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, tr('quotaTitle'), h('small', null, (snap.quota || {}).note || '')),
          h(
            'div',
            { className: 'dsc-metrics' },
            h(Metric, { label: tr('quotaKeys'), value: String((snap.quota || {}).keys || 0), hint: tr('quotaProviders') + ' ' + ((snap.quota || {}).providers || 0) }),
            h(Metric, { label: tr('quotaSessions'), value: String((snap.quota || {}).sessions || 0), hint: (snap.quota || {}).updated || '' }),
            h(Metric, { label: tr('quotaTokens'), value: String((snap.quota || {}).tokens || 0) }),
            h(Metric, { label: tr('quotaTotal'), value: String((snap.quota || {}).tokensTotal || 0) }),
            h(Metric, { label: tr('quotaPerKey'), value: String((snap.quota || {}).perKey || 0), hint: tr('balanceUnits') }),
            h(Metric, { label: '账号余额', value: (snap.quota || {}).balance || '—', hint: 'DeepSeek 付费侧（当前不用）' }),
          ),
        ),
        h(
          'section',
          { className: 'dsc-card' },
          h(
            'h3',
            { className: 'dsc-sec-title' },
            tr('concurrency'),
            h('small', null, '实际 ' + (conc.actualTotal || 0) + ' / 上限 ' + (conc.theory || 0)),
          ),
          h(
            'div',
            { className: 'dsc-chips', style: { marginBottom: '10px' } },
            h('span', { className: 'dsc-hint' }, '模型：'),
            ...(matrix.models || []).map((m) => h('button', {
              key: m,
              type: 'button',
              className: 'dsc-chip' + (selectedModels.includes(m) ? ' on' : ''),
              onClick: () => {
                const next = selectedModels.includes(m) ? selectedModels.filter((x) => x !== m) : [...selectedModels, m]
                if (!next.length) return
                setSelectedModels(next)
                act({ type: 'setting', key: 'displayModels', value: next }, '显示模型')
              },
            }, m + ' · ' + (selectedModels.includes(m) ? '关闭' : '显示'))),
          ),
          h(
            'table',
            { className: 'dsc-table dsc-matrix' },
            h('thead', null, h('tr', null,
              h('th', null, '密钥'),
              ...visibleModels.map((m) => h('th', { key: m }, m)),
            )),
            h(
              'tbody',
              null,
              (matrix.keys || []).map((k) => h('tr', { key: k.id },
                h('td', { title: k.tasks && k.tasks.length ? '计划：' + k.tasks.join('/') : '计划：空闲' }, h('b', null, k.label)),
                ...visibleModels.map((m) => {
                  const cell = (matrix.cells || []).find((c) => c.key === k.id && c.model === m)
                  return h('td', { key: m, className: cell ? 'dsc-cell-busy' : '' }, cell ? `${cell.task} ${cell.busy}` : '—')
                }),
              )),
            ),
          ),
          h(
            'div',
            { className: 'dsc-chips', style: { marginTop: '10px' } },
            (conc.items || []).map((item) => h('span', { key: item.id, className: 'dsc-chip' },
              item.label, ' ', h('b', null, String(item.actual || 0)), ' / ', String(item.max || 0))),
            h('span', { className: 'dsc-chip' }, '当前 dsh 进程 ', h('b', null, String(conc.live || 0))),
            h('span', { className: 'dsc-chip' }, '调度 ', h('b', null, String((snap.schedule || {}).action || '-')), ' · 目标 ', String((snap.schedule || {}).target || 0)),
          ),
          h('div', { className: 'dsc-hint', style: { marginTop: '8px' } },
            '格子是当前实际在跑的并行 worker；模型列可以多选显示，不选的列只是隐藏，不影响调度。上限 = 账户 × 模型 × 每模型 4 路。'),
        ),
        h(
          'section',
          { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, '写代码调度', h('small', null, '免费 AMD · 不带思考')),
          h('textarea', {
            className: 'dsc-textarea',
            style: { minHeight: '84px' },
            placeholder: '描述要实现什么：文件、函数、验收标准。付费模型只负责写清任务。',
            value: codeTask,
            onChange: (event) => setCodeTask(event.target.value),
          }),
          h(
            'div',
            { className: 'dsc-actions', style: { marginTop: '8px' } },
            h('button', {
              type: 'button',
              className: 'dsc-btn primary',
              disabled: Boolean(busy) || !codeTask.trim(),
              onClick: async () => {
                const result = await act({ type: 'code-dispatch', task: codeTask, minutes: 15 }, '已交给免费 AMD')
                if (result) setCodeResult(result)
              },
            }, '交给免费 AMD 写'),
            h('span', { className: 'dsc-hint' }, '复杂任务建议拆小步；跑完自己验一下'),
          ),
          codeResult
            ? h('pre', { className: 'dsc-logpre', style: { marginTop: '8px' } },
                (codeResult.ok ? '✓ ' : '✗ ') + String(codeResult.output || codeResult.error || codeResult.message || ''))
            : null,
        ),
        h(
          'section',
          { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, tr('sessionsTitle'), h('small', null, (snap.sessions || {}).lastGc ? '上次清理 ' + String((snap.sessions || {}).lastGc).slice(0, 16).replace('T', ' ') : tr('sessionsHint'))),
          h(
            'div',
            { className: 'dsc-metrics' },
            h(Metric, { label: tr('sessionsTotal'), value: String((snap.sessions || {}).total || 0) }),
            h(Metric, { label: tr('sessionsCore'), value: String((snap.sessions || {}).core || 0), hint: 'ds工作区 / tools' }),
            h(Metric, { label: tr('sessionsAuto'), value: String((snap.sessions || {}).auto || 0), hint: Math.round(((snap.sessions || {}).autoBytes || 0) / 1048576) + ' MB' }),
            h(Metric, { label: tr('sessionsArchived'), value: String((snap.sessions || {}).archived || 0) }),
          ),
          h(
            'div',
            { className: 'dsc-actions', style: { marginTop: '12px' } },
            h('button', {
              type: 'button',
              className: 'dsc-btn',
              disabled: Boolean(busy),
              onClick: async () => {
                const result = await act({ type: 'session-cleanup', apply: false, minAgeMinutes: 10 }, tr('sessionsPreview'))
                if (result && result.ok) setCleanPreview(result)
              },
            }, tr('sessionsPreview')),
            h('button', {
              type: 'button',
              className: 'dsc-btn danger',
              disabled: Boolean(busy) || !cleanPreview || !cleanPreview.count,
              onClick: async () => {
                const result = await act({ type: 'session-cleanup', apply: true, minAgeMinutes: 10 }, tr('sessionsDone'))
                if (result && result.ok) setCleanPreview(null)
              },
            }, cleanPreview ? tr('sessionsClean') + ' (' + (cleanPreview.count || 0) + ')' : tr('sessionsClean')),
          ),
          cleanPreview
            ? h('div', { className: 'dsc-hint', style: { marginTop: '8px' } },
                tr('sessionsDone') + ' ' + (cleanPreview.count || 0) + ' · ' + Object.entries(cleanPreview.byCwd || {}).map(([k, v]) => String(k).split('\\').slice(-2).join('\\') + ' ' + v).join('，'))
            : h('div', { className: 'dsc-hint', style: { marginTop: '8px' } }, tr('sessionsHint')),
        ),
        h(
          'section',
          { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, tr('tabCode'), h('small', null, (pipeline.checked || 0) + ' / ' + (pipeline.total || 0))),
          h('div', { className: 'dsc-bar', style: { marginBottom: '12px' } }, h('i', { style: { width: percent + '%' } })),
          h(
            'div',
            { className: 'dsc-chips' },
            h('span', { className: 'dsc-chip' }, tr('phase'), ' ', h('b', null, tr(PHASE_LABELS[pipeline.phase] || 'phaseIdle'))),
            h('span', { className: 'dsc-chip' }, tr('cycle'), ' ', h('b', null, String(pipeline.cycle || 0))),
            h('span', { className: 'dsc-chip' }, tr('round'), ' ', h('b', null, String(pipeline.round || 0))),
            h('span', { className: 'dsc-chip' }, tr('version'), ' ', h('b', null, pipeline.version || '1.45')),
            h('span', { className: 'dsc-chip' }, tr('lastTest'), ' ', h('b', null, pipeline.lastTest || '—')),
            h('span', { className: 'dsc-chip' }, tr('tabBot'), ' ', h('b', null, bot.running ? tr('running') : tr('stopped'))),
          ),
          h(
            'div',
            { className: 'dsc-metrics', style: { marginTop: '14px' } },
            h(Metric, { label: tr('findings'), value: String(pipeline.findings || 0), hint: tr('cycle') + ' ' + (pipeline.cycle || 0) }),
            h(Metric, { label: tr('auditProgress'), value: percent + '%', hint: tr('checked') + ' ' + (pipeline.checked || 0) }),
            h(Metric, { label: tr('restartCount'), value: String((snap.watchdog || {}).restarts || 0), hint: (snap.watchdog || {}).lastExitAt || '—' }),
            h(Metric, { label: tr('taskMap'), value: String(((snap.tasks || []).find((t) => t.id === 'map') || {}).missingTilesets || 0), hint: tr('mapMissing') }),
          ),
        ),
        h(
          'section',
          { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, tr('logs')),
          h('div', { className: 'dsc-logs' }, h('div', { className: 'dsc-log' }, h('h4', null, tr('pipelineLog')), h('pre', { className: 'dsc-logpre' }, ((snap.logs || {}).pipeline || []).slice(-10).join('\n') || tr('noLog'))), h('div', { className: 'dsc-log' }, h('h4', null, tr('mapLog')), h('pre', { className: 'dsc-logpre' }, ((snap.logs || {}).map || []).slice(-10).join('\n') || tr('noLog')))),
        ),
      )
    }

    function MapView(props) {
      const { snap, act, busy, tr } = props
      const task = (snap.tasks || []).find((t) => t.id === 'map') || {}
      const running = task.state === 'running'
      const logs = snap.logs || {}
      return h(
        React.Fragment,
        null,
        h(
          'section',
          { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, tr('mapTitle'), h('small', null, running ? tr('running') : taskStateText(tr, task.state || 'idle'))),
          h(
            'div',
            { className: 'dsc-metrics' },
            h(Metric, { label: tr('mapMaps'), value: String(task.maps || 0) }),
            h(Metric, { label: tr('mapMissing'), value: String(task.missingTilesets || 0) }),
            h(Metric, { label: tr('mapBlank'), value: String(task.blankGround || 0) }),
            h(Metric, { label: tr('mapInvisible'), value: String(task.invisibleRes || 0) }),
          ),
          h('div', { className: 'dsc-bar', style: { margin: '14px 0 8px' } }, h('i', { style: { width: (task.deepTotal ? Math.round((task.deepDone || 0) / task.deepTotal * 100) : 0) + '%' } })),
          h('div', { className: 'dsc-hint' }, `${tr('deepProgress')} ${task.deepDone || 0}/${task.deepTotal || 0}` + (task.currentMap ? ' · ' + tr('currentItem') + ' ' + task.currentMap : '')),
          h(
            'div',
            { className: 'dsc-chips', style: { marginTop: '8px' } },
            h('span', { className: 'dsc-chip' }, tr('mineMain'), ' ', h('b', null, String(task.minesMain || 0))),
            h('span', { className: 'dsc-chip' }, tr('mineSquad'), ' ', h('b', null, String(task.minesSquad || 0))),
            h('span', { className: 'dsc-chip' }, tr('mineContested'), ' ', h('b', null, String(task.minesContested || 0))),
          ),
          h(
            'div',
            { className: 'dsc-actions', style: { marginTop: '14px' } },
            h(
              'button',
              { type: 'button', className: 'dsc-btn primary', disabled: Boolean(busy) || running, onClick: () => act({ type: 'map-start' }, tr('mapStart')) },
              tr('mapStart'),
            ),
            h(
              'button',
              { type: 'button', className: 'dsc-btn', disabled: Boolean(busy) || !running, onClick: () => act({ type: 'map-stop' }, tr('mapStop')) },
              tr('mapStop'),
            ),
            h('span', { className: 'dsc-hint' }, task.updated ? tr('updatedAt') + ' ' + task.updated : tr('mapEmpty')),
          ),
          task.report
            ? h('div', { className: 'dsc-note', style: { marginTop: '10px' } }, tr('mapReport') + '：' + task.report)
            : null,
          task.balanceReport
            ? h('div', { className: 'dsc-note', style: { marginTop: '4px' } }, tr('mapBalance') + '：' + task.balanceReport)
            : null,
          task.balanceSim
            ? h('div', { className: 'dsc-note', style: { marginTop: '4px' } }, tr('mapSim') + '：' + task.balanceSim)
            : null,
          task.designReport
            ? h('div', { className: 'dsc-note', style: { marginTop: '4px' } }, tr('mapDesign') + '：' + task.designReport)
            : null,
        ),
        h(
          'section',
          { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, tr('mapLog')),
          h('pre', { className: 'dsc-logpre' }, (logs.map || []).slice(-18).join('\n') || tr('noLog')),
        ),
      )
    }

    function ArtView(props) {
      const { snap, act, busy, tr } = props
      const task = (snap.tasks || []).find((t) => t.id === 'art') || {}
      const running = task.state === 'running'
      const logs = snap.logs || {}
      return h(
        React.Fragment,
        null,
        h(
          'section',
          { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, tr('artTitle'), h('small', null, running ? tr('running') : taskStateText(tr, task.state || 'idle'))),
          h(
            'div',
            { className: 'dsc-metrics' },
            h(Metric, { label: tr('artTotal'), value: String(task.total || 0) }),
            h(Metric, { label: tr('artIndexed'), value: String(task.indexed || 0) }),
            h(Metric, { label: tr('artRebuilt'), value: String(task.rebuilt || 0) }),
            h(Metric, { label: tr('updatedAt'), value: task.updated || '—', compact: true }),
          ),
          h('div', { className: 'dsc-bar', style: { margin: '14px 0 8px' } }, h('i', { style: { width: (task.deepTotal ? Math.round((task.deepDone || 0) / task.deepTotal * 100) : 0) + '%' } })),
          h('div', { className: 'dsc-hint' }, `${tr('artDeep')} ${task.deepDone || 0}/${task.deepTotal || 0}` + (task.current ? ' · ' + tr('currentItem') + ' ' + task.current : '')),
          h('div', { className: 'dsc-hint' }, `AI 理解 ${task.aiDone || 0}/${task.aiTotal || 0}`),
          h(
            'div',
            { className: 'dsc-actions', style: { marginTop: '14px' } },
            h(
              'button',
              { type: 'button', className: 'dsc-btn primary', disabled: Boolean(busy) || running, onClick: () => act({ type: 'art-start' }, tr('artStart')) },
              tr('artStart'),
            ),
            h(
              'button',
              { type: 'button', className: 'dsc-btn', disabled: Boolean(busy) || !running, onClick: () => act({ type: 'art-stop' }, tr('artStop')) },
              tr('artStop'),
            ),
            h('span', { className: 'dsc-hint' }, tr('artPending')),
          ),
          task.report ? h('div', { className: 'dsc-note', style: { marginTop: '10px' } }, tr('artReport') + '：' + task.report) : null,
          h('div', { className: 'dsc-note', style: { marginTop: '6px' } }, tr('artHint')),
        ),
        h(
          'section',
          { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, tr('artLog')),
          h('pre', { className: 'dsc-logpre' }, (logs.art || []).slice(-18).join('\n') || tr('noLog')),
        ),
      )
    }


    function BalanceView(props) {
      const { snap, act, busy, tr } = props
      const bal = snap.balance || {}
      const sim = bal.sim || {}
      const design = bal.design || {}
      const factions = Object.entries(sim.factions || {})
      const factionRank = (Array.isArray(sim.faction_index) && sim.faction_index.length
        ? sim.faction_index.map((row) => ({ ...row }))
        : factions.map(([name, info]) => ({ faction: name, units: info.units, score: null }))
      ).sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0) || (Number(b.units) || 0) - (Number(a.units) || 0))
      const rankChanges = bal.rankChanges || {}
      const changeTd = (cat, name) => {
        const d = (rankChanges[cat] || {})[name] || {}
        const c = d.delta
        return h('td', { style: { color: c > 0 ? '#3fb950' : c < 0 ? '#f85149' : 'inherit', fontWeight: 700 } },
          c > 0 ? `↑ ${c}` : c < 0 ? `↓ ${Math.abs(c)}` : d.from ? '—' : '新')
      }
      const top = sim.top_hp_cost || []
      const unitBoards = [
        ['步兵榜', 'infantry'],
        ['远程步兵榜', 'ranged_infantry'],
        ['骑兵榜', 'cavalry'],
        ['远程骑兵榜', 'ranged_cavalry'],
        ['火枪榜', 'gunpowder'],
        ['火炮榜', 'artillery'],
      ]
      const supply = sim.supply_top || []
      const flagged = (design.maps || []).filter((m) => (m.flags || []).length)
      return h(
        React.Fragment,
        null,
        h(
          'section',
          { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, tr('balanceTitle'), h('small', null, `${sim.generated || ''} · 理解阶段 ${sim.rank_stage || 1}/5 ${sim.rank_stage_name || ''}`)),
          h(
            'div',
            { className: 'dsc-metrics' },
            h(Metric, { label: tr('balanceUnits'), value: String(sim.units || 0) }),
            h(Metric, { label: tr('balanceFactions'), value: String(factions.length) }),
            h(Metric, { label: tr('balanceDesign'), value: String(flagged.length), hint: '/' + (design.maps || []).length }),
            h(Metric, { label: tr('quotaTokens'), value: String((snap.quota || {}).tokens || 0), hint: (snap.quota || {}).note || '' }),
          ),
          h(
            'div',
            { className: 'dsc-actions', style: { marginTop: '14px' } },
            h('button', { type: 'button', className: 'dsc-btn primary', disabled: Boolean(busy), onClick: () => act({ type: 'balance-run' }, tr('balanceRun')) }, tr('balanceRun')),
            h('span', { className: 'dsc-hint' }, tr('balanceSim') + '：' + (sim.report || '—')),
          ),
        ),
        h(
          'section',
          { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, '平衡工作流', h('small', null, (snap.balanceLoop || {}).updated || '')),
          h(
            'div',
            { className: 'dsc-chips' },
            h('span', { className: 'dsc-chip' }, '状态 ', h('b', null, (snap.balanceLoop || {}).state || 'idle')),
            h('span', { className: 'dsc-chip' }, '轮次 ', h('b', null, String((snap.balanceLoop || {}).round || 0))),
            h('span', { className: 'dsc-chip' }, '阶段 ', h('b', null, (snap.balanceLoop || {}).phase || '-')),
          ),
          h(
            'div',
            { className: 'dsc-actions', style: { marginTop: '10px' } },
            h('button', { type: 'button', className: 'dsc-btn primary', disabled: Boolean(busy) || (snap.balanceLoop || {}).state === 'running', onClick: () => act({ type: 'balance-loop-start' }, '平衡工作流') }, '启动'),
            h('button', { type: 'button', className: 'dsc-btn', disabled: Boolean(busy), onClick: () => act({ type: 'balance-loop-stop' }, '平衡工作流') }, '停止'),
            h('span', { className: 'dsc-hint' }, '每 30 分钟一轮：模拟 → AI 解读 → 阵营分析 → 刷新排行榜'),
          ),
        ),
        h(
          'section',
          { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, tr('balanceFactionRank'), h('small', null, '按强度分从高到低')),
          h(
            'table',
            { className: 'dsc-table' },
            h('thead', null, h('tr', null,
              h('th', null, tr('balanceFactions')),
              h('th', null, '变化'),
              h('th', null, tr('balanceScore')),
              h('th', null, tr('balanceUnits')),
              h('th', null, 'HP/成本'),
              h('th', null, 'DPS/成本'),
              h('th', null, '建造(s)'),
              h('th', null, '解锁(min)'),
              h('th', null, '最便宜骑兵'),
            )),
            h(
              'tbody',
              null,
              factionRank.map((row, i) => {
                const d = (bal.rankDelta || {})[row.faction] || {}
                const change = d.delta
                return h('tr', { key: row.faction + i },
                h('td', null, row.faction),
                h('td', { style: { color: change > 0 ? '#3fb950' : change < 0 ? '#f85149' : 'inherit', fontWeight: 700 } },
                  change > 0 ? `↑ ${change}` : change < 0 ? `↓ ${Math.abs(change)}` : d.from ? '—' : '新'),
                h('td', null, row.score === null || row.score === undefined ? '—' : String(row.score)),
                h('td', null, String(row.units || 0)),
                h('td', null, row.hp_per_cost === undefined ? '—' : Number(row.hp_per_cost).toFixed(2)),
                h('td', null, row.dps_per_cost === undefined ? '—' : Number(row.dps_per_cost).toFixed(3)),
                h('td', null, row.avg_build === undefined ? '—' : Number(row.avg_build).toFixed(1)),
                h('td', null, row.avg_unlock === undefined ? '—' : Number(row.avg_unlock).toFixed(1)),
                h('td', null, row.cheapest_cav === undefined ? '—' : String(row.cheapest_cav)),
                )
              }),
            ),
          ),
          h('div', { className: 'dsc-hint', style: { marginTop: '6px' } }, '强度分来自 balance_sim.json 的 faction_index；HP/成本、DPS/成本、建造/解锁时间都是纸面值，单位数只作参考。'),
        ),
        h(
          'section',
          { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, '建筑榜', h('small', null, '建筑独立排行，不与单位混排')),
          h(
            'table',
            { className: 'dsc-table' },
            h('thead', null, h('tr', null, h('th', null, '建筑'), h('th', null, '变化'), h('th', null, '阵营'), h('th', null, 'HP'), h('th', null, '成本'), h('th', null, 'HP/成本'), h('th', null, '建造'))),
            h(
              'tbody',
              null,
              (sim.buildings || []).slice(0, 20).map((row) => h('tr', { key: row.name },
                h('td', null, row.name), changeTd('buildings', row.name), h('td', null, row.faction), h('td', null, String(Math.round(row.hp || 0))),
                h('td', null, String(Math.round(row.cost || 0))), h('td', null, (Number(row.hp || 0) / Math.max(Number(row.cost || 0), 1)).toFixed(2)),
                h('td', null, String(row.build || '')))),
            ),
          ),
        ),
        h(
          'section',
          { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, '海军榜', h('small', null, '海军独立排行')),
          h(
            'table',
            { className: 'dsc-table' },
            h('thead', null, h('tr', null, h('th', null, '舰船'), h('th', null, '变化'), h('th', null, '阵营'), h('th', null, 'HP'), h('th', null, '成本'), h('th', null, 'HP/成本'), h('th', null, 'DPS'), h('th', null, '建造'))),
            h(
              'tbody',
              null,
              (sim.navy || []).slice(0, 20).map((row) => h('tr', { key: row.name },
                h('td', null, row.name), changeTd('navy', row.name), h('td', null, row.faction), h('td', null, String(Math.round(row.hp || 0))),
                h('td', null, String(Math.round(row.cost || 0))), h('td', null, (Number(row.hp || 0) / Math.max(Number(row.cost || 0), 1)).toFixed(2)),
                h('td', null, String(row.dps || '')), h('td', null, String(row.build || '')))),
            ),
          ),
        ),
        unitBoards.map(([title, key]) => h(
          'section',
          { className: 'dsc-card', key },
          h('h3', { className: 'dsc-sec-title' }, title),
          h(
            'table',
            { className: 'dsc-table' },
            h('thead', null, h('tr', null, h('th', null, '单位'), h('th', null, '变化'), h('th', null, '阵营'), h('th', null, 'HP'), h('th', null, '成本'), h('th', null, 'HP/成本'), h('th', null, 'DPS'), h('th', null, '建造'))),
            h(
              'tbody',
              null,
              (sim[key] || []).slice(0, 15).map((row) => h('tr', { key: row.name },
                h('td', null, row.name), changeTd(key, row.name), h('td', null, row.faction), h('td', null, String(Math.round(row.hp || 0))),
                h('td', null, String(Math.round(row.cost || 0))), h('td', null, (Number(row.hp || 0) / Math.max(Number(row.cost || 0), 1)).toFixed(2)),
                h('td', null, String(row.dps || '')), h('td', null, String(row.build || '')))),
            ),
          ),
        )),
        h(
          'section',
          { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, '单位榜（陆军）'),
          h(
            'table',
            { className: 'dsc-table' },
            h('thead', null, h('tr', null, h('th', null, tr('balanceUnits')), h('th', null, '变化'), h('th', null, tr('balanceFactions')), h('th', null, 'HP/成本'), h('th', null, 'DPS'), h('th', null, 'TTK'), h('th', null, '移速'), h('th', null, '综合'))),
            h(
              'tbody',
              null,
              top.map((row) => h('tr', { key: row.name }, h('td', null, row.name), changeTd('top', row.name), h('td', null, row.faction), h('td', null, String(row.hp_per_cost)), h('td', null, String(row.dps || '')), h('td', null, String(row.ttk || '')), h('td', null, String(row.move || '')), h('td', null, String(row.composite || '')))),
            ),
          ),
        ),
        h(
          'section',
          { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, '输出榜（DPS）'),
          h(
            'table',
            { className: 'dsc-table' },
            h('thead', null, h('tr', null, h('th', null, tr('balanceUnits')), h('th', null, '变化'), h('th', null, tr('balanceFactions')), h('th', null, 'DPS'), h('th', null, 'TTK'))),
            h(
              'tbody',
              null,
              (sim.top_dps || []).map((row) => h('tr', { key: row.name }, h('td', null, row.name), changeTd('dps', row.name), h('td', null, row.faction), h('td', null, String(row.dps || '')), h('td', null, String(row.ttk || '')))),
            ),
          ),
        ),
        h(
          'section',
          { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, '受限榜（纸面强但受限多）'),
          (sim.flagged_restricted || []).length
            ? h('ul', { className: 'dsc-flaglist' }, sim.flagged_restricted.map((n) => h('li', { key: n }, n)))
            : h('div', { className: 'dsc-hint' }, tr('noLog')),
        ),
        h(
          'section',
          { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, tr('balanceSupply')),
          h(
            'table',
            { className: 'dsc-table' },
            h('thead', null, h('tr', null, h('th', null, tr('balanceUnits')), h('th', null, '变化'), h('th', null, tr('balanceFactions')), h('th', null, '辎重'))),
            h(
              'tbody',
              null,
              supply.map((row) => h('tr', { key: row.name }, h('td', null, row.name), changeTd('supply', row.name), h('td', null, row.faction), h('td', null, String(row.supply)))),
            ),
          ),
        ),
        h(
          'section',
          { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, tr('restrictionsTitle')),
          h('textarea', {
            className: 'dsc-textarea',
            spellCheck: false,
            defaultValue: bal.restrictionsText || '{"units": {}}',
            ref: React.useRef(null),
            id: 'dsc-restrictions',
          }),
          h(
            'div',
            { className: 'dsc-actions', style: { marginTop: '10px' } },
            h(
              'button',
              {
                type: 'button',
                className: 'dsc-btn primary',
                disabled: Boolean(busy),
                onClick: () => {
                  const el = document.getElementById('dsc-restrictions')
                  act({ type: 'restrictions-save', text: el ? el.value : '' }, tr('restrictionsSave'))
                },
              },
              tr('restrictionsSave'),
            ),
          ),
          h('div', { className: 'dsc-hint' }, tr('restrictionsHint')),
        ),
        h(
          'section',
          { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, tr('balanceDesign')),
          flagged.length
            ? h(
                'ul',
                { className: 'dsc-flaglist' },
                flagged.map((m) => h('li', { key: m.name }, m.name + '：' + (m.flags || []).join('、'))),
              )
            : h('div', { className: 'dsc-hint' }, tr('noLog')),
        ),
      )
    }

    function WorkflowView(props) {
      const { snap, tr, act, busy } = props
      const [modules, setModules] = React.useState(() =>
        window.__AI_HUB_UI__ ? window.__AI_HUB_UI__.listModules() : [],
      )
      React.useEffect(() => {
        if (!window.__AI_HUB_UI__) return undefined
        return window.__AI_HUB_UI__.subscribe(setModules)
      }, [])
      const settings = snap.settings || {}
      const savedStates = settings.modelStates && typeof settings.modelStates === 'object' ? settings.modelStates : {}
      const stateOf = (m) => savedStates[m] || (m === 'V4.1' ? 'active' : 'disabled')
      const activeModels = ALL_MODELS.filter((m) => stateOf(m) === 'active')
      const backupModels = ALL_MODELS.filter((m) => stateOf(m) === 'backup')
      const callModels = ALL_MODELS
      const displayModels = Array.isArray(settings.displayModels) && settings.displayModels.length ? settings.displayModels : activeModels
      const tasks = snap.tasks || []
      const opt = snap.optimizer || {}
      const toggleSetting = (key, value) => act({ type: 'setting', key, value }, '模型模块')
      const cycleModel = (model) => {
        const current = stateOf(model)
        const nextState = current === 'disabled' ? 'backup' : current === 'backup' ? 'active' : 'disabled'
        toggleSetting('modelStates', { ...savedStates, [model]: nextState })
      }
      const toggleDisplay = (model) => {
        const next = displayModels.includes(model) ? displayModels.filter((m) => m !== model) : [...displayModels, model]
        if (!next.length) return
        toggleSetting('displayModels', next)
      }
      const optOn = !snap.settings || snap.settings.optimizer !== false
      const scoutOn = !snap.settings || snap.settings.scout !== false
      const scoutChecked = ((snap.freePool || {}).candidates || {}).checked_at || ''
      const [thrPct, setThrPct] = React.useState(Math.round((((snap.settings || {}).idleThreshold) || 0.3) * 100))
      const [expandCount, setExpandCount] = React.useState(Number((snap.settings || {}).expandTasks) || 3)
      React.useEffect(() => {
        setThrPct(Math.round((((snap.settings || {}).idleThreshold) || 0.3) * 100))
        setExpandCount(Number((snap.settings || {}).expandTasks) || 3)
      }, [snap.settings && snap.settings.idleThreshold, snap.settings && snap.settings.expandTasks])
      const run = (id, op) => act({ type: 'hub-task', id, op }, `${id} ${op}`)
      const actionLabels = {
        start: '启动',
        stop: '停止',
        restart: '重启',
        'clear-stop': '清除 STOP',
        fix: '修复地图',
        'fix-dry': '修复预览',
        design: '设计分析',
        'ai-design': 'AI 生成设计',
        generate: '生成 4v4/10p',
        editor: '蒸馏原版地形',
        pve: '生成 PvE 城市',
        workflow: '地图工作流',
        recompute: '重算平衡',
        'ai-think': '两轮思考',
      }
      const etaMap = Object.fromEntries((((snap.eta || {}).items) || []).map((item) => [item.id, item]))
      return h(
        React.Fragment,
        null,
        !snap.pipeline || !snap.pipeline.hasDlc
          ? h('div', { className: 'dsc-banner' }, '无插件：未安装模组插件（task-mod）。工作流页仍可打开，但不会显示代码/地图/贴图/平衡任务和操作；安装后自动出现。')
          : null,
        h(
          'section',
          { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, '模型模块', h('small', null, '调用 / 显示分离')),
          h('div', { className: 'dsc-hint' }, '三态循环：不启用 → 备选 → 启用 → 不启用；调用 = 启用 + 备选，显示只决定并发矩阵列。'),
          h('div', { className: 'dsc-chips', style: { marginTop: '8px' } },
            h('span', { className: 'dsc-chip' }, '启用 ', h('b', null, String(activeModels.length))),
            h('span', { className: 'dsc-chip' }, '备选 ', h('b', null, String(backupModels.length))),
            h('span', { className: 'dsc-chip' }, '不启用 ', h('b', null, String(ALL_MODELS.length - activeModels.length - backupModels.length)))),
          h('div', { className: 'dsc-hint', style: { marginTop: '8px' } }, '调用：'),
          ...MODEL_GROUPS.map((g) => h('div', { key: 'call-' + g.name, className: 'dsc-chips', style: { marginTop: '6px' } },
            h('span', { className: 'dsc-hint', style: { minWidth: '96px' } }, g.name + '：'),
            ...g.models.map((m) => h('button', {
              key: 'call-' + m, type: 'button',
              className: 'dsc-chip' + (stateOf(m) === 'active' ? ' on' : ''),
              onClick: () => cycleModel(m),
            }, m + ' · ' + (stateOf(m) === 'active' ? '启用' : stateOf(m) === 'backup' ? '备选' : '不启用'))))),
          h('div', { className: 'dsc-hint', style: { marginTop: '10px' } }, '显示（并发矩阵已接入的列）：'),
          h('div', { className: 'dsc-chips', style: { marginTop: '6px' } },
            h('span', { className: 'dsc-hint', style: { minWidth: '96px' } }, '矩阵：'),
            ...MATRIX_MODELS.map((m) => h('button', {
              key: 'display-' + m, type: 'button',
              className: 'dsc-chip' + (displayModels.includes(m) ? ' on' : ''),
              onClick: () => toggleDisplay(m),
            }, m))),
        ),
        h(
          'section',
          { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, '调度自优化（独立槽位）',
            h('small', null, optOn ? '已启用' : '已关闭')),
          h('div', { className: 'dsc-chips' },
            h('span', { className: 'dsc-chip' }, '模型 ', h('b', null, opt.used === 'paid' ? '付费兜底' : '免费聪明模型')),
            h('span', { className: 'dsc-chip' }, '上次 ', h('b', null, opt.updated || '—'))),
          h('div', { className: 'dsc-actions', style: { marginTop: '10px' } },
            h('button', {
              type: 'button', className: 'dsc-btn primary', disabled: Boolean(busy) || !optOn,
              onClick: () => act({ type: 'optimizer-run' }, '调度自优化'),
            }, '立即分析'),
            h('button', {
              type: 'button', className: 'dsc-btn',
              onClick: () => act({ type: 'setting', key: 'optimizer', value: !optOn }, optOn ? '关闭自优化' : '开启自优化'),
            }, optOn ? '关闭槽位' : '开启槽位')),
          h('div', { className: 'dsc-hint', style: { marginTop: '6px' } },
            opt.ok === false ? '上次失败：' + (opt.error || '') : (opt.preview || '运行后这里显示优化建议。').slice(-700))),
        h(
          'section',
          { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, '自动扩展阈值', h('small', null, `当前 ${thrPct}%`)),
          h('div', { className: 'dsc-actions' },
            h('input', {
              type: 'number', min: 5, max: 90, value: thrPct,
              onChange: (e) => setThrPct(Number(e.target.value) || 0),
              style: { width: '80px' },
            }),
            h('span', { className: 'dsc-hint' }, '% 空闲'),
            h('button', {
              type: 'button', className: 'dsc-btn primary', disabled: Boolean(busy),
              onClick: () => act({ type: 'setting', key: 'idleThreshold', value: thrPct / 100 }, '设置扩展阈值'),
            }, '保存')),
          h('div', { className: 'dsc-actions', style: { marginTop: '8px' } },
            h('input', {
              type: 'number', min: 1, max: 8, value: expandCount,
              onChange: (e) => setExpandCount(Number(e.target.value) || 1),
              style: { width: '80px' },
            }),
            h('span', { className: 'dsc-hint' }, '个扩展任务'),
            h('button', {
              type: 'button', className: 'dsc-btn primary', disabled: Boolean(busy),
              onClick: () => act({ type: 'setting', key: 'expandTasks', value: expandCount }, '设置扩展任务数'),
            }, '保存')),
          h('div', { className: 'dsc-hint', style: { marginTop: '6px' } },
            '空闲率大于该值就新增扩展任务；扩展数量按机器内存自行调整，最多 8 个。')),
        h(
          'section',
          { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, '免费池侦察', h('small', null, scoutOn ? '已启用' : '已关闭')),
          h('div', { className: 'dsc-chips' },
            h('span', { className: 'dsc-chip' }, '上次 ', h('b', null, scoutChecked || '—'))),
          h('div', { className: 'dsc-actions', style: { marginTop: '10px' } },
            h('button', {
              type: 'button', className: 'dsc-btn primary', disabled: Boolean(busy) || !scoutOn,
              onClick: () => act({ type: 'scout-run' }, '免费池侦察'),
            }, '立即侦察'),
            h('button', {
              type: 'button', className: 'dsc-btn',
              onClick: () => act({ type: 'setting', key: 'scout', value: !scoutOn }, scoutOn ? '关闭侦察' : '开启侦察'),
            }, scoutOn ? '关闭开关' : '开启开关'))),
        h(
          'section',
          { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, '工作流', h('small', null, `${modules.length || 1} 个模块 · ${tasks.length} 个任务`)),
          h(
            'div',
            { className: 'dsc-chips', style: { marginBottom: '10px' } },
            (modules.length ? modules : [{ id: 'mod', title: '插件任务' }]).map((m) =>
              h('span', { key: m.id, className: 'dsc-chip' }, m.title || m.id)),
          ),
          h(
            'table',
            { className: 'dsc-table' },
            h('thead', null, h('tr', null, h('th', null, '任务'), h('th', null, '工种'), h('th', null, '批次'), h('th', null, '状态'), h('th', null, '进度'), h('th', null, '验收'), h('th', null, 'Key/并发'), h('th', null, '预计'), h('th', null, '操作'))),
            h(
              'tbody',
              null,
              tasks.map((task) => h('tr', { key: task.id },
                h('td', null, task.name || task.id),
                h('td', null, task.role || '工班'),
                h('td', null, String(task.batch || 0)),
                h('td', null, task.state || 'idle'),
                h('td', null, task.detail || ''),
                h('td', null, task.acceptance || '任务指定'),
                h('td', null, `${task.keys || 0} key / ${task.workers || 0} 路`),
                h('td', { title: (etaMap[task.id] || {}).basis || '' }, (etaMap[task.id] || {}).eta_text || '—'),
                h('td', null,
                  (task.actions || ['start', 'stop', 'restart']).map((op) =>
                    h('button', {
                      key: op,
                      type: 'button',
                      className: 'dsc-mini',
                      disabled: Boolean(busy),
                      onClick: () => run(task.id, op),
                    }, actionLabels[op] || op)),
                ),
              )),
            ),
          ),
          h('div', { className: 'dsc-hint', style: { marginTop: '8px' } },
            '这里只放精简状态和软启停；详细控制台在左栏「插件任务」里。'),
        ),
      )
    }

    function ReviewView({ snap, act, busy }) {
      const tel = snap.telemetry || {}
      const summary = tel.summary || {}
      const issues = tel.issues || []
      const history = snap.taskHistory || []
      const rows = Object.entries(summary)
      return h(React.Fragment, null,
        h('section', { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, '批次复盘', h('small', null, tel.updated || '暂无遥测')),
          h('div', { className: 'dsc-actions' },
            h('button', { type: 'button', className: 'dsc-btn primary', disabled: Boolean(busy), onClick: () => act({ type: 'telemetry-run' }, '生成复盘') }, '重新分析'),
            h('span', { className: 'dsc-hint' }, '按任务类型看 token / 耗时 / 异常')),
          rows.length
            ? h('table', { className: 'dsc-table' },
              h('thead', null, h('tr', null, h('th', null, '类型'), h('th', null, '次数'), h('th', null, '成功'), h('th', null, '平均 token'), h('th', null, '平均秒'), h('th', null, 'token/s'))),
              h('tbody', null, rows.map(([type, s]) => h('tr', { key: type },
                h('td', null, type), h('td', null, String(s.runs || 0)), h('td', null, String(s.ok || 0)),
                h('td', null, String(s.avg_tokens || 0)), h('td', null, String(s.avg_seconds || 0)),
                h('td', null, String(s.tokens_per_second || 0))))))
            : h('div', { className: 'dsc-hint' }, '还没有批次遥测；跑一批任务后自动出现。')),
        h('section', { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, '异常工单', h('small', null, `${issues.length} 条`)),
          issues.length
            ? h('table', { className: 'dsc-table' },
              h('thead', null, h('tr', null, h('th', null, '类型'), h('th', null, '任务'), h('th', null, '原因'), h('th', null, 'token'), h('th', null, '秒'))),
              h('tbody', null, issues.slice(0, 20).map((x, i) => h('tr', { key: i },
                h('td', null, x.type || ''), h('td', null, x.id || ''), h('td', null, x.reason || ''),
                h('td', null, String(x.tokens || 0)), h('td', null, String(x.seconds || 0))))))
            : h('div', { className: 'dsc-hint' }, '没有异常批次。')),
        h('section', { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, '最近操作', h('small', null, `${history.length} 条`)),
          history.length
            ? h('div', { className: 'dsc-hint' }, history.slice(-12).reverse().map((x) => `${x.at || ''} · ${x.id || ''} · ${x.op || ''}`).join('\n'))
            : h('div', { className: 'dsc-hint' }, '还没有审核/接管记录。')),
      )
    }

    function ScheduleView() {
      const [items, setItems] = React.useState([])
      const [error, setError] = React.useState('')
      const load = React.useCallback(async () => {
        try {
          const r = await call(`/dsh-console/api/schedules?t=${Date.now()}`)
          setItems(r.items || [])
          setError(r.ok === false ? (r.message || 'schedule service 不可用') : '')
        } catch (e) {
          setError(String((e && e.message) || e))
        }
      }, [])
      React.useEffect(() => { load() }, [load])
      const remove = async (item) => {
        const r = await call('/dsh-console/api/schedules', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId: item.sessionId, id: item.id }),
        })
        if (r && r.deleted) load()
      }
      return h('section', { className: 'dsc-card' },
        h('h3', { className: 'dsc-sec-title' }, '定时任务', h('small', null, `${items.length} 条`)),
        error ? h('div', { className: 'dsc-banner err' }, error) : null,
        items.length
          ? h('table', { className: 'dsc-table' },
            h('thead', null, h('tr', null,
              h('th', null, '标题'), h('th', null, '类型'), h('th', null, '时间'),
              h('th', null, '状态'), h('th', null, '操作'))),
            h('tbody', null, items.map((x) => h('tr', { key: x.id },
              h('td', null, x.title || x.id),
              h('td', null, x.kind || ''),
              h('td', null, x.scheduledAt || ''),
              h('td', null, x.status || ''),
              h('td', null, h('button', { type: 'button', className: 'dsc-mini', onClick: () => remove(x) }, '删除'))))))
          : h('div', { className: 'dsc-hint' }, '没有定时任务。'))
    }

    function XdPoolPanel() {
      const [data, setData] = React.useState(null)
      const load = React.useCallback(async () => {
        try {
          const [xd, prov] = await Promise.all([
            call(`/dsh-console/api/xdpool?t=${Date.now()}`),
            call(`/dsh-console/api/providers?t=${Date.now()}`),
          ])
          setData({ xd: xd || {}, prov: prov || {} })
        } catch (e) {
          setData({ xd: { installed: false, message: String(e) }, prov: {} })
        }
      }, [])
      React.useEffect(() => { load() }, [load])
      const xd = (data && data.xd) || {}
      const st = xd.status || {}
      const prov = (data && data.prov) || {}
      return h('div', { className: 'dsc-root', style: { padding: '4px' } },
        h('style', null, CSS),
        h('section', { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, 'XD Pool 控制面板', h('small', null, xd.installed ? '宿主已加载' : '未安装')),
          xd.installed
            ? h(React.Fragment, null,
              h('div', { className: 'dsc-chips' },
                h('span', { className: 'dsc-chip' }, '账号 ', h('b', null, String((st.accounts || []).length))),
                h('span', { className: 'dsc-chip' }, '模型 ', h('b', null, String((st.models || []).length))),
                h('span', { className: 'dsc-chip' }, '冷却 ', h('b', null, String(st.cooling || 0))),
                h('span', { className: 'dsc-chip' }, '聚合渠道 ', h('b', null, String((((xd.aggregate || {}).providers) || []).length)))),
              h('div', { className: 'dsc-hint', style: { marginTop: '8px' } },
                '账号池、扫码登录、76 家聚合渠道由 XD Pool 宿主维护；这里提供状态和统一模型视图。'))
            : h('div', { className: 'dsc-hint' }, xd.message || '未检测到 XD Pool。')),
        h('section', { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, '统一模型来源', h('small', null, 'GET /dsh-console/api/providers')),
          h('div', { className: 'dsc-chips' },
            ...((prov.sources || []).map((s) => h('span', { key: s.id, className: 'dsc-chip' },
              s.name || s.id, ' ', h('b', null, String(s.models || 0)))))),
          h('div', { className: 'dsc-actions', style: { marginTop: '10px' } },
            h('button', { type: 'button', className: 'dsc-btn primary', onClick: load }, '刷新'))),
      )
    }

    function ConsolePage(props) {
      const tr = picker(props.t)
      const [snap, setSnap] = React.useState(null)
      const [error, setError] = React.useState(null)
      const [busy, setBusy] = React.useState(null)
      const [autoRefresh, setAutoRefresh] = React.useState(true)
      const [toast, setToast] = React.useState(null)
      const [tab, setTab] = React.useState('home')

      const load = React.useCallback(async (force = false) => {
        let lastError = null
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            const data = await call(`${STATUS_URL}?t=${Date.now()}${force ? '&refresh=1' : ''}`)
            setSnap(data)
            setError(null)
            return
          } catch (failure) {
            lastError = failure
            await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)))
          }
        }
        setError(String((lastError && lastError.message) || lastError))
      }, [])

      React.useEffect(() => {
        load()
      }, [load])

      React.useEffect(() => {
        if (!autoRefresh) return undefined
        const timer = setInterval(() => {
          if (typeof document === 'undefined' || !document.hidden) load()
        }, 3000)
        return () => clearInterval(timer)
      }, [autoRefresh, load])

      React.useEffect(() => {
        if (!toast) return undefined
        const timer = setTimeout(() => setToast(null), 3200)
        return () => clearTimeout(timer)
      }, [toast])

      // 面板内 Ctrl+R 只刷新状态，不重载整个 DSH 页面。
      React.useEffect(() => {
        const onKey = (event) => {
          if (!(event.ctrlKey || event.metaKey)) return
          if (String(event.key).toLowerCase() !== 'r') return
          event.preventDefault()
          event.stopPropagation()
          load()
          setToast({ text: tr('refreshed'), tone: 'ok' })
        }
        window.addEventListener('keydown', onKey, true)
        return () => window.removeEventListener('keydown', onKey, true)
      }, [load, tr])

      const act = React.useCallback(async (payload, label) => {
        setBusy(payload.type + (payload.key ? ':' + payload.key : ''))
        try {
          const result = await call(ACTION_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          })
          if (result && result.status) setSnap(result.status)
          if (result && result.ok === false) setToast({ text: String(result.message || '失败'), tone: 'err' })
          else setToast({ text: String((result && result.message) || label || ''), tone: 'ok' })
          return result
        } catch (failure) {
          setToast({ text: String((failure && failure.message) || failure), tone: 'err' })
          return { ok: false }
        } finally {
          setBusy(null)
        }
      }, [])

      if (error && !snap) {
        return h(
          'div',
          { className: 'dsc-root' },
          h('style', null, CSS),
          h(
            'div',
            { className: 'dsc-inner' },
            h('div', { className: 'dsc-banner err' }, tr('errorTitle') + ' ' + error),
            h('div', { className: 'dsc-rowdesc' }, tr('errorHint')),
            h('div', null, h('button', { type: 'button', className: 'dsc-btn', onClick: load }, tr('retry'))),
          ),
        )
      }

      if (!snap) {
        return h('div', { className: 'dsc-root' }, h('style', null, CSS), h('div', { className: 'dsc-inner' }, tr('loading')))
      }

      const pipeline = snap.pipeline || {}
      const bot = snap.bot || {}
      const running = Boolean(pipeline.running)

      return h(
        'div',
        { className: 'dsc-root' },
        h('style', null, CSS),
        h(
          'div',
          { className: 'dsc-inner' },
          h(
            'header',
            { className: 'dsc-head' },
            h(
              'div',
              { className: 'dsc-title' },
              h('span', { className: 'dsc-logo' }, h(ConsoleIcon, { size: 22 })),
              h('div', null, h('h1', { className: 'dsc-h1' }, `${tr('title')}${snap.pluginVersion ? ' v' + snap.pluginVersion : ''}`), h('p', { className: 'dsc-sub' }, tr('subtitle'))),
            ),
            h(
              'div',
              { className: 'dsc-headright' },
              (snap.tasks || []).map((task) =>
                h(
                  'span',
                  { key: task.id, className: 'dsc-pill' + (task.state === 'running' ? ' on' : ' muted') },
                  h('span', { className: 'dsc-dot' }),
                  task.name + ' ' + taskStateText(tr, task.state),
                ),
              ),
              h('span', { className: 'dsc-pill' + ((snap.balanceLoop || {}).state === 'running' ? ' on' : ' muted') }, h('span', { className: 'dsc-dot' }), tr('tabBalance') + ' ' + ((snap.balanceLoop || {}).state === 'running' ? tr('running') : tr('stopped'))),
              h('span', { className: 'dsc-pill' + (bot.running ? ' on' : ' muted') }, h('span', { className: 'dsc-dot' }), tr('tabBot') + ' ' + (bot.running ? tr('running') : tr('stopped'))),
              h('button', { type: 'button', className: 'dsc-btn', onClick: () => setAutoRefresh(!autoRefresh), title: tr('autoRefreshDesc') }, tr('autoRefresh') + '：' + (autoRefresh ? tr('on') : tr('off'))),
              h('button', { type: 'button', className: 'dsc-btn', onClick: () => load(true), disabled: Boolean(busy), title: 'Ctrl+R' }, tr('refresh')),
            ),
          ),
          h(
            'nav',
            { className: 'dsc-tabs' },
            h('button', { type: 'button', className: 'dsc-tab' + (tab === 'home' ? ' is-on' : ''), onClick: () => setTab('home') }, tr('tabHome')),
            h('button', { type: 'button', className: 'dsc-tab' + (tab === 'workflow' ? ' is-on' : ''), onClick: () => setTab('workflow') }, tr('tabWorkflow')),
            h('button', { type: 'button', className: 'dsc-tab' + (tab === 'free' ? ' is-on' : ''), onClick: () => setTab('free') }, '免费池'),
            h('button', { type: 'button', className: 'dsc-tab' + (tab === 'review' ? ' is-on' : ''), onClick: () => setTab('review') }, '复盘'),
            h('button', { type: 'button', className: 'dsc-tab' + (tab === 'schedule' ? ' is-on' : ''), onClick: () => setTab('schedule') }, '定时'),
            h('button', { type: 'button', className: 'dsc-tab' + (tab === 'bot' ? ' is-on' : ''), onClick: () => setTab('bot') }, tr('tabBot')),
          ),
          error ? h('div', { className: 'dsc-banner err' }, error) : null,
          tab === 'home'
            ? h(OverviewView, {
                snap,
                tr,
                onOpen: () => setTab('workflow'),
                act,
                busy,
              })
            : tab === 'workflow'
              ? h(WorkflowView, { snap, tr, act, busy })
              : tab === 'free'
                ? h(FreePoolView, { snap, act, busy })
                : tab === 'review'
                  ? h(ReviewView, { snap, act, busy })
                  : tab === 'schedule'
                    ? h(ScheduleView, null)
                    : h(BotView, { snap, act, busy, tr }),
          toast ? h('div', { className: 'dsc-toast' + (toast.tone === 'err' ? ' err' : '') }, toast.text) : null,
        ),
      )
    }

    function FreePoolView({ snap, act, busy }) {
      const [xd, setXd] = React.useState(null)
      const [prov, setProv] = React.useState(null)
      const [fm, setFm] = React.useState(null)
      const [fmq, setFmq] = React.useState('')
      const loadFm = React.useCallback((q = '') => {
        call(`/dsh-console/api/free-models?q=${encodeURIComponent(q)}&t=${Date.now()}`)
          .then((data) => setFm(data || { models: [] }))
          .catch(() => setFm({ models: [] }))
      }, [])
      React.useEffect(() => {
        let alive = true
        call(`/dsh-console/api/xdpool?t=${Date.now()}`)
          .then((data) => { if (alive) setXd(data || { installed: false }) })
          .catch(() => { if (alive) setXd({ installed: false }) })
        call(`/dsh-console/api/providers?t=${Date.now()}`)
          .then((data) => { if (alive) setProv(data || {}) })
          .catch(() => { if (alive) setProv({ sources: [] }) })
        loadFm('')
        return () => { alive = false }
      }, [loadFm])
      const fp = snap.freePool || {}
      const sched = snap.scheduler || {}
      const auto = snap.autoscale || {}
      const power = snap.power || {}
      const powerDaily = snap.powerDaily || {}
      const resource = snap.resource || {}
      const assets = snap.assets || {}
      const community = snap.community || {}
      const cand = fp.candidates || {}
      const providers = Array.isArray(cand.providers) ? cand.providers : []
      return h(
        React.Fragment,
        null,
        h('section', { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, 'XD Pool 伴侣', h('small', null, xd && xd.installed ? '已检测' : '可选')),
          xd === null
            ? h('div', { className: 'dsc-hint' }, '读取 XD Pool 状态…')
            : xd.installed
              ? h(React.Fragment, null,
                h('div', { className: 'dsc-chips' },
                  h('span', { className: 'dsc-chip' }, '账号 ', h('b', null, String(((xd.status || {}).accounts || []).length))),
                  h('span', { className: 'dsc-chip' }, '模型 ', h('b', null, String(((xd.status || {}).models || []).length))),
                  h('span', { className: 'dsc-chip' }, '冷却 ', h('b', null, String((xd.status || {}).cooling || 0))),
                  h('span', { className: 'dsc-chip' }, '聚合渠道 ', h('b', null, String((((xd.aggregate || {}).providers) || []).length)))),
                h('div', { className: 'dsc-hint', style: { marginTop: '6px' } },
                  '伴侣模式：账号池、登录和路由由 XD Pool 维护，这里只读显示。'))
              : h('div', { className: 'dsc-hint' }, '未安装 XD Pool；装好后这里会显示它的账号池、模型和聚合渠道。')),
        h('section', { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, '模型来源（统一 API）', h('small', null, (prov && prov.version ? 'v' + prov.version : '可选'))),
          h('div', { className: 'dsc-chips' },
            ...((prov && prov.sources) || []).map((s) => h('span', { key: s.id, className: 'dsc-chip' },
              s.name || s.id, ' ', h('b', null, String(s.models || 0))))),
          h('div', { className: 'dsc-hint', style: { marginTop: '6px' } },
            'GET /dsh-console/api/providers；统一返回 source / model / state，供调度器直接消费。')),
        h('section', { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, '免费模型登记', h('small', null, (fm && fm.total !== undefined ? fm.total + ' 条' : '加载中'))),
          h('div', { className: 'dsc-actions' },
            h('input', {
              type: 'text', value: fmq, placeholder: '搜索来源 / 模型 / 额度 / 绑卡',
              onChange: (e) => setFmq(e.target.value),
              onKeyDown: (e) => { if (e.key === 'Enter') loadFm(fmq) },
              style: { minWidth: '240px' },
            }),
            h('button', { type: 'button', className: 'dsc-btn primary', onClick: () => loadFm(fmq) }, '搜索')),
          h('table', { className: 'dsc-table', style: { marginTop: '10px' } },
            h('thead', null, h('tr', null,
              h('th', null, '来源'), h('th', null, '模型'), h('th', null, '状态'),
              h('th', null, '绑卡'), h('th', null, '免费额度'), h('th', null, 'IQ'))),
            h('tbody', null, ((fm && fm.models) || []).slice(0, 30).map((m, i) => h('tr', { key: m.model || m.provider || i },
              h('td', null, m.source || ''),
              h('td', null, m.model || m.provider || ''),
              h('td', null, m.status || ''),
              h('td', null, m.card_required || '—'),
              h('td', null, String(m.free_quota || m.quota || '—').slice(0, 60)),
              h('td', null, m.iq_score !== undefined ? String(m.iq_score) : '—'))))),
          h('div', { className: 'dsc-hint', style: { marginTop: '6px' } },
            'IQ 限流会自动按 10/20/40 分钟退避重试，结果写回 registry。')),
        h('section', { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, '素材 / GitHub', h('small', null, assets.updated || '')),
          h('div', { className: 'dsc-chips' },
            h('span', { className: 'dsc-chip' }, '地图 ', h('b', null, String((assets.maps || []).length))),
            h('span', { className: 'dsc-chip' }, 'tsx ', h('b', null, String((assets.tilesets || []).length))),
            h('span', { className: 'dsc-chip' }, 'png ', h('b', null, String(assets.png_count || 0))),
            h('span', { className: 'dsc-chip' }, '贴图集 ', h('b', null, String((assets.atlases || []).length)))),
          h('div', { className: 'dsc-actions', style: { marginTop: '10px' } },
            h('button', { type: 'button', className: 'dsc-btn primary', disabled: Boolean(busy), onClick: () => act({ type: 'asset-index' }, '素材索引') }, '重建素材索引'),
            h('button', { type: 'button', className: 'dsc-btn', disabled: Boolean(busy), onClick: () => act({ type: 'github-search' }, 'GitHub 地图') }, 'GitHub 地图'),
            h('button', { type: 'button', className: 'dsc-btn', disabled: Boolean(busy), onClick: () => act({ type: 'github-mods' }, 'GitHub 模组') }, 'GitHub 模组'),
            h('button', { type: 'button', className: 'dsc-btn', disabled: Boolean(busy), onClick: () => act({ type: 'self-check' }, '自检') }, '自检'),
            h('span', { className: 'dsc-hint' }, '桌面 maps · tsx · 全地形.png'))),
        h('section', { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, '国内社区素材', h('small', null, community.updated || '')),
          h('div', { className: 'dsc-chips' },
            h('span', { className: 'dsc-chip' }, '来源 ', h('b', null, community.source || 'rtsbox')),
            h('span', { className: 'dsc-chip' }, '条目 ', h('b', null, String((community.items || []).length)))),
          h('div', { className: 'dsc-actions', style: { marginTop: '10px' } },
            h('button', { type: 'button', className: 'dsc-btn primary', disabled: Boolean(busy), onClick: () => act({ type: 'community-scout' }, '社区素材抓取') }, '抓取并下载'),
            h('span', { className: 'dsc-hint' }, '只抓公开下载链接')),
          h('div', { className: 'dsc-hint', style: { marginTop: '6px' } },
            (community.items || []).slice(0, 5).map((x) => x.title || x.page).join(' · ') || '还没有抓取')),
        h('section', { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, '电量 / 供电', h('small', null, power.checked_at || '')),
          h('div', { className: 'dsc-chips' },
            h('span', { className: 'dsc-chip' }, '电量 ', h('b', null, power.percent == null ? '—' : `${power.percent}%`)),
            h('span', { className: 'dsc-chip' }, '状态 ', h('b', null, power.charging ? '充电中' : power.on_battery ? '电池供电' : '—')),
            h('span', { className: 'dsc-chip' }, '预计 ', h('b', null, power.projected_minutes ? `${power.projected_minutes} 分钟` : power.estimated_minutes ? `${power.estimated_minutes} 分钟` : '—')),
            h('span', { className: 'dsc-chip' }, '放电 ', h('b', null, power.discharge_percent_per_hour ? `${power.discharge_percent_per_hour}%/h` : '—'))),
          h('div', { className: 'dsc-hint', style: { marginTop: '6px' } },
            '每天耗电按电池供电区间的电量下降累计；插电时不累计。'),
          h('table', { className: 'dsc-table', style: { marginTop: '8px' } },
            h('thead', null, h('tr', null, h('th', null, '日期'), h('th', null, '耗电'), h('th', null, '估算 Wh'), h('th', null, '放电分钟'), h('th', null, '采样'))),
            h('tbody', null, Object.keys(powerDaily).sort().slice(-7).reverse().map((d) => {
              const r = powerDaily[d] || {}
              return h('tr', { key: d },
                h('td', null, d),
                h('td', null, `${r.used_percent || 0}%`),
                h('td', null, String(r.estimated_wh || 0)),
                h('td', null, String(r.discharge_minutes || 0)),
                h('td', null, String(r.samples || 0)))
            })))),
        h('section', { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, '内存保护', h('small', null, resource.checked_at || '')),
          h('div', { className: 'dsc-chips' },
            h('span', { className: 'dsc-chip' }, '内存 ', h('b', null, resource.used_percent == null ? '—' : `${resource.used_percent}%`)),
            h('span', { className: 'dsc-chip' }, '可用 ', h('b', null, resource.free_mb == null ? '—' : `${resource.free_mb} MB`)),
            h('span', { className: 'dsc-chip' }, '保护 ', h('b', null, resource.action || '正常'))),
          h('div', { className: 'dsc-hint', style: { marginTop: '6px' } },
            resource.note || '内存过高时自动停止扩展对话和侦察任务，保留主插件任务。')),
        h('section', { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, '自动扩展', h('small', null, auto.updated || '')),
          h('div', { className: 'dsc-chips' },
            h('span', { className: 'dsc-chip' }, 'key ', h('b', null, String(auto.keys || 0))),
            h('span', { className: 'dsc-chip' }, '槽位 ', h('b', null, `${auto.active_slots || 0} / ${auto.capacity_slots || 0}`)),
            h('span', { className: 'dsc-chip' }, '空闲槽位 ', h('b', null, String(auto.idle_slots || 0))),
            h('span', { className: 'dsc-chip' }, '空闲率 ', h('b', null, `${Math.round((auto.slot_ratio || 0) * 100)}%`))),
          h('div', { className: 'dsc-hint', style: { marginTop: '6px' } },
            (auto.actions || []).length ? '最近动作：' + auto.actions.join(' / ') : '空闲低于阈值，暂不扩展')),
        h('section', { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, '固定槽位调度', h('small', null, `${(sched.slots || []).length} 个槽位 · 队列 ${(sched.queues && Object.values(sched.queues).reduce((a, b) => a + b, 0)) || 0}`)),
          h('div', { className: 'dsc-chips' },
            (sched.slots || []).map((slot) => h('span', { key: slot.id, className: 'dsc-chip' },
              slot.id, ' · ', (sched.type_labels || {})[slot.type] || slot.type))),
          h('div', { className: 'dsc-hint', style: { marginTop: '6px' } }, sched.note || '')),
        h('section', { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, '免费池侦察'),
          h('div', { className: 'dsc-hint' }, '空闲时让免费模型联网搜索可用的免费 AI 池；只产候选，不自动写入 key。'),
          h('div', { className: 'dsc-actions', style: { marginTop: '10px' } },
            h('button', { type: 'button', className: 'dsc-btn primary', disabled: Boolean(busy), onClick: () => act({ type: 'free-scout' }, '免费池侦察') }, '开始侦察'),
            h('span', { className: 'dsc-hint' }, cand.checked_at ? '上次：' + cand.checked_at : '还没侦察过'))),
        h('section', { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, '候选提供方', h('small', null, providers.length + ' 个')),
          providers.length
            ? h('table', { className: 'dsc-table' },
                h('thead', null, h('tr', null, h('th', null, '名称'), h('th', null, '免费额度'), h('th', null, 'Base URL'), h('th', null, '模型'), h('th', null, '来源'))),
                h('tbody', null, providers.map((p, i) => h('tr', { key: i },
                  h('td', null, p.name || ''),
                  h('td', null, p.free_quota || ''),
                  h('td', null, p.base_url || ''),
                  h('td', null, String(p.models || '')),
                  h('td', null, p.source_url ? h('a', { href: p.source_url, target: '_blank', rel: 'noreferrer' }, '来源') : '')))))
            : h('div', { className: 'dsc-hint' }, '暂无候选，点“开始侦察”。')),
        h('section', { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, '中小任务分流（插件外）', h('small', null, '固定会话，不占插件槽位')),
          h('div', { className: 'dsc-chips' },
            ['问答/理解', '小脚本', '文档/翻译', '分析/整理'].map((k) => h('span', { key: k, className: 'dsc-chip' }, k))),
          h('div', { className: 'dsc-hint', style: { marginTop: '6px' } },
            (snap.pipeline && snap.pipeline.hasDlc)
              ? '只接不需要完整插件流程的中小任务；插件任务仍走代码/地图/贴图/平衡槽位。'
              : '当前未安装模组插件：这里只接中小任务；安装后才会出现代码/地图/贴图/平衡槽位。')),
      )
    }

    function TurnSound() {
      React.useEffect(() => {
        if (!window.__dshTurnSoundArmed) {
          window.__dshTurnSoundArmed = true
          setTimeout(() => { window.__dshTurnSoundReady = true }, 5000)
          return
        }
        if (!window.__dshTurnSoundReady) return
        const now = Date.now()
        if (now - (window.__dshLastTurnSound || 0) < 2500) return
        window.__dshLastTurnSound = now
        try {
          const AudioCtor = window.AudioContext || window.webkitAudioContext
          if (!AudioCtor) return
          const audio = new AudioCtor()
          const osc = audio.createOscillator()
          const gain = audio.createGain()
          osc.type = 'sine'
          osc.frequency.value = 880
          gain.gain.setValueAtTime(0.0001, audio.currentTime)
          gain.gain.exponentialRampToValueAtTime(0.12, audio.currentTime + 0.02)
          gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.35)
          osc.connect(gain)
          gain.connect(audio.destination)
          osc.start()
          osc.stop(audio.currentTime + 0.36)
          setTimeout(() => audio.close().catch(() => {}), 600)
        } catch {
          /* 浏览器拦截自动播放时静默 */
        }
      }, [])
      return null
    }

    return {
      inject: ['slots', 'locale'],
      /**
       * 注册左栏图标与主面板。
       * @param ctx 浏览器上下文。
       */
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), 'ds-console: dictionaries')
        const t = ctx.locale.bind(NS)
        window.__AI_HUB_UI__.tr = t
        window.__AI_HUB_UI__.views = { PipelineView, MapView, ArtView, BalanceView }
        window.__AI_HUB_UI__.css = CSS

        ctx.slots.inject('main', () =>
          ctx.slots.register(
            { name: 'main', key: PANEL_ID, locale: NS, inject: () => ({ t: t }) },
            ConsolePage,
          ),
        )

        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            { name: 'sidebar.panellist', id: PANEL_ID, order: 5, locale: NS, label: () => t('panel') },
            ConsoleIcon,
          ),
        )

        ctx.slots.inject('settings.section', () =>
          ctx.slots.register(
            { name: 'settings.section', id: 'xdpool-control', order: 441, label: () => 'XD Pool' },
            XdPoolPanel,
          ),
        )

        // 对话回合完成提示音（挂在 turnTail，只在实时完成时响，刷新历史会被 5 秒静默期压掉）
        ctx.slots.inject('conversation.chat.turnTail', () =>
          ctx.slots.register(
            { name: 'conversation.chat.turnTail', id: 'ai-hub-turn-sound', order: 999, label: () => '完成提示' },
            TurnSound,
          ),
        )
      },
    }
  },
})
