/**
 * dsh-plugin-ai-hub — 浏览器半（Client half）。
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
    const shortModel = (m) => {
      const s = String(m || '')
      const low = s.toLowerCase()
      if (/v4\.1/.test(low)) return 'V4.1f'
      if (low === 'deepseek-flash') return 'V4.1f'
      if (/deepseek.*flash/.test(low)) return 'V4f'
      if (/deepseek.*pro/.test(low)) return 'V4p'
      if (/v4/.test(low)) return /pro/.test(low) ? 'V4p' : 'V4f'
      if (/glm/.test(low)) {
        const match = /glm[\s-]*([\d.]+)/i.exec(s)
        const version = match ? match[1] : '5.3'
        return `GLM-${version}${/pro/.test(low) ? 'p' : 'f'}`
      }
      if (/gemma/.test(low)) {
        const match = /gemma[\s-]*([\d.]+(?:-\d+b)?)/i.exec(s)
        return match ? `Gemma-${match[1]}` : 'Gemma-4-31B'
      }
      if (/qwen/.test(low)) {
        const match = /qwen[\s-]*([\d.]+)/i.exec(s)
        return match ? `Qwen${match[1]}` : 'Qwen'
      }
      if (/mimo/.test(low)) {
        const match = /mimo[\s-]*v?([\d.]+)/i.exec(s)
        return match ? `MiMo-${match[1]}${/flash/.test(low) ? 'f' : ''}` : 'MiMo'
      }
      if (/minicpm/.test(low)) {
        const match = /minicpm[\s-]*v?([\d.]+)/i.exec(s)
        return match ? `MiniCPM-${match[1]}` : 'MiniCPM'
      }
      return s
    }

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
.dsc-root{box-sizing:border-box;height:100%;overflow-y:auto;overflow-x:hidden;color:var(--dsw-alias-label-primary)}
.dsc-inner{width:100%;box-sizing:border-box;max-width:none;margin:0;padding:calc(var(--dsh-frame-top-clearance,0px) + 24px) 30px 52px;display:flex;flex-direction:column;gap:20px}
.dsc-herobar{display:flex;flex-direction:column;gap:14px;padding:18px 20px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:20px;background:linear-gradient(135deg,color-mix(in srgb,var(--dsw-alias-brand-primary) 9%,var(--dsw-alias-bg-layer-1)),var(--dsw-alias-bg-layer-1) 46%,color-mix(in srgb,var(--dsw-alias-state-business-primary) 5%,var(--dsw-alias-bg-layer-2)));box-shadow:0 1px 2px rgba(0,0,0,.08);box-sizing:border-box;width:100%;min-width:0}
.dsc-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;flex-wrap:wrap}
.dsc-title{display:flex;gap:13px;align-items:center;min-width:0}
.dsc-logo{width:44px;height:44px;border-radius:14px;display:flex;align-items:center;justify-content:center;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-brand-primary);flex:none}
.dsc-h1{font-size:19px;font-weight:650;margin:0;line-height:1.25;letter-spacing:.2px}
.dsc-sub{font-size:12.5px;color:var(--dsw-alias-label-secondary);margin:4px 0 0;line-height:1.45}
.dsc-headright{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dsc-statusrow{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding-top:2px}
.dsc-pill{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;padding:4px 10px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);white-space:nowrap}
.dsc-dot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-idle-primary);flex:none}
.dsc-pill.on{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary)}
.dsc-pill.on .dsc-dot{background:var(--dsw-alias-state-success-primary)}
.dsc-pill.muted{color:var(--dsw-alias-label-secondary)}
.dsc-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;padding:0 14px;border-radius:9px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:13px;font-family:inherit;cursor:pointer;transition:background .12s ease,border-color .12s ease}
.dsc-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}
.dsc-btn:disabled{opacity:.42;cursor:not-allowed}
.dsc-btn.primary{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);background:linear-gradient(135deg,color-mix(in srgb,var(--dsw-alias-brand-primary) 15%,var(--dsw-alias-bg-layer-1)),var(--dsw-alias-bg-layer-1))}
.dsc-btn.danger{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}
.dsc-tabs{display:flex;gap:4px;padding:10px 0 0;border-top:1px solid var(--dsw-alias-border-l1);align-self:stretch;overflow-x:auto;scrollbar-width:none;min-width:0}
.dsc-tabs::-webkit-scrollbar{display:none}
.dsc-tab{font-family:inherit;font-size:12.5px;padding:7px 15px;border-radius:999px;border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;white-space:nowrap;transition:background .12s ease,color .12s ease,border-color .12s ease}
.dsc-tab:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}
.dsc-tab.is-on{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,var(--dsw-alias-bg-layer-1));border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 40%,transparent);color:var(--dsw-alias-brand-primary);font-weight:600}
.dsc-card{box-sizing:border-box;width:100%;min-width:0;background:linear-gradient(180deg,var(--dsw-alias-bg-layer-1),color-mix(in srgb,var(--dsw-alias-bg-layer-2) 38%,var(--dsw-alias-bg-layer-1)));border:1px solid var(--dsw-alias-border-l1);border-radius:18px;padding:18px 20px;box-shadow:0 1px 2px rgba(0,0,0,.06)}
.dsc-hero{display:flex;gap:22px;align-items:center;flex-wrap:wrap}
.dsc-ring{flex:none;width:92px;height:92px}
.dsc-ringtext{font-size:17px;font-weight:600;fill:var(--dsw-alias-label-primary)}
.dsc-ringcap{font-size:9.5px;fill:var(--dsw-alias-label-secondary)}
.dsc-heroinfo{flex:1;min-width:240px;display:flex;flex-direction:column;gap:10px}
.dsc-herotop{display:flex;align-items:baseline;justify-content:space-between;gap:12px;font-size:12.5px;color:var(--dsw-alias-label-secondary)}
.dsc-herotop strong{font-size:14px;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums}
.dsc-bar{position:relative;height:8px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);overflow:hidden}
.dsc-bar i{position:absolute;inset:0 auto 0 0;border-radius:999px;background:var(--dsw-alias-brand-primary);transition:width .35s ease}
.dsc-chips{display:flex;gap:8px;flex-wrap:wrap;min-width:0;max-width:100%}
.dsc-chip{font-size:11.5px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);border-radius:7px;padding:4px 9px;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.dsc-chip.on{color:var(--dsw-alias-brand-primary);background:linear-gradient(135deg,color-mix(in srgb,var(--dsw-alias-brand-primary) 15%,var(--dsw-alias-bg-layer-2)),var(--dsw-alias-bg-layer-2));box-shadow:inset 0 0 0 1px var(--dsw-alias-brand-primary)}
.dsc-chip b{color:var(--dsw-alias-label-primary);font-weight:600;font-variant-numeric:tabular-nums}
.dsc-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(148px,1fr));gap:12px}
.dsc-metric{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:13px;padding:13px 15px;display:flex;flex-direction:column;gap:6px;min-width:0}
.dsc-metric-k{font-size:11.5px;color:var(--dsw-alias-label-secondary)}
.dsc-metric-v{font-size:18px;font-weight:600;line-height:1.25;font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsc-metric-v.is-compact{font-size:12.5px;font-weight:500;line-height:1.45;white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-word}
.dsc-metric-h{font-size:11px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsc-sec-title{font-size:14px;font-weight:650;margin:0 0 13px;display:flex;align-items:center;justify-content:space-between;gap:12px}
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
.dsc-empty{display:flex;align-items:center;justify-content:center;min-height:76px;border:1px dashed var(--dsw-alias-border-l1);border-radius:14px;color:var(--dsw-alias-label-secondary);font-size:12.5px;line-height:1.5;text-align:center;padding:14px 18px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 55%,transparent)}
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
.dsc-table th,.dsc-table td{text-align:left;padding:7px 10px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.dsc-table th{color:var(--dsw-alias-label-secondary);font-weight:650;font-size:11.5px;letter-spacing:.02em}
.dsc-table th:first-child,.dsc-table td:first-child{position:sticky;left:0;z-index:1;background:var(--dsw-alias-bg-layer-1);width:auto;min-width:112px;white-space:nowrap;color:var(--dsw-alias-label-primary)}
.dsc-table thead th:first-child{z-index:3;background:var(--dsw-alias-bg-layer-2)}
.dsc-table tbody tr:nth-child(even) td:first-child{background:var(--dsw-alias-bg-layer-2)}
.dsc-state{display:inline-block;padding:1px 6px;border-radius:999px;font-size:11px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}
.dsc-state.succeeded,.dsc-state.done{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 18%,transparent);color:var(--dsw-alias-state-success-primary)}
.dsc-state.failed,.dsc-state.stale,.dsc-state.cancelled{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 18%,transparent);color:var(--dsw-alias-state-error-primary)}
.dsc-state.running,.dsc-state.dispatched{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 18%,transparent);color:var(--dsw-alias-state-business-primary)}
.dsc-state.queued{background:color-mix(in srgb,var(--dsw-alias-state-warning-primary) 18%,transparent)}
.dsc-table th,.dsc-table td{border-right:1px solid color-mix(in srgb,var(--dsw-alias-border-l1) 70%,transparent)}
.dsc-table th:last-child,.dsc-table td:last-child{border-right:0}
.dsc-table tbody tr:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsc-table tbody tr:nth-child(even) td{border-bottom-color:color-mix(in srgb,var(--dsw-alias-border-l1) 80%,transparent)}
.dsc-matrix th{background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 88%,var(--dsw-alias-brand-primary) 12%)}
.dsc-matrix td:first-child{border-right:1px solid var(--dsw-alias-border-l1)}
.dsc-matrix tr[data-vendor]{background:var(--dsw-alias-bg-layer-2)}
.dsc-matrix td:first-child,.dsc-matrix th:first-child{width:auto;color:inherit}
.dsc-matrix tbody td:first-child::before{content:none}
.dsc-matrix td,.dsc-matrix th{text-align:center;white-space:nowrap}
.dsc-matrix td:first-child,.dsc-matrix th:first-child{text-align:left}
.dsc-matrix tbody tr:nth-child(even),.dsc-matrix tbody tr:nth-child(-n+3){background:transparent}
.dsc-matrix tbody tr:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsc-matrix .dsc-cell-busy{color:var(--dsw-alias-state-business-primary);font-weight:600}
.dsc-provider-row{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:10px;padding-top:8px;border-top:1px dashed var(--dsw-alias-border-l1);font-size:11.5px;color:var(--dsw-alias-label-secondary)}
.dsc-provider-row>b{color:var(--dsw-alias-label-primary);font-weight:650}
.dsc-key-state{display:inline-block;margin-left:6px;padding:0 5px;border-radius:999px;font-size:10px;line-height:15px;border:1px solid transparent;white-space:nowrap}
.dsc-key-state.available{color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 12%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 28%,transparent)}
.dsc-key-state.used{color:var(--dsw-alias-label-secondary);background:color-mix(in srgb,var(--dsw-alias-label-secondary) 12%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-label-secondary) 22%,transparent)}
.dsc-key-state.limited{color:var(--dsw-alias-state-warning-primary);background:color-mix(in srgb,var(--dsw-alias-state-warning-primary) 14%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-state-warning-primary) 32%,transparent)}
.dsc-flaglist{margin:8px 0 0;padding-left:18px;font-size:12px;line-height:1.7;color:var(--dsw-alias-label-primary)}
.dsc-qualitybar{display:flex;align-items:center;gap:3px;margin-top:10px;font-size:11px;color:var(--dsw-alias-label-secondary);min-width:0}
.dsc-qualitybar i{height:6px;border-radius:999px;display:block}
.dsc-qualitybar i.qa{background:linear-gradient(90deg,#35c98a,#57d6a2)}
.dsc-qualitybar i.qb{background:linear-gradient(90deg,#d6a84a,#e7c36d)}
.dsc-qualitybar i.qc{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 65%,transparent)}
.dsc-qualitybar span{margin-left:6px;white-space:nowrap}
.dsc-radar-search{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:12px}
.dsc-radar-search .dsc-input{flex:1;min-width:240px}
.dsc-radar-list{display:flex;flex-direction:column;gap:10px;margin-top:12px}
.dsc-radar-item{padding:13px 15px;border:1px solid var(--dsw-alias-border-l1);border-radius:14px;background:linear-gradient(135deg,color-mix(in srgb,var(--dsw-alias-bg-layer-2) 72%,transparent),var(--dsw-alias-bg-layer-1));min-width:0}
.dsc-radar-item:hover{border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 42%,var(--dsw-alias-border-l1))}
.dsc-radar-top{display:flex;align-items:flex-start;gap:10px;justify-content:space-between}
.dsc-radar-title{font-size:13.5px;font-weight:600;line-height:1.45;min-width:0;overflow-wrap:anywhere}
.dsc-radar-title a{color:var(--dsw-alias-label-primary);text-decoration:none}
.dsc-radar-title a:hover{color:var(--dsw-alias-brand-primary)}
.dsc-radar-badge{display:inline-flex;align-items:center;gap:4px;flex:none;font-size:10.5px;padding:3px 8px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2)}
.dsc-radar-badge.bilibili{color:#fb7299;border-color:color-mix(in srgb,#fb7299 45%,transparent)}
.dsc-radar-badge.hackernews{color:#ff9f43;border-color:color-mix(in srgb,#ff9f43 45%,transparent)}
.dsc-radar-badge.xiaoheihe{color:#54d6a1;border-color:color-mix(in srgb,#54d6a1 45%,transparent)}
.dsc-radar-badge.xiaomi{color:#ff6900;border-color:color-mix(in srgb,#ff6900 45%,transparent)}
.dsc-radar-summary{font-size:12px;color:var(--dsw-alias-label-secondary);line-height:1.55;margin-top:5px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.dsc-radar-summary.is-open{display:block;overflow:visible;-webkit-line-clamp:unset}
.dsc-radar-detail{display:flex;flex-direction:column;gap:3px;margin-top:7px;padding-top:7px;border-top:1px dashed var(--dsw-alias-border-l1);font-size:11px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.dsc-radar-meta{display:flex;gap:8px;flex-wrap:wrap;margin-top:7px;font-size:11px;color:var(--dsw-alias-label-secondary)}
.dsc-radar-meta b{font-weight:600;color:var(--dsw-alias-label-primary)}
.dsc-radar-tags{display:flex;gap:5px;flex-wrap:wrap;margin-top:6px}
.dsc-radar-tags span{font-size:10.5px;padding:2px 7px;border-radius:6px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}
.dsc-radar-filters{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:12px}
.dsc-textarea{width:100%;min-height:180px;font-family:Consolas,monospace;font-size:12px;line-height:1.5;padding:10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);resize:vertical;box-sizing:border-box}
.dsc-row2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.dsc-session-radar{display:flex;flex-direction:column;gap:10px}
.dsc-session-group{border-top:1px solid var(--dsw-alias-border-l1);padding-top:6px}
.dsc-session-group:first-child{border-top:0;padding-top:0}
.dsc-session-group-title{display:flex;align-items:center;justify-content:space-between;font-size:11.5px;font-weight:650;color:var(--dsw-alias-label-secondary);padding:4px 2px}
.dsc-session-group-title b{font-weight:600;color:var(--dsw-alias-label-primary)}
.dsc-session-row{display:grid;grid-template-columns:12px minmax(140px,1fr) 58px 62px 78px;align-items:center;gap:9px;padding:7px 8px;border-radius:7px;cursor:pointer;transition:background .12s ease}
.dsc-session-row:hover,.dsc-session-row.is-on{background:var(--dsw-alias-interactive-bg-hover)}
.dsc-session-row.is-on{box-shadow:inset 2px 0 0 var(--dsw-alias-brand-primary)}
.dsc-session-dot{width:8px;height:8px;border-radius:50%;display:block;background:var(--dsw-alias-label-secondary);opacity:.55}
.dsc-session-dot.running{background:var(--dsw-alias-state-success-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-state-success-primary) 13%,transparent);opacity:1}
.dsc-session-dot.failed{background:var(--dsw-alias-state-error-primary);opacity:1}
.dsc-session-dot.idle{background:var(--dsw-alias-label-secondary)}
.dsc-session-name{font-size:12.5px;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsc-session-meta{font-size:11px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;white-space:nowrap}
.dsc-session-ctx{font-size:11px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;white-space:nowrap}
.dsc-session-ctx.warn{color:var(--dsw-alias-state-warning-primary);font-weight:650}
.dsc-session-time{font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap;text-align:right}
.dsc-session-actions{display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding:8px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-2)}
.dsc-session-actions .dsc-input{min-width:180px;flex:1}
.dsc-session-status{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--dsw-alias-label-secondary)}
.dsc-session-status .dsc-dot{width:7px;height:7px}
.dsc-ended{margin-top:10px;padding-top:8px;border-top:1px dashed var(--dsw-alias-border-l1)}
.dsc-ended-title{font-size:11.5px;font-weight:650;color:var(--dsw-alias-label-secondary);margin-bottom:5px}
.dsc-ended-row{display:grid;grid-template-columns:minmax(130px,1fr) auto 54px;gap:8px;align-items:center;padding:4px 2px;font-size:11.5px;color:var(--dsw-alias-label-secondary)}
.dsc-ended-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary)}
.dsc-ended-meta,.dsc-ended-time{white-space:nowrap;font-variant-numeric:tabular-nums}
@media (max-width:720px){.dsc-session-row{grid-template-columns:12px minmax(100px,1fr) 44px 52px 68px;gap:6px}.dsc-session-time{font-size:10px}}

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

    function XdIcon(props) {
      return h('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' },
        h('circle', { cx: 12, cy: 12, r: 9, stroke: 'currentColor', strokeWidth: 1.7 }),
        h('path', { d: 'M8 12h8M12 8v8', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' }))
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
              h('span', { className: 'dsc-chip' }, '并发 ', h('b', null, String(pipeline.workers || 0))),
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
          h(Metric, { label: tr('version'), value: pipeline.version || '1.46', hint: tr('lastTest') + ' ' + (pipeline.lastTest || '—') }),
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

    function decodeSessionWorkspace(raw) {
      let s = String(raw || '')
      s = s.replace(/^--C-Users-Railan-Desktop-/, '').replace(/--$/, '')
      s = s.replace(/~([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      return s.replace(/-/g, '\\')
    }

    function sessionGroupLabel(raw) {
      const decoded = decodeSessionWorkspace(raw)
      if (decoded.includes('ds工作区')) return 'ds工作区'
      if (decoded.includes('任务') && decoded.includes('代码')) return '代码任务'
      if (decoded.includes('任务') && decoded.includes('地图')) return '地图任务'
      if (decoded.includes('任务') && decoded.includes('贴图')) return '贴图任务'
      if (decoded.includes('任务') && decoded.includes('平衡')) return '平衡任务'
      if (decoded.toLowerCase().includes('qqbot')) return '大肥鱼'
      const tail = decoded.split('\\').filter(Boolean).slice(-1)[0]
      return tail || decoded || '其他'
    }

    function sessionAgo(value) {
      const ts = Date.parse(String(value || ''))
      if (!Number.isFinite(ts)) return '—'
      const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000))
      if (seconds < 60) return '刚刚'
      if (seconds < 3600) return Math.floor(seconds / 60) + ' 分钟前'
      if (seconds < 86400) return Math.floor(seconds / 3600) + ' 小时前'
      return new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    }

    const SESSION_GROUPS = ['ds工作区', '代码任务', '地图任务', '贴图任务', '平衡任务', '大肥鱼', '其他']

    function SessionRadar() {
      const [sessions, setSessions] = React.useState([])
      const [running, setRunning] = React.useState([])
      const [recentEnded, setRecentEnded] = React.useState([])
      const [selected, setSelected] = React.useState(null)
      const [message, setMessage] = React.useState('')
      const [notice, setNotice] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const load = React.useCallback(async () => {
        try {
          const [progress, data] = await Promise.all([
            fetch('/dsh-console/api/progress').then((r) => r.json()).catch(() => ({})),
            fetch('/dsh-console/api/sessions').then((r) => r.json()).catch(() => ({ sessions: [] })),
          ])
          const rows = Array.isArray((data || {}).sessions) ? data.sessions : []
          const recentCutoff = Date.now() - 24 * 3600 * 1000
          const visible = rows
            .filter((s) => s && s.sessionId && (s.running || Date.parse(String(s.lastActive || '')) >= recentCutoff))
            .sort((a, b) => (Number(b.running) - Number(a.running)) || (Date.parse(String(b.lastActive || '')) - Date.parse(String(a.lastActive || ''))))
          setSessions(visible)
          setRunning(((progress || {}).sessions || {}).running || [])
          setRecentEnded(Array.isArray((data || {}).recentEnded) ? data.recentEnded : [])
          setSelected((old) => (old && visible.some((s) => s.sessionId === old.sessionId) ? old : null))
        } catch (error) {
          setSessions([])
          setRecentEnded([])
        }
      }, [])
      React.useEffect(() => {
        load()
        const timer = setInterval(load, 5000)
        return () => clearInterval(timer)
      }, [load])
      const openSession = (session) => {
        try {
          window.open('/?session=' + encodeURIComponent(session.sessionId), '_blank', 'noopener,noreferrer')
        } catch (error) {
          setNotice('打开失败：' + String((error && error.message) || error))
        }
      }
      const select = (session) => {
        setSelected(session)
        setNotice('')
        setMessage('')
        openSession(session)
      }
      const inject = async () => {
        if (!selected || !message.trim()) return
        setBusy(true)
        setNotice('投递中…')
        try {
          const response = await fetch('/dsh-console/api/inject', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionId: selected.sessionId, text: message.trim() }),
          })
          const data = await response.json().catch(() => ({}))
          if (!response.ok || data.ok === false) throw new Error(data.message || data.error || 'HTTP ' + response.status)
          setMessage('')
          setNotice('已投递' + (data.resumed ? '（已恢复会话）' : ''))
          load()
        } catch (error) {
          setNotice('投递失败：' + String((error && error.message) || error))
        } finally {
          setBusy(false)
        }
      }
      const interrupt = async () => {
        if (!selected) return
        setBusy(true)
        setNotice('打断中…')
        try {
          const response = await fetch('/dsh-console/api/session/interrupt', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionId: selected.sessionId }),
          })
          const data = await response.json().catch(() => ({}))
          if (!response.ok || data.ok === false) throw new Error(data.message || data.error || 'HTTP ' + response.status)
          setNotice('已打断')
          load()
        } catch (error) {
          setNotice('打断失败：' + String((error && error.message) || error))
        } finally {
          setBusy(false)
        }
      }
      const grouped = {}
      for (const session of sessions) {
        const group = sessionGroupLabel(session.workspace)
        ;(grouped[group] = grouped[group] || []).push(session)
      }
      const order = [...SESSION_GROUPS, ...Object.keys(grouped).filter((x) => !SESSION_GROUPS.includes(x))]
      return h(
        'section',
        { className: 'dsc-card' },
        h('h3', { className: 'dsc-sec-title' }, '会话雷达', h('small', null, `${running.length || sessions.filter((s) => s.running).length} 运行中 · ${sessions.length} 最近活跃`)),
        h('div', { className: 'dsc-hint' }, '只列会话元信息，不显示对话内容。点一行在 DSH 新标签打开；选中后可投递或打断。'),
        h('div', { className: 'dsc-session-radar', style: { marginTop: '8px' } },
          sessions.length
            ? order.filter((group) => grouped[group] && grouped[group].length).map((group) => h('div', { className: 'dsc-session-group', key: group },
                h('div', { className: 'dsc-session-group-title' },
                  h('span', null, group),
                  h('b', null, String(grouped[group].length))),
                grouped[group].map((session) => {
                  const failed = session.failed === true || String(session.state || '').toLowerCase() === 'failed' || Boolean(session.lastError)
                  const status = session.running ? 'running' : failed ? 'failed' : 'idle'
                  const pct = Math.max(0, Math.min(100, Number(session.contextPct) || 0))
                  return h('div', {
                    key: session.sessionId,
                    className: 'dsc-session-row' + (selected && selected.sessionId === session.sessionId ? ' is-on' : ''),
                    onClick: () => select(session),
                    title: '点击打开会话',
                  },
                    h('span', { className: 'dsc-session-dot ' + status }),
                    h('span', { className: 'dsc-session-name' }, session.title || session.sessionId),
                    h('span', { className: 'dsc-session-meta' }, `${Number(session.turns) || 0} 轮`),
                    h('span', { className: 'dsc-session-ctx' + (pct > 60 ? ' warn' : '') }, `${pct}%`),
                    h('span', { className: 'dsc-session-time' }, sessionAgo(session.lastActive)))
                })))
            : h('div', { className: 'dsc-empty' }, '没有正在运行或最近活跃的会话。')),
        recentEnded.length
          ? h('div', { className: 'dsc-ended' },
              h('div', { className: 'dsc-ended-title' }, '最近结束'),
              recentEnded.slice(0, 5).map((event) => h('div', { className: 'dsc-ended-row', key: `${event.sessionId}:${event.turn}` },
                h('span', { className: 'dsc-ended-name', title: event.sessionId }, event.title || event.sessionId),
                h('span', { className: 'dsc-ended-meta' }, `${Number(event.turn) || 0} 轮 · ctx ${Number(event.contextPct) || 0}%${event.late ? ' · 迟到' : ''}`),
                h('span', { className: 'dsc-ended-time' }, sessionAgo(event.at)))))
          : null,
        selected
          ? h('div', { className: 'dsc-session-actions', style: { marginTop: '8px' } },
              h('span', { className: 'dsc-session-status' }, h('span', { className: 'dsc-dot' }), selected.title || selected.sessionId),
              h('input', { className: 'dsc-input', value: message, placeholder: '给这个会话投递消息…', onChange: (e) => setMessage(e.target.value), onKeyDown: (e) => { if (e.key === 'Enter' && !e.shiftKey) inject() } }),
              h('button', { type: 'button', className: 'dsc-btn primary', disabled: busy || !message.trim(), onClick: inject }, '投递'),
              h('button', { type: 'button', className: 'dsc-btn', disabled: busy || !selected.running, onClick: interrupt }, '打断'),
              h('button', { type: 'button', className: 'dsc-btn', onClick: () => openSession(selected) }, '打开'))
          : null,
        notice ? h('div', { className: 'dsc-hint', style: { marginTop: '6px' } }, notice) : null,
      )
    }

    function WorkBuddyConcurrency({ onOpen }) {
      const [data, setData] = React.useState(null)
      React.useEffect(() => {
        let alive = true
        const load = () => Promise.all([
          fetch('/dsh-console/api/workbuddy').then((r) => r.json()).catch(() => ({ ok: false })),
          fetch('/dsh-console/api/xdpool').then((r) => r.json()).catch(() => ({})),
          fetch('/dsh-console/api/workbuddy/gateway').then((r) => r.json()).catch(() => ({})),
          fetch('/plugins/dsh-xdpool/relay').then((r) => r.json()).catch(() => ({})),
        ]).then(([wb, xd, native, relay]) => { if (alive) setData({ wb: wb || {}, xd: xd || {}, native: native || {}, relay: relay || {} }) }).catch(() => { if (alive) setData(null) })
        load()
        const timer = setInterval(load, 15000)
        return () => { alive = false; clearInterval(timer) }
      }, [])
      const xd = (data && data.xd) || {}
      const wb = (data && data.wb) || {}
      if (!xd.installed && !wb.ok) return null
      const accounts = Array.isArray(wb.accounts) && wb.accounts.length ? wb.accounts : ((xd.status || {}).accounts || [])
      const models = Array.isArray(wb.models) && wb.models.length ? wb.models : ((xd.status || {}).models || [])
      const credits = wb.total !== undefined ? Number(wb.total || 0) : accounts.reduce((sum, a) => sum + Number((a.credits || {}).total || 0), 0)
      const listening = Boolean((data && data.native || {}).running) || Boolean((data && data.relay || {}).listening)
      return h('div', { className: 'dsc-provider-row' },
        h('b', null, 'WorkBuddy / XD Pool'),
        h('span', { className: 'dsc-chip' }, '账号 ', h('b', null, String(accounts.length))),
        h('span', { className: 'dsc-chip' }, '积分 ', h('b', null, String(credits))),
        h('span', { className: 'dsc-chip' }, '模型 ', h('b', null, String(models.length))),
        h('span', { className: 'dsc-chip' }, '来源 ', h('b', null, wb.models && wb.models.length ? 'native' : 'XD Pool')),
        h('span', { className: 'dsc-key-state ' + (listening ? 'available' : 'idle') }, (data && data.native || {}).running ? '原生网关监听中' : listening ? 'XD 网关监听中' : '网关未启用'),
        onOpen ? h('button', { type: 'button', className: 'dsc-mini', onClick: onOpen }, '去模型模块配置') : null)
    }


    function OverviewView(props) {
      const { snap, tr, onOpen, act, busy } = props
      const [cleanPreview, setCleanPreview] = React.useState(null)
      const [codeTask, setCodeTask] = React.useState('')
      const [codeResult, setCodeResult] = React.useState(null)
      const [keyProvider, setKeyProvider] = React.useState('')
      const [keyValue, setKeyValue] = React.useState('')
      const [keyBase, setKeyBase] = React.useState('')
      const [keyModel, setKeyModel] = React.useState('')
      const [keyMsg, setKeyMsg] = React.useState('')
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
        h(SessionRadar, null),
        h(
          'section',
          { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, tr('tasks'), h('small', null, tr('tasksHint'))),
          h(
            'div',
            { className: 'dsc-tasks' },
            (snap.tasks || []).length
              ? (snap.tasks || []).map((task) =>
                  h(TaskCard, { key: task.id, task: task, tr: tr, onOpen: () => onOpen(tabOf[task.id] || 'code') }),
                )
              : h('div', { className: 'dsc-empty' }, '暂无任务注册。DLC 或流水线启动后会显示在这里。'),
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
          h('h3', { className: 'dsc-sec-title' }, 'Token 消耗 · 按供应商 / 每日', h('small', null, (snap.tokenBreakdown || {}).updated || '')),
          h('div', { className: 'dsc-chips' },
            h('span', { className: 'dsc-chip' }, '实测总量 ', h('b', null, String((snap.tokenBreakdown || {}).total || 0))),
            h('span', { className: 'dsc-chip' }, '供应商 ', h('b', null, String(((snap.tokenBreakdown || {}).providers || []).length)))),
          h('table', { className: 'dsc-table', style: { marginTop: '10px' } },
            h('thead', null, h('tr', null, h('th', null, '供应商'), h('th', null, 'Token'), h('th', null, '会话'), h('th', null, '模型'))),
            h('tbody', null, ((snap.tokenBreakdown || {}).providers || []).map((p) => h('tr', { key: p.name },
              h('td', null, p.name), h('td', null, String(p.tokens || 0)), h('td', null, String(p.sessions || 0)), h('td', null, shortModel(p.model) || ''))))),
          h('h3', { className: 'dsc-sec-title', style: { marginTop: '14px' } }, '每日消耗'),
          h('table', { className: 'dsc-table' },
            h('thead', null, h('tr', null, h('th', null, '日期'), h('th', null, 'Token'), h('th', null, '主要供应商'))),
            h('tbody', null, ((snap.tokenBreakdown || {}).days || []).slice(0, 14).map((d) => h('tr', { key: d.date },
              h('td', null, d.date), h('td', null, String(d.tokens || 0)), h('td', null, Object.entries(d.providers || {}).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, v]) => k + ' ' + v).join(' / ')))))),
          h('div', { className: 'dsc-hint', style: { marginTop: '6px' } }, (snap.tokenBreakdown || {}).note || '按会话投影统计'),
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
            'table',
            { className: 'dsc-table dsc-matrix' },
            h('thead', null,
              h('tr', null, h('th', { colSpan: 1 + visibleModels.length, style: { textAlign: 'left' } }, '模型供应商 / 可选项')),
            ),
            h(
              'tbody',
              null,
              (() => {
                const rows = []
                const keys = matrix.keys || []
                let i = 0
                while (i < keys.length) {
                  const provider = keys[i].provider || 'AMD'
                  const group = []
                  while (i < keys.length && (keys[i].provider || 'AMD') === provider) {
                    group.push(keys[i])
                    i += 1
                  }
                  const allProviderModels = ((matrix.providers || []).find((p) => p.name === provider) || {}).models || matrix.models || []
                  const shownModels = allProviderModels.filter((m) => (matrix.models || []).includes(m) && selectedModels.includes(m))
                  const buttons = allProviderModels.filter((m) => (matrix.models || []).includes(m)).map((m) => h('button', {
                    key: m,
                    type: 'button',
                    className: 'dsc-chip' + (selectedModels.includes(m) ? ' on' : ''),
                    style: { marginLeft: '6px' },
                    onClick: () => {
                      const next = selectedModels.includes(m) ? selectedModels.filter((x) => x !== m) : [...selectedModels, m]
                      if (!next.length) return
                      setSelectedModels(next)
                      act({ type: 'setting', key: 'displayModels', value: next }, '显示模型')
                    },
                  }, shortModel(m) + ' · ' + (selectedModels.includes(m) ? '关闭' : '显示')))
                  rows.push(h('tr', { key: 'vendor-' + provider, style: { background: 'var(--dsw-alias-bg-2, rgba(127,127,127,.08))' } },
                    h('td', { colSpan: 1 + shownModels.length, style: { fontWeight: 700 } },
                      h('span', null, provider), h('span', null, '  '), ...buttons)))
                  rows.push(h('tr', { key: 'vendor-cols-' + provider, style: { background: 'var(--dsw-alias-bg-2, rgba(127,127,127,.05))' } },
                    h('th', null, '密钥'),
                    ...shownModels.map((m) => h('th', { key: m }, shortModel(m)))))
                  for (const k of group) {
                    rows.push(h('tr', { key: k.id },
                      h('td', { title: (k.tasks && k.tasks.length ? '计划：' + k.tasks.join('/') : '计划：空闲') + (k.resetAt ? ' · 重置 ' + new Date(k.resetAt).toLocaleString() : '') },
                        h('b', null, k.label),
                        h('span', { className: 'dsc-key-state ' + (k.state || 'available') },
                          k.state === 'used' ? '用完' + (k.resetText ? ' · ' + k.resetText : '')
                            : k.state === 'limited' ? '限流中' + (k.retryAfter ? ' · ' + k.retryAfter + 's' : '')
                              : '可用' + (k.resetText ? ' · ' + k.resetText : '')),
                        h('span', { className: 'dsc-hint' }, '  ' + provider)),
                      ...shownModels.map((m) => {
                        const cell = (matrix.cells || []).find((c) => c.key === k.id && c.model === m)
                        return h('td', { key: m, className: cell ? 'dsc-cell-busy' : '' }, cell ? `${cell.task} ${cell.busy}` : '')
                      }),
                    ))
                  }
                }
                return rows
              })(),
            ),
          ),
          h(WorkBuddyConcurrency, { onOpen }),
          h('div', { className: 'dsc-actions', style: { marginTop: '10px', alignItems: 'center' } },
            h('input', {
              type: 'text', value: keyProvider, placeholder: '密钥供应商，例如 AMD / WorkBuddy / 华为果办',
              onChange: (e) => setKeyProvider(e.target.value), style: { minWidth: '220px' },
            }),
            h('input', {
              type: 'password', value: keyValue, placeholder: '粘贴 API 密钥',
              onChange: (e) => setKeyValue(e.target.value), style: { minWidth: '260px' },
            }),
            h('input', {
              type: 'text', value: keyBase, placeholder: 'API 地址（OpenCode 可留空）',
              onChange: (e) => setKeyBase(e.target.value), style: { minWidth: '260px' },
            }),
            h('input', {
              type: 'text', value: keyModel, placeholder: '模型 ID（OpenCode 可留空）',
              onChange: (e) => setKeyModel(e.target.value), style: { minWidth: '220px' },
            }),
            h('button', {
              type: 'button', className: 'dsc-btn primary', disabled: Boolean(busy),
              onClick: async () => {
                setKeyMsg('')
                const result = await act({ type: 'add-key', provider: keyProvider, key: keyValue, baseUrl: keyBase, model: keyModel }, '接入密钥')
                if (result && result.ok) {
                  setKeyMsg(result.message || '已接入，重启 DSH 后可在模型选择里看到')
                  setKeyValue('')
                  setKeyProvider('')
                  setKeyBase('')
                  setKeyModel('')
                } else {
                  setKeyMsg((result && result.message) || '接入失败')
                }
              },
            }, '接入密钥')),
          keyMsg ? h('div', { className: 'dsc-hint', style: { marginTop: '6px' } }, keyMsg) : null,
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
      const [jobTitle, setJobTitle] = React.useState('opencode-task')
      const [jobPrompt, setJobPrompt] = React.useState('')
      const [jobMsg, setJobMsg] = React.useState({ text: '', error: false })
      const [jobModel, setJobModel] = React.useState('')
      const [openFree, setOpenFree] = React.useState({ models: [], error: '' })
      const [commander, setCommander] = React.useState({ goals: [], reports: [] })
      const [goalText, setGoalText] = React.useState('')
      const [goalMsg, setGoalMsg] = React.useState('')
      const [reportText, setReportText] = React.useState('')
      const [evalRows, setEvalRows] = React.useState([])
      const [evalModel, setEvalModel] = React.useState('')
      const [evalKey, setEvalKey] = React.useState('bridge')
      const [evalKeyName, setEvalKeyName] = React.useState('bridge-8799')
      const [evalProvider, setEvalProvider] = React.useState('opencode')
      const [evalBase, setEvalBase] = React.useState('http://127.0.0.1:8799/v1')
      const [evalMsg, setEvalMsg] = React.useState('')
      const [evalq, setEvalq] = React.useState('')
      const [probeMsg, setProbeMsg] = React.useState('')
      const [progress, setProgress] = React.useState({ sessions: { running: [] } })
      const [recentLogs, setRecentLogs] = React.useState([])
      const [health, setHealth] = React.useState({})
      const [workbuddy, setWorkbuddy] = React.useState({})
      const [gateway, setGateway] = React.useState(null)
      const [gatewayPort, setGatewayPort] = React.useState('8327')
      const [gatewayMsg, setGatewayMsg] = React.useState('')
      const [freeGateway, setFreeGateway] = React.useState(null)
      const [freeGatewayMsg, setFreeGatewayMsg] = React.useState('')
      const [nativeGateway, setNativeGateway] = React.useState(null)
      const [nativeGatewayMsg, setNativeGatewayMsg] = React.useState('')
      const loadNativeGateway = React.useCallback(() => fetch('/dsh-console/api/workbuddy/gateway').then((r) => r.json()).then((data) => setNativeGateway(data || null)).catch(() => setNativeGateway(null)), [])
      const refreshWorkbuddy = React.useCallback(() => Promise.all([
        fetch('/dsh-console/api/workbuddy').then((r) => r.json()).catch(() => ({ ok: false })),
        fetch('/dsh-console/api/xdpool').then((r) => r.json()).catch(() => ({})),
      ]).then(([wb, xd]) => {
        const nativeModels = wb && Array.isArray(wb.models) && wb.models.length ? wb.models : (((xd || {}).status || {}).models || [])
        setWorkbuddy({ ...(wb || {}), aggregate: (xd || {}).aggregate || null, xdModels: nativeModels, xdAccounts: ((xd || {}).status || {}).accounts || [] })
      }).catch(() => setWorkbuddy({ ok: false })), [])
      React.useEffect(() => {
        const loadEval = () => fetch('/dsh-console/api/model-eval')
          .then((r) => r.json())
          .then((data) => setEvalRows((data && data.models) || []))
          .catch(() => setEvalRows([]))
        loadEval()
        const evalTimer = setInterval(loadEval, 10000)
        const loadProgress = () => fetch('/dsh-console/api/progress').then((r) => r.json()).then((data) => setProgress(data || { sessions: { running: [] } })).catch(() => {})
        loadProgress()
        const loadLogs = () => fetch('/dsh-console/api/logs?lines=30').then((r) => r.json()).then((data) => setRecentLogs((data && data.lines) || [])).catch(() => {})
        loadLogs()
        const loadHealth = () => fetch('/dsh-console/api/health').then((r) => r.json()).then((data) => setHealth(data || {})).catch(() => setHealth({}))
        loadHealth()
        const loadWorkbuddy = refreshWorkbuddy
        loadWorkbuddy()
        const loadGateway = () => fetch('/plugins/dsh-xdpool/relay', { credentials: 'same-origin' }).then((r) => r.json()).then((data) => { setGateway(data || null); if (data && data.port && !gatewayPort) setGatewayPort(String(data.port)) }).catch(() => setGateway(null))
        loadGateway()
        const loadFreeGateway = () => fetch('/dsh-console/api/free-gateway').then((r) => r.json()).then((data) => setFreeGateway(data || null)).catch(() => setFreeGateway(null))
        loadFreeGateway()
        loadNativeGateway()
        const timer = setInterval(loadProgress, 5000)
        const logTimer = setInterval(loadLogs, 10000)
        const healthTimer = setInterval(loadHealth, 15000)
        const wbTimer = setInterval(loadWorkbuddy, 30000)
        const gwTimer = setInterval(loadGateway, 15000)
        const fgTimer = setInterval(loadFreeGateway, 15000)
        const ngTimer = setInterval(loadNativeGateway, 15000)
        return () => { clearInterval(evalTimer); clearInterval(timer); clearInterval(logTimer); clearInterval(healthTimer); clearInterval(wbTimer); clearInterval(gwTimer); clearInterval(fgTimer); clearInterval(ngTimer) }
      }, [])
      const loadCommander = React.useCallback(() => {
        fetch('/dsh-console/api/commander')
          .then((r) => r.json())
          .then((data) => setCommander({ goals: (data && data.goals) || [], reports: (data && data.reports) || [] }))
          .catch(() => setCommander({ goals: [], reports: [] }))
      }, [])
      React.useEffect(() => {
        loadCommander()
        const timer = setInterval(loadCommander, 15000)
        return () => clearInterval(timer)
      }, [loadCommander])
      React.useEffect(() => {
        let alive = true
        fetch('/dsh-console/api/opencode/free-models')
          .then((r) => r.json())
          .then((data) => {
            if (!alive) return
            const models = (data && data.models) || []
            setOpenFree({ models, error: data && data.error ? String(data.error) : '' })
            const pick = models.find((m) => stateOf(m.name) !== 'disabled') || models[0]
            if (models[0]) setJobModel((old) => old || pick.name)
            if (pick) setEvalModel((old) => old || pick.name)
          })
          .catch((e) => { if (alive) setOpenFree({ models: [], error: String((e && e.message) || e) }) })
        return () => { alive = false }
      }, [])
      const openNames = (openFree.models || []).map((m) => m.name)
      const evalFilter = evalq.trim().toLowerCase()
      const shownEvalRows = evalRows.filter((row) => !evalFilter || [row.model, row.provider, row.keyName].some((v) => String(v || '').toLowerCase().includes(evalFilter)))
      const allModelNames = [...ALL_MODELS, ...openNames]
      const totalActive = allModelNames.filter((m) => stateOf(m) === 'active')
      const totalBackup = allModelNames.filter((m) => stateOf(m) === 'backup')
      const selectableOpenModels = openFree.models.filter((m) => stateOf(m.name) !== 'disabled')
      const openEnabled = (name) => stateOf(name) !== 'disabled'
      const setOpenAll = (state) => {
        const next = { ...savedStates }
        for (const name of openNames) next[name] = state
        toggleSetting('modelStates', next)
      }
      React.useEffect(() => {
        setThrPct(Math.round((((snap.settings || {}).idleThreshold) || 0.3) * 100))
        setExpandCount(Number((snap.settings || {}).expandTasks) || 3)
      }, [snap.settings && snap.settings.idleThreshold, snap.settings && snap.settings.expandTasks])
      const run = (id, op) => act({ type: 'hub-task', id, op }, `${id} ${op}`)
      const dispatchJob = async () => {
        setJobMsg({ text: '', error: false })
        try {
          const response = await fetch('/dsh-console/api/jobs', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ type: 'opencode', title: jobTitle, prompt: jobPrompt, model: jobModel ? 'opencode/' + jobModel : undefined }),
          })
          if (!response.ok) throw new Error('HTTP ' + response.status)
          const result = await response.json()
          const id = (result && (result.id || result.jobId || (result.job && result.job.id))) || 'job-...'
          setJobPrompt('')
          setJobMsg({ text: '已派发 ' + String(id), error: false })
        } catch (failure) {
          setJobMsg({ text: '派发失败：' + String((failure && failure.message) || failure), error: true })
        }
      }
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
      const aggregateProviders = ((workbuddy.aggregate || {}).providers) || []
      const xdModels = Array.isArray(workbuddy.xdModels) ? workbuddy.xdModels : []
      const usefulAggregate = aggregateProviders.filter((x) => x.configured || x.enabled || x.category === 'local' || x.category === 'free').length
      return h(
        React.Fragment,
        null,
        !snap.pipeline || !snap.pipeline.hasDlc
          ? h('div', { className: 'dsc-banner' }, '无插件：未安装模组插件（task-mod）。工作流页仍可打开，但不会显示代码/地图/贴图/平衡任务和操作；安装后自动出现。')
          : null,
        h(
          'section',
          { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, '运行概览'),
          h('div', { className: 'dsc-chips' },
            h('span', { className: 'dsc-chip' }, '会话 ', h('b', null, String(((progress.sessions || {}).running || []).length))),
            h('span', { className: 'dsc-chip' }, 'Job running ', h('b', null, String((((progress.jobs || {}).counts || {}).running) || 0))),
            h('span', { className: 'dsc-chip' }, '队列 ', h('b', null, String(((progress.queue || {}).queued) || 0))),
            h('span', { className: 'dsc-chip' }, '总指挥 ', h('b', null, String((commander.goals || []).length))),
            h('span', { className: 'dsc-chip' }, '冒烟 ', h('b', null, ((health.guard || {}).smoke || {}).ok ? 'PASS' : '—')),
            h('span', { className: 'dsc-chip' }, '免费池 ', h('b', null, ((health.freeCooldown || {}).until || 0) > Date.now() / 1000 ? '冷却' : '可用')))),
        h(
          'section',
          { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, 'WorkBuddy / XD Pool', h('small', null, workbuddy.installed ? '宿主已安装' : '未安装')),
          workbuddy.ok || workbuddy.installed
            ? h(React.Fragment, null,
                (() => {
                  const wbAccounts = Array.isArray(workbuddy.accounts) ? workbuddy.accounts : (((workbuddy.status || {}).accounts) || [])
                  const wbTotal = workbuddy.total !== undefined ? workbuddy.total : wbAccounts.reduce((sum, a) => sum + Number(((a || {}).credits || {}).total || 0), 0)
                  return h(React.Fragment, null,
                    h('div', { className: 'dsc-chips' },
                      h('span', { className: 'dsc-chip' }, '账号 ', h('b', null, String(wbAccounts.length))),
                      h('span', { className: 'dsc-chip' }, '积分 ', h('b', null, String(wbTotal))),
                      h('span', { className: 'dsc-chip' }, '来源 ', h('b', null, workbuddy.source || 'native')),
                      h('span', { className: 'dsc-chip' }, '聚合渠道 ', h('b', null, String(usefulAggregate) + '/' + String(aggregateProviders.length)))),
                    wbAccounts.length
                      ? h('table', { className: 'dsc-table', style: { marginTop: '8px' } },
                          h('thead', null, h('tr', null, h('th', null, '账号'), h('th', null, '积分'), h('th', null, '连签'), h('th', null, '状态'))),
                          h('tbody', null, wbAccounts.slice(0, 6).map((a) => h('tr', { key: a.id || a.label },
                            h('td', null, a.nickname || a.label || a.id),
                            h('td', null, String((a.credits || {}).total || 0)),
                            h('td', null, a.checkin && a.checkin.streakDays ? String(a.checkin.streakDays) + ' 天' : '—'),
                            h('td', null, a.ok === false ? ('失败: ' + String(a.error || '').slice(0, 30)) : a.cooling ? '冷却' : a.disabled ? '停用' : '可用')))))
                      : h('div', { className: 'dsc-hint' }, workbuddy.error || '没有发现 WorkBuddy 账号。'),
                    h('div', { className: 'dsc-hint', style: { marginTop: '6px' } },
                      'WorkBuddy 通过 XD Pool 的 provider 接入，不是单独的 OpenAI API key；需要复用积分时用下方网关。'))
                })())
            : h('div', { className: 'dsc-hint' }, workbuddy.error || '未检测到 WorkBuddy；需要先在 WorkBuddy 桌面 App 登录。')),
        h(
          'section',
          { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, 'XD Pool 网关 / WorkBuddy Bridge', h('small', null, gateway ? (gateway.listening ? '监听中' : gateway.enabled ? '已启用未监听' : '未启用') : '读取中')),
          gateway
            ? h(React.Fragment, null,
                h('div', { className: 'dsc-chips' },
                  h('span', { className: 'dsc-chip' }, '启用 ', h('b', null, gateway.enabled ? '是' : '否')),
                  h('span', { className: 'dsc-chip' }, '监听 ', h('b', null, gateway.listening ? '是' : '否')),
                  h('span', { className: 'dsc-chip' }, '端口 ', h('b', null, String(gateway.port || 8326))),
                  h('span', { className: 'dsc-chip' }, 'WorkBuddy 候选 ', h('b', null, String((gateway.candidates || []).filter((x) => String(x.source || '').includes('workbuddy')).length)))),
                gateway.endpoint
                  ? h('div', { className: 'dsc-hint', style: { marginTop: '8px', wordBreak: 'break-all' } }, 'Endpoint: ' + gateway.endpoint)
                  : null,
                gateway.error
                  ? h('div', { className: 'dsc-hint', style: { marginTop: '4px', color: 'var(--dsw-alias-state-error-primary)' } }, '网关错误：' + gateway.error)
                  : null,
                gateway.key
                  ? h('div', { className: 'dsc-hint', style: { marginTop: '4px', wordBreak: 'break-all' } }, 'Relay key: ' + String(gateway.key).slice(0, 6) + '••••••' + String(gateway.key).slice(-4))
                  : null,
                h('div', { className: 'dsc-actions', style: { marginTop: '8px' } },
                  h('button', {
                    type: 'button', className: 'dsc-btn' + (gateway.enabled ? '' : ' primary'),
                    onClick: async () => {
                      setGatewayMsg(gateway.enabled ? '停用中…' : '启用中…')
                      try {
                        const r = await fetch('/plugins/dsh-xdpool/relay', {
                          method: 'POST', credentials: 'same-origin',
                          headers: { 'content-type': 'application/json' },
                          body: JSON.stringify(gateway.enabled ? { enabled: false } : { enabled: true, host: '127.0.0.1', port: Number(gatewayPort) || 8326 }),
                        })
                        const data = await r.json()
                        if (!r.ok) throw new Error(data.error || 'HTTP ' + r.status)
                        setGateway(data)
                        setGatewayMsg(!gateway.enabled ? (data.listening ? '网关已启用' : '已启用但未监听') : '网关已停用')
                      } catch (e) { setGatewayMsg('操作失败：' + String((e && e.message) || e)) }
                    },
                  }, gateway.enabled ? '停用网关' : '启用网关'),
                  h('input', { className: 'dsc-input', value: gatewayPort, onChange: (e) => setGatewayPort(e.target.value), placeholder: '端口', style: { width: '90px' } }),
                  gateway.endpoint
                    ? h('button', { type: 'button', className: 'dsc-btn', onClick: () => { try { navigator.clipboard.writeText(gateway.endpoint) } catch { /* ignore */ } } }, '复制 Endpoint')
                    : null,
                  gateway.key
                    ? h('button', { type: 'button', className: 'dsc-btn', onClick: () => { try { navigator.clipboard.writeText(gateway.key) } catch { /* ignore */ } } }, '复制 Relay Key')
                    : null,
                  gatewayMsg ? h('span', { className: 'dsc-hint' }, gatewayMsg) : null),
                h('div', { className: 'dsc-hint', style: { marginTop: '6px' } },
                  '这是 XD Pool 的本地 OpenAI 兼容网关；启用后会生成 relay key，WorkBuddy 走同一通道。网关默认只监听 127.0.0.1。'))
            : h('div', { className: 'dsc-hint' }, '未读取到 XD Pool 网关状态。')),
        h(
          'section',
          { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, '统一免费入口（原型）', h('small', null, freeGateway && freeGateway.running ? '运行中' : '未运行')),
          h('div', { className: 'dsc-hint' },
            '一把 key 暴露 OpenCode 和 XD Pool 两个本地上游；XD Pool 的 buddy: 模型需要先在上一张卡启用网关。'),
          h('div', { className: 'dsc-chips', style: { marginTop: '8px' } },
            h('span', { className: 'dsc-chip' }, 'endpoint ', h('b', null, 'http://127.0.0.1:8810/v1')),
            h('span', { className: 'dsc-chip' }, 'key ', h('b', null, 'free-pool')),
            h('span', { className: 'dsc-chip' }, '上游 ', h('b', null, 'OpenCode + XD Pool'))),
          h('div', { className: 'dsc-actions', style: { marginTop: '8px' } },
            h('button', {
              type: 'button', className: 'dsc-btn' + (freeGateway && freeGateway.running ? '' : ' primary'),
              onClick: async () => {
                setFreeGatewayMsg(freeGateway && freeGateway.running ? '停止中…' : '启动中…')
                try {
                  const r = await fetch('/dsh-console/api/free-gateway', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: freeGateway && freeGateway.running ? 'stop' : 'start' }) })
                  const data = await r.json()
                  if (!r.ok) throw new Error(data.message || 'HTTP ' + r.status)
                  setFreeGateway(data)
                  setFreeGatewayMsg(data.running ? '已启动' : '已停止')
                } catch (e) { setFreeGatewayMsg('操作失败：' + String((e && e.message) || e)) }
              },
            }, freeGateway && freeGateway.running ? '停止入口' : '启动入口'),
            h('button', { type: 'button', className: 'dsc-btn', onClick: () => { try { navigator.clipboard.writeText('http://127.0.0.1:8810/v1') } catch { /* ignore */ } } }, '复制 Endpoint'),
            h('button', { type: 'button', className: 'dsc-btn', onClick: () => { try { navigator.clipboard.writeText('free-pool') } catch { /* ignore */ } } }, '复制 Key'),
            freeGatewayMsg ? h('span', { className: 'dsc-hint' }, freeGatewayMsg) : null)),
        h(
          'details',
          { className: 'dsc-card' },
          h('summary', { className: 'dsc-sec-title', style: { cursor: 'pointer' } }, '最近日志', h('small', null, `${recentLogs.length} 行`)),
          h('pre', { className: 'dsc-textarea', style: { minHeight: '120px', maxHeight: '240px', overflow: 'auto' } }, recentLogs.join('\n'))),
        h(
          'section',
          { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, '模型模块', h('small', null, '调用 / 显示分离')),
          h('div', { className: 'dsc-hint' }, '三态循环：不启用 → 备选 → 启用 → 不启用；调用 = 启用 + 备选，显示只决定并发矩阵列。'),
          h('div', { className: 'dsc-chips', style: { marginTop: '8px' } },
            h('span', { className: 'dsc-chip' }, '启用 ', h('b', null, String(totalActive.length))),
            h('span', { className: 'dsc-chip' }, '备选 ', h('b', null, String(totalBackup.length))),
            h('span', { className: 'dsc-chip' }, '不启用 ', h('b', null, String(allModelNames.length - totalActive.length - totalBackup.length)))),
          h('div', { className: 'dsc-hint', style: { marginTop: '8px' } }, '调用：'),
          ...MODEL_GROUPS.map((g) => h('div', { key: 'call-' + g.name, className: 'dsc-chips', style: { marginTop: '6px' } },
            h('span', { className: 'dsc-hint', style: { minWidth: '96px' } }, g.name + '：'),
            ...g.models.map((m) => h('button', {
              key: 'call-' + m, type: 'button',
              className: 'dsc-chip' + (stateOf(m) === 'active' ? ' on' : ''),
              onClick: () => cycleModel(m),
            }, shortModel(m) + ' · ' + (stateOf(m) === 'active' ? '启用' : stateOf(m) === 'backup' ? '备选' : '不启用'))))),
          openNames.length
            ? h('div', { key: 'call-opencode', className: 'dsc-chips', style: { marginTop: '6px' } },
                h('span', { className: 'dsc-hint', style: { minWidth: '96px' } }, 'OpenCode 桥接：'),
                ...openNames.map((m) => h('button', {
                  key: 'call-' + m, type: 'button',
                  className: 'dsc-chip' + (stateOf(m) === 'active' ? ' on' : ''),
                  onClick: () => cycleModel(m),
                }, shortModel(m) + ' · ' + (stateOf(m) === 'active' ? '启用' : stateOf(m) === 'backup' ? '备选' : '不启用'))),
                h('button', { type: 'button', className: 'dsc-mini', onClick: () => setOpenAll('active') }, '全部启用'),
                h('button', { type: 'button', className: 'dsc-mini', onClick: () => setOpenAll('backup') }, '全部备选'),
                h('button', { type: 'button', className: 'dsc-mini', onClick: () => setOpenAll('disabled') }, '全部关闭'))
            : null,
          h('div', { key: 'call-workbuddy', className: 'dsc-chips', style: { marginTop: '6px' } },
            h('span', { className: 'dsc-hint', style: { minWidth: '96px' } }, 'WorkBuddy 桥接：'),
            h('span', { className: 'dsc-chip' }, '模型 ', h('b', null, String(xdModels.length))),
            ...xdModels.slice(0, 8).map((m) => h('span', { key: 'wb-' + (m.id || m.name || m), className: 'dsc-chip' }, String((m && (m.name || m.id)) || m).slice(0, 18))),
            xdModels.length > 8 ? h('span', { className: 'dsc-hint' }, `+${xdModels.length - 8}`) : null),
          h('div', { className: 'dsc-actions', style: { marginTop: '6px' } },
            h('span', { className: 'dsc-key-state ' + (nativeGateway && nativeGateway.running ? 'available' : 'idle') }, nativeGateway && nativeGateway.running ? '原生网关监听中' : '原生网关未启用'),
            h('span', { className: 'dsc-hint' }, nativeGateway && nativeGateway.endpoint ? nativeGateway.endpoint : 'http://127.0.0.1:8330/v1'),
            h('button', {
              type: 'button', className: 'dsc-btn' + (nativeGateway && nativeGateway.running ? '' : ' primary'),
              onClick: async () => {
                setNativeGatewayMsg(nativeGateway && nativeGateway.running ? '停止中…' : '启动中…')
                try {
                  const r = await fetch('/dsh-console/api/workbuddy/gateway', {
                    method: 'POST', headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ action: nativeGateway && nativeGateway.running ? 'stop' : 'start' }),
                  })
                  const next = await r.json()
                  if (!r.ok || next.ok === false) throw new Error(next.message || 'HTTP ' + r.status)
                  setNativeGateway(next)
                  setNativeGatewayMsg(next.running ? '原生网关已启动' : '原生网关已停止')
                  loadNativeGateway()
                } catch (e) { setNativeGatewayMsg('操作失败：' + String((e && e.message) || e)) }
              },
            }, nativeGateway && nativeGateway.running ? '停止原生网关' : '启动原生网关'),
            h('button', { type: 'button', className: 'dsc-mini', onClick: () => refreshWorkbuddy() }, '刷新模型'),
            h('button', { type: 'button', className: 'dsc-mini', onClick: () => loadNativeGateway() }, '刷新网关'),
            nativeGateway && nativeGateway.endpoint ? h('button', { type: 'button', className: 'dsc-mini', onClick: () => { try { navigator.clipboard.writeText(nativeGateway.endpoint) } catch { /* ignore */ } } }, '复制 Endpoint') : null,
            nativeGateway && nativeGateway.key ? h('button', { type: 'button', className: 'dsc-mini', onClick: () => { try { navigator.clipboard.writeText(nativeGateway.key) } catch { /* ignore */ } } }, '复制 Key') : null,
            nativeGatewayMsg ? h('span', { className: 'dsc-hint' }, nativeGatewayMsg) : null),
          h('div', { className: 'dsc-hint', style: { marginTop: '4px' } }, '原生网关 8330 直接转发 WorkBuddy；XD Pool 聚合网关仍在上一张卡，76 家渠道走那边。'),
          h('div', { className: 'dsc-hint', style: { marginTop: '12px', fontWeight: 600 } }, `模型评测（${evalRows.length}）`),
          h('div', { className: 'dsc-actions', style: { marginTop: '6px' } },
            h('input', { className: 'dsc-input', value: evalq, placeholder: '按模型 / 供应商 / 密钥筛选', onChange: (e) => setEvalq(e.target.value), style: { flex: '1', minWidth: '220px' } }),
            evalq ? h('button', { type: 'button', className: 'dsc-mini', onClick: () => setEvalq('') }, '清空') : null),
          openNames.length
            ? h('div', { className: 'dsc-actions', style: { marginTop: '6px' } },
                h('select', { className: 'dsc-input', value: evalModel, onChange: (e) => setEvalModel(e.target.value), style: { maxWidth: '240px' } },
                  Array.from(new Set(allModelNames)).map((name) => h('option', { key: name, value: name }, shortModel(name)))),
                h('input', { className: 'dsc-input', value: evalProvider, onChange: (e) => setEvalProvider(e.target.value), placeholder: 'provider', style: { width: '110px' } }),
                h('input', { className: 'dsc-input', value: evalKeyName, onChange: (e) => setEvalKeyName(e.target.value), placeholder: 'key 名称', style: { width: '130px' } }),
                h('input', { className: 'dsc-input', value: evalBase, onChange: (e) => setEvalBase(e.target.value), placeholder: 'base URL', style: { minWidth: '210px', flex: '1' } }),
                h('input', { className: 'dsc-input', value: evalKey, onChange: (e) => setEvalKey(e.target.value), placeholder: 'key 或 bridge', style: { width: '130px' } }),
                h('button', { type: 'button', className: 'dsc-mini', onClick: async () => {
                  setEvalMsg('评测已启动…')
                  try {
                    const r = await fetch('/dsh-console/api/model-eval/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: evalModel, baseUrl: evalBase, key: evalKey, provider: evalProvider, keyName: evalKeyName }) })
                    if (!r.ok) throw new Error('HTTP ' + r.status)
                    setEvalMsg('后台评测中，约 2-3 分钟')
                  } catch (e) { setEvalMsg('启动失败：' + String((e && e.message) || e)) }
                } }, '运行评测'),
                h('button', { type: 'button', className: 'dsc-mini', onClick: async () => {
                  setProbeMsg('测延时中…')
                  try {
                    const r = await fetch('/dsh-console/api/model-eval/probe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: evalModel, baseUrl: evalBase, key: evalKey }) })
                    const data = await r.json()
                    if (!data.ok) throw new Error(data.message || data.error || 'HTTP ' + r.status)
                    setProbeMsg(`延时 ${data.latency_ms} ms · tokens ${((data.usage || {}).total_tokens) || 0}`)
                  } catch (e) { setProbeMsg('测延时失败：' + String((e && e.message) || e)) }
                } }, '测延时/Token'),
                probeMsg ? h('span', { className: 'dsc-hint' }, probeMsg) : null,
                evalMsg ? h('span', { className: 'dsc-hint' }, evalMsg) : null)
            : null,
          evalRows.length
            ? h('table', { className: 'dsc-table', style: { marginTop: '8px' } },
                h('thead', null, h('tr', null, h('th', null, '模型'), h('th', null, '供应商'), h('th', null, '密钥'), h('th', null, '延时'), h('th', null, 'tokens'), h('th', null, '鹈鹕'), h('th', null, '逻辑'), h('th', null, 'JSON'), h('th', null, '长上下文'), h('th', null, '代码'), h('th', null, '工具诚实'), h('th', null, '跟踪'), h('th', null, '空间'), h('th', null, '指令'), h('th', null, '总分'))),
                h('tbody', null, shownEvalRows.slice(-10).map((row) => h('tr', { key: (row.model || '') + (row.provider || '') + (row.keyName || '') + (row.at || '') },
                  h('td', null, shortModel(row.model)),
                  h('td', null, row.provider || '—'),
                  h('td', null, row.keyName || '—'),
                  h('td', null, row.latency_ms ? `${row.latency_ms} ms` : '—'),
                  h('td', null, row.tokens ? String(row.tokens) : '—'),
                  h('td', null, String((row.dimensions || {}).pelican || 0)),
                  h('td', null, String((row.dimensions || {}).logic || 0)),
                  h('td', null, String((row.dimensions || {}).json || 0)),
                  h('td', null, String((row.dimensions || {}).needle || 0)),
                  h('td', null, String((row.dimensions || {}).code || 0)),
                  h('td', null, String((row.dimensions || {}).tool_honesty || 0)),
                  h('td', null, String((row.dimensions || {}).tracking || 0)),
                  h('td', null, String((row.dimensions || {}).spatial || 0)),
                  h('td', null, String((row.dimensions || {}).instruction || 0)),
                  h('td', null, String(row.score || 0))))))
            : h('div', { className: 'dsc-hint' }, '还没有扩展评测；新模型接入或手动运行 model_eval_extended.py 后出现。'),
        ),
        h(
          'section',
          { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, 'DSH 会话进度', h('small', null, `${((progress.sessions || {}).running || []).length} 个运行中`)),
          h('div', { className: 'dsc-hint' }, `调度队列：${((progress.queue || {}).queued) || 0} 个等待${((progress.queue || {}).tasks || []).length ? ' · ' + (progress.queue.tasks || []).map((t) => t.title).join(' / ') : ''}`),
          ((progress.sessions || {}).running || []).length
            ? h('table', { className: 'dsc-table', style: { marginTop: '8px' } },
                h('thead', null, h('tr', null, h('th', null, '标题'), h('th', null, '模型'), h('th', null, '步骤'), h('th', null, '上下文'), h('th', null, '待处理'))),
                h('tbody', null, (progress.sessions.running || []).slice(0, 8).map((s) => h('tr', { key: s.sessionId },
                  h('td', null, s.title || s.sessionId),
                  h('td', null, shortModel(s.model)),
                  h('td', null, s.currentStep || `${s.turns || 0} 轮`),
                  h('td', null, `${s.contextPct || 0}%`),
                  h('td', null, String(s.pending || 0))))))
            : h('div', { className: 'dsc-hint', style: { marginTop: '8px' } }, '当前没有运行中的 DSH 会话。')),
        h(
          'section',
          { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, '总指挥', h('small', null, `${commander.goals.length} 个目标`)),
          h('div', { className: 'dsc-hint' }, '一个长会话拆任务；worker 只拿任务卡；完成后写报告。'),
          h('div', { className: 'dsc-actions', style: { marginTop: '8px' } },
            h('button', { type: 'button', className: 'dsc-mini', onClick: loadCommander }, '刷新总指挥')),
          h('textarea', {
            className: 'dsc-textarea',
            style: { minHeight: '56px', marginTop: '8px' },
            placeholder: '给总指挥一个目标，例如：只读检查 ai-hub API 清单，不改文件',
            value: goalText,
            onChange: (e) => setGoalText(e.target.value),
            spellCheck: false,
          }),
          h('div', { className: 'dsc-actions', style: { marginTop: '8px' } },
            h('button', { type: 'button', className: 'dsc-btn primary', disabled: !goalText.trim(), onClick: async () => {
              setGoalMsg('创建中…')
              try {
                const r = await fetch('/dsh-console/api/commander/goal', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ goal: goalText }) })
                const data = await r.json()
                if (!r.ok) throw new Error(data.message || ('HTTP ' + r.status))
                setGoalText('')
                setGoalMsg('已创建 ' + data.id)
                loadCommander()
              } catch (e) { setGoalMsg('失败：' + String((e && e.message) || e)) }
            } }, '创建目标'),
            goalMsg ? h('span', { className: 'dsc-hint' }, goalMsg) : null),
          commander.goals.length
            ? h('div', { className: 'dsc-hint', style: { marginTop: '8px' } },
                commander.goals.slice(-4).reverse().map((g) => h('div', { key: g.id, style: { marginTop: '4px' } },
                  h('b', null, g.id + ' · ' + (g.state || 'unknown')),
                  g.tasks && g.tasks.length ? h('span', null, ' · ' + g.tasks.join(' / ')) : null,
                  g.report ? h('button', { type: 'button', className: 'dsc-mini', style: { marginLeft: '6px' }, onClick: async () => {
                    const name = String(g.report).split(/[\\/]/).pop()
                    try {
                      const r = await fetch('/dsh-console/api/commander/report?name=' + encodeURIComponent(name))
                      const data = await r.json()
                      setReportText(data.text || data.message || '')
                    } catch (e) { setReportText(String((e && e.message) || e)) }
                  } }, '查看报告') : null)))
            : h('div', { className: 'dsc-hint', style: { marginTop: '8px' } }, '还没有总指挥目标。'),
          reportText ? h('pre', { className: 'dsc-textarea', style: { minHeight: '100px', maxHeight: '240px', overflow: 'auto', marginTop: '8px' } }, reportText) : null,
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
        h(
          'section',
          { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, '异步任务', h('small', null, `${(snap.jobs || []).length} 条`)),
          h(
            'div',
            { style: { marginTop: '4px' } },
            h('input', {
              className: 'dsc-input',
              type: 'text',
              value: jobTitle,
              placeholder: '标题',
              onChange: (e) => setJobTitle(e.target.value),
              style: { maxWidth: '260px' },
            }),
            selectableOpenModels.length
              ? h('select', {
                  className: 'dsc-input',
                  value: jobModel,
                  onChange: (e) => setJobModel(e.target.value),
                  style: { maxWidth: '260px', marginLeft: '8px' },
                }, selectableOpenModels.map((m) => h('option', { key: m.id, value: m.name }, m.name)))
              : null,
            h('textarea', {
              className: 'dsc-textarea',
              style: { minHeight: '64px', marginTop: '8px' },
              placeholder: '让 OpenCode 改哪个文件 / 做什么',
              value: jobPrompt,
              onChange: (e) => setJobPrompt(e.target.value),
              spellCheck: false,
            }),
            h(
              'div',
              { className: 'dsc-actions', style: { marginTop: '8px' } },
              h('button', {
                type: 'button',
                className: 'dsc-btn primary',
                disabled: !jobPrompt.trim(),
                onClick: dispatchJob,
              }, '让 OpenCode 跑'),
            ),
            jobMsg.text
              ? h('div', {
                  className: 'dsc-hint',
                  style: { marginTop: '6px', color: jobMsg.error ? 'var(--dsw-alias-state-error-primary)' : undefined },
                }, jobMsg.text)
              : null,
          ),
          (snap.jobs || []).length
            ? h('table', { className: 'dsc-table' },
                h('thead', null, h('tr', null, h('th', null, 'ID'), h('th', null, '类型'), h('th', null, '标题'), h('th', null, '状态'), h('th', null, '结果'), h('th', null, '操作'))),
                h('tbody', null, (snap.jobs || []).slice(0, 20).map((job) => h('tr', { key: job.id },
                  h('td', null, job.id),
                  h('td', null, job.type || ''),
                  h('td', null, job.title || ''),
                  h('td', null, h('span', { className: 'dsc-state ' + (job.state || '') }, job.state || '')),
                  h('td', null, String(job.result || job.error || job.resultRef || '').slice(0, 120)),
                  h('td', null, job.state === 'running' || job.state === 'queued'
                    ? h('button', { type: 'button', className: 'dsc-mini', onClick: async () => {
                        await fetch(`/dsh-console/api/jobs/${encodeURIComponent(job.id)}/cancel`, { method: 'POST' })
                        props.reload && props.reload()
                      } }, '取消')
                    : '—'))))
              )
            : h('div', { className: 'dsc-hint' }, '还没有异步任务；OpenCode/子代理任务会出现在这里。'),
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
          const [xd, prov, wb, audit] = await Promise.all([
            call(`/dsh-console/api/xdpool?t=${Date.now()}`),
            call(`/dsh-console/api/providers?t=${Date.now()}`),
            call(`/dsh-console/api/workbuddy?t=${Date.now()}`).catch(() => ({ ok: false })),
            call(`/dsh-console/api/aggregate/audit?t=${Date.now()}`).catch(() => ({ ok: false })),
          ])
          setData({ xd: xd || {}, prov: prov || {}, wb: wb || {}, audit: audit || {} })
        } catch (e) {
          setData({ xd: { installed: false, message: String(e) }, prov: {}, wb: { ok: false } })
        }
      }, [])
      React.useEffect(() => { load() }, [load])
      const xd = (data && data.xd) || {}
      const st = xd.status || {}
      const prov = (data && data.prov) || {}
      const wb = (data && data.wb) || {}
      const audit = (data && data.audit) || {}
      const nativeAccounts = Array.isArray(wb.accounts) ? wb.accounts : []
      const accounts = nativeAccounts.length ? nativeAccounts : (Array.isArray(st.accounts) ? st.accounts : [])
      const credits = wb.total !== undefined ? Number(wb.total || 0) : accounts.reduce((sum, a) => sum + Number(((a || {}).credits || {}).total || 0), 0)
      const [aggq, setAggq] = React.useState('')
      const [aggCat, setAggCat] = React.useState('useful')
      const aggregate = (xd.aggregate || {}).providers || []
      const configuredAgg = aggregate.filter((x) => x.configured || x.enabled || x.category === 'local' || x.category === 'free').length
      const aggCats = Array.from(new Set(aggregate.map((x) => x.category || 'other')))
      const aggRows = aggregate.filter((x) => {
        const q = aggq.trim().toLowerCase()
        const useful = x.configured || x.enabled || x.category === 'local' || x.category === 'free'
        return (aggCat === 'all' || (aggCat === 'useful' ? useful : (x.category || 'other') === aggCat)) && (!q || [x.name, x.id, x.authKind, x.format].some((v) => String(v || '').toLowerCase().includes(q)))
      }).slice(0, 60)
      return h('div', { className: 'dsc-root', style: { padding: '4px' } },
        h('style', null, CSS),
        h('section', { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, 'XD Pool 控制面板', h('small', null, xd.installed ? '宿主已加载' : '未安装')),
          xd.installed
            ? h(React.Fragment, null,
              h('div', { className: 'dsc-chips' },
                h('span', { className: 'dsc-chip' }, '账号 ', h('b', null, String(accounts.length))),
                h('span', { className: 'dsc-chip' }, 'WorkBuddy 积分 ', h('b', null, String(credits))),
                h('span', { className: 'dsc-chip' }, '积分来源 ', h('b', null, wb.source || 'xdpool')),
                h('span', { className: 'dsc-chip' }, '模型 ', h('b', null, String((st.models || []).length))),
                h('span', { className: 'dsc-chip' }, '冷却 ', h('b', null, String(st.cooling || 0))),
                h('span', { className: 'dsc-chip' }, '聚合渠道 ', h('b', null, String(configuredAgg) + '/' + String(aggregate.length))),
                h('span', { className: 'dsc-chip' }, '免费池匹配 ', h('b', null, String((audit.free_pool || {}).matched || 0))),
                h('span', { className: 'dsc-chip' }, '可补源 ', h('b', null, String((audit.free_pool || {}).unmatched || 0))),
                h('span', { className: 'dsc-chip' }, '原生网关 ', h('b', null, audit.native_ok ? '健康' : '未运行'))),
              h('div', { className: 'dsc-hint', style: { marginTop: '8px' } },
                '账号池、扫码登录、76 家聚合渠道由 XD Pool 宿主维护；WorkBuddy 账号和积分现在优先直读本地账号文件 + WorkBuddy billing，不再只依赖伴侣 API。'))
            : h('div', { className: 'dsc-hint' }, xd.message || '未检测到 XD Pool。')),
        h('section', { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, '统一模型来源', h('small', null, 'GET /dsh-console/api/providers')),
          h('div', { className: 'dsc-chips' },
            ...((prov.sources || []).map((s) => h('span', { key: s.id, className: 'dsc-chip' },
              s.name || s.id, ' ', h('b', null, String(s.models || 0)))))),
          h('div', { className: 'dsc-actions', style: { marginTop: '10px' } },
            h('button', { type: 'button', className: 'dsc-btn primary', onClick: load }, '刷新'))),
        h('section', { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, 'XD Pool 聚合渠道', h('small', null, `${aggRows.length} 个推荐 / ${aggregate.length} 个总数`)),
          h('div', { className: 'dsc-hint' }, '76 家里大部分没配置；默认只显示已配置、本地和免费渠道。'),
          h('div', { className: 'dsc-actions', style: { marginBottom: '8px' } },
            h('input', { className: 'dsc-input', value: aggq, placeholder: '搜索渠道 / 分类 / auth', onChange: (e) => setAggq(e.target.value), style: { flex: '1', minWidth: '220px' } }),
            h('button', { type: 'button', className: 'dsc-btn', onClick: () => { setAggq(''); setAggCat('useful') } }, '重置')),
          h('div', { className: 'dsc-chips', style: { marginBottom: '8px' } },
            ...[['useful', `推荐 ${configuredAgg}`], ['all', `全部 ${aggregate.length}`], ...aggCats.map((c) => [c, c])].map(([key, label]) => h('button', {
              key, type: 'button', className: 'dsc-chip' + (aggCat === key ? ' on' : ''), onClick: () => setAggCat(key),
            }, label))),
          aggRows.length
            ? h('table', { className: 'dsc-table' },
                h('thead', null, h('tr', null, h('th', null, '渠道'), h('th', null, '分类'), h('th', null, '鉴权'), h('th', null, '格式'), h('th', null, '状态'))),
                h('tbody', null, aggRows.map((x) => h('tr', { key: x.id },
                  h('td', null, x.name || x.id),
                  h('td', null, x.category || '—'),
                  h('td', null, x.authKind || '—'),
                  h('td', null, x.format || '—'),
                  h('td', null, x.enabled ? '启用' : x.configured ? '已配置' : '未配置')))))
            : h('div', { className: 'dsc-hint' }, '没有渠道；先确认 XD Pool 已加载。')),
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
            { className: 'dsc-herobar' },
            h(
              'div',
              { className: 'dsc-head' },
              h(
                'div',
                { className: 'dsc-title' },
                h('span', { className: 'dsc-logo' }, h(ConsoleIcon, { size: 24 })),
                h('div', null, h('h1', { className: 'dsc-h1' }, `${tr('title')}${snap.pluginVersion ? ' v' + snap.pluginVersion : ''}`), h('p', { className: 'dsc-sub' }, tr('subtitle'))),
              ),
              h(
                'div',
                { className: 'dsc-headright' },
                h('button', { type: 'button', className: 'dsc-btn', onClick: () => setAutoRefresh(!autoRefresh), title: tr('autoRefreshDesc') }, tr('autoRefresh') + '：' + (autoRefresh ? tr('on') : tr('off'))),
                h('button', { type: 'button', className: 'dsc-btn', onClick: () => load(true), disabled: Boolean(busy), title: 'Ctrl+R' }, tr('refresh')),
              ),
            ),
            h(
              'div',
              { className: 'dsc-statusrow' },
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
            ),
            h(
              'nav',
              { className: 'dsc-tabs' },
              h('button', { type: 'button', className: 'dsc-tab' + (tab === 'home' ? ' is-on' : ''), onClick: () => setTab('home') }, tr('tabHome')),
              h('button', { type: 'button', className: 'dsc-tab' + (tab === 'workflow' ? ' is-on' : ''), onClick: () => setTab('workflow') }, tr('tabWorkflow')),
              h('button', { type: 'button', className: 'dsc-tab' + (tab === 'free' ? ' is-on' : ''), onClick: () => setTab('free') }, '免费池'),
              h('button', { type: 'button', className: 'dsc-tab' + (tab === 'radar' ? ' is-on' : ''), onClick: () => setTab('radar') }, '情报'),
              h('button', { type: 'button', className: 'dsc-tab' + (tab === 'review' ? ' is-on' : ''), onClick: () => setTab('review') }, '复盘'),
              h('button', { type: 'button', className: 'dsc-tab' + (tab === 'schedule' ? ' is-on' : ''), onClick: () => setTab('schedule') }, '定时'),
              h('button', { type: 'button', className: 'dsc-tab' + (tab === 'settings' ? ' is-on' : ''), onClick: () => setTab('settings') }, '设置'),
              h('button', { type: 'button', className: 'dsc-tab' + (tab === 'bot' ? ' is-on' : ''), onClick: () => setTab('bot') }, tr('tabBot')),
            ),
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
                ? h(FreePoolView, { snap, act, busy, onRadar: () => setTab('radar') })
                : tab === 'radar'
                  ? h(RadarView, null)
                  : tab === 'review'
                    ? h(ReviewView, { snap, act, busy })
                  : tab === 'schedule'
                    ? h(ScheduleView, null)
                    : tab === 'settings'
                      ? h(XdPoolPanel, null)
                      : h(BotView, { snap, act, busy, tr }),
          toast ? h('div', { className: 'dsc-toast' + (toast.tone === 'err' ? ' err' : '') }, toast.text) : null,
        ),
      )
    }

    const RADAR_SOURCE_LABEL = { github: 'GitHub', bilibili: 'B站', hackernews: 'HN', xiaoheihe: '小黑盒', xiaomi: '小米社区', web: 'Web' }
    const RADAR_QUICK = ['白嫖 AI', '免费 API', '免费密钥', 'WorkBuddy 积分', 'DSH 插件', 'Agent 优化', '免费模型', 'AI 公益站']
    const RADAR_TAG_WORDS = ['免费', '白嫖', 'API', '插件', 'Agent', 'DeepSeek', 'Claude', 'Gemini', 'MCP', '额度', '中转']

    function RadarView() {
      const [query, setQuery] = React.useState('白嫖 AI 插件 Agent')
      const [data, setData] = React.useState(null)
      const [loading, setLoading] = React.useState(false)
      const [error, setError] = React.useState('')
      const [imported, setImported] = React.useState({})
      const [saving, setSaving] = React.useState('')
      const [sourceFilter, setSourceFilter] = React.useState('all')
      const [sortBy, setSortBy] = React.useState('score')
      const [expandedUrl, setExpandedUrl] = React.useState('')
      const [hotMode, setHotMode] = React.useState(false)
      const [history, setHistory] = React.useState(() => {
        try { return JSON.parse(localStorage.getItem('dsc_radar_history') || '[]') } catch { return [] }
      })
      const addCandidate = React.useCallback(async (row) => {
        if (!row || !row.url) return
        setSaving(row.url)
        try {
          const result = await call('/dsh-console/api/radar/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: row.url, title: row.title, source: row.source }),
          })
          if (result && result.ok) setImported((prev) => ({ ...prev, [row.url]: true }))
          else setError((result && result.message) || '加入候选失败')
        } catch (failure) {
          setError(String((failure && failure.message) || failure))
        } finally {
          setSaving('')
        }
      }, [])
      const load = React.useCallback((q, refresh = false, hot = false) => {
        setLoading(true)
        setError('')
        setHotMode(Boolean(hot))
        setHistory((prev) => {
          const next = [q, ...prev.filter((x) => x !== q)].slice(0, 8)
          try { localStorage.setItem('dsc_radar_history', JSON.stringify(next)) } catch { /* ignore */ }
          return next
        })
        call(`/dsh-console/api/radar?q=${encodeURIComponent(q)}&limit=30&refresh=${refresh ? 1 : 0}&hot=${hot ? 1 : 0}&t=${Date.now()}`)
          .then((result) => { if (result && result.ok) setData(result); else setError((result && result.message) || '雷达没有返回结果') })
          .catch((failure) => setError(String((failure && failure.message) || failure)))
          .finally(() => setLoading(false))
      }, [])
      React.useEffect(() => { load(query) }, [])
      const items = (data && data.items) || []
      const sourceMap = {}
      for (const source of (data && data.sources) || []) {
        if (!sourceMap[source.id] || source.ok) sourceMap[source.id] = source
      }
      const sources = Object.values(sourceMap)
      const activeSources = sources.filter((s) => s.ok && Number(s.count || 0) > 0)
      const effectiveFilter = sourceFilter !== 'all' && !activeSources.some((s) => s.id === sourceFilter) ? 'all' : sourceFilter
      const visibleItems = items
        .filter((row) => effectiveFilter === 'all' || row.source === effectiveFilter)
        .slice()
        .sort((a, b) => {
          if (sortBy === 'hot') return Number(b.popularity || 0) - Number(a.popularity || 0)
          if (sortBy === 'new') return Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0)
          return Number(b.score || 0) - Number(a.score || 0)
        })
      const tagsFor = (row) => {
        const text = String(row.title || '') + ' ' + String(row.summary || '')
        const tags = RADAR_TAG_WORDS.filter((x) => text.toLowerCase().includes(x.toLowerCase())).slice(0, 4)
        if (row.extra) tags.push(String(row.extra).slice(0, 28))
        return tags
      }
      return h(
        React.Fragment,
        null,
        h('section', { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, '情报雷达', h('small', null, data ? data.generatedAt : '多源聚合')),
          h('div', { className: 'dsc-hint' },
            '不是单关键词搜索：GitHub、B站搜索与排行、Hacker News、小黑盒签名搜索一起查；自动扩词、去重，按相关性和热度排序，结果缓存 15 分钟。'),
          h('div', { className: 'dsc-radar-search' },
            h('input', {
              className: 'dsc-input', type: 'text', value: query,
              placeholder: '例如：白嫖 AI、免费 API、DSH 插件、Agent 优化',
              onChange: (e) => setQuery(e.target.value),
              onKeyDown: (e) => { if (e.key === 'Enter' && !loading) load(query, true) },
            }),
            h('button', { type: 'button', className: 'dsc-btn primary', disabled: loading, onClick: () => load(query, true, false) }, loading ? '扫描中…' : '聚合搜索'),
            h('button', { type: 'button', className: 'dsc-btn' + (hotMode ? ' primary' : ''), disabled: loading, onClick: () => load(query, true, true) }, '热门榜'),
            h('button', { type: 'button', className: 'dsc-btn', disabled: loading, onClick: () => load(query, true, false) }, '刷新缓存')),
          h('div', { className: 'dsc-chips', style: { marginTop: '10px' } },
            ...RADAR_QUICK.map((q) => h('button', {
              key: q, type: 'button', className: 'dsc-chip' + (q === query ? ' on' : ''),
              onClick: () => { setQuery(q); load(q, false) },
            }, q))),
          history.length
            ? h('div', { className: 'dsc-chips', style: { marginTop: '8px' } },
                h('span', { className: 'dsc-hint' }, '最近：'),
                ...history.map((q) => h('button', {
                  key: 'h-' + q, type: 'button', className: 'dsc-chip',
                  onClick: () => { setQuery(q); load(q, false) },
                }, q)))
            : null,
          h('div', { className: 'dsc-chips', style: { marginTop: '8px' } },
            h('span', { className: 'dsc-hint' }, '外部社区：'),
            h('a', { className: 'dsc-chip', href: 'https://search.bilibili.com/all?keyword=' + encodeURIComponent(query), target: '_blank', rel: 'noreferrer' }, 'B站搜索'),
            h('a', { className: 'dsc-chip', href: 'https://www.xiaoheihe.cn/', target: '_blank', rel: 'noreferrer' }, '小黑盒'),
            h('a', { className: 'dsc-chip', href: 'https://www.xiaomi.cn/', target: '_blank', rel: 'noreferrer' }, '小米社区')),
          h('div', { className: 'dsc-chips', style: { marginTop: '10px' } },
            ...sources.filter((s) => !s.ok || Number(s.count || 0) > 0).map((s) => h('span', { key: s.id, className: 'dsc-chip' + (s.ok ? ' on' : '') },
              RADAR_SOURCE_LABEL[s.id] || s.id, ' ', h('b', null, s.ok ? String(s.count || 0) : '不可用')))),
          h('div', { className: 'dsc-radar-filters' },
            h('span', { className: 'dsc-hint' }, '来源'),
            h('button', { type: 'button', className: 'dsc-chip' + (effectiveFilter === 'all' ? ' on' : ''), onClick: () => setSourceFilter('all') }, '全部'),
            ...activeSources.map((s) => h('button', {
              key: s.id, type: 'button', className: 'dsc-chip' + (effectiveFilter === s.id ? ' on' : ''),
              onClick: () => setSourceFilter(s.id),
            }, RADAR_SOURCE_LABEL[s.id] || s.id)),
            h('span', { className: 'dsc-hint', style: { marginLeft: '8px' } }, '排序'),
            ...[['score', '相关度'], ['hot', '热度'], ['new', '最新']].map(([key, label]) => h('button', {
              key, type: 'button', className: 'dsc-chip' + (sortBy === key ? ' on' : ''), onClick: () => setSortBy(key),
            }, label))),
          error ? h('div', { className: 'dsc-banner err', style: { marginTop: '10px' } }, error) : null),
        h('section', { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, '社区结果', h('small', null, data ? `${data.hot ? '热门榜 · ' : ''}共 ${data.total || items.length} 条，当前 ${visibleItems.length}` : '等待扫描')),
          data && data.expanded && data.expanded.length
            ? h('div', { className: 'dsc-hint' }, '扩词：' + data.expanded.slice(0, 6).join(' · '))
            : null,
          loading
            ? h('div', { className: 'dsc-empty' }, '正在拉取 GitHub / B站 / HN / 搜索，首次可能要几十秒…')
            : visibleItems.length
              ? h('div', { className: 'dsc-radar-list' },
                  ...visibleItems.map((row, index) => h('article', { key: (row.url || row.title) + index, className: 'dsc-radar-item' },
                    h('div', { className: 'dsc-radar-top' },
                      h('div', { className: 'dsc-radar-title' }, h('a', { href: row.url, target: '_blank', rel: 'noreferrer' }, row.title || row.url)),
                      h('div', { className: 'dsc-actions' },
                        h('button', {
                          type: 'button', className: 'dsc-mini',
                          onClick: () => setExpandedUrl(expandedUrl === row.url ? '' : row.url),
                        }, expandedUrl === row.url ? '收起' : '详情'),
                        h('button', {
                          type: 'button', className: 'dsc-mini',
                          disabled: Boolean(imported[row.url]) || saving === row.url,
                          onClick: () => addCandidate(row),
                        }, imported[row.url] ? '已加入候选' : saving === row.url ? '加入中…' : '加入候选'),
                        h('span', { className: 'dsc-radar-badge ' + row.source }, RADAR_SOURCE_LABEL[row.source] || row.source))),
                    row.summary ? h('div', { className: 'dsc-radar-summary' + (expandedUrl === row.url ? ' is-open' : '') }, row.summary) : null,
                    expandedUrl === row.url
                      ? h('div', { className: 'dsc-radar-detail' },
                          h('div', null, '来源 ', h('b', null, RADAR_SOURCE_LABEL[row.source] || row.source), ' · ', row.kind || 'post'),
                          h('div', null, '链接 ', h('a', { href: row.url, target: '_blank', rel: 'noreferrer' }, row.url)),
                          row.extra ? h('div', null, '附加 ', row.extra) : null)
                      : null,
                    h('div', { className: 'dsc-radar-meta' },
                      row.author ? h('span', null, '作者 ', h('b', null, row.author)) : null,
                      row.popularity ? h('span', null, '热度 ', h('b', null, String(Math.round(row.popularity)))) : null,
                      row.score !== undefined ? h('span', null, '评分 ', h('b', null, String(row.score))) : null,
                      row.publishedAt ? h('span', null, String(row.publishedAt).slice(0, 10)) : null),
                    h('div', { className: 'dsc-radar-tags' }, ...tagsFor(row).map((tag) => h('span', { key: tag }, tag))))))
              : h('div', { className: 'dsc-empty' }, data ? '当前来源/筛选没有结果；换来源或点“刷新缓存”。' : '点“聚合搜索”开始。')),
      )
    }

    function FreePoolView({ snap, act, busy, onRadar }) {
      const [xd, setXd] = React.useState(null)
      const [prov, setProv] = React.useState(null)
      const [fm, setFm] = React.useState(null)
      const [fmq, setFmq] = React.useState('')
      const [candq, setCandq] = React.useState('')
      const [qualityFilter, setQualityFilter] = React.useState('all')
      const [reg, setReg] = React.useState({ items: [] })
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
        call(`/dsh-console/api/registration?t=${Date.now()}`)
          .then((data) => { if (alive) setReg(data || { items: [] }) })
          .catch(() => { if (alive) setReg({ items: [] }) })
        return () => { alive = false }
      }, [loadFm])
      const fp = snap.freePool || {}
      const cand = fp.candidates || {}
      const providers = Array.isArray(cand.providers) ? cand.providers : []
      const shownProviders = providers.filter((p) => {
        const q = candq.trim().toLowerCase()
        const textHit = !q || [p.name, p.base_url, p.key_url, p.free_quota, p.source_url, p.quality].some((v) => String(v || '').toLowerCase().includes(q))
        return textHit && (qualityFilter === 'all' || p.quality === qualityFilter)
      }).sort((a, b) => Number(b.quality_score || 0) - Number(a.quality_score || 0))
      return h(
        React.Fragment,
        null,
        h('section', { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, '免费池侦察档案', h('small', null, cand.checked_at || '还没侦察过')),
          h('div', { className: 'dsc-chips' },
            h('span', { className: 'dsc-chip' }, '来源 ', h('b', null, String((cand.sources || []).length))),
            h('span', { className: 'dsc-chip' }, '候选 ', h('b', null, String(providers.length))),
            h('span', { className: 'dsc-chip' }, 'A ', h('b', null, String(providers.filter((p) => p.quality === 'A').length))),
            h('span', { className: 'dsc-chip' }, 'B ', h('b', null, String(providers.filter((p) => p.quality === 'B').length))),
            h('span', { className: 'dsc-chip' }, '登记 ', h('b', null, String((fm && fm.total) || 0)))),
          providers.length
            ? (() => {
                const a = providers.filter((p) => p.quality === 'A').length
                const b = providers.filter((p) => p.quality === 'B').length
                const c = Math.max(0, providers.length - a - b)
                return h('div', { className: 'dsc-qualitybar' },
                  h('i', { className: 'qa', style: { width: `${(a / providers.length) * 100}%` } }),
                  h('i', { className: 'qb', style: { width: `${(b / providers.length) * 100}%` } }),
                  h('i', { className: 'qc', style: { width: `${(c / providers.length) * 100}%` } }),
                  h('span', null, `A ${a} · B ${b} · C ${c}`))
              })()
            : null,
          providers.length
            ? h('table', { className: 'dsc-table', style: { marginTop: '10px' } },
                h('thead', null, h('tr', null, h('th', null, '名称'), h('th', null, '免费额度'), h('th', null, 'Base URL'))),
                h('tbody', null, providers.slice(0, 8).map((p, i) => h('tr', { key: i },
                  h('td', null, p.name || ''),
                  h('td', null, String(p.free_quota || '').slice(0, 100)),
                  h('td', null, p.base_url || p.key_url || '')))))
            : h('div', { className: 'dsc-hint' }, '暂无侦察内容；点下方“开始侦察”。'),
          h('div', { className: 'dsc-hint', style: { marginTop: '6px' } }, '完整候选和注册信息在下方卡片。'),
          (cand.sources || []).length
            ? h('div', { className: 'dsc-hint', style: { marginTop: '6px' } }, '侦察源：' + (cand.sources || []).slice(-6).map((s) => s.repo || s.url).join(' / '))
            : null,
          h('div', { className: 'dsc-actions', style: { marginTop: '10px' } },
            h('button', { type: 'button', className: 'dsc-btn primary', onClick: onRadar }, '打开情报雷达'),
            h('span', { className: 'dsc-hint' }, 'GitHub / B站 / 小黑盒 / HN 聚合）'))),
        h('section', { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, '模型来源（统一 API）', h('small', null, (prov && prov.version ? 'v' + prov.version : '可选'))),
          h('div', { className: 'dsc-chips' },
            ...((prov && prov.sources) || []).map((s) => h('span', { key: s.id, className: 'dsc-chip' },
              s.name || s.id, ' ', h('b', null, String(s.models || 0))))),
          h('div', { className: 'dsc-hint', style: { marginTop: '6px' } },
            'GET /dsh-console/api/providers；统一返回 source / model / state，供调度器直接消费。')),
        h('section', { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, '免费模型注册入口', h('small', null, `${(reg.items || []).length} 个`)),
          h('div', { className: 'dsc-hint' }, '只读入口：需要验证码、邮箱或手机号；插件不自动提交注册。'),
          (reg.items || []).length
            ? h('table', { className: 'dsc-table', style: { marginTop: '8px' } },
                h('thead', null, h('tr', null, h('th', null, '入口'), h('th', null, '免费额度'), h('th', null, '绑卡'), h('th', null, '检查时间'))),
                h('tbody', null, (reg.items || []).slice(0, 20).map((item, i) => h('tr', { key: item.url || i },
                  h('td', null, h('a', { href: item.url, target: '_blank', rel: 'noreferrer' }, item.url || '')),
                  h('td', null, String(item.free_quota || '—').slice(0, 80)),
                  h('td', null, String(item.card_required || '—')),
                  h('td', null, String(item.checked_at || '—'))))))
            : h('div', { className: 'dsc-hint' }, '还没有注册入口；跑一次免费池侦察。')),
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
          h('h3', { className: 'dsc-sec-title' }, '免费池侦察'),
          h('div', { className: 'dsc-hint' }, '空闲时让免费模型联网搜索可用的免费 AI 池；只产候选，不自动写入 key。'),
          h('div', { className: 'dsc-actions', style: { marginTop: '10px' } },
            h('button', { type: 'button', className: 'dsc-btn primary', disabled: Boolean(busy), onClick: () => act({ type: 'free-scout' }, '免费池侦察') }, '开始侦察'),
            h('span', { className: 'dsc-hint' }, cand.checked_at ? '上次：' + cand.checked_at : '还没侦察过'))),
        h('section', { className: 'dsc-card' },
          h('h3', { className: 'dsc-sec-title' }, '候选提供方', h('small', null, `${shownProviders.length} / ${providers.length} 个`)),
          h('div', { className: 'dsc-actions', style: { marginBottom: '8px' } },
            h('input', {
              className: 'dsc-input', type: 'text', value: candq, placeholder: '筛选名称 / Base URL / 额度 / 来源',
              onChange: (e) => setCandq(e.target.value), style: { flex: '1', minWidth: '240px' },
            }),
            candq ? h('button', { type: 'button', className: 'dsc-btn', onClick: () => setCandq('') }, '清空') : null),
          h('div', { className: 'dsc-chips', style: { marginBottom: '8px' } },
            ...[['all', '全部'], ['A', 'A 级'], ['B', 'B 级'], ['C', 'C 级']].map(([key, label]) => h('button', {
              key, type: 'button', className: 'dsc-chip' + (qualityFilter === key ? ' on' : ''),
              onClick: () => setQualityFilter(key),
            }, label))),
          shownProviders.length
            ? h('table', { className: 'dsc-table' },
                h('thead', null, h('tr', null, h('th', null, '名称'), h('th', null, '质量'), h('th', null, '免费额度'), h('th', null, 'Base URL'), h('th', null, '模型'), h('th', null, '来源'))),
                h('tbody', null, shownProviders.map((p, i) => h('tr', { key: i },
                  h('td', null, p.name || ''),
                  h('td', null, p.quality ? h('span', { className: 'dsc-state' }, p.quality + ' · ' + (p.quality_score || 0)) : '—'),
                  h('td', null, p.free_quota || ''),
                  h('td', null, p.base_url || ''),
                  h('td', null, String(p.models || '')),
                  h('td', null, p.source_url ? h('a', { href: p.source_url, target: '_blank', rel: 'noreferrer' }, '来源') : '')))))
            : h('div', { className: 'dsc-hint' }, providers.length ? '筛选没有结果。' : '暂无候选，点“开始侦察”。')),
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

    /**
     * 会话雷达（DSH 右侧面板 body）。
     * 只读 /api/sessions + /api/progress，点一行用 uiWorkspace.openSession 原地切会话。
     */
    function RadarTabBody(props) {
      const openSession = props && typeof props.openSession === 'function' ? props.openSession : null
      const [rows, setRows] = React.useState([])
      const [running, setRunning] = React.useState(0)
      const [error, setError] = React.useState('')
      const load = React.useCallback(async () => {
        try {
          const [data, progress] = await Promise.all([
            fetch('/dsh-console/api/sessions').then((r) => r.json()).catch(() => ({})),
            fetch('/dsh-console/api/progress').then((r) => r.json()).catch(() => ({})),
          ])
          const list = Array.isArray((data || {}).sessions) ? data.sessions : []
          const cutoff = Date.now() - 24 * 3600 * 1000
          const visible = list
            .filter((s) => s && s.sessionId && (s.running || Date.parse(String(s.lastActive || '')) >= cutoff))
            .sort((a, b) => (Number(b.running) - Number(a.running)) || (Date.parse(String(b.lastActive || '')) - Date.parse(String(a.lastActive || ''))))
            .slice(0, 40)
          setRows(visible)
          const runningRows = (((progress || {}).sessions || {}).running || []).length
          setRunning(runningRows || visible.filter((s) => s.running).length)
          setError('')
        } catch (e) {
          setError(String((e && e.message) || e))
        }
      }, [])
      React.useEffect(() => {
        load()
        const timer = setInterval(load, 10000)
        return () => clearInterval(timer)
      }, [load])
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', padding: '8px' } },
        h('div', { style: { fontSize: '12px', opacity: 0.75 } }, `${running} 运行中 · ${rows.length} 可见`),
        error ? h('div', { style: { fontSize: '11px', color: '#f87171' } }, error) : null,
        rows.length
          ? rows.map((s) => {
            const pct = Math.max(0, Math.min(100, Number(s.contextPct) || 0))
            const status = s.running ? '#34d399' : (s.stale ? '#f59e0b' : '#94a3b8')
            return h('button', {
              key: s.sessionId,
              type: 'button',
              title: s.sessionId,
              onClick: () => openSession && openSession(s.sessionId),
              style: {
                display: 'flex', alignItems: 'center', gap: '6px', width: '100%', textAlign: 'left',
                padding: '6px 8px', borderRadius: '8px', border: '1px solid rgba(148,163,184,.25)',
                background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: '12px',
              },
            },
              h('span', { style: { width: '7px', height: '7px', borderRadius: '50%', background: status, flex: 'none' } }),
              h('span', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, s.title || s.sessionId),
              h('span', { style: { opacity: 0.7, flex: 'none' } }, `${Number(s.turns) || 0}轮`),
              h('span', { style: { opacity: pct > 60 ? 1 : 0.7, color: pct > 60 ? '#fbbf24' : 'inherit', flex: 'none' } }, `${pct}%`))
          })
          : h('div', { style: { fontSize: '12px', opacity: 0.6 } }, '没有正在运行或最近活跃的会话。'))
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

        // 对话回合完成提示音（挂在 turnTail，只在实时完成时响，刷新历史会被 5 秒静默期压掉）
        ctx.slots.inject('conversation.chat.turnTail', () =>
          ctx.slots.register(
            { name: 'conversation.chat.turnTail', id: 'ai-hub-turn-sound', order: 999, label: () => '完成提示' },
            TurnSound,
          ),
        )

        // 会话雷达（DSH 右侧面板）：类型注册 + body + 「开始页 More」入口。
        // 依赖服务缺失（旧版 DSH）时整个块静默跳过，不影响控制台。
        ctx.inject(['sidebarRightTabs', 'sidebarRight', 'uiWorkspace'], (scope) => {
          try {
            const KIND = 'aihub-radar'
            ctx.effect(() => scope.sidebarRightTabs.register({
              id: KIND,
              kind: KIND,
              patterns: ['dsh-resource://aihub-radar/**'],
              priority: 'builtin',
              canOpen: () => true,
              title: () => '会话雷达',
            }), 'ds-console: radar tab type')
            ctx.slots.inject('sidebar.right.pane.tab', () =>
              ctx.slots.register(
                { name: 'sidebar.right.pane.tab', key: KIND, locale: NS },
                (props) => h(RadarTabBody, {
                  ...(props || {}),
                  openSession: (id) => {
                    try {
                      scope.uiWorkspace.openSession(id)
                    } catch (e) {
                      console.warn('[ai-hub] openSession failed', e)
                    }
                  },
                }),
              ),
            )
            ctx.slots.inject('sidebar.right.tab.guide.actions', () =>
              ctx.slots.register(
                { name: 'sidebar.right.tab.guide.actions', id: 'aihub-radar-open', order: 60, locale: NS, label: () => '会话雷达' },
                () => h('button', {
                  type: 'button',
                  onClick: () => {
                    try {
                      scope.sidebarRight.openTab(KIND, { params: {} })
                    } catch (e) {
                      console.warn('[ai-hub] openTab failed', e)
                    }
                  },
                }, '会话雷达'),
              ),
            )
          } catch (error) {
            console.warn('[ai-hub] 会话雷达注册失败（DSH 版本差异），已跳过', error)
          }
        })
      },
    }
  },
})
