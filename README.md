# AI Console / AI 璋冨害鍙?
![AI Console dashboard](docs/screenshot-dashboard.png)

A DSH desktop plugin that puts task scheduling, concurrency, free-pool discovery, local tools and the optional mod console into one left-sidebar panel.

涓€涓?DSH 妗岄潰鎻掍欢锛氭妸浠诲姟璋冨害銆佸苟鍙戙€佸厤璐规睜銆佹湰鏈哄伐鍏峰拰鍙€夌殑妯＄粍鎺у埗鍙伴泦涓埌宸︽爮闈㈡澘銆?
---

## English

### What it is

AI Console is a local-first scheduler for DSH. It watches the tasks you run on your own machine, shows which model/key slot is busy, and exposes a small local API so agents, scripts and a QQ bot can call the same tools.

It started as a process watcher for a mod pipeline that used free AI. The free pool was not efficient enough, so the watcher became a scheduler. Later the project was split into:

- `ai-hub` (this repository): scheduler
- `task-mod`: optional mod console for maps, textures and balance

### Features

- Task overview: code, map, texture and balance tasks with batch, progress, workers and keys
- Concurrency matrix: local key pool 脳 models, busy and idle slots
- Auto-scaling: start extra workers when idle slots exceed a threshold
- Free-pool discovery: parse public GitHub lists into provider candidates, base URLs and free quotas
- Map tools: wish-based naming, spawn/resource validation, diff checks
- Asset tools: GitHub map/mod search, local asset index, rtsbox community scraper
- Browser search: local Edge screenshot + DOM text, no search API
- Task telemetry: tokens, duration and anomalies by task type
- Self-check: plugin syntax, config, token ledger, map rules, monitors
- Local API for tools and QQ bot

### Requirements

- DSH Desktop (Windows)
- Python 3.11
- Node runtime bundled with DSH
- Optional: Rusted Warfare + Tiled/TMX tools for the mod workflow
- Optional: `task-mod` for the mod console

### Install

1. Open DSH Desktop.
2. Go to **Settings 鈫?Plugins**.
3. Install this folder as a local bundle (or clone this repository and select the folder).
4. Restart DSH if the left-sidebar icon does not appear.
5. Open **AI Console** from the left sidebar.

```powershell
git clone https://github.com/Railan1314/dsh-plugin-ds-console.git
```

There is no npm build step; the plugin is plain ES modules.

### Configuration

Main settings:

```text
tools/ds_console_settings.json
```

Common fields:

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

Local scripts and secrets are outside this repository. **Never commit API keys, tokens or notification configs.**

### Local API

Loopback only:

```text
GET  /dsh-console/api/status
GET  /dsh-console/api/tasks
POST /dsh-console/api/tasks   {id, op}
POST /dsh-console/api/tool    {action, ...}
```

Tool actions include:

```text
github / github-mods / community / community-scout
browser-search / assets / asset-index / mapvalidate
self-check / power / resource / task
```

### Security

- The plugin does not read or write API keys.
- `/dsh-console/api/*` is bound to localhost and has no token auth; do not expose DSH to the public internet.
- Before publishing, remove `tools/dsh_config.json`, `tools/notify_config.json`, `tools/token_ledger.json` and personal data.
- This is a personal/beta project; no cross-version compatibility guarantee.

### Known limits

- The matrix uses local key aliases, not real account identities.
- The map validator's "resource" check is a non-empty tile check, not a strict resource-pool type check.
- Headless Bing/Baidu may hide visual results behind anti-bot; DOM text is still saved.

---

## 涓枃

### 杩欐槸浠€涔?
AI 璋冨害鍙版槸涓€涓湰鏈轰紭鍏堢殑 DSH 璋冨害鎻掍欢銆傚畠瑙傚療浣犳満鍣ㄤ笂鐨勪换鍔★紝鏄剧ず褰撳墠鍝釜妯″瀷/key 妲戒綅鍦ㄥ繖锛屽苟鎻愪緵涓€涓皬鍨嬫湰鏈?API锛岃 agent銆佽剼鏈拰 QQ 鏈哄櫒浜鸿皟鐢ㄥ悓涓€濂楀伐鍏枫€?
鏈€鍒濆彧鏄兂鍐欎釜杩涚▼瀹堟姢锛岃鍏嶈垂 AI 甯繖鍐欐ā缁勶紱鍚庢潵鍙戠幇鍏嶈垂姹犳晥鐜囦笉澶燂紝灏辨妸瀹堟姢鍋氭垚浜嗚皟搴﹀彴銆傚啀鍚庢潵涓嶆兂鐩存帴鍋氭ā缁勫唴瀹癸紝浜庢槸鎷嗘垚涓や釜鎻掍欢锛?
- `ai-hub`锛堟湰浠撳簱锛夛細璋冨害鍙?- `task-mod`锛氬彲閫夋ā缁勬帶鍒跺彴锛岃礋璐ｅ湴鍥?璐村浘/骞宠　

涓嶉渶瑕佹ā缁勭殑浜哄彧瑁呰皟搴﹀彴鍗冲彲銆?
### 鍔熻兘

