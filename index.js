/**
 * dsh-plugin-ds-console — 宿主半（Host half）。
 *
 * 两块能力：
 *  1) 流水线守护：原来外置的 tools\watchdog_dsh.py 变成常驻插件，
 *     按开关自动拉起 / 重启 tools\pipeline_dsh.py，并汇总进度。
 *  2) 大肥鱼（QQ 官方机器人）：管理独立 profile `qqbot` 的进程、白名单、群推送。
 *
 * 浏览器半通过 /dsh-console/api/* 读写；agent 侧另有 watchdog_* / qqbot_* 工具。
 * 只用 node: 内置模块，不依赖第三方包。
 */
import { execFile, execFileSync, spawn } from 'node:child_process'
import { zstdDecompressSync } from 'node:zlib'
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, renameSync, statSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'ai-hub'
export const inject = ['webServer', 'tools', 'agents']

const FALLBACK_ROOT = 'C:\\Users\\Railan\\Desktop\\ds工作区'
// 注意：webServer 的 prefix 匹配是 pathname === prefix || pathname.startsWith(prefix + '/')，
// 所以这里不带尾斜杠，否则 /dsh-console/api/... 永远命中不了。
const ROUTE_PREFIX = '/dsh-console'
const SETTINGS_NAME = 'ds_console_settings.json'
const DEFAULT_SETTINGS = {
  auto: false,
  restartOnFailure: true,
  notify: false,
  intervalSeconds: 30,
  restartSeconds: 60,
  python: 'python',
  botAuto: false,
  mapAuto: true,
  artAuto: true,
  balanceAuto: true,
  qqNotify: false,
  sessionGc: false,
  optimizer: true,
  scout: true,
  idleThreshold: 0.3,
  expandTasks: 3,
}
const MAX_BODY = 64 * 1024
const QQ_BASE = (process.env.QQBOT_BASE_URL || 'https://api.bot.qq.com').replace(/\/+$/, '')
const DSH_CMD = 'D:\\Apps\\dsha\\resources\\runtime\\cli\\bin\\dsh.cmd'
const BOT_ROOT = 'C:\\Users\\Railan\\Desktop\\DS-AI'
const BOT_DIR = join(BOT_ROOT, 'bot')
const QQBOT_PROFILE_DIR = join(process.env.USERPROFILE || 'C:\\Users\\Railan', '.dsh', 'profiles', 'qqbot')
const QQ_ACCESS_MODES = ['open', 'allowlist', 'disabled']

/* ------------------------------------------------------------------ */
/* 小工具                                                              */
/* ------------------------------------------------------------------ */

function clock() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function nowText() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function today() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(file, value) {
  try {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(value, null, 2), 'utf8')
    return true
  } catch {
    return false
  }
}

function readText(file) {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return ''
  }
}

function tailLines(file, count) {
  try {
    const text = readText(file)
    const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '')
    return lines.slice(-count)
  } catch {
    return []
  }
}

function pidAlive(pid) {
  const n = Number(pid)
  if (!Number.isInteger(n) || n <= 0) return false
  try {
    process.kill(n, 0)
    return true
  } catch (error) {
    return error && error.code === 'EPERM'
  }
}