- 浠诲姟鎬昏锛氫唬鐮併€佸湴鍥俱€佽创鍥俱€佸钩琛＄殑鐘舵€併€佹壒娆°€佽繘搴︺€亀orker/key
- 骞跺彂鐭╅樀锛氭湰鍦?key 姹?脳 妯″瀷锛屾樉绀哄疄闄呭崰鐢ㄥ拰绌洪棽妲戒綅
- 鑷姩鎵╁睍锛氱┖闂叉Ы浣嶈秴杩囬槇鍊兼椂鎷夎捣棰濆浠诲姟
- 鍏嶈垂姹犱睛瀵燂細瑙ｆ瀽鍏紑 GitHub 娓呭崟锛岃緭鍑?provider銆乥ase URL銆佸厤璐归搴?- 鍦板浘宸ュ叿锛氳鎰垮紡鍛藉悕銆佸嚭鐢熺偣/鐭挎牎楠屻€佸樊寮傚寲妫€鏌?- 绱犳潗宸ュ叿锛欸itHub 鍦板浘/妯＄粍鎼滅储銆佹闈㈢礌鏉愮储寮曘€乺tsbox 绀惧尯鎶撳彇
- 娴忚鍣ㄦ悳绱細鏈満 Edge 鎴浘 + DOM 鏂囨湰锛屼笉璧版悳绱?API
- 浠诲姟閬ユ祴锛氭寜浠诲姟绫诲瀷璁板綍 token銆佽€楁椂鍜屽紓甯?- 鑷锛氭彃浠惰娉曘€侀厤缃€乼oken 璐︽湰銆佸湴鍥捐鍒欍€佺洃鎺?- 鏈満 API锛氱粰宸ュ叿鍜?QQbot 鍏辩敤

### 瀹夎

1. 鎵撳紑 DSH Desktop
2. 杩涘叆 **璁剧疆 鈫?鎻掍欢**
3. 閫夋嫨鏈洰褰曚綔涓烘湰鍦?bundle 瀹夎
4. 宸︿晶娌℃湁鍥炬爣灏遍噸鍚?DSH
5. 浠庡乏鏍忔墦寮€ **AI 璋冨害鍙?*

```powershell
git clone https://github.com/Railan1314/dsh-plugin-ds-console.git
```

娌℃湁 npm 鏋勫缓姝ラ锛屾彃浠舵槸鏅€?ES module銆?
### 渚濊禆

- DSH Desktop锛圵indows锛?- Python 3.11
- DSH 鑷甫 Node runtime
- 鍙€夛細閾侀攬鎴樹簤 + Tiled/TMX 宸ュ叿
- 鍙€夛細`task-mod` 妯＄粍鎺у埗鍙?
### 閰嶇疆

```text
tools/ds_console_settings.json
```

甯哥敤椤癸細

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

鏈満鑴氭湰鍜屽瘑閽ヤ笉鍦ㄦ湰浠撳簱鍐呫€?*涓嶈鎻愪氦 API key銆乼oken 鎴栭€氱煡閰嶇疆銆?*

### 瀹夊叏

- 鎻掍欢涓嶈鍙栥€佷笉鍐欏叆 API key
- `/dsh-console/api/*` 鍙粦鏈満鍥炵幆锛屼笉鍋?token 閴存潈锛涗笉瑕佹妸 DSH 鏆撮湶鍒板叕缃?- 鍙戝竷鍓嶅垹闄?`tools/dsh_config.json`銆乣tools/notify_config.json`銆乣tools/token_ledger.json` 鍜屼釜浜烘暟鎹?- 涓汉/beta 椤圭洰锛屼笉淇濊瘉璺?DSH 鐗堟湰鍏煎

### 宸茬煡闄愬埗

- 骞跺彂鐭╅樀鐨?key 鍚嶇О鏄湰鍦板埆鍚嶏紝涓嶅搴旂湡瀹炶处鍙?- 鍦板浘鏍￠獙閲岀殑鈥滅熆鈥濈洰鍓嶅彧妫€鏌ラ潪绌鸿祫婧愭牸锛屼笉鏄弗鏍艰祫婧愭睜绫诲瀷
- 鏃犲ご Bing/鐧惧害鍙兘琚弽鐖殣钘忕粨鏋滐紝DOM 鏂囨湰浠嶄細淇濆瓨

### 鏉ュ巻

鏈€鍒濆彧鎯冲啓涓繘绋嬪畧鎶わ紝璁╁厤璐?AI 甯繖鍐欐ā缁勶紱鍚庢潵鍙戠幇鍏嶈垂姹犳晥鐜囦笉澶燂紝灏辨妸瀹堟姢鍋氭垚浜嗚皟搴﹀彴銆傚啀鍚庢潵涓嶆兂鐩存帴鍋氭ā缁勫唴瀹癸紝浜庢槸鎷嗘垚璋冨害鍙?+ 妯＄粍鎺у埗鍙般€?
---

## License

MIT. See [LICENSE](LICENSE).

## Links

- Issues: https://github.com/Railan1314/dsh-plugin-ds-console/issues
- Releases: https://github.com/Railan1314/dsh-plugin-ds-console/releases