function resolveRoot() {
  const candidates = []
  if (process.env.DS_CONSOLE_ROOT) candidates.push(process.env.DS_CONSOLE_ROOT)
  try {
    candidates.push(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'))
  } catch {
    /* ignore */
  }
  candidates.push(FALLBACK_ROOT)
  for (const candidate of candidates) {
    if (candidate && existsSync(join(candidate, 'tools', 'pipeline_dsh.py'))) return candidate
  }
  return FALLBACK_ROOT
}

/** 把「换行 / 逗号 / 分号 / 空格 / 竖线 / 顿号」分隔的 id 串切成数组。 */
function splitIds(value) {
  const raw = Array.isArray(value) ? value.join('\n') : String(value ?? '')
  return raw
    .split(/[\s,;，；|、]+/)
    .map((id) => id.trim().replace(/^["']|["']$/g, ''))
    .filter((id) => id !== '')
}

function validId(id) {
  return /^[A-Za-z0-9_-]{4,80}$/.test(id)
}

/* ------------------------------------------------------------------ */
/* qqbot profile 的 cordis.patch.yml 读写                              */
/* ------------------------------------------------------------------ */

/**
 * 从 patch 文本里取出 access 块的四项配置。
 * 只认 `access:` 下的这四个键，其余内容原样保留，避免整体重写 YAML。
 */
function parseAccessYaml(text) {
  const lines = String(text || '').split(/\r?\n/)
  const start = lines.findIndex((line) => /^\s*access:\s*$/.test(line))
  const out = { c2cMode: 'allowlist', c2cAllow: [], groupMode: 'open', groupAllow: [] }
  if (start < 0) return out
  const baseIndent = (lines[start].match(/^\s*/) || [''])[0].length
  let end = lines.length
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i]
    if (line.trim() === '') continue
    const indent = (line.match(/^\s*/) || [''])[0].length
    if (indent <= baseIndent) {
      end = i
      break
    }
  }
  const block = lines.slice(start + 1, end)
  let key = null
  for (const line of block) {
    const listItem = /^\s*-\s*(.+?)\s*$/.exec(line)
    if (listItem && key) {
      const value = listItem[1].replace(/^["']|["']$/g, '')
      if (Array.isArray(out[key])) out[key].push(value)
      continue
    }
    const kv = /^\s*([A-Za-z0-9_]+):\s*(.*?)\s*$/.exec(line)
    if (!kv) continue
    key = kv[1]
    const value = kv[2]
    if (key === 'c2cMode' || key === 'groupMode') {
      const clean = value.replace(/^["']|["']$/g, '')
      if (QQ_ACCESS_MODES.includes(clean)) out[key] = clean
      key = null
    } else if (key === 'c2cAllow' || key === 'groupAllow') {
      if (value.startsWith('[') && value.endsWith(']')) {
        out[key] = value
          .slice(1, -1)
          .split(',')
          .map((item) => item.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean)
      } else if (value !== '') {
        out[key] = [value.replace(/^["']|["']$/g, '')]
        key = null
      }
    } else {
      key = null
    }
  }
  return out
}

/** 生成 access 块（缩进跟随原文件）。 */
function renderAccessBlock(access, indent) {
  const pad = ' '.repeat(indent)
  const inner = ' '.repeat(indent + 2)
  const item = ' '.repeat(indent + 4)
  const lines = [`${pad}access:`, `${inner}c2cMode: ${access.c2cMode}`, `${inner}c2cAllow:`]
  if (access.c2cAllow.length === 0) lines[lines.length - 1] = `${inner}c2cAllow: []`
  else for (const id of access.c2cAllow) lines.push(`${item}- ${id}`)
  lines.push(`${inner}groupMode: ${access.groupMode}`, `${inner}groupAllow:`)
  if (access.groupAllow.length === 0) lines[lines.length - 1] = `${inner}groupAllow: []`
  else for (const id of access.groupAllow) lines.push(`${item}- ${id}`)
  return lines
}

/** 用新的 access 值替换原文本中的 access 块；其余字节原样保留。 */
function replaceAccessBlock(text, access) {
  const lines = String(text || '').split(/\r?\n/)
  const start = lines.findIndex((line) => /^\s*access:\s*$/.test(line))
  if (start < 0) return null
  const indent = (lines[start].match(/^\s*/) || [''])[0].length
  let end = lines.length
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i]
    if (line.trim() === '') continue
    const own = (line.match(/^\s*/) || [''])[0].length
    if (own <= indent) {
      end = i
      break
    }
  }
  const block = renderAccessBlock(access, indent)
  return [...lines.slice(0, start), ...block, ...lines.slice(end)].join('\n')
}

/** 从 patch 文本里取 appId / appSecret（只在宿主内部用，不发给浏览器）。 */
function parseCredentials(text) {
  const appId = /^\s*appId:\s*'?([0-9]+)'?/m.exec(text)?.[1]
  const appSecret = /^\s*appSecret:\s*'?([A-Za-z0-9_-]+)'?/m.exec(text)?.[1]
  return { appId: appId || '', appSecret: appSecret || '' }
}

function maskSecret(secret) {
  if (!secret) return ''
  if (secret.length <= 8) return '****'
  return `${secret.slice(0, 4)}****${secret.slice(-3)}`
}

/* ------------------------------------------------------------------ */
/* 宿主半                                                              */
/* ------------------------------------------------------------------ */

/**
 * 建立守护台的全部状态与行为。
 * @param ctx Cordis 宿主上下文（已注入 webServer 与 tools）。
 */
function createConsole(ctx) {
  const root = resolveRoot()
  const settingsPath = join(root, 'tools', SETTINGS_NAME)
  const pipelineScript = join(root, 'tools', 'pipeline_dsh.py')
  // 任务目录已挪到 桌面\任务\：01/02 在 代码，地图项目在 地图
  const relayFallback = (() => {
    const moved = join(root, '..', '任务', '代码', '02_修改', '_relay')
    return existsSync(moved) ? moved : join(root, '02_修改', '_relay')
  })()
  const botPatchPath = join(QQBOT_PROFILE_DIR, 'cordis.patch.yml')
  const botPatchSource = join(BOT_ROOT, 'config', 'qqbot.patch.yml')
  const groupJsonPath = join(BOT_ROOT, 'config', 'group.json')
  const botLogDir = join(BOT_DIR, 'logs')

  const settings = { ...DEFAULT_SETTINGS, ...readJson(settingsPath, {}) }
  if (!existsSync(settingsPath)) writeJson(settingsPath, settings)

  const state = {
    child: null,
    childStartedAt: null,
    restarts: 0,
    lastStart: null,
    lastExit: null,
    lastExitAt: null,
    lastEvent: '守护台已就绪',
    lastError: null,
    suppressed: false,
    restartTimer: null,
    ring: [],
    lastSupervised: 0,
    dshCount: 0,
    dshByProfile: {},
    dshCountAt: 0,
    alloc: null,
    allocAt: 0,
    balanceAt: 0,
    mapAt: 0,
    artAt: 0,
    botChild: null,
    botLastStart: null,
    botLastStop: null,
    botSuppressed: false,
    botLastPush: null,
    botEvent: '机器人未启动过',
    routeDispose: null,
    routeOrigin: null,
    routeError: null,
    routeReady: false,
    toolsBound: false,
    toolDisposers: [],
    lastGc: 0,
  }

  /* ---------- 路径 / 配置 ---------- */

  function pipelineConfig() {
    return readJson(join(root, 'tools', 'pipeline_config.json'), {})
  }

  function relayDir() {
    const dir = pipelineConfig().relay_dir
    return dir ? dir : relayFallback
  }

  /** 免费审计的 _relay（并行 worker 的 live.json 在这里）。 */
  function freeRelayDir() {
    const dir = (pipelineConfig().free || {}).relay_dir
    return dir ? dir : join(root, '..', '任务', '代码', '01_查问题', '_relay')
  }

  function worklogDir() {
    const dir = pipelineConfig().worklog_dir
    return dir ? dir : join(root, '..', '工作日志')
  }

  function logDir() {
    return join(worklogDir(), today())
  }

  /* ---------- 日志 ---------- */

  function log(message) {
    const line = `[${clock()}] ${message}`
    state.ring.push(line)
    if (state.ring.length > 200) state.ring.shift()
    state.lastEvent = message
    try {
      mkdirSync(logDir(), { recursive: true })
      appendFileSync(join(logDir(), '守护记录.md'), `${line}\n`, 'utf8')
    } catch {
      /* 日志失败不影响主流程 */
    }
    try {
      ctx.logger?.info?.(`ds-console: ${message}`)
    } catch {
      /* ignore */
    }
  }

  /* ---------- 流水线观测 ---------- */

  function lockInfo() {
    const lock = join(relayDir(), 'pipeline.lock')
    const data = readJson(lock, null)
    const pid = data && Number(data.pid) ? Number(data.pid) : null
    return { pid, started: (data && data.started) || null, alive: pidAlive(pid) }
  }

  function stopFlag() {
    return existsSync(join(relayDir(), 'STOP'))
  }

  function pipelineRunning() {
    const lock = lockInfo()
    if (lock.alive) return lock
    if (state.child && pidAlive(state.child.pid)) return { pid: state.child.pid, started: state.childStartedAt, alive: true }
    return { pid: lock.pid, started: lock.started, alive: false }
  }

  function snapshot() {
    refreshDshCount(true)
    const relay = relayDir()
    const status = readJson(join(relay, 'status.json'), {})
    const saved = readJson(join(relay, 'state.json'), {})
    const config = pipelineConfig()
    const lock = lockInfo()
    const childPid = state.child ? state.child.pid : null
    const managed = Boolean(childPid && lock.pid === childPid)
    const running = lock.alive || (childPid !== null && pidAlive(childPid))
    const total = Number(config?.free?.total_files) || 618
    const checked = Number.isFinite(Number(status.checked)) ? Number(status.checked) : 0
    const workflow = readJson(join(relay, 'parallel_workflow_status.json'), {})
    const hasDlc = (() => {
      try {
        return Boolean(globalThis.__AI_HUB__ && typeof globalThis.__AI_HUB__.listTasks === 'function' && globalThis.__AI_HUB__.listTasks().length)
      } catch {
        return false
      }
    })()

    return {
      ok: true,
      root,
      now: nowText(),
      settings: { ...settings },
      watchdog: {
        auto: Boolean(settings.auto),
        suppressed: state.suppressed,
        childPid,
        restarts: state.restarts,
        lastStart: state.lastStart,
        lastExit: state.lastExit,
        lastExitAt: state.lastExitAt,
        lastEvent: state.lastEvent,
        lastError: state.lastError,
      },
      pipeline: {
        running,
        pid: lock.pid || childPid,
        managed,
        stop: stopFlag(),
        external: running && !managed && !state.child,
        phase: typeof status.phase === 'string' ? status.phase : null,
        cycle: Number.isFinite(Number(saved.cycle)) ? Number(saved.cycle) : Number(status.cycle) || 0,
        round: Number.isFinite(Number(status.round)) ? Number(status.round) : 0,
        checked,
        total,
        hasDlc,
        workflow: {
          stage: typeof workflow.stage === 'string' ? workflow.stage : '',
          done: Number(workflow.done) || 0,
          total: Number(workflow.total) || 0,
          workers: Number(workflow.workers) || 0,
          updated: workflow.updated || '',
        },
        findings: Number.isFinite(Number(status.findings)) ? Number(status.findings) : 0,
        version: saved.mod_version || status.version || '',
        lastTest: saved.last_test || status.last_test || '',
        startedAt: lock.started || state.childStartedAt,
        updated: status.updated || saved.updated || null,
      },
      bot: botSnapshot(),
      tasks: (() => {
        const builtin = [
          {
            id: 'desc',
            name: '描述/代码',
            state: running ? 'running' : stopFlag() ? 'stopped' : 'idle',
            pid: lock.pid || childPid || null,
            detail: '',
          },
          artTask(),
          mapTask(),
          balanceTask(),
        ]
        const dlc = (() => {
          try {
            return globalThis.__AI_HUB__ && typeof globalThis.__AI_HUB__.listTasks === 'function'
              ? globalThis.__AI_HUB__.listTasks()
              : []
          } catch {
            return []
          }
        })()
        // 没有装 task-mod（无 DLC 注册）时，不显示代码/地图/贴图/平衡这些模组任务，
        // 只保留纯 AI 调度台；避免朋友只装 ai-hub 也看到模组按钮。
        if (!dlc.length) builtin.length = 0
        for (const desc of dlc) {
          if (!desc || !desc.id) continue
          let status = {}
          try {
            status = desc.status ? desc.status() || {} : {}
          } catch {
            status = {}
          }
          const i = builtin.findIndex((t) => t.id === desc.id)
          if (i >= 0) {
            builtin[i] = { ...builtin[i], ...status, name: desc.name || builtin[i].name, source: 'dlc' }
          } else {
            builtin.push({ id: desc.id, name: desc.name || desc.id, state: 'idle', pid: null, detail: '', ...status, source: 'dlc' })
          }
        }
        const actions = {
          desc: ['start', 'stop', 'restart', 'clear-stop'],
          map: ['start', 'stop', 'restart', 'fix', 'fix-dry', 'design', 'ai-design', 'generate', 'editor', 'pve', 'workflow'],
          art: ['start', 'stop', 'restart'],
          balance: ['start', 'stop', 'restart', 'recompute', 'ai-think'],
        }
        for (const task of builtin) {
          task.actions = actions[task.id] || ['start', 'stop', 'restart']
        }
        const live = readJson(join(freeRelayDir(), 'par', 'live.json'), {})
        const liveFresh = live && Date.now() / 1000 - (Number(live.updated) || 0) < 120
        const activeWorkers = liveFresh ? Math.max(0, Number(live.active) || 0) : 0
        const descTask = builtin.find((t) => t.id === 'desc')
        if (descTask) {
          descTask.workers = activeWorkers
          descTask.keys = Number(readJson(join(root, 'tools', 'pipeline_config.json'), {}).parallel_keys_used) || 0
          descTask.done = activeWorkers
          descTask.total = Number(descTask.total) || 0
        }
        return builtin
      })(),
      service: {
        origin: state.routeOrigin,
        routeReady: Boolean(state.routeDispose),
        routeError: state.routeError,
        prefix: ROUTE_PREFIX,
      },
      logs: {
        watchdog: tailLines(join(logDir(), '守护记录.md'), 40),
        pipeline: tailLines(join(logDir(), '运行记录.md'), 8),
        map: tailLines(join(logDir(), '地图任务.md'), 20),
        art: tailLines(join(logDir(), '贴图任务.md'), 20),
      },
      quota: quotaInfo(),
      balanceLoop: (() => {
        const task = balanceTask()
        return { state: task.state, round: task.round, phase: task.phase, updated: task.updated || '' }
      })(),
      schedule: (() => {
        const plan = readJson(join(root, 'tools', 'ai_plan.json'), {})
        const quotas = plan.quotas || {}
        const aiStatus = readJson(join(artDir, '_relay', 'art_ai_status.json'), {})
        const actual = {
          code_pipeline: running ? 1 : 0,
          map_modify: mapTask().state === 'running' ? 1 : 0,
          map_experiment: 0,
          balance: balanceTask().state === 'running' ? 1 : 0,
          ai: aiStatus.state === 'running' ? aiStatus.workers || 0 : 0,
          art_loop: artTask().state === 'running' ? 1 : 0,
          live: state.dshCount,
        }
        const total = Object.values(quotas).reduce((a, b) => a + (Number(b) || 0), 0)
        const alloc = state.alloc || {}
        return {
          quotas,
          actual,
          total,
          target: alloc.target || Math.ceil(total * 0.8),
          poolMax: alloc.poolMax || 0,
          action: alloc.action || 'pending',
          reason: alloc.reason || '',
          imageAvailable: Boolean(alloc.imageOk),
          occupancyPct: alloc.poolMax ? Math.round((alloc.actual / alloc.poolMax) * 100) : 0,
        }
      })(),
      concurrency: (() => {
        const ai = readJson(join(artDir, '_relay', 'art_ai_status.json'), {})
        const cfg = readJson(join(root, 'tools', 'dsh_config.json'), {})
        const plan = readJson(join(root, 'tools', 'ai_plan.json'), {})
        const quotas = plan.quotas || {}
        const accounts = Object.keys(cfg.amd_api_keys || {}).length
        const models = (cfg.models || []).length
        const poolMax = accounts * models * 4
        const theory = Number(plan.theoretical_max) || poolMax
        // 并行审计会写 _relay\par\live.json；用它显示实际在跑的 worker 数，而不是固定 1。
        const parLive = readJson(join(freeRelayDir(), 'par', 'live.json'), {})
        const liveFresh = parLive && Date.now() / 1000 - (Number(parLive.updated) || 0) < 120
        const parallelActive = liveFresh ? Math.max(0, Number(parLive.active) || 0) : 0
        const pipelineWorkers = running ? Math.max(1, parallelActive) : 0
        const mapFlowNow = readJson(join(mapDir, '_relay', 'map_workflow_status.json'), {})
        const mapRunningNow = mapFlowNow.state === 'running' || mapFlowNow.state === 'waiting'
        const mapNow = { state: mapRunningNow ? 'running' : mapTask().state, workers: Number(mapFlowNow.workers) || 0 }
        const actual = {
          code: pipelineWorkers,
          map: mapRunningNow ? Math.max(1, Number(mapFlowNow.workers) || 1) : 0,
          art: artTask().state === 'running' ? 1 : 0,
          ai: ai.state === 'running' ? (ai.workers || 0) : 0,
          balance: balanceTask().state === 'running' ? 1 : 0,
          flex: 0,
        }
        const knownLive = actual.code + actual.map + actual.art + actual.ai + actual.balance
        const otherLive = Math.max(0, (Number(state.dshCount) || 0) - (Number((state.dshByProfile || {}).qqbot) || 0) - knownLive)
        const autoWorkers = readJson(join(root, 'tools', 'autoscale_workers.json'), {})
        const autoActive = Object.values(autoWorkers || {}).filter((v) => {
          if (!v || !v.updated) return false
          const t = Date.parse(String(v.updated).replace(' ', 'T'))
          return Number.isFinite(t) && Date.now() - t < 10 * 60 * 1000
        }).length
        actual.flex = Math.max(otherLive, autoActive)
        const items = [
          { id: 'code', label: '代码流水线', actual: actual.code, max: Number(quotas.code_pipeline) || 1 },
          { id: 'map', label: '地图', actual: actual.map, max: (Number(quotas.map_modify) || 0) + (Number(quotas.map_experiment) || 0) },
          { id: 'balance', label: '平衡', actual: actual.balance, max: Number(quotas.balance) || 1 },
          { id: 'art', label: '贴图', actual: actual.art, max: Number(quotas.art) || Number(quotas.art_loop) || 1 },
          { id: 'ai', label: 'AI 分析', actual: actual.ai, max: Number(quotas.flex) || 0 },
          { id: 'flex', label: '扩展/其他', actual: actual.flex, max: Number(quotas.flex) || 0 },
        ]
        const names = Object.keys(cfg.amd_api_keys || {})
        const providers = Array.isArray(cfg.amd_providers) ? cfg.amd_providers : []
        const artKeys = Object.keys(cfg.art_ai_keys || {})
        const mapKeys = Object.keys(cfg.map_ai_keys || {})
        const balKeys = Object.keys(cfg.balance_ai_keys || {})
        const accountsDetail = names.map((k, i) => {
          const providerId = i === 0 ? 'amd' : `amd-${i + 1}`
          const tasks = []
          if (providers.includes(providerId)) tasks.push('流水线')
          if (artKeys.includes(k)) tasks.push('贴图')
          if (mapKeys.includes(k)) tasks.push('地图')
          if (balKeys.includes(k)) tasks.push('平衡')
          // 地图工作流不锁主 key：正在跑的 key 都算地图任务
          if ((mapFlowNow.state === 'running' || mapFlowNow.state === 'waiting') && Array.isArray(mapFlowNow.key_names) && mapFlowNow.key_names.includes(k)) {
            if (!tasks.includes('地图')) tasks.push('地图')
          }
          return { key: k, label: `amd${i + 1}`, tasks }
        })

        const shortModel = (id) => {
          const s = String(id || '')
          if (s.includes('V4.1')) return 'V4.1'
          if (s.includes('V4')) return 'V4'
          if (s.includes('GLM')) return 'GLM'
          if (s.includes('Gemma')) return 'Gemma'
          return s.replace(/^DeepSeek-/, '').replace(/-Flash$/, '') || s
        }
        const modelIds = [...new Set(
          (Array.isArray(cfg.models) && cfg.models.length
            ? cfg.models
            : ['DeepSeek-V4.1-Flash', 'DeepSeek-V4-Flash', 'GLM-5.3-Flash', 'Gemma-4-31B-IT']
          ).map(shortModel),
        )]

        // 当前流水线用的是哪个 provider/model（headless 的 agent-default-model）。
        let headlessProvider = 'amd'
        let headlessModel = modelIds[0]
        try {
          const patch = readFileSync(join(process.env.USERPROFILE || '', '.dsh', 'profiles', 'headless', 'cordis.patch.yml'), 'utf8')
          const pm = /id:\s*agent-default-model[\s\S]{0,500}?provider:\s*([\w-]+)/.exec(patch)
          const mm = /id:\s*agent-default-model[\s\S]{0,500}?model:\s*([\w.-]+)/.exec(patch)
          if (pm) headlessProvider = pm[1]
          if (mm) headlessModel = shortModel(mm[1])
        } catch {
          /* 读不到就用默认 */
        }
        const providerIndex = (pid) => {
          const m = /amd-(\d+)/.exec(String(pid || ''))
          return m ? Math.max(0, Number(m[1]) - 1) : 0
        }
        const cells = []
        const keyLabel = (raw) => {
          const i = names.indexOf(raw)
          return i >= 0 ? `amd${i + 1}` : ''
        }
        const addCell = (keyName, task, busy) => {
          if (!keyName || !busy) return
          cells.push({ key: keyLabel(keyName), model: modelIds.includes(headlessModel) ? headlessModel : modelIds[0], task, busy })
        }
        const liveSlots = liveFresh && Array.isArray(parLive.slots) ? parLive.slots : []
        if (liveSlots.length) {
          // 并行审计会在 live.json 里给出每个 key × 模型真正在跑的批次数。
          for (const slot of liveSlots) {
            cells.push({
              key: String(slot.key || ''),
              model: modelIds.includes(slot.model) ? slot.model : modelIds[0],
              task: String(slot.task || '流水线'),
              busy: Math.max(1, Number(slot.active) || 1),
            })
          }
        } else if (actual.code) {
          addCell(names[providerIndex(headlessProvider)], '流水线', actual.code)
        }
        if (actual.map) {
          const flowKeys = (mapFlowNow.state === 'running' || mapFlowNow.state === 'waiting') && Array.isArray(mapFlowNow.key_names)
            ? mapFlowNow.key_names.slice(0, Math.max(1, actual.map))
            : []
          if (flowKeys.length) {
            // 每个实际在跑的 key 只算 1 路，保证格子总和 = 地图 worker 数
            for (const k of flowKeys) addCell(k, '地图', 1)
          } else {
            addCell(mapKeys[0], '地图', actual.map)
          }
        }
        if (actual.balance) addCell(balKeys[0], '平衡', actual.balance)
        if (actual.art) addCell(artKeys[0], '贴图', actual.art)
        if (actual.ai) addCell(artKeys[0], 'AI 分析', actual.ai)
        if (actual.flex) {
          let used = 0
          for (let i = names.length - 1; i >= 0 && used < actual.flex; i -= 1) {
            const label = `amd${i + 1}`
            if (cells.some((c) => c.key === label)) continue
            addCell(names[i], '扩展/其他', 1)
            used += 1
          }
          if (used === 0) addCell(names[names.length - 1], '扩展/其他', actual.flex)
        }

        return {
          pipeline: actual.code,
          map: actual.map,
          art: actual.art,
          ai: actual.ai,
          balance: actual.balance,
          aiWorkers: actual.ai,
          models,
          accounts,
          poolMax,
          theory,
          actualTotal: items.reduce((a, b) => a + b.actual, 0),
          items,
          pipelineWorkers,
          parallelActive,
          matrix: { models: modelIds, keys: accountsDetail.map((a) => ({ id: a.label, label: a.label, tasks: a.tasks })), cells },
          live: state.dshCount,
          liveByProfile: state.dshByProfile,
          accountsDetail,
          aiState: ai.state || '',
          pipelineKeys: Array.isArray(cfg.amd_providers) ? cfg.amd_providers.length : 0,
          aiKeys: Object.keys(cfg.art_ai_keys || {}).length,
        }
      })(),
      sessions: sessionsInfo(),
      eta: (() => {
        const plan = readJson(join(root, 'tools', 'ai_plan.json'), {})
        const cfg = plan.eta || {}
        const rate = Number(cfg.tokens_per_second) || 40
        const par = readJson(join(relay, 'par', 'parallel_status.json'), {})
        const files = Number(par.files) || 0
        const wall = Number(par.wall_sec) || 0
        const filesPerHour = files > 0 && wall > 0 ? (files / wall) * 3600 : Number(cfg.audit_files_per_hour) || 2000
        const fmt = (sec) => {
          if (!sec || sec <= 0) return '—'
          if (sec < 90) return `${Math.round(sec)} 秒`
          if (sec < 5400) return `${Math.round(sec / 60)} 分钟`
          return `${(sec / 3600).toFixed(1)} 小时`
        }
        const items = []
        let pipelineSec = 0
        let basis = '未运行'
        if (running) {
          const phase = String(status.phase || '')
          if (phase === 'free' && total > checked) {
            const remain = total - checked
            pipelineSec = (remain / filesPerHour) * 3600
            basis = `${remain} 个文件 ÷ ${Math.round(filesPerHour)}/小时`
          } else if (phase === 'review') {
            const findings = Number(status.findings) || 0
            const per = Number(cfg.review_seconds_per_finding) || 8
            const base = findings * per
            const started = Date.parse(String(status.updated || '').replace(' ', 'T'))
            const elapsed = Number.isFinite(started) ? Math.max(0, (Date.now() - started) / 1000) : 0
            pipelineSec = Math.max(300, base - elapsed)
            basis = `${findings} 条 × ${per} 秒 − 已过 ${Math.round(elapsed / 60)} 分钟（${rate} tok/s）`
          } else if (phase === 'paid') {
            const findings = Number(status.findings) || 0
            pipelineSec = findings * (Number(cfg.paid_seconds_per_finding) || 30)
            basis = `${findings} 条问题 × ${Number(cfg.paid_seconds_per_finding) || 30} 秒（含实机复测）`
          } else {
            basis = `当前阶段：${phase || '未知'}`
          }
        }
        items.push({ id: 'desc', name: '代码流水线', phase: status.phase || '', eta_seconds: Math.round(pipelineSec), eta_text: fmt(pipelineSec), basis })

        const mt = mapTask()
        const mapFlow = readJson(join(mapDir, '_relay', 'map_workflow_status.json'), {})
        const mapLeft = Math.max(0, (Number(mt.deepTotal) || 0) - (Number(mt.deepDone) || 0))
        let mapSec = 0
        let mapBasis = '当前没有待处理地图'
        if (mt.state === 'running' && mapFlow.state === 'waiting' && mapFlow.next_run) {
          const next = Date.parse(String(mapFlow.next_run).replace(' ', 'T'))
          mapSec = Number.isFinite(next) ? Math.max(0, (next - Date.now()) / 1000) : 900
          mapBasis = `下一轮 ${mapFlow.next_run}`
        } else if (mt.state === 'running') {
          mapSec = mapLeft * 20
          mapBasis = mapLeft ? `${mapLeft} 张待深读` : '本轮审查中'
        }
        items.push({ id: 'map', name: '地图', phase: mt.state || 'idle', eta_seconds: Math.round(mapSec), eta_text: fmt(mapSec), basis: mapBasis })

        const at = artTask()
        const artLeft = Math.max(0, (Number(at.total) || 0) - (Number(at.indexed) || 0))
        const artSec = at.state === 'running' ? artLeft * 8 : 0
        items.push({ id: 'art', name: '贴图', phase: at.state || 'idle', eta_seconds: artSec, eta_text: fmt(artSec), basis: artLeft ? `${artLeft} 张待处理` : '已全部蒸馏' })

        const bt = balanceTask()
        items.push({ id: 'balance', name: '平衡', phase: bt.state || 'idle', eta_seconds: bt.state === 'running' ? 1800 : 0, eta_text: bt.state === 'running' ? '≤30 分钟/轮' : '—', basis: '每轮间隔 30 分钟' })

        return { tokens_per_second: rate, items }
      })(),
      balance: (() => {
        const sim = readJson(join(balanceDir, '_relay', 'balance_sim.json'), null)
        const design = readJson(join(mapDir, '_relay', 'design.json'), null)
        let restrictionsText = ''
        try {
          restrictionsText = readFileSync(join(balanceDir, '限制标注.json'), 'utf8')
        } catch {
          restrictionsText = '{"说明":"人工补充的额外限制","units":{}}'
        }
        return { sim: sim, design: design, restrictionsText, rankDelta: readJson(join(balanceDir, '_relay', 'rank_delta.json'), {}), rankChanges: readJson(join(balanceDir, '_relay', 'rank_changes.json'), {}) }
      })(),
      freePool: {
        candidates: readJson(join(root, 'tools', 'free_pool_candidates.json'), null),
        codePlan: readJson(join(process.env.USERPROFILE || 'C:\\Users\\Railan', 'Desktop', '任务', '代码', '02_修改', '_relay', '调度分类.json'), null),
      },
      scheduler: readJson(join(root, 'tools', 'scheduler_status.json'), null),
      assets: readJson(join(root, 'tools', 'assets_index.json'), null),
      community: readJson(join(root, 'tools', 'community_assets.json'), null),
      selfCheck: readJson(join(root, 'tools', 'self_check.json'), null),
      pluginVersion: readJson(join(root, '插件', 'ai-hub', 'package.json'), {}).version || '',
      autoscale: readJson(join(root, 'tools', 'autoscale_status.json'), null),
      power: readJson(join(root, 'tools', 'power_status.json'), null),
      powerDaily: readJson(join(root, 'tools', 'power_daily.json'), null),
      resource: readJson(join(root, 'tools', 'resource_status.json'), null),
      optimizer: readJson(join(root, 'tools', 'scheduler_optimizer.json'), null),
    }
  }

  /* ---------- 启动 / 停止（流水线） ---------- */

  function clearRestartTimer() {
    if (state.restartTimer) {
      clearTimeout(state.restartTimer)
      state.restartTimer = null
    }
  }

  function notify(message) {
    if (!settings.notify) return
    try {
      const child = spawn(settings.python || 'python', ['-X', 'utf8', join(root, 'tools', 'notify.py'), '--send', message, '--subject', 'DS 守护台'], {
        cwd: root,
        windowsHide: true,
        stdio: 'ignore',
      })
      child.on('error', () => {})
    } catch {
      /* ignore */
    }
  }

  function startPipeline(origin) {
    if (state.child) return { ok: false, message: '守护台已经拉起了一个进程' }
    const running = pipelineRunning()
    if (running.alive) return { ok: false, message: `已有流水线在跑（PID ${running.pid}），不重复启动`, pid: running.pid }
    if (stopFlag()) {
      try {
        unlinkSync(join(relayDir(), 'STOP'))
      } catch {
        /* ignore */
      }
    }
    try {
      const child = spawn(settings.python || 'python', ['-X', 'utf8', pipelineScript], {
        cwd: root,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      state.child = child
      state.childStartedAt = nowText()
      state.lastStart = state.childStartedAt
      state.lastError = null
      if (origin === 'restart') state.restarts += 1
      state.suppressed = false
      log(origin === 'restart' ? '流水线异常退出后自动重启…' : '启动 dsh 流水线…')

      const collect = (chunk) => {
        const text = String(chunk).trim()
        if (!text) return
        for (const line of text.split(/\r?\n/).slice(-3)) {
          state.ring.push(`  ${line}`)
        }
        if (state.ring.length > 200) state.ring = state.ring.slice(-200)
      }
      child.stdout?.on('data', collect)
      child.stderr?.on('data', collect)

      child.on('error', (error) => {
        state.lastError = String((error && error.message) || error)
        log(`启动失败：${state.lastError}`)
      })

      child.on('exit', (code, signal) => {
        state.child = null
        state.lastExit = code === null ? signal || '信号' : code
        state.lastExitAt = nowText()
        if (stopFlag()) {
          log('检测到 STOP，守护台不再重启。')
          return
        }
        if (code === 0) {
          log('流水线正常结束（退出码 0）。')
          return
        }
        if (!settings.restartOnFailure || !settings.auto || state.suppressed) {
          log(`流水线退出（${state.lastExit}），自动重启已关闭。`)
          return
        }
        const wait = Math.max(5, Number(settings.restartSeconds) || 60)
        log(`流水线异常退出（${state.lastExit}），${wait}s 后重启。`)
        notify(`流水线异常退出（${state.lastExit}），${wait}s 后自动重启。`)
        if (settings.qqNotify) qqSendC2C(`流水线异常退出（${state.lastExit}），${wait}s 后自动重启。`)
        clearRestartTimer()
        state.restartTimer = setTimeout(() => {
          state.restartTimer = null
          if (settings.auto && !stopFlag() && !state.suppressed) startPipeline('restart')
        }, wait * 1000)
      })

      return { ok: true, pid: child.pid, message: '已启动' }
    } catch (error) {
      state.lastError = String((error && error.message) || error)
      log(`启动失败：${state.lastError}`)
      return { ok: false, message: state.lastError }
    }
  }

  function stopGraceful() {
    try {
      mkdirSync(relayDir(), { recursive: true })
      writeFileSync(join(relayDir(), 'STOP'), `停止请求：${nowText()}\n`, 'utf8')
    } catch (error) {
      return { ok: false, message: `写 STOP 失败：${String(error)}` }
    }
    clearRestartTimer()
    log('写入 STOP，流水线会在当前步骤结束后停止。')
    return { ok: true, message: '已写入 STOP' }
  }

  function clearStop() {
    try {
      unlinkSync(join(relayDir(), 'STOP'))
    } catch (error) {
      if (!error || error.code !== 'ENOENT') return { ok: false, message: `删除 STOP 失败：${String(error)}` }
    }
    log('清除 STOP。')
    return { ok: true, message: '已清除 STOP' }
  }

  function killManaged() {
    const child = state.child
    if (!child || !child.pid) return { ok: false, message: '守护台没有自己拉起的进程' }
    const pid = child.pid
    clearRestartTimer()
    state.suppressed = true
    try {
      if (process.platform === 'win32') {
        const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
        killer.on('error', () => {})
      } else {
        child.kill('SIGKILL')
      }
      log(`强制结束了守护台拉起的进程（PID ${pid}），自动守护已暂停。`)
      return { ok: true, message: `已结束 PID ${pid}` }
    } catch (error) {
      return { ok: false, message: String(error) }
    }
  }

  /* ---------- 大肥鱼（qqbot profile） ---------- */

  function botPatch({ forWrite = false } = {}) {
    const primary = readText(botPatchPath)
    if (primary) return { text: primary, path: botPatchPath }
    const source = readText(botPatchSource)
    return { text: source, path: source ? botPatchSource : botPatchPath }
  }

  /** 列出所有 --profile qqbot 的进程（不依赖外部脚本，直接问 powershell）。 */
  function listBotProcesses() {
    return new Promise((resolveList) => {
      const script = [
        "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8",
        "Get-CimInstance Win32_Process -Filter \"Name='node.exe' or Name='cmd.exe'\" |",
        "  Where-Object { $_.CommandLine -match '--profile\\s+qqbot' } |",
        "  ForEach-Object { $_.ProcessId }",
      ].join('\n')
      let out = ''
      let child
      try {
        child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'ignore'],
        })
      } catch {
        resolveList([])
        return
      }
      const timer = setTimeout(() => {
        try {
          child.kill()
        } catch {
          /* ignore */
        }
        resolveList([])
      }, 8000)
      child.stdout.on('data', (chunk) => {
        out += String(chunk)
      })
      child.on('error', () => {
        clearTimeout(timer)
        resolveList([])
      })
      child.on('exit', () => {
        clearTimeout(timer)
        const pids = out
          .split(/\r?\n/)
          .map((line) => Number(line.trim()))
          .filter((n) => Number.isInteger(n) && n > 0)
        resolveList(pids)
      })
    })
  }

  // 进程列表要 spawn 一次 powershell，别每 3 秒轮询都去拉；缓存几秒。
  let botPidCache = { pids: [], at: 0 }

  async function botPidsFresh() {
    const pids = await listBotProcesses().catch(() => [])
    botPidCache = { pids, at: Date.now() }
    return pids
  }

  async function botPidsCached(maxAge = 6000) {
    if (Date.now() - botPidCache.at < maxAge) return botPidCache.pids
    return botPidsFresh()
  }

  function newestBotLog() {
    try {
      const files = readdirSync(botLogDir)
        .filter((name) => /^bot-.*\.log$/.test(name))
        .map((name) => ({ name, mtime: statSync(join(botLogDir, name)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime)
      return files.length ? join(botLogDir, files[0].name) : null
    } catch {
      return null
    }
  }

  function botSnapshot(pids) {
    const { text } = botPatch()
    const access = parseAccessYaml(text)
    const creds = parseCredentials(text)
    const group = readJson(groupJsonPath, {})
    const list = Array.isArray(pids) ? pids : []
    const logFile = newestBotLog()
    return {
      running: list.length > 0,
      pids: list,
      auto: Boolean(settings.botAuto),
      suppressed: state.botSuppressed,
      lastStart: state.botLastStart,
      lastStop: state.botLastStop,
      lastEvent: state.botEvent,
      lastPush: state.botLastPush,
      configured: {
        appId: creds.appId,
        appSecretMasked: maskSecret(creds.appSecret),
        hasSecret: Boolean(creds.appSecret),
        model: /^\s*model:\s*(\S+)/m.exec(text)?.[1] || '',
        cwd: /^\s*cwd:\s*'?([^'\n]+)'?/m.exec(text)?.[1] || '',
        c2cMode: access.c2cMode,
        c2cAllow: access.c2cAllow,
        groupMode: access.groupMode,
        groupAllow: access.groupAllow,
        patchPath: botPatchPath,
      },
      group: {
        groupNumber: String(group.group_number || ''),
        groupOpenid: String(group.group_openid || ''),
      },
      logs: logFile ? tailLines(logFile, 30) : [],
      logFile,
    }
  }

  /* ---------- 地图任务（TMX 体检） ---------- */

  const artDir = (() => {
    const moved = join(root, '..', '任务', '贴图', '贴图项目')
    return existsSync(join(moved, 'art_loop.py')) ? moved : join(root, '贴图项目')
  })()
  const artStatePath = join(artDir, '_relay', 'art_status.json')
  const artLockPath = join(artDir, '_relay', 'art.lock')

  function artTask() {
    const saved = readJson(artStatePath, {})
    let lockPid = 0
    try {
      lockPid = Number(readFileSync(artLockPath, 'utf8').trim()) || 0
    } catch {
      lockPid = 0
    }
    const running = lockPid > 0 && pidAlive(lockPid)
    let taskState = 'idle'
    if (running) taskState = 'running'
    else if (saved.state === 'error' || saved.state === 'running') taskState = 'stopped'
    const detail = saved.indexed ? `${saved.indexed} 张已蒸馏 · ${saved.last_pass || saved.finished || ''}` : '未跑过'
    return {
      id: 'art',
      name: '贴图',
      state: taskState,
      pid: running ? lockPid : null,
      detail,
      total: saved.total || 0,
      indexed: saved.indexed || 0,
      rebuilt: saved.rebuilt || 0,
      deepDone: saved.deep_done || 0,
      deepTotal: saved.deep_total || 0,
      current: saved.current || '',
      aiDone: (readJson(join(artDir, '_relay', 'art_ai_status.json'), {}) || {}).done || 0,
      aiTotal: (readJson(join(artDir, '_relay', 'art_ai_status.json'), {}) || {}).total || 0,
      updated: saved.updated || null,
      report: saved.report || null,
      error: saved.error || null,
    }
  }

  function startArtTask() {
    if (artTask().state === 'running') return { ok: false, message: '贴图任务已经在跑' }
    try {
      const child = spawn(settings.python || 'python', ['-X', 'utf8', join(artDir, 'art_loop.py'), '--interval', '600'], {
        cwd: artDir,
        windowsHide: true,
        stdio: 'ignore',
      })
      child.on('error', (error) => log(`贴图任务启动失败：${String((error && error.message) || error)}`))
      log('启动贴图任务（单位贴图蒸馏，30 分钟一轮）…')
      return { ok: true, message: '已启动贴图任务' }
    } catch (error) {
      return { ok: false, message: String((error && error.message) || error) }
    }
  }

  function stopArtTask() {
    const pid = artTask().pid
    if (!pid) return { ok: false, message: '贴图任务没在跑' }
    try {
      spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => {})
      log(`已停止贴图任务（PID ${pid}）`)
      return { ok: true, message: `已停止 PID ${pid}` }
    } catch (error) {
      return { ok: false, message: String((error && error.message) || error) }
    }
  }

  let quotaCacheAt = 0
  let quotaCacheValue = null

  const tokenLedgerPath = join(root, 'tools', 'token_ledger.json')
  const TOKEN_BYTES_PER_TOKEN = 3.5

  /**
   * 累计 token 账本：清理会话不会再把历史数字冲掉。
   * - baseline 是 2026-11-24 清理前面板显示的历史值（约 1500w），只增不减
   * - entries 记录基线之后新出现的会话（真实会话树 + 临时 home + 回收站）
   */
  function loadTokenLedger() {
    const ledger = readJson(tokenLedgerPath, null)
    if (!ledger || typeof ledger !== 'object') {
      const fresh = {
        version: 1,
        baseline: 15000000,
        baselineAt: new Date().toISOString(),
        baselineNote: '2026-11-24 清理前显示的历史累计约 1500w；作为不再回退的基线',
        entries: {},
      }
      writeJson(tokenLedgerPath, fresh)
      return fresh
    }
    ledger.entries = ledger.entries && typeof ledger.entries === 'object' ? ledger.entries : {}
    return ledger
  }

  function quotaInfo() {
    if (quotaCacheValue && Date.now() - quotaCacheAt < 60000) return quotaCacheValue
    const cfg = readJson(join(root, 'tools', 'dsh_config.json'), {})
    const keys = Object.keys(cfg.amd_api_keys || {})
    const providers = Array.isArray(cfg.amd_providers) ? cfg.amd_providers : []
    const now = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    const dayOf = (ms) => {
      const d = new Date(ms)
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    }
    const ledger = loadTokenLedger()
    const baselineAt = Date.parse(ledger.baselineAt) || Date.now()
    let sessions = 0
    let bytes = 0
    let firstUse = null
    let changed = false

    const visit = (dir, mtimeMs, size) => {
      if (!firstUse || mtimeMs < firstUse) firstUse = mtimeMs
      if (dayOf(mtimeMs) === day) {
        sessions++
        bytes += size
      }
      if (mtimeMs >= baselineAt) {
        const sid = dir.split(/[\\/]/).pop()
        const tokens = Math.round(size / TOKEN_BYTES_PER_TOKEN)
        const prev = ledger.entries[sid]
        if (!prev || tokens > (Number(prev.tokens) || 0)) {
          ledger.entries[sid] = { tokens, date: dayOf(mtimeMs) }
          changed = true
        }
      }
    }

    const walk = (base, depth) => {
      if (depth > 4) return
      let names = []
      try {
        names = readdirSync(base)
      } catch {
        return
      }
      for (const name of names) {
        const p = join(base, name)
        let st
        try {
          st = statSync(p)
        } catch {
          continue
        }
        if (!st.isDirectory()) continue
        if (name.startsWith('session-')) {
          let size = 0
          try {
            for (const f of readdirSync(p)) {
              try {
                size += statSync(join(p, f)).size
              } catch {
                /* ignore */
              }
            }
          } catch {
            continue
          }
          visit(p, st.mtimeMs, size)
        } else {
          walk(p, depth + 1)
        }
      }
    }

    for (const base of [
      join(process.env.USERPROFILE || '', '.dsh', 'sessions'),
      join(process.env.USERPROFILE || '', '.dsh', 'sessions-trash'),
      join(root, '..', '任务', '_dsh_ephemeral', 'sessions'),
    ]) {
      walk(base, 0)
    }

    if (changed) writeJson(tokenLedgerPath, ledger)
    const entryTokens = Object.values(ledger.entries).reduce((a, e) => a + (Number(e && e.tokens) || 0), 0)
    const tokensToday = Object.values(ledger.entries).reduce(
      (a, e) => a + (e && e.date === day ? Number(e.tokens) || 0 : 0),
      0,
    )
    const baseline = Number(ledger.baseline) || 0
    const tokens = Math.round(tokensToday)
    const tokensTotal = Math.round(baseline + entryTokens)
    const usage = {
      updated: nowText(),
      today: Math.round(tokens),
      cumulative: tokensTotal,
      baseline,
      keys: keys.length,
      providers: providers.length,
    }
    writeJson(join(root, 'tools', 'token_usage.json'), usage)
    quotaCacheValue = {
      keys: keys.length,
      providers: providers.length,
      sessions,
      tokens,
      tokensTotal,
      today: usage.today,
      cumulative: usage.cumulative,
      baseline,
      tokensAfterBaseline: Math.round(entryTokens),
      sessionEntries: Object.keys(ledger.entries).length,
      firstUse: firstUse ? dayOf(firstUse) : String(ledger.baselineAt || '').slice(0, 10),
      perKey: keys.length ? Math.round(tokens / keys.length) : 0,
      updated: nowText(),
      note: `累计 = 清理前基线 ${Math.round(baseline / 10000)}w + 之后新会话 ${Math.round(entryTokens / 10000)}w；只增不减。AMD 无余额接口，容量等跑满/被限流后反推`,
    }
    quotaCacheAt = Date.now()
    return quotaCacheValue
  }

  const balanceDir = join(root, '..', '任务', '平衡', '平衡项目')

  const mapDir = (() => {
    const moved = join(root, '..', '任务', '地图', '地图项目')
    return existsSync(join(moved, 'map_loop.py')) ? moved : join(root, '地图项目')
  })()
  const mapStatePath = join(mapDir, '_relay', 'map_status.json')
  const mapLockPath = join(mapDir, '_relay', 'map.lock')

  function mapTask() {
    const saved = readJson(mapStatePath, {})
    let lockPid = 0
    try {
      lockPid = Number(readFileSync(mapLockPath, 'utf8').trim()) || 0
    } catch {
      lockPid = 0
    }
    const running = lockPid > 0 && pidAlive(lockPid)
    let taskState = 'idle'
    if (running) taskState = 'running'
    else if (saved.state === 'error' || saved.state === 'running') taskState = 'stopped'
    const detail =
      saved.state === 'done'
        ? `${saved.maps || 0} 张图 / 缺 tileset ${saved.missing_tilesets || 0} / 空 Ground ${saved.blank_ground || 0}`
        : saved.updated
          ? `上次 ${saved.updated}`
          : '未跑过'
    return {
      id: 'map',
      name: '地图',
      state: taskState,
      pid: running ? lockPid : null,
      detail,
      maps: saved.maps || 0,
      missingTilesets: saved.missing_tilesets || 0,
      blankGround: saved.blank_ground || 0,
      invisibleRes: saved.invisible_res || 0,
      updated: saved.updated || null,
      finished: saved.finished || null,
      report: saved.report || null,
      balanceReport: saved.balance_report || null,
      balanceSim: saved.balance_sim || null,
      designReport: saved.design_report || null,
      deepDone: saved.deep_done || 0,
      deepTotal: saved.deep_total || 0,
      currentMap: saved.current_map || '',
      minesMain: saved.mines_main || 0,
      minesSquad: saved.mines_squad || 0,
      minesContested: saved.mines_contested || 0,
      error: saved.error || null,
    }
  }

  function balanceTask() {
    const saved = readJson(join(balanceDir, '_relay', 'balance_status.json'), {})
    const alive = Number(saved.pid) > 0 && pidAlive(Number(saved.pid)) && saved.state === 'running'
    return {
      id: 'balance',
      name: '平衡',
      state: alive ? 'running' : saved.state === 'error' ? 'stopped' : 'idle',
      pid: alive ? saved.pid : null,
      detail: saved.updated ? `第 ${saved.round || 0} 轮 ${saved.phase || ''} · 上次 ${saved.updated}` : '未跑过',
      round: saved.round || 0,
      phase: saved.phase || '',
      updated: saved.updated || null,
    }
  }

  function startBalanceTask() {
    if (balanceTask().state === 'running') return { ok: false, message: '平衡任务已经在跑' }
    try {
      spawn(settings.python || 'python', ['-X', 'utf8', join(balanceDir, 'balance_loop.py'), '--interval', '1800'], {
        cwd: balanceDir,
        windowsHide: true,
        stdio: 'ignore',
      }).on('error', (error) => log(`平衡任务启动失败：${String((error && error.message) || error)}`))
      log('启动平衡任务（模拟 → AI 解读 → 阵营分析 → 排行榜）…')
      return { ok: true, message: '已启动平衡任务' }
    } catch (error) {
      return { ok: false, message: String((error && error.message) || error) }
    }
  }

  function stopBalanceTask() {
    const saved = readJson(join(balanceDir, '_relay', 'balance_status.json'), {})
    if (!saved.pid) return { ok: false, message: '平衡任务没在跑' }
    try {
      spawn('taskkill', ['/PID', String(saved.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => {})
      log(`已停止平衡任务（PID ${saved.pid}）`)
      return { ok: true, message: `已停止 PID ${saved.pid}` }
    } catch (error) {
      return { ok: false, message: String((error && error.message) || error) }
    }
  }

  function startMapTask() {    if (mapTask().state === 'running') return { ok: false, message: '地图任务已经在跑' }
    try {
      const child = spawn(settings.python || 'python', ['-X', 'utf8', join(mapDir, 'map_workflow_loop.py')], {
        cwd: mapDir,
        windowsHide: true,
        stdio: 'ignore',
      })
      child.on('error', (error) => log(`地图任务启动失败：${String((error && error.message) || error)}`))
      log('启动地图任务（18 路并行工作流循环）…')
      return { ok: true, message: '已启动地图任务' }
    } catch (error) {
      return { ok: false, message: String((error && error.message) || error) }
    }
  }

  function stopMapTask() {
    const pid = mapTask().pid
    if (!pid) return { ok: false, message: '地图任务没在跑' }
    try {
      spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => {})
      log(`已停止地图任务（PID ${pid}）`)
      return { ok: true, message: `已停止 PID ${pid}` }
    } catch (error) {
      return { ok: false, message: String((error && error.message) || error) }
    }
  }

  /** 从 dsh_config.json 取 AMD 免费 key，注入机器人子进程环境（机器人默认走 AMD）。 */
  function amdEnv() {
    const cfg = readJson(join(root, 'tools', 'dsh_config.json'), {})
    const out = {}
    const keys = cfg.amd_api_keys || {}
    for (const [name, value] of Object.entries(keys)) {
      if (value) out[String(name)] = String(value)
    }
    const fallback = cfg.amd_api_key
    if (fallback) out[String(cfg.amd_api_key_env || 'AMD_API_KEY')] = String(fallback)
    return out
  }

  async function startBot(origin) {
    const running = await botPidsFresh()
    if (running.length > 0) return { ok: false, message: `大肥鱼已经在跑（PID ${running.join(',')}）`, pids: running }
    if (!existsSync(DSH_CMD)) return { ok: false, message: `找不到 dsh 命令：${DSH_CMD}` }
    try {
      mkdirSync(botLogDir, { recursive: true })
      const stamp = `${today().replace(/-/g, '')}-${clock().replace(/:/g, '')}`
      const logFile = join(botLogDir, `bot-${stamp}.log`)
      const fd = openSync(logFile, 'a')
      const child = spawn('cmd.exe', ['/c', DSH_CMD, '--profile', 'qqbot'], {
        cwd: BOT_ROOT,
        windowsHide: true,
        env: { ...process.env, QQBOT_BIND_OPEN_BROWSER: '0', DSH_PERMISSION_MODE: 'danger-full-access', ...amdEnv() },
        stdio: ['ignore', fd, fd],
      })
      state.botChild = child
      state.botLastStart = nowText()
      state.botSuppressed = false
      state.botEvent = origin === 'auto' ? '检测到掉线，自动拉起' : '手动启动'
      log(`启动大肥鱼（QQ 机器人）… 日志 ${logFile}`)
      child.on('exit', (code) => {
        try {
          closeSync(fd)
        } catch {
          /* ignore */
        }
        state.botChild = null
        state.botLastStop = nowText()
        state.botEvent = `机器人进程退出（${code === null ? '信号' : code}）`
        log(`大肥鱼退出（${code === null ? '信号' : code}）。`)
      })
      child.on('error', (error) => {
        state.botEvent = `启动失败：${String((error && error.message) || error)}`
        log(state.botEvent)
      })
      return { ok: true, message: '已启动大肥鱼，稍等几秒看日志', pid: child.pid, logFile }
    } catch (error) {
      const message = String((error && error.message) || error)
      log(`大肥鱼启动失败：${message}`)
      return { ok: false, message }
    }
  }

  async function stopBot() {
    const pids = await botPidsFresh()
    if (pids.length === 0) return { ok: false, message: '大肥鱼当前没在跑' }
    state.botSuppressed = true
    for (const pid of pids) {
      try {
        spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => {})
      } catch {
        /* ignore */
      }
    }
    state.botLastStop = nowText()
    state.botEvent = `已停止（PID ${pids.join(',')}）`
    log(`停止大肥鱼（PID ${pids.join(',')}）。`)
    return { ok: true, message: `已停止 PID ${pids.join(',')}` }
  }

  async function restartBot() {
    await stopBot()
    await new Promise((r) => setTimeout(r, 1500))
    return startBot('manual')
  }

  async function saveBotAccess(payload) {
    const { text } = botPatch()
    if (!text) return { ok: false, message: `读不到配置：${botPatchPath}` }
    const current = parseAccessYaml(text)
    const c2cMode = QQ_ACCESS_MODES.includes(payload.c2cMode) ? payload.c2cMode : current.c2cMode
    const groupMode = QQ_ACCESS_MODES.includes(payload.groupMode) ? payload.groupMode : current.groupMode
    const c2cAllow = splitIds(payload.c2cAllow ?? current.c2cAllow)
    const groupAllow = splitIds(payload.groupAllow ?? current.groupAllow)
    const bad = [...c2cAllow, ...groupAllow].filter((id) => !validId(id))
    if (bad.length) return { ok: false, message: `这些 ID 格式不对：${bad.join('、')}` }

    const next = { c2cMode, c2cAllow, groupMode, groupAllow }
    const patched = replaceAccessBlock(text, next)
    if (patched === null) return { ok: false, message: '配置里没有 access: 块，没敢动；请手动检查' }

    try {
      const backup = `${botPatchPath}.bak-${Date.now()}`
      writeFileSync(backup, text, 'utf8')
      writeFileSync(botPatchPath, patched, 'utf8')
      // 同步一份到 DS-AI\config，保持「配置源」和「profile 实际配置」一致
      try {
        const sourceText = readText(botPatchSource)
        if (sourceText) {
          const sourcePatched = replaceAccessBlock(sourceText, next)
          if (sourcePatched !== null) writeFileSync(botPatchSource, sourcePatched, 'utf8')
        }
      } catch {
        /* 源副本同步失败不阻塞 */
      }
      log(`大肥鱼白名单已更新：私聊 ${next.c2cMode}/${c2cAllow.length} 个，群聊 ${next.groupMode}/${groupAllow.length} 个。`)
      return { ok: true, message: '已写入配置，重启大肥鱼后生效', restartRequired: true, access: next, backup }
    } catch (error) {
      return { ok: false, message: `写配置失败：${String((error && error.message) || error)}` }
    }
  }

  function saveGroupConfig(payload) {
    const current = readJson(groupJsonPath, {})
    const next = {
      ...current,
      group_number: String(payload.groupNumber ?? current.group_number ?? '').trim(),
      group_openid: String(payload.groupOpenid ?? current.group_openid ?? '').trim(),
    }
    if (next.group_openid && !validId(next.group_openid)) return { ok: false, message: 'group openid 格式不对' }
    if (!writeJson(groupJsonPath, next)) return { ok: false, message: '写 config\\group.json 失败' }
    log('群配置已更新。')
    return { ok: true, message: '群配置已保存' }
  }

  async function qqToken() {
    const { text } = botPatch()
    const { appId, appSecret } = parseCredentials(text)
    if (!appId || !appSecret) throw new Error('配置里没有 appId / appSecret，先让大肥鱼扫码绑定')
    const response = await fetch(`${QQ_BASE}/app/getAppAccessToken`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ appId, clientSecret: appSecret }),
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok || !body.access_token) throw new Error(`取 token 失败 HTTP ${response.status}：${JSON.stringify(body).slice(0, 200)}`)
    return body.access_token
  }

  async function qqSend(target, id, content) {
    const text = String(content || '').trim()
    if (!text) return { ok: false, message: '内容为空' }
    if (!id) return { ok: false, message: `没有 ${target === 'group' ? '群 openid' : '私聊 openid'}` }
    const clipped = text.length > 1800 ? `${text.slice(0, 1780)}\n…（已截断）` : text
    try {
      const token = await qqToken()
      const path = target === 'group' ? `/v2/groups/${encodeURIComponent(id)}/messages` : `/v2/users/${encodeURIComponent(id)}/messages`
      const response = await fetch(`${QQ_BASE}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `QQBot ${token}` },
        body: JSON.stringify({ content: clipped, msg_type: 0, msg_seq: Math.floor(Math.random() * 1_000_000) }),
      })
      const body = await response.json().catch(() => ({}))
      state.botLastPush = `${nowText()} → ${target} ${id}：${response.ok ? '成功' : `失败 ${response.status}`}`
      log(`QQ 推送${response.ok ? '成功' : '失败'}（${target} ${id}）。`)
      if (!response.ok) return { ok: false, message: `HTTP ${response.status}：${JSON.stringify(body).slice(0, 200)}` }
      return { ok: true, message: '已发送', result: body }
    } catch (error) {
      const message = String((error && error.message) || error)
      state.botLastPush = `${nowText()} → ${target} ${id}：失败 ${message}`
      log(`QQ 推送失败：${message}`)
      return { ok: false, message }
    }
  }

  /** 流水线异常时顺手给主人私聊发一条（不阻塞主流程）。 */
  function qqSendC2C(text) {
    const { text: patchText } = botPatch()
    const access = parseAccessYaml(patchText)
    const owner = access.c2cAllow[0]
    if (!owner) return
    qqSend('c2c', owner, text).catch(() => {})
  }

  /* ---------- 设置 ---------- */

  function saveSettings() {
    writeJson(settingsPath, settings)
  }

  function setSetting(key, value) {
    if (!(key in DEFAULT_SETTINGS)) return { ok: false, message: `未知设置项：${key}` }
    if (key === 'auto' || key === 'restartOnFailure' || key === 'notify' || key === 'botAuto' || key === 'qqNotify' || key === 'optimizer' || key === 'scout') {
      settings[key] = Boolean(value)
    } else if (key === 'intervalSeconds' || key === 'restartSeconds') {
      const n = Number(value)
      settings[key] = Number.isFinite(n) && n > 0 ? Math.round(n) : DEFAULT_SETTINGS[key]
    } else if (key === 'idleThreshold') {
      const n = Number(value)
      settings[key] = Number.isFinite(n) ? Math.min(0.9, Math.max(0.05, n)) : DEFAULT_SETTINGS[key]
    } else if (key === 'expandTasks') {
      const n = Number(value)
      settings[key] = Number.isFinite(n) ? Math.min(8, Math.max(1, Math.round(n))) : DEFAULT_SETTINGS[key]
    } else {
      settings[key] = String(value)
    }
    if (key === 'auto' && settings.auto) {
      state.suppressed = false
      state.lastSupervised = 0 // 立刻巡检一次，不用等满一个间隔
      log('自动守护已开启。')
    } else if (key === 'auto') {
      clearRestartTimer()
      log('自动守护已关闭。')
    } else if (key === 'botAuto' && settings.botAuto) {
      state.botSuppressed = false
      log('大肥鱼自动守护已开启。')
    } else if (key === 'botAuto') {
      log('大肥鱼自动守护已关闭。')
    }
    saveSettings()
    return { ok: true, message: '已保存' }
  }

  /* ---------- 巡检 ---------- */

  function refreshDshCount(force = false) {
    const now = Date.now()
    if (!force && now - state.dshCountAt < 15000) return
    if (force && now - state.dshCountAt < 2000) return
    state.dshCountAt = now
    const ps = "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'dsh\\.cmd' -and $_.CommandLine -match '--profile' } | ForEach-Object { if ($_.CommandLine -match '--profile\\s+([\\w-]+)') { $matches[1] } }"
    if (force) {
      try {
        const stdout = execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], { windowsHide: true, timeout: 15000, encoding: 'utf8' })
        const byProfile = {}
        for (const line of String(stdout || '').split(/\r?\n/)) {
          const p = line.trim()
          if (p) byProfile[p] = (byProfile[p] || 0) + 1
        }
        state.dshByProfile = byProfile
        state.dshCount = Object.values(byProfile).reduce((a, b) => a + b, 0)
        return
      } catch {
        /* fall back to async refresh */
      }
    }
    execFile('powershell.exe', ['-NoProfile', '-Command', ps], { windowsHide: true, timeout: 15000 }, (error, stdout) => {
      if (error) return
      const byProfile = {}
      for (const line of String(stdout || '').split(/\r?\n/)) {
        const p = line.trim()
        if (p) byProfile[p] = (byProfile[p] || 0) + 1
      }
      state.dshByProfile = byProfile
      state.dshCount = Object.values(byProfile).reduce((a, b) => a + b, 0)
    })
  }

  function autoAllocate() {
    const plan = readJson(join(root, 'tools', 'ai_plan.json'), {})
    const cfg = readJson(join(root, 'tools', 'dsh_config.json'), {})
    const keys = Object.keys(cfg.amd_api_keys || {}).length
    const models = (cfg.models || []).length || 4
    const perCombo = Number(cfg.per_combo_concurrency) || 4
    const poolMax = keys * models * perCombo
    const quotas = plan.quotas || {}
    const quotaTotal = Object.values(quotas).reduce((a, b) => a + (Number(b) || 0), 0)
    const target = Math.max(1, Math.ceil(quotaTotal * 0.8))
    const ai = readJson(join(artDir, '_relay', 'art_ai_status.json'), {})
    const live = readJson(join(freeRelayDir(), 'par', 'live.json'), {})
    const liveFresh = live && Date.now() / 1000 - (Number(live.updated) || 0) < 120
    const liveActive = liveFresh ? Math.max(0, Number(live.active) || 0) : 0
    const actual =
      (pipelineRunning().alive ? Math.max(1, liveActive) : 0) +
      (mapTask().state === 'running' ? 1 : 0) +
      (artTask().state === 'running' ? 1 : 0) +
      (ai.state === 'running' ? ai.workers || 0 : 0) +
      (balanceTask().state === 'running' ? 1 : 0)
    const imageOk = Boolean(cfg.image2_api_key || process.env.IMAGE2_API_KEY)
    let action = 'none'
    let reason = '占用已达目标，不做调整'
    if (actual < target) {
      // 优先级：代码 > 地图 > 平衡；平衡任务也算实际占用。
      if (!pipelineRunning().alive) {
        action = 'code-pipeline'
        reason = '代码流水线未在跑，优先补代码'
      } else if (mapTask().state !== 'running') {
        action = 'map-analyze'
        reason = '代码已在跑，转地图分析补占用'
        if (Date.now() - state.allocAt > 600000) {
          state.allocAt = Date.now()
          try {
            spawn(settings.python || 'python', ['-X', 'utf8', join(mapDir, 'ai_workers.py'), '--mode', 'map', '--workers', '4'], {
              cwd: mapDir,
              windowsHide: true,
              stdio: 'ignore',
            }).on('error', () => {})
            log('自动调度：启动地图 AI 分析补占用')
          } catch (error) {
            reason += `（启动失败：${String((error && error.message) || error)}）`
          }
        }
      } else if (balanceTask().state !== 'running') {
        action = 'balance-loop'
        reason = '代码/地图已在跑，用平衡任务补占用'
        if (Date.now() - state.balanceAt > 600000) {
          state.balanceAt = Date.now()
          startBalanceTask()
        }
      }
    }
    state.alloc = { target, actual, poolMax, action, reason, imageOk }
  }

  function tick() {
    const interval = Math.max(5, Number(settings.intervalSeconds) || 30) * 1000
    const now = Date.now()
    if (now - state.lastSupervised < interval) return
    state.lastSupervised = now
    refreshDshCount()
    autoAllocate()

    // 每 6 小时自动清一次「超过 12 小时没动」的检测/审批会话；默认关闭，需在设置里显式打开。
    if (settings.sessionGc === true && now - (state.lastGc || 0) > 6 * 3600 * 1000) {
      try {
        const result = cleanupSessions({ apply: true, minAgeMinutes: 720 })
        if (result.count) log(`自动会话清理：移动 ${result.count} 个检测/审批会话到 _trash`)
      } catch (error) {
        log(`自动会话清理失败：${String((error && error.message) || error)}`)
      }
    }

    // 流水线
    if (settings.auto && !state.suppressed && !stopFlag() && !state.child) {
      const running = pipelineRunning()
      if (!running.alive) startPipeline('auto')
    }

    // 地图 / 贴图 / 平衡：持续工作流；跑完一次后冷却 10 分钟，避免每 30 秒重复拉起
    if (settings.mapAuto && mapTask().state !== 'running' && now - (state.mapAt || 0) > 600000) {
      state.mapAt = now
      startMapTask()
    }
    if (settings.artAuto && artTask().state !== 'running' && now - (state.artAt || 0) > 600000) {
      state.artAt = now
      startArtTask()
    }
    if (settings.balanceAuto && balanceTask().state !== 'running' && now - (state.balanceAt || 0) > 600000) {
      state.balanceAt = now
      startBalanceTask()
    }

    // 大肥鱼：掉线自动拉起
    if (settings.botAuto && !state.botSuppressed) {
      listBotProcesses()
        .then((pids) => {
          if (pids.length === 0) startBot('auto')
        })
        .catch(() => {})
    }
  }

  /* ---------- HTTP ---------- */

  function readBody(req) {
    return new Promise((resolveBody, rejectBody) => {
      let size = 0
      const chunks = []
      req.on('data', (chunk) => {
        size += chunk.length
        if (size > MAX_BODY) {
          rejectBody(new Error('请求体过大'))
          req.destroy()
          return
        }
        chunks.push(chunk)
      })
      req.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        if (!text) return resolveBody({})
        try {
          resolveBody(JSON.parse(text))
        } catch {
          rejectBody(new Error('请求体不是合法 JSON'))
        }
      })
      req.on('error', rejectBody)
    })
  }

  function sendJson(res, code, value) {
    try {
      const body = Buffer.from(JSON.stringify(value), 'utf8')
      res.statusCode = code
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.setHeader('cache-control', 'no-store')
      res.end(body)
    } catch {
      try {
        res.statusCode = 500
        res.end()
      } catch {
        /* ignore */
      }
    }
  }

  async function perform(payload) {
    const type = payload && payload.type
    if (type === 'start') {
      state.suppressed = false
      return { ...startPipeline('manual'), status: snapshot() }
    }
    if (type === 'stop') return { ...stopGraceful(), status: snapshot() }
    if (type === 'clear-stop') return { ...clearStop(), status: snapshot() }
    if (type === 'kill') return { ...killManaged(), status: snapshot() }
    if (type === 'setting') return { ...setSetting(payload.key, payload.value), status: snapshot() }
    if (type === 'map-start') return { ...startMapTask(), status: snapshot() }
    if (type === 'map-stop') return { ...stopMapTask(), status: snapshot() }
    if (type === 'art-start') return { ...startArtTask(), status: snapshot() }
    if (type === 'art-stop') return { ...stopArtTask(), status: snapshot() }
    if (type === 'self-check') {
      try {
        spawn(settings.python || 'python', ['-X', 'utf8', join(root, 'tools', 'self_check.py')], {
          cwd: root, windowsHide: true, stdio: 'ignore', detached: true,
        }).unref()
        return { ok: true, status: snapshot() }
      } catch (e) {
        return { ok: false, message: String(e && e.message ? e.message : e), status: snapshot() }
      }
    }
    if (type === 'asset-index' || type === 'github-search' || type === 'github-mods') {
      try {
        const script = type === 'asset-index' ? 'asset_index.py' : type === 'github-mods' ? 'github_mods.py' : 'github_maps.py'
        const args = type === 'asset-index' ? [] : type === 'github-mods' ? [] : ['--search']
        spawn(settings.python || 'python', ['-X', 'utf8', join(root, 'tools', script), ...args], {
          cwd: root, windowsHide: true, stdio: 'ignore', detached: true,
        }).unref()
        return { ok: true, status: snapshot() }
      } catch (e) {
        return { ok: false, message: String(e && e.message ? e.message : e), status: snapshot() }
      }
    }
    if (type === 'free-scout') {
      try {
        spawn(settings.python || 'python', ['-X', 'utf8', join(root, 'tools', 'free_pool_scout.py')], {
          cwd: root, windowsHide: true, stdio: 'ignore', detached: true,
        }).unref()
        return { ok: true, status: snapshot() }
      } catch (e) {
        return { ok: false, message: String(e && e.message ? e.message : e), status: snapshot() }
      }
    }
    if (type === 'scout-run') {
      try {
        spawn(settings.python || 'python', ['-X', 'utf8', join(root, 'tools', 'free_pool_scout.py')], {
          cwd: root, windowsHide: true, stdio: 'ignore', detached: true,
        }).unref()
        return { ok: true, status: snapshot() }
      } catch (e) {
        return { ok: false, message: String(e && e.message ? e.message : e), status: snapshot() }
      }
    }
    if (type === 'optimizer-run') {
      try {
        spawn(settings.python || 'python', ['-X', 'utf8', join(root, 'tools', 'scheduler_optimizer.py'), '--paid-fallback'], {
          cwd: root, windowsHide: true, stdio: 'ignore', detached: true,
        }).unref()
        return { ok: true, status: snapshot() }
      } catch (e) {
        return { ok: false, message: String(e && e.message ? e.message : e), status: snapshot() }
      }
    }
    if (type === 'hub-task') {
      try {
        const result = await taskAction(payload.id, String(payload.op || 'status'))
        return { ...result, status: snapshot() }
      } catch (error) {
        return { ok: false, message: String((error && error.message) || error) }
      }
    }
    if (type === 'code-dispatch') {
      try {
        const result = await runFreeCode(payload.task, payload.cwd, payload.minutes)
        return { ...result, status: snapshot() }
      } catch (error) {
        return { ok: false, message: String((error && error.message) || error) }
      }
    }
    if (type === 'session-cleanup') {
      try {
        const result = cleanupSessions({ apply: payload.apply === true, minAgeMinutes: payload.minAgeMinutes })
        return { ...result, status: snapshot() }
      } catch (error) {
        return { ok: false, message: String((error && error.message) || error) }
      }
    }
    if (type === 'session-delete') {
      try {
        return { ...deleteOneSession(String(payload.sessionId || '')), status: snapshot() }
      } catch (error) {
        return { ok: false, message: String((error && error.message) || error) }
      }
    }
    if (type === 'restrictions-save') {
      try {
        const raw = String(payload.text || '')
        const parsed = JSON.parse(raw)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return { ok: false, message: '必须是一个 JSON 对象' }
        }
        if (!parsed.units || typeof parsed.units !== 'object' || Array.isArray(parsed.units)) parsed.units = {}
        writeFileSync(join(balanceDir, '限制标注.json'), JSON.stringify(parsed, null, 2), 'utf8')
        spawn(settings.python || 'python', ['-X', 'utf8', join(balanceDir, 'balance_sim.py')], {
          cwd: balanceDir,
          windowsHide: true,
          stdio: 'ignore',
        }).on('error', () => {})
        log('已更新限制标注，开始重算平衡')
        return { ok: true, message: '已保存并开始重算', status: snapshot() }
      } catch (error) {
        return { ok: false, message: 'JSON 格式不对：' + String((error && error.message) || error) }
      }
    }
    if (type === 'balance-loop-start') {
      return { ...startBalanceTask(), status: snapshot() }
    }
    if (type === 'balance-loop-stop') {
      return { ...stopBalanceTask(), status: snapshot() }
    }
    if (type === 'balance-run') {
      try {
        const py = settings.python || 'python'
        spawn(py, ['-X', 'utf8', join(balanceDir, 'balance_sim.py')], { cwd: balanceDir, windowsHide: true, stdio: 'ignore' }).on('error', () => {})
        spawn(py, ['-X', 'utf8', join(mapDir, 'map_design.py')], { cwd: mapDir, windowsHide: true, stdio: 'ignore' }).on('error', () => {})
        log('重新计算关联平衡 / 设计平衡…')
        return { ok: true, message: '已开始重新计算（约 1–2 分钟）', status: snapshot() }
      } catch (error) {
        return { ok: false, message: String((error && error.message) || error) }
      }
    }
    if (type === 'bot-start') return { ...(await startBot('manual')), status: await withBotPids() }
    if (type === 'bot-stop') return { ...(await stopBot()), status: await withBotPids() }
    if (type === 'bot-restart') return { ...(await restartBot()), status: await withBotPids() }
    if (type === 'bot-access') return { ...(await saveBotAccess(payload)), status: await withBotPids() }
    if (type === 'bot-group') return { ...saveGroupConfig(payload), status: await withBotPids() }
    if (type === 'bot-push') {
      const result = await qqSend(payload.target === 'c2c' ? 'c2c' : 'group', String(payload.id || ''), payload.text)
      return { ...result, status: await withBotPids() }
    }
    return { ok: false, message: `未知操作：${String(type)}` }
  }

  async function withBotPids() {
    return snapshotWith(await botPidsCached())
  }

  function snapshotWith(pids) {
    const base = snapshot()
    base.bot = botSnapshot(pids)
    return base
  }

  /**
   * 往指定会话里投递一条用户消息（走宿主 agents 服务，等于用户自己发的）。
   * 会话不在内存里就先 resume，再 followup。
   */
  async function injectMessage(payload) {
    const sessionId = String((payload && payload.sessionId) || '').trim()
    const text = String((payload && payload.text) || '')
    if (!sessionId) throw new Error('缺少 sessionId')
    if (!text.trim()) throw new Error('缺少 text')
    const agents = ctx.agents
    if (!agents) throw new Error('agents 服务不可用')
    let live = null
    let resumed = false
    try {
      live = agents.get(sessionId)
    } catch {
      live = null
    }
    if (!live) {
      // resume 必须把 agent preset 一起挂回来，否则恢复出的是空壳 agent，followup 会被吞成空回合。
      const extra = await presetResumeOptions()
      const result = await agents.resume({ resumeSessionId: sessionId, ...extra })
      live = (result && result.agent) || result
      resumed = true
    }
    if (!live || typeof live.followup !== 'function') throw new Error('会话不可用：followup 不存在')
    if (resumed) {
      // 刚 resume 的会话会先空转一个 turn，这期间 followup 会被吞。
      // 先等它把空回合跑完（whenIdle），再多等一拍，然后才投递。
      await new Promise((resolve) => setTimeout(resolve, 4000))
      try {
        if (typeof live.whenIdle === 'function') await live.whenIdle()
      } catch {
        /* 忽略 */
      }
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
    const attempts = []
    for (const [label, build] of await messageShapes(text)) {
      let message
      try {
        message = await build()
      } catch (error) {
        attempts.push(`${label}: build失败 ${String((error && error.message) || error)}`)
        continue
      }
      let delivered = false
      try {
        const countUsers = () => {
          try {
            return readSessionEvents(sessionId).events.filter((e) => e && e.type === 'user/message').length
          } catch {
            return -1
          }
        }
        const before = countUsers()
        await live.followup(message)
        delivered = true
        let verified = false
        for (let i = 0; i < 12; i++) {
          await new Promise((resolve) => setTimeout(resolve, 1500))
          const now = countUsers()
          if (before >= 0 && now > before) {
            verified = true
            break
          }
        }
        if (!verified) {
          throw new Error(`followup 已调用（${label}）但 15 秒内会话日志里没有新 user/message，消息很可能被吞了（resume=${resumed}）`)
        }
        log(`注入消息 -> ${sessionId}（${label}，${text.length} 字，resume=${resumed}，已校验）`)
        return { ok: true, sessionId, chars: text.length, resumed, shape: label, verified: true }
      } catch (error) {
        if (delivered) throw error
        attempts.push(`${label}: ${String((error && error.message) || error)}`)
      }
    }
    throw new Error(`所有消息形态都被拒：${attempts.join(' | ')}`)
  }

  /** 取会话用的 agent preset（cordis），给 resume 拼 agentPreset + setup。 */
  async function presetResumeOptions() {
    try {
      const presets = typeof ctx.get === 'function' ? ctx.get('agentPresets') : null
      if (!presets) return {}
      const resolved = await presets.resolve('cordis')
      const id = resolved && resolved.id ? resolved.id : 'cordis'
      return {
        agentPreset: id,
        agentOptions: { provider: 'deepseek-account', model: 'deepseek-flash' },
        setup: async (agentCtx) => {
          await presets.mount(agentCtx, id)
        },
      }
    } catch (error) {
      log(`preset 解析失败：${String((error && error.message) || error)}`)
      return {}
    }
  }

  /** 依次给出候选的消息对象构造方式，让调用方逐个试。 */
  async function messageShapes(text) {
    const content = [{ type: 'text', text }]
    const shapes = []
    shapes.push(['dsh-llm.createUserMessage', async () => {
      const llm = await import('@deepseek-ai/dsh-llm')
      if (typeof llm.createUserMessage !== 'function') throw new Error('没有 createUserMessage')
      return llm.createUserMessage({ content, source: { kind: 'user' } })
    }])
    shapes.push(['plain{id,role,content,source}', async () => ({ id: newUserId(), role: 'user', content, source: { kind: 'user' } })])
    shapes.push(['plain{role,content,source}', async () => ({ role: 'user', content, source: { kind: 'user' } })])
    shapes.push(['plain{content,source}', async () => ({ content, source: { kind: 'user' } })])
    shapes.push(['string', async () => text])
    return shapes
  }

  /** 内核要求 user message 带唯一 id，缺了会在会话校验时报「lacks an identified message」。 */
  function newUserId() {
    try {
      if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID()
    } catch {
      /* 退化 */
    }
    return `inj-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
  }

  /* ---------- 会话查询 / 导出（给 QQ 侧用） ---------- */

  function sessionsRoot() {
    return join(process.env.USERPROFILE || '', '.dsh', 'sessions')
  }

  function decodeSessionLog(buf) {
    // 会话日志是「多帧 zstd 拼接」，zstdDecompressSync 只解第一帧，所以按 magic 拆帧。
    const magic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
    let start = buf.indexOf(magic)
    if (start < 0) throw new Error('不是 zstd 文件（找不到 magic）')
    let out = ''
    let frames = 0
    while (start >= 0) {
      const next = buf.indexOf(magic, start + 4)
      const part = buf.subarray(start, next < 0 ? buf.length : next)
      try {
        out += zstdDecompressSync(part).toString('utf8')
        frames++
      } catch (error) {
        if (frames === 0) throw error
        break
      }
      start = next
    }
    return out
  }

  function listSessions() {
    const root = sessionsRoot()
    if (!existsSync(root)) throw new Error(`会话目录不存在：${root}`)
    const items = []
    for (const ws of readdirSync(root)) {
      const wsDir = join(root, ws)
      let sids = []
      try {
        sids = readdirSync(wsDir)
      } catch {
        continue
      }
      for (const sid of sids) {
        const dir = join(wsDir, sid)
        if (!sid.startsWith('session-')) continue
        let size = 0
        let mtime = 0
        try {
          for (const f of readdirSync(dir)) {
            const st = statSync(join(dir, f))
            size += st.size
            if (st.mtimeMs > mtime) mtime = st.mtimeMs
          }
        } catch {
          continue
        }
        const cache = readJson(join(process.env.USERPROFILE || '', '.dsh', 'storages', 'session_projcache', 'sessions', `${sid}.json`), {})
        let running = false
        try {
          running = Boolean(ctx.agents && ctx.agents.get(sid))
        } catch {
          running = false
        }
        items.push({
          sessionId: sid,
          workspace: ws,
          title: (cache.record && cache.record.title) || cache.title || cache.name || '',
          running,
          lastActive: mtime ? new Date(mtime).toISOString() : null,
          bytes: size,
        })
      }
    }
    items.sort((a, b) => String(b.lastActive).localeCompare(String(a.lastActive)))
    return items
  }

  function readSessionEvents(sessionId) {
    const root = sessionsRoot()
    for (const ws of readdirSync(root)) {
      const dir = join(root, ws, sessionId)
      if (!existsSync(dir)) continue
      const file = join(dir, 'session.v4.jsonl.zstd')
      if (!existsSync(file)) continue
      const text = decodeSessionLog(readFileSync(file))
      const events = []
      for (const line of text.split(/\r?\n/)) {
        const s = line.trim()
        if (!s) continue
        try {
          events.push(JSON.parse(s))
        } catch {
          /* 跳过坏行 */
        }
      }
      return { events, file, workspace: ws }
    }
    throw new Error(`找不到会话：${sessionId}`)
  }

  function exportSession(payload) {
    const sessionId = String((payload && payload.sessionId) || '').trim()
    if (!sessionId) throw new Error('缺少 sessionId')
    const from = Math.max(1, Number(payload.from) || 1)
    const to = Math.max(from, Number(payload.to) || from)
    const { events, workspace } = readSessionEvents(sessionId)
    const turns = []
    let current = null
    for (const ev of events) {
      const t = ev && ev.type
      if (t === 'turn/start') {
        current = { user: [], assistant: [] }
        turns.push(current)
        continue
      }
      if (!current) continue
      const content = ev && ev.data && Array.isArray(ev.data.content) ? ev.data.content : []
      const text = content.map((c) => (c && c.type === 'text' ? c.text : '')).filter(Boolean).join('\n')
      if (!text) continue
      if (t === 'user/message') current.user.push(text)
      if (t === 'assistant/message') current.assistant.push(text)
    }
    const picked = turns.slice(from - 1, to)
    if (!picked.length) throw new Error(`轮次范围 ${from}-${to} 没有内容（会话共 ${turns.length} 轮）`)
    const title = (events.find((e) => e && e.type === 'session/title' && e.data && e.data.title) || {}).data || {}
    const outDir = join(root, '..', '任务', 'qqbot', 'exports')
    mkdirSync(outDir, { recursive: true })
    const outFile = String(payload.out || '').trim() || join(outDir, `${sessionId}-t${from}-${to}.md`)
    mkdirSync(dirname(outFile), { recursive: true })
    const lines = [`# ${title.title || sessionId}`, '', `> 会话：${sessionId}`, `> 工作区：${workspace}`, `> 轮次：${from}-${to} / 共 ${turns.length}`, '']
    picked.forEach((turn, i) => {
      lines.push(`## 第 ${from + i} 轮`, '')
      if (turn.user.length) lines.push('**你**：', '', turn.user.join('\n\n'), '')
      if (turn.assistant.length) lines.push('**助手**：', '', turn.assistant.join('\n\n'), '')
    })
    writeFileSync(outFile, lines.join('\n'), 'utf8')
    log(`导出会话 ${sessionId} 轮次 ${from}-${to} → ${outFile}`)
    return { ok: true, path: outFile, turns: picked.length, totalTurns: turns.length }
  }

  /* ---------- 会话清理（守护台自己的 GC） ---------- */

  // 只清「任务目录」里由 headless 流水线 / 检测 / 审批自动产生的会话。
  // ds工作区 主目录和 tools 的对话当核心对话保留。
  const AUTO_CWD_MARKERS = [
    '\\任务\\代码\\01_查问题',
    '\\任务\\代码\\02_修改',
    '\\任务\\地图\\地图项目',
    '\\任务\\平衡\\平衡项目',
    '\\任务\\贴图\\贴图项目',
    '\\ds工作区\\01_查问题',
  ]
  let sessionScanCache = { at: 0, value: null }

  /** 只读会话文件第一帧，拿到 header（cwd 等），不解析整份日志。 */
  function sessionHeader(dir) {
    try {
      const buf = Buffer.alloc(8192)
      const fd = openSync(join(dir, 'session.v4.jsonl.zstd'), 'r')
      let n = 0
      try {
        n = readSync(fd, buf, 0, buf.length, 0)
      } finally {
        closeSync(fd)
      }
      const head = buf.subarray(0, n)
      const magic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
      const next = head.indexOf(magic, 4)
      const text = zstdDecompressSync(head.subarray(0, next > 0 ? next : head.length)).toString('utf8')
      const line = text.split('\n').find((s) => s.trim())
      return line ? JSON.parse(line) : null
    } catch {
      return null
    }
  }

  const ONESHOT_PROMPT = /^\s*(你是|请作为|请扮演|扮演|【|铁锈战争|This is a|You are|审计|校对|修复|复查|检测|描述审计|角色[:：]|\[Chat history begins\])/
  const ONESHOT_CWD = ['01_查问题', '02_修改', '_relay']

  /** 从投影缓存读标题 / 首个提问 / 轮次数（不打开会话日志正文）。 */
  function projectionRow(sid) {
    const row = readJson(join(process.env.USERPROFILE || '', '.dsh', 'storages', 'session_projcache', 'sessions', `${sid}.json`), {})
    const rows = (((row || {}).record || {}).rows) || {}
    const val = (key) => ((rows[key] || {}).val)
    const first = (((val('titleInput') || {}).first) || {})
    return {
      title: String(val('title') || ''),
      prompt: String(first.text || ''),
      turns: Array.isArray((val('turnOutline') || {}).turns) ? val('turnOutline').turns.length : 0,
    }
  }

  /**
   * 核心对话 vs 一次性（流水线/检测/审批/子代理）：
   * 任务目录里的、开场白是角色提示词的、无标题单轮的都当一次性。
   */
  function classifySession(sid, cwd) {
    const row = projectionRow(sid)
    const base = String(cwd || '').split('\\').pop() || ''
    if (AUTO_CWD_MARKERS.some((marker) => String(cwd || '').includes(marker)) || ONESHOT_CWD.some((hint) => base.includes(hint))) {
      return { auto: true, why: `cwd=${base}`, ...row }
    }
    if (ONESHOT_PROMPT.test(row.prompt)) return { auto: true, why: '角色提示词', ...row }
    if (row.title) return { auto: false, why: '有标题', ...row }
    if (row.turns >= 3) return { auto: false, why: `${row.turns} 轮`, ...row }
    // 没标题也没角色提示词：宁可保留，不误删用户对话。
    return { auto: false, why: '无标题但保留', ...row }
  }

  function sessionRunning(id) {
    try {
      return Boolean(ctx.agents && ctx.agents.get(id))
    } catch {
      return false
    }
  }

  function collectSessions(rootDir, archived) {
    const items = []
    let workspaces = []
    try {
      workspaces = readdirSync(rootDir)
    } catch {
      return items
    }
    for (const ws of workspaces) {
      if (ws.startsWith('_')) continue
      let sids = []
      try {
        sids = readdirSync(join(rootDir, ws))
      } catch {
        continue
      }
      for (const sid of sids) {
        if (!sid.startsWith('session-')) continue
        const dir = join(rootDir, ws, sid)
        let st
        try {
          st = statSync(dir)
        } catch {
          continue
        }
        if (!st.isDirectory()) continue
        const header = sessionHeader(dir)
        const cwd = (header && header.cwd) || ''
        const kind = classifySession(sid, cwd)
        let bytes = 0
        try {
          for (const f of readdirSync(dir)) {
            try {
              bytes += statSync(join(dir, f)).size
            } catch {
              /* ignore */
            }
          }
        } catch {
          /* ignore */
        }
        items.push({
          sessionId: sid,
          workspace: ws,
          dir,
          cwd,
          archived,
          auto: kind.auto,
          why: kind.why,
          title: kind.title,
          turns: kind.turns,
          mtime: st.mtimeMs,
          bytes,
          running: sessionRunning(sid),
        })
      }
    }
    return items
  }

  function scanSessions(force) {
    if (!force && sessionScanCache.value && Date.now() - sessionScanCache.at < 30000) return sessionScanCache.value
    const root = sessionsRoot()
    const items = [...collectSessions(root, false), ...collectSessions(join(root, '_archived'), true)]
    sessionScanCache = { at: Date.now(), value: items }
    return items
  }

  function sessionsInfo() {
    const all = scanSessions()
    const live = all.filter((s) => !s.archived)
    return {
      total: live.length,
      archived: all.length - live.length,
      core: live.filter((s) => !s.auto).length,
      auto: live.filter((s) => s.auto).length,
      autoBytes: live.filter((s) => s.auto).reduce((a, s) => a + s.bytes, 0),
      lastGc: state.lastGc ? new Date(state.lastGc).toISOString() : null,
      note: '检测/审批会话清到 _trash，不直接删；核心对话保留。',
    }
  }

  function workspaceFile() {
    return join(process.env.USERPROFILE || '', '.dsh', 'storages', 'workspace.json')
  }

  /**
   * 更新 workspace.json：去掉已清会话，并把保留会话归回 cwd 对应的工作区。
   * 必须写 UTF-8 无 BOM：DSH 用 JSON.parse(readFile(..., 'utf8')) 读它，带 BOM 会让
   * workspaceController 启动失败（gateway/service-unavailable）。写前留一份备份。
   */
  function repairWorkspace(removedIds, kept) {
    const file = workspaceFile()
    try {
      const data = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
      const removed = new Set(removedIds)
      data.global = data.global || {}
      data.global.archivedSessionIds = (data.global.archivedSessionIds || []).filter((id) => !removed.has(id))
      const workspaces = (data.tables && data.tables.workspaces) || {}
      const accounted = new Set()
      for (const ws of Object.values(workspaces)) {
        for (const id of ws.sessionIds || []) accounted.add(id)
      }
      for (const ws of Object.values(workspaces)) {
        ws.sessionIds = (ws.sessionIds || []).filter((id) => !removed.has(id))
        const path = String(ws.path || '')
        if (!path) continue
        for (const s of kept) {
          if (s.archived || s.auto) continue
          if (s.cwd !== path && !s.cwd.startsWith(`${path}\\`)) continue
          // 同一会话只能归属一个工作区，否则 workspace 注册表校验会判定不一致而启动失败。
          if (accounted.has(s.sessionId)) continue
          ws.sessionIds.push(s.sessionId)
          accounted.add(s.sessionId)
        }
      }
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      try {
        writeFileSync(`${file}.bak-sessiongc-${stamp}`, readFileSync(file, 'utf8'), 'utf8')
      } catch {
        /* ignore */
      }
      // 原子替换：先写临时文件再重命名，避免 DSH 在启动读取时读到写了一半的文件。
      const tmp = `${file}.tmp-${stamp}`
      writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
      renameSync(tmp, file)
      return true
    } catch (error) {
      log(`workspace.json 修复失败：${String((error && error.message) || error)}`)
      return false
    }
  }

  function trashRoot() {
    return join(sessionsRoot(), '_trash')
  }

  function moveSessionToTrash(item, stamp) {
    const dst = join(trashRoot(), stamp, item.workspace, item.sessionId)
    mkdirSync(dirname(dst), { recursive: true })
    renameSync(item.dir, dst)
    try {
      unlinkSync(join(process.env.USERPROFILE || '', '.dsh', 'storages', 'session_projcache', 'sessions', `${item.sessionId}.json`))
    } catch {
      /* ignore */
    }
    return dst
  }

  /**
   * 清检测/审批会话。
   * @param {object} options apply=true 才真的移动；否则只预览。
   */
  function cleanupSessions(options = {}) {
    const apply = options.apply === true
    const minAgeMinutes = Math.max(0, Number(options.minAgeMinutes ?? 1440))
    const now = Date.now()
    const all = scanSessions(true)
    // 正在跑、排队中、或已被调度器占用的会话一律不清
    const protectedIds = new Set()
    for (const file of [
      join(root, 'tools', 'autoscale_workers.json'),
      join(root, 'tools', 'scheduler_status.json'),
      join(root, '..', '任务', '代码', '02_修改', '_relay', 'fix_sessions.json'),
    ]) {
      const data = readJson(file, null)
      if (!data) continue
      if (Array.isArray(data)) {
        for (const x of data) if (x) protectedIds.add(String(x))
      } else if (data && typeof data === 'object') {
        for (const [k, v] of Object.entries(data)) {
          if (k.startsWith('lane-') && v && v.session_id) protectedIds.add(String(v.session_id))
          if (k === 'session_ids' && Array.isArray(v)) for (const x of v) if (x) protectedIds.add(String(x))
        }
        for (const slot of data.slots || []) if (slot && slot.session_id) protectedIds.add(String(slot.session_id))
      }
    }
    const targets = all.filter((s) => s.auto && !s.running && !protectedIds.has(String(s.sessionId)) && now - s.mtime > minAgeMinutes * 60000)
    const byCwd = {}
    for (const s of targets) byCwd[s.cwd || '(未知)'] = (byCwd[s.cwd || '(未知)'] || 0) + 1
    const result = {
      ok: true,
      dry: !apply,
      count: targets.length,
      byCwd,
      minAgeMinutes,
      samples: targets.slice(0, 12).map((s) => ({ sessionId: s.sessionId, cwd: s.cwd, mb: Math.round(s.bytes / 1048576) })),
    }
    if (!apply || targets.length === 0) return result
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const removed = []
    for (const item of targets) {
      try {
        moveSessionToTrash(item, stamp)
        removed.push(item.sessionId)
      } catch (error) {
        log(`会话移动失败 ${item.sessionId}：${String((error && error.message) || error)}`)
      }
    }
    // 不写 workspace.json：DSH 运行时写注册表会触发 workspaceController 不一致。
    // 需要修索引时停掉 DSH，跑 tools\session_tool.py repair-registry --apply。
    sessionScanCache = { at: 0, value: null }
    state.lastGc = Date.now()
    log(`会话清理：移动 ${removed.length} 个检测/审批会话到 _trash（未改 workspace.json）`)
    return { ...result, dry: false, count: removed.length, moved: removed.length, workspaceRepaired: false, registryTouched: false, trash: join(trashRoot(), stamp) }
  }

  function deleteOneSession(sessionId) {
    const target = scanSessions(true).find((s) => s.sessionId === sessionId)
    if (!target) throw new Error('找不到这个会话（可能已经清掉）')
    if (target.running) throw new Error('这个会话正在运行，不能删')
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    moveSessionToTrash(target, stamp)
    sessionScanCache = { at: 0, value: null }
    log(`删除会话 ${sessionId}（${target.cwd}，未改 workspace.json）`)
    return { ok: true, sessionId, workspaceRepaired: false, registryTouched: false }
  }

  /* ---------- 远程工具（DSH / QQ 大肥鱼共用） ---------- */

  const DESKTOP = join(process.env.USERPROFILE || '', 'Desktop')
  const TASK_ROOT = join(DESKTOP, '任务')
  const QQ_EXPORT = join(TASK_ROOT, 'qqbot', 'exports')
  const ALLOWED_ROOTS = [root, TASK_ROOT, DESKTOP, join(process.env.USERPROFILE || '', '.dsh')]

  function absAllowed(input) {
    const abs = resolve(String(input || ''))
    return ALLOWED_ROOTS.some((base) => abs === base || abs.startsWith(`${base}\\`) || abs.startsWith(`${base}/`))
  }

  function listPath(input) {
    const abs = resolve(String(input || root))
    if (!absAllowed(abs)) throw new Error(`路径不在允许范围：${abs}`)
    const st = statSync(abs)
    if (!st.isDirectory()) {
      return [{ name: abs.split(/[\\/]/).pop(), path: abs, dir: false, size: st.size, mtime: st.mtime.toISOString() }]
    }
    return readdirSync(abs)
      .slice(0, 200)
      .map((name) => {
        const p = join(abs, name)
        try {
          const s = statSync(p)
          return { name, path: p, dir: s.isDirectory(), size: s.size, mtime: s.mtime.toISOString() }
        } catch {
          return { name, path: p, dir: false, size: 0, mtime: null }
        }
      })
  }

  function readTextFile(input, max = 20000) {
    const abs = resolve(String(input || ''))
    if (!absAllowed(abs)) throw new Error(`路径不在允许范围：${abs}`)
    const text = readFileSync(abs, 'utf8')
    return { path: abs, chars: text.length, truncated: text.length > max, text: text.slice(0, max) }
  }

  function packagePaths(paths, name) {
    const list = (Array.isArray(paths) ? paths : [paths]).map((p) => resolve(String(p))).filter(Boolean)
    if (!list.length) throw new Error('没有要打包的路径')
    for (const p of list) {
      if (!absAllowed(p)) throw new Error(`路径不在允许范围：${p}`)
      if (!existsSync(p)) throw new Error(`路径不存在：${p}`)
    }
    mkdirSync(QQ_EXPORT, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const safe = String(name || 'package').replace(/[<>:"/\\|?*\s]+/g, '_').slice(0, 60)
    const out = join(QQ_EXPORT, `${safe}-${stamp}.zip`)
    const quoted = list.map((p) => `'${p.replace(/'/g, "''")}'`).join(',')
    const script = `Compress-Archive -LiteralPath ${quoted} -DestinationPath '${out.replace(/'/g, "''")}' -Force`
    return new Promise((resolveZip) => {
      const child = spawn('powershell.exe', ['-NoProfile', '-Command', script], { windowsHide: true, stdio: 'ignore' })
      child.on('error', (error) => resolveZip({ ok: false, message: String((error && error.message) || error) }))
      child.on('exit', (code) => {
        if (code !== 0) return resolveZip({ ok: false, message: `压缩失败 rc=${code}` })
        let size = 0
        try {
          size = statSync(out).size
        } catch {
          size = 0
        }
        resolveZip({ ok: true, path: out, size, files: list.length })
      })
    })
  }

  function refineSpecs(kind) {
    try {
      const child = spawn(settings.python || 'python', ['-X', 'utf8', join(root, 'tools', 'spec_refine.py'), '--kind', String(kind || 'all')], {
        cwd: root,
        windowsHide: true,
        stdio: 'ignore',
      })
      child.on('error', (error) => log(`规范优化启动失败：${String((error && error.message) || error)}`))
      log(`规范优化建议（${kind || 'all'}）…`)
      return { ok: true, message: '已开始生成规范优化建议', pid: child.pid }
    } catch (error) {
      return { ok: false, message: String((error && error.message) || error) }
    }
  }

  function testMod() {
    const script = join(TASK_ROOT, '代码', '02_修改', '交接包_1.45', 'tools', 'update_and_test.py')
    if (!existsSync(script)) return { ok: false, message: `找不到测试脚本：${script}` }
    try {
      const child = spawn(settings.python || 'python', ['-X', 'utf8', script], {
        cwd: dirname(script),
        windowsHide: true,
        stdio: 'ignore',
      })
      child.on('error', (error) => log(`模组测试启动失败：${String((error && error.message) || error)}`))
      log('启动模组测试（update_and_test.py）…')
      return { ok: true, message: '已启动模组测试', pid: child.pid }
    } catch (error) {
      return { ok: false, message: String((error && error.message) || error) }
    }
  }

  function taskControlSnapshot() {
    const now = Date.now()
    return (snapshot().tasks || []).map((t) => {      const updated = Date.parse(String(t.updated || '').replace(' ', 'T'))
      const staleMinutes = Number.isFinite(updated) ? Math.round((now - updated) / 60000) : null
      return {
        id: t.id,
        name: t.name,
        state: t.state,
        pid: t.pid || null,
        detail: t.detail || '',
        workers: t.workers || 0,
        keys: t.keys || 0,
        done: t.done || 0,
        total: t.total || 0,
        updated: t.updated || '',
        staleMinutes,
        stalled: staleMinutes !== null && staleMinutes > 10 && t.state === 'running',
      }
    })
  }

  function taskHistory() {
    const rows = readJson(join(root, 'tools', 'task_history.json'), [])
    return Array.isArray(rows) ? rows.slice(-100) : []
  }

  function recordTaskHistory(id, op, extra = {}) {
    const rows = taskHistory()
    rows.push({ at: nowText(), id: String(id || ''), op: String(op || ''), ...extra })
    writeJson(join(root, 'tools', 'task_history.json'), rows.slice(-500))
  }

  function taskControl(id, op) {
    const taskId = String(id || '')
    if (op === 'status') {
      const brief = taskControlSnapshot().find((t) => t.id === taskId)
      return brief ? { ok: true, task: brief, history: taskHistory().filter((x) => x.id === taskId).slice(-10) } : { ok: false, message: `没有这个任务：${taskId}` }
    }
    if (op === 'review' || op === 'approve') {
      recordTaskHistory(taskId, op, { note: op === 'approve' ? '审核通过' : '提交审核' })
      return { ok: true, action: op, task: taskId, history: taskHistory().filter((x) => x.id === taskId).slice(-10) }
    }
    if (op === 'takeover') {
      const stopped = taskAction(taskId, 'stop')
      writeJson(join(root, 'tools', 'paid_takeover.json'), {
        id: taskId,
        owner: 'paid',
        at: nowText(),
        note: 'paid takeover; finish then call resume to sync scheduler',
      })
      recordTaskHistory(taskId, 'takeover', { stopped })
      return { ok: true, action: 'takeover', task: taskId, stopped, status: taskControlSnapshot(), history: taskHistory().filter((x) => x.id === taskId).slice(-10) }
    }
    if (op === 'resume' || op === 'handoff') {
      try {
        unlinkSync(join(root, 'tools', 'paid_takeover.json'))
      } catch {
        /* ignore */
      }
      const started = taskAction(taskId, 'start')
      recordTaskHistory(taskId, op, { started })
      return { ok: true, action: op, task: taskId, started, status: taskControlSnapshot(), history: taskHistory().filter((x) => x.id === taskId).slice(-10) }
    }
    if (op === 'soft-stop' || op === 'stop') {
      const result = taskAction(taskId, 'stop')
      recordTaskHistory(taskId, op)
      return { ok: true, action: op, soft: op === 'soft-stop' && taskId === 'desc', result, status: taskControlSnapshot(), history: taskHistory().filter((x) => x.id === taskId).slice(-10) }
    }
    return { ok: false, message: `未知操作：${op}` }
  }

  function taskAction(id, action) {    const taskId = String(id || '')
    if (action === 'status') {
      const task = (snapshot().tasks || []).find((t) => t.id === taskId)
      return task ? { ok: true, task } : { ok: false, message: `没有这个任务：${taskId}` }
    }
    if (taskId === 'desc') {
      if (action === 'start') return startPipeline('manual')
      if (action === 'stop') return stopGraceful()
      if (action === 'clear-stop') return clearStop()
      if (action === 'restart') {
        const stopped = killManaged()
        setTimeout(() => startPipeline('manual'), 1500)
        return { ...stopped, message: '已结束，1.5 秒后重启' }
      }
    }
    if (taskId === 'map') {
      if (action === 'start') return startMapTask()
      if (action === 'stop') return stopMapTask()
      if (action === 'restart') {
        const stopped = stopMapTask()
        setTimeout(() => startMapTask(), 1500)
        return { ...stopped, message: '已结束，1.5 秒后重启' }
      }
      if (action === 'fix' || action === 'fix-dry') {
        try {
          const args = ['-X', 'utf8', join(mapDir, 'map_fix.py')]
          if (action === 'fix-dry') args.push('--dry')
          const child = spawn(settings.python || 'python', args, { cwd: mapDir, windowsHide: true, stdio: 'ignore' })
          child.on('error', (error) => log(`地图修复启动失败：${String((error && error.message) || error)}`))
          log(action === 'fix-dry' ? '地图修复 dry-run…' : '地图修复（按 map_fix_queue.json，改前自动备份）…')
          return { ok: true, message: action === 'fix-dry' ? '已开始 dry-run' : '已开始修复（有备份）', pid: child.pid }
        } catch (error) {
          return { ok: false, message: String((error && error.message) || error) }
        }
      }
      if (action === 'design') {
        try {
          const child = spawn(settings.python || 'python', ['-X', 'utf8', join(mapDir, 'map_design.py')], { cwd: mapDir, windowsHide: true, stdio: 'ignore' })
          child.on('error', (error) => log(`地图设计启动失败：${String((error && error.message) || error)}`))
          log('地图设计平衡分析…')
          return { ok: true, message: '已开始地图设计分析', pid: child.pid }
        } catch (error) {
          return { ok: false, message: String((error && error.message) || error) }
        }
      }
      if (action === 'ai-design') {
        const prompt = [
          '你是《铁锈战争》的地图设计师。请生成一张新的 3v3、400×400、非对称但公平的地图设计模型。',
          '只输出 JSON，字段：name、size、terrain_zones（草地/深水/水桥/山地/障碍及占比）、mines（主城/小队/争夺数量与分布）、',
          'spawns（6 个出生点坐标与到最近矿的距离）、fairness_notes（3 条）、test_checklist（5 条）。',
          '不要写代码，不要调用工具。',
        ].join('\n')
        return runFreeCode(prompt, mapDir, 10).then((result) => {
          if (result.ok && result.output) {
            try {
              writeFileSync(join(mapDir, '_relay', 'map_ai_design.json'), result.output, 'utf8')
            } catch {
              /* ignore */
            }
          }
          return result
        })
      }
      if (action === 'generate') {
        try {
          const child = spawn(settings.python || 'python', ['-X', 'utf8', join(mapDir, 'map_generate.py')], { cwd: mapDir, windowsHide: true, stdio: 'ignore' })
          child.on('error', (error) => log(`地图生成启动失败：${String((error && error.message) || error)}`))
          log('地图生成：4v4 / 5v5 PvE / 10p 混战设计…')
          return { ok: true, message: '已开始生成 4v4/5v5/10p 地图设计', pid: child.pid }
        } catch (error) {
          return { ok: false, message: String((error && error.message) || error) }
        }
      }
      if (action === 'editor') {
        try {
          const child = spawn(settings.python || 'python', ['-X', 'utf8', join(mapDir, 'map_distill.py')], { cwd: mapDir, windowsHide: true, stdio: 'ignore' })
          child.on('error', (error) => log(`地图蒸馏启动失败：${String((error && error.message) || error)}`))
          log('地图蒸馏：复制原版地形，重排出生点/触发器…')
          return { ok: true, message: '已开始蒸馏 31 张原版地形图', pid: child.pid }
        } catch (error) {
          return { ok: false, message: String((error && error.message) || error) }
        }
      }
      if (action === 'pve') {
        try {
          const child = spawn(settings.python || 'python', ['-X', 'utf8', join(mapDir, 'map_pve.py')], { cwd: mapDir, windowsHide: true, stdio: 'ignore' })
          child.on('error', (error) => log(`PvE 地图生成失败：${String((error && error.message) || error)}`))
          log('PvE 帝国围城：生成城墙城市 / AI 城市 / 定时增援…')
          return { ok: true, message: '已开始生成 PvE 地图', pid: child.pid }
        } catch (error) {
          return { ok: false, message: String((error && error.message) || error) }
        }
      }
      if (action === 'workflow') {
        try {
          const child = spawn(settings.python || 'python', ['-X', 'utf8', join(mapDir, 'map_workflow.py'), '--workers', '18', '--keys-used', '6'], { cwd: mapDir, windowsHide: true, stdio: 'ignore' })
          child.on('error', (error) => log(`地图工作流启动失败：${String((error && error.message) || error)}`))
          log('地图工作流：18 路并行审查/修复/汇总…')
          return { ok: true, message: '已启动地图工作流（18 路）', pid: child.pid }
        } catch (error) {
          return { ok: false, message: String((error && error.message) || error) }
        }
      }
    }
    if (taskId === 'art') {
      if (action === 'start') return startArtTask()
      if (action === 'stop') return stopArtTask()
    }
    if (taskId === 'balance') {
      if (action === 'start') return startBalanceTask()
      if (action === 'stop') return stopBalanceTask()
      if (action === 'restart') {
        const stopped = stopBalanceTask()
        setTimeout(() => startBalanceTask(), 1500)
        return { ...stopped, message: '已结束，1.5 秒后重启' }
      }
      if (action === 'recompute') {
        try {
          const child = spawn(settings.python || 'python', ['-X', 'utf8', join(balanceDir, 'balance_sim.py')], { cwd: balanceDir, windowsHide: true, stdio: 'ignore' })
          child.on('error', (error) => log(`平衡重算启动失败：${String((error && error.message) || error)}`))
          log('平衡重算…')
          return { ok: true, message: '已开始平衡重算', pid: child.pid }
        } catch (error) {
          return { ok: false, message: String((error && error.message) || error) }
        }
      }
      if (action === 'ai-think') {
        try {
          const child = spawn(settings.python || 'python', ['-X', 'utf8', join(balanceDir, 'balance_think.py')], { cwd: balanceDir, windowsHide: true, stdio: 'ignore' })
          child.on('error', (error) => log(`平衡两轮思考启动失败：${String((error && error.message) || error)}`))
          log('平衡两轮思考（前期/中期/后期/终结 → 自我批判）…')
          return { ok: true, message: '已开始两轮平衡思考', pid: child.pid }
        } catch (error) {
          return { ok: false, message: String((error && error.message) || error) }
        }
      }
    }
    const dlc = (() => {
      try {
        return globalThis.__AI_HUB__ ? globalThis.__AI_HUB__.listTasks() : []
      } catch {
        return []
      }
    })()
    const desc = dlc.find((t) => t.id === taskId)
    if (desc && action === 'start' && typeof desc.start === 'function') return desc.start()
    if (desc && action === 'stop' && typeof desc.stop === 'function') return desc.stop()
    return { ok: false, message: `没有这个任务或动作：${taskId} / ${action}` }
  }

  function restartTarget(target) {
    const name = String(target || '').toLowerCase()
    if (name === 'dsh' || name === 'plugin') {
      try {
        spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(root, 'tools', 'restart-dsh.ps1'), '-Action', 'schedule', '-DelaySeconds', '10'], {
          windowsHide: true,
          stdio: 'ignore',
        }).on('error', () => {})
        log(`收到远程重启请求（${name}），10 秒后重启 DSH`)
        return { ok: true, message: '已安排 10 秒后重启 DSH' }
      } catch (error) {
        return { ok: false, message: String((error && error.message) || error) }
      }
    }
    if (name === 'test' || name === 'mod-test') return testMod()
    if (['pipeline', 'desc', 'map', 'art', 'balance'].includes(name)) {
      return taskAction(name === 'pipeline' ? 'desc' : name, 'restart')
    }
    return { ok: false, message: `未知重启目标：${target}（dsh/plugin/test/pipeline/map/art/balance）` }
  }

  /**
   * 写代码调度：把任务交给免费的 headless AMD，默认 15 分钟。
   * 具体执行在 tools\free_code_dispatch.py（免费模型写的），这里只负责起进程。
   */
  function runFreeCode(task, cwd, timeoutMinutes) {
    return new Promise((resolveCode) => {
      const script = join(root, 'tools', 'free_code_dispatch.py')
      if (!existsSync(script)) {
        resolveCode({ ok: false, message: '缺少 tools\\free_code_dispatch.py' })
        return
      }
      const minutes = Math.max(1, Math.min(30, Number(timeoutMinutes) || 15))
      const args = [
        '-X', 'utf8', script,
        '--task', String(task || ''),
        '--cwd', String(cwd || root),
        '--timeout', String(minutes * 60),
      ]
      const child = spawn(settings.python || 'python', args, {
        cwd: root,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let out = ''
      let err = ''
      const timer = setTimeout(() => {
        try {
          spawn('taskkill', ['/T', '/F', '/PID', String(child.pid)], { windowsHide: true, stdio: 'ignore' })
        } catch {
          /* ignore */
        }
        resolveCode({ ok: false, message: `写代码超时（${minutes} 分钟）`, output: out.slice(-4000), error: err.slice(-2000) })
      }, (minutes + 2) * 60 * 1000)
      child.stdout.on('data', (chunk) => {
        out += String(chunk)
      })
      child.stderr.on('data', (chunk) => {
        err += String(chunk)
      })
      child.on('error', (error) => {
        clearTimeout(timer)
        resolveCode({ ok: false, message: String((error && error.message) || error) })
      })
      child.on('exit', (code) => {
        clearTimeout(timer)
        resolveCode({
          ok: code === 0,
          code,
          output: out.slice(-12000),
          error: err.slice(-3000),
          cwd: String(cwd || root),
          minutes,
        })
      })
    })
  }

  async function remoteTool(payload) {
    const action = String((payload && payload.action) || 'status')
    if (action === 'status' || action === 'tasks') {
      return { ok: true, status: await withBotPids(), registry: (globalThis.__AI_HUB__ ? globalThis.__AI_HUB__.listTasks() : []).map((t) => t.id) }
    }
    if (action === 'eta') return { ok: true, ...snapshot().eta }
    if (action === 'task') return { ok: true, ...(await taskAction(payload.id, String(payload.op || payload.operation || 'status'))) }
    if (action === 'files') return { ok: true, path: resolve(String(payload.path || root)), entries: listPath(payload.path || root) }
    if (action === 'read') return { ok: true, ...readTextFile(payload.path, Number(payload.max) || 20000) }
    if (action === 'package') return await packagePaths(payload.paths, payload.name)
    if (action === 'code') return { ok: true, ...(await runFreeCode(payload.task, payload.cwd, payload.minutes)) }
    if (action === 'restart') return { ok: true, ...restartTarget(payload.target) }
    if (action === 'test') return { ok: true, ...testMod() }
    if (action === 'refine-specs') return { ok: true, ...refineSpecs(payload.kind) }
    if (action === 'github') {
      try {
        spawn(settings.python || 'python', ['-X', 'utf8', join(root, 'tools', 'github_maps.py'), '--search'], {
          cwd: root, windowsHide: true, stdio: 'ignore', detached: true,
        }).unref()
        return { ok: true, message: 'GitHub 地图搜索已启动', output: join(root, 'tools', 'GitHub地图参考.md') }
      } catch (e) {
        return { ok: false, message: String(e && e.message ? e.message : e) }
      }
    }
    if (action === 'validate-map') {
      try {
        spawn(settings.python || 'python', ['-X', 'utf8', join(mapDir, 'map_validate.py')], {
          cwd: mapDir, windowsHide: true, stdio: 'ignore', detached: true,
        }).unref()
        return { ok: true, message: '地图硬规则校验已启动', output: join(mapDir, '_relay', 'map_validate.md') }
      } catch (e) {
        return { ok: false, message: String(e && e.message ? e.message : e) }
      }
    }
    if (action === 'power') return { ok: true, power: readJson(join(root, 'tools', 'power_status.json'), {}), daily: readJson(join(root, 'tools', 'power_daily.json'), {}) }
    if (action === 'assets') return { ok: true, assets: readJson(join(root, 'tools', 'assets_index.json'), {}) }
    if (action === 'community') return { ok: true, community: readJson(join(root, 'tools', 'community_assets.json'), {}) }
    if (action === 'browser-search') {
      const query = String((payload && payload.query) || '').trim()
      if (!query) return { ok: false, message: '需要 query' }
      try {
        spawn(settings.python || 'python', ['-X', 'utf8', join(root, 'tools', 'browser_search.py'), query], {
          cwd: root, windowsHide: true, stdio: 'ignore', detached: true,
        }).unref()
        return { ok: true, message: '浏览器搜索已启动', output: join(root, 'tools', '浏览器搜索.md') }
      } catch (e) {
        return { ok: false, message: String(e && e.message ? e.message : e) }
      }
    }
    if (action === 'community-scout') {
      try {
        spawn(settings.python || 'python', ['-X', 'utf8', join(root, 'tools', 'community_scout.py'), '--download'], {
          cwd: root, windowsHide: true, stdio: 'ignore', detached: true,
        }).unref()
        return { ok: true, message: '社区素材抓取已启动', output: join(root, 'tools', '社区素材.md') }
      } catch (e) {
        return { ok: false, message: String(e && e.message ? e.message : e) }
      }
    }
    if (action === 'asset-index') {
      try {
        spawn(settings.python || 'python', ['-X', 'utf8', join(root, 'tools', 'asset_index.py')], {
          cwd: root, windowsHide: true, stdio: 'ignore', detached: true,
        }).unref()
        return { ok: true, message: '素材索引已启动', output: join(root, 'tools', '素材索引.md') }
      } catch (e) {
        return { ok: false, message: String(e && e.message ? e.message : e) }
      }
    }
    if (action === 'resource') return { ok: true, resource: readJson(join(root, 'tools', 'resource_status.json'), {}) }
    return { ok: false, message: `未知远程动作：${action}` }
  }

  async function handler(req, res) {
    // 面板与页面同源；放开 CORS 只是为了 Electron file:// 形态也能用。
    res.setHeader('access-control-allow-origin', req.headers.origin || '*')
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS')
    res.setHeader('access-control-allow-headers', 'content-type')

    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }

    const url = new URL(req.url || '/', 'http://127.0.0.1')
    const path = url.pathname
    if (path !== ROUTE_PREFIX && !path.startsWith(`${ROUTE_PREFIX}/`)) {
      res.statusCode = 404
      res.end('not found')
      return
    }
    const route = path.slice(ROUTE_PREFIX.length).replace(/^\/+/, '')

    if (req.method === 'GET' && (route === 'api/tasks' || route === 'tasks')) {
      sendJson(res, 200, {
        ok: true,
        api: '/dsh-console/api/tasks',
        tasks: taskControlSnapshot(),
        history: taskHistory(),
        actions: ['status', 'soft-stop', 'stop', 'takeover', 'resume', 'review', 'approve'],
        note: '付费接管：POST {id,op:"takeover"} → 处理 → {id,op:"resume"}',
      })
      return
    }
    if (req.method === 'POST' && (route === 'api/tasks' || route === 'tasks')) {
      try {
        const payload = await readBody(req)
        sendJson(res, 200, taskControl(payload.id, String(payload.op || 'status')))
      } catch (error) {
        sendJson(res, 400, { ok: false, message: String((error && error.message) || error) })
      }
      return
    }
    if (req.method === 'GET' && (route === 'api/status' || route === 'status')) {
      try {
        sendJson(res, 200, await withBotPids())
      } catch (error) {
        log(`status 失败：${String((error && error.stack) || error)}`)
        sendJson(res, 500, { ok: false, message: String((error && error.message) || error) })
      }
      return
    }
    if (req.method === 'POST' && (route === 'api/tool' || route === 'tool')) {
      try {
        const payload = await readBody(req)
        sendJson(res, 200, await remoteTool(payload))
      } catch (error) {
        sendJson(res, 400, { ok: false, message: String((error && error.message) || error) })
      }
      return
    }
    if (req.method === 'POST' && (route === 'api/action' || route === 'action')) {
      try {
        const payload = await readBody(req)
        sendJson(res, 200, await perform(payload))
      } catch (error) {
        sendJson(res, 400, { ok: false, message: String((error && error.message) || error) })
      }
      return
    }
    if (req.method === 'POST' && (route === 'api/inject' || route === 'inject')) {
      try {
        const payload = await readBody(req)
        sendJson(res, 200, await injectMessage(payload))
      } catch (error) {
        sendJson(res, 400, { ok: false, message: String((error && error.message) || error) })
      }
      return
    }
    if (req.method === 'GET' && route === 'api/sessions') {
      try {
        sendJson(res, 200, { ok: true, sessions: listSessions() })
      } catch (error) {
        sendJson(res, 500, { ok: false, message: `列会话失败：${String((error && error.message) || error)}` })
      }
      return
    }
    if (req.method === 'POST' && route === 'api/session/cleanup') {
      try {
        const payload = await readBody(req)
        sendJson(res, 200, cleanupSessions({ apply: payload.apply === true, minAgeMinutes: payload.minAgeMinutes }))
      } catch (error) {
        sendJson(res, 400, { ok: false, message: String((error && error.message) || error) })
      }
      return
    }
    if (req.method === 'POST' && route === 'api/session/delete') {
      try {
        const payload = await readBody(req)
        sendJson(res, 200, deleteOneSession(String(payload.sessionId || '')))
      } catch (error) {
        sendJson(res, 400, { ok: false, message: String((error && error.message) || error) })
      }
      return
    }
    if (req.method === 'POST' && route === 'api/session/export') {
      try {
        const payload = await readBody(req)
        sendJson(res, 200, exportSession(payload))
      } catch (error) {
        sendJson(res, 400, { ok: false, message: String((error && error.message) || error) })
      }
      return
    }
    if (req.method === 'POST' && route === 'api/pipeline') {
      try {
        const payload = await readBody(req)
        const action = String((payload && payload.action) || 'status')
        if (action === 'status') {
          sendJson(res, 200, { ok: true, status: await withBotPids() })
        } else if (action === 'start' || action === 'stop') {
          const result = await perform({ type: action })
          sendJson(res, 200, { ...result, status: await withBotPids() })
        } else {
          sendJson(res, 400, { ok: false, message: `未知 action：${action}（可选 status/start/stop）` })
        }
      } catch (error) {
        sendJson(res, 400, { ok: false, message: String((error && error.message) || error) })
      }
      return
    }
    if (req.method === 'GET' && route === 'api/logs') {
      try {
        const name = String(url.searchParams.get('name') || '运行记录.md')
        const n = Math.min(500, Math.max(1, Number(url.searchParams.get('lines') || 50)))
        const path = join(logDir(), name)
        if (!existsSync(path)) throw new Error(`日志不存在：${path}`)
        sendJson(res, 200, { ok: true, file: path, lines: tailLines(path, n) })
      } catch (error) {
        sendJson(res, 400, { ok: false, message: String((error && error.message) || error) })
      }
      return
    }
    sendJson(res, 404, { ok: false, message: '未知接口' })
  }

  /* ---------- agent 工具 ---------- */

  function toolDefinition(toolName, description, properties, execute) {
    const props = properties || {}
    const required = []
    const clean = {}
    for (const [key, value] of Object.entries(props)) {
      // OpenAI 兼容接口只认顶层 `required: string[]`；属性里再放 required: true 会让整个请求 400。
      const { required: isRequired, ...schema } = value || {}
      if (isRequired) required.push(key)
      clean[key] = schema
    }
    return {
      name: toolName,
      description,
      parameters: { type: 'object', properties: clean, required, additionalProperties: false },
      output: {
        schema: {},
        render(_args, value) {
          return [{ type: 'text', text: JSON.stringify(value, null, 2) }]
        },
      },
      execute,
    }
  }

  /* ---------- 装配 ---------- */

  /**
   * 注册 HTTP 路由（由 install 里的 ctx.effect 托管，插件卸载时自动释放）。
   * 注意：ctx.webServer 每次取到的包装对象身份并不稳定，不能拿引用做比较；
   * 资源一律用 ctx.effect 拥有，生命周期才和插件行一致。
   */
  function registerRoute() {
    try {
      state.routeDispose = ctx.webServer.register({ kind: 'prefix', path: ROUTE_PREFIX, handler })
      state.routeReady = true
      state.routeOrigin = (() => {
        try {
          return ctx.webServer.getOrigin()
        } catch {
          return null
        }
      })()
      state.routeError = null
      writeUrlFile()
      log(`HTTP 路由就绪：${state.routeOrigin || '?'}${ROUTE_PREFIX}/api/status`)
    } catch (error) {
      state.routeError = String((error && error.message) || error)
      log(`HTTP 路由注册失败：${state.routeError}`)
    }
  }

  /** 释放路由，并把「当前地址」文件标记为失效。 */
  function releaseRoute() {
    try {
      state.routeDispose?.()
    } catch {
      /* ignore */
    }
    state.routeDispose = null
    state.routeReady = false
    state.routeOrigin = null
  }

  /** 把当前面板地址写到文件里，给 QQ 机器人的 console.cmd 用（端口会变）。 */
  function writeUrlFile() {
    try {
      const url = `${state.routeOrigin || ''}${ROUTE_PREFIX}`
      writeFileSync(join(root, 'tools', 'ds_console_url.txt'), `${url}\n`, 'utf8')
    } catch {
      /* ignore */
    }
  }

  /** 在给定 tools 服务上注册全部 agent 工具，并记下 disposer。 */
  function registerTools(toolsService) {
    const registerTool = (definition) => {
      try {
        state.toolDisposers.push(toolsService.register(definition))
      } catch (error) {
        const message = String((error && error.message) || error)
        // 上一代实例的工具还没释放时会出现这个；当成已注册处理，不刷屏。
        if (!/already registered/i.test(message)) log(`工具 ${definition.name} 注册失败：${message}`)
      }
    }

    registerTool(
      toolDefinition('watchdog_status', '查看 ds工作区 流水线与守护台状态：是否在跑、PID、阶段、审计进度、开关。', {}, async () => withBotPids()),
    )
    registerTool(
      toolDefinition('watchdog_start', '启动 ds工作区 流水线（tools\\pipeline_dsh.py）。已有流水线在跑时不重复启动。', {}, async () => {
        state.suppressed = false
        return { ...startPipeline('manual'), status: await withBotPids() }
      }),
    )
    registerTool(
      toolDefinition('watchdog_stop', '结束守护台自己拉起的流水线进程；不会动用户手动启动的流水线。', {}, async () => ({ ...killManaged(), status: await withBotPids() })),
    )
    registerTool(
      toolDefinition('qqbot_status', '查看大肥鱼（QQ 官方机器人）状态：进程 PID、白名单、群配置、最近日志。', {}, async () => botSnapshot(await botPidsFresh())),
    )
    registerTool(
      toolDefinition('qqbot_start', '启动大肥鱼（dsh --profile qqbot）。已在跑则不重复启动。', {}, async () => ({ ...(await startBot('manual')), status: await withBotPids() })),
    )
    registerTool(
      toolDefinition('qqbot_stop', '停止大肥鱼（结束 --profile qqbot 进程树）。', {}, async () => ({ ...(await stopBot()), status: await withBotPids() })),
    )
    registerTool(
      toolDefinition(
        'qqbot_push',
        '用大肥鱼的应用凭据主动往 QQ 群或私聊发一条消息。target=group 需要群 openid；target=c2c 需要用户 openid（默认发给主人）。',
        {
          text: { type: 'string', required: true, description: '要发送的文字，最多 1800 字。' },
          target: { type: 'string', description: 'group 或 c2c，默认 c2c。' },
          id: { type: 'string', description: '群 openid 或用户 openid；c2c 省略时发给白名单里的主人。' },
        },
        async (args) => {
          const target = args.target === 'group' ? 'group' : 'c2c'
          let id = String(args.id || '')
          if (!id && target === 'group') id = String(readJson(groupJsonPath, {}).group_openid || '')
          if (!id && target === 'c2c') id = parseAccessYaml(botPatch().text).c2cAllow[0] || ''
          return qqSend(target, id, args.text)
        },
      ),
    )
    registerTool(
      toolDefinition(
        'hub_status',
        'AI 调度台总状态：流水线/地图/贴图/平衡/大肥鱼、并发、以及已注册的 DLC 任务。远程排查先调这个。',
        {},
        async () => (await remoteTool({ action: 'status' })),
      ),
    )
    registerTool(
      toolDefinition(
        'hub_task',
        '启动/停止/重启/查询 DLC 或内置任务。id：desc（代码流水线）、map、art、balance，或 DLC 注册的 id。',
        {
          id: { type: 'string', required: true, description: '任务 id，例如 desc / map / art / balance' },
          op: { type: 'string', required: true, description: 'start / stop / restart / status' },
        },
        async (args) => ({ ok: true, ...taskAction(args.id, args.op) }),
      ),
    )
    registerTool(
      toolDefinition(
        'hub_files',
        '列目录（Desktop / 任务 / ds工作区 / .dsh 范围内），返回名称、大小、修改时间。',
        { path: { type: 'string', required: true, description: '绝对路径' } },
        async (args) => ({ ok: true, path: resolve(String(args.path || root)), entries: listPath(args.path) }),
      ),
    )
    registerTool(
      toolDefinition(
        'hub_read',
        '读取文本文件（md/txt/json/ini 等），默认最多 2 万字。',
        {
          path: { type: 'string', required: true, description: '绝对路径' },
          max: { type: 'integer', description: '最多读取多少字符' },
        },
        async (args) => ({ ok: true, ...readTextFile(args.path, Number(args.max) || 20000) }),
      ),
    )
    registerTool(
      toolDefinition(
        'hub_package',
        '把文件/目录打包成 zip，放到 任务\\qqbot\\exports，返回路径，QQ 机器人可用 qqbot_send_file 发送。',
        {
          paths: { type: 'array', items: { type: 'string' }, required: true, description: '要打包的绝对路径列表' },
          name: { type: 'string', description: '压缩包名前缀' },
        },
        async (args) => packagePaths(args.paths, args.name),
      ),
    )
    registerTool(
      toolDefinition(
        'hub_restart',
        '重启 DSH / 任务 / 模组测试。target：dsh、plugin、pipeline、map、art、balance、test。',
        { target: { type: 'string', required: true, description: 'dsh / plugin / pipeline / map / art / balance / test' } },
        async (args) => ({ ok: true, ...restartTarget(args.target) }),
      ),
    )
    registerTool(
      toolDefinition('hub_test_mod', '跑一次模组实机测试（update_and_test.py），结果写工作日志。', {}, async () => ({ ok: true, ...testMod() })),
    )
    registerTool(
      toolDefinition(
        'hub_code',
        '写代码调度：把一段明确的实现任务交给空闲的免费 AMD 模型执行（不带思考，默认 15 分钟），返回输出。付费模型只负责写清楚要干什么。',
        {
          task: { type: 'string', required: true, description: '要实现的代码任务，写清楚文件、函数、验收标准' },
          cwd: { type: 'string', description: '工作目录，默认 ds工作区' },
          minutes: { type: 'integer', description: '超时分钟，默认 15，最多 30' },
        },
        async (args) => ({ ok: true, ...(await runFreeCode(args.task, args.cwd, args.minutes)) }),
      ),
    )
    registerTool(
      toolDefinition(
        'hub_eta',
        '预估当前各任务还需要多久：代码流水线（审计/校对/修复）、地图、贴图、平衡。返回秒数、文字和估算依据。',
        {},
        async () => ({ ok: true, ...snapshot().eta }),
      ),
    )
    registerTool(
      toolDefinition(
        'hub_refine_specs',
        '让免费 AMD 读现有规范和最近报告，提出规范增删改建议；只写 规范优化建议.md，不直接改规范。kind：map/texture/balance/code/all。',
        { kind: { type: 'string', description: 'map / texture / balance / code / all' } },
        async (args) => ({ ok: true, ...refineSpecs(args.kind) }),
      ),
    )
  }

  function install() {
    // 路由和工具都用 ctx.effect 拥有，卸载/热重载时才会真正释放。
    ctx.effect(() => {
      registerRoute()
      return releaseRoute
    }, 'ds-console: http route')

    ctx.effect(() => {
      registerTools(ctx.tools)
      return () => {
        for (const dispose of state.toolDisposers) {
          try {
            dispose()
          } catch {
            /* ignore */
          }
        }
        state.toolDisposers = []
      }
    }, 'ds-console: tools')

    ctx.effect(() => {
      const timer = setInterval(tick, 5000)
      return () => {
        clearInterval(timer)
        clearRestartTimer()
        if (state.child && state.child.pid) {
          try {
            if (process.platform === 'win32') {
              spawn('taskkill', ['/PID', String(state.child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => {})
            } else {
              state.child.kill('SIGTERM')
            }
          } catch {
            /* ignore */
          }
        }
        state.child = null
      }
    }, 'ds-console: supervisor')

    log('守护台插件已加载（自动守护默认关闭）。')
    tick()
  }

  return { install, snapshot }
}

/**
 * 插件入口。
 * @param ctx 宿主上下文。
 */
export function apply(ctx) {
  const tasks = new Map()
  globalThis.__AI_HUB__ = {
    version: 1,
    registerTask(desc) {
      if (!desc || !desc.id) return () => {}
      tasks.set(desc.id, desc)
      return () => {
        if (tasks.get(desc.id) === desc) tasks.delete(desc.id)
      }
    },
    listTasks() {
      return [...tasks.values()]
    },
  }
  ctx.effect(() => () => {
    if (globalThis.__AI_HUB__ && globalThis.__AI_HUB__.listTasks) delete globalThis.__AI_HUB__
  }, 'ai-hub: task registry')
  createConsole(ctx).install()
}
