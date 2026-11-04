# QuickLaunch config.json 可视化生成器

给 [wv2-launcher](../wv2-launcher/README.md)（AHK + WebView2 的 Windows 快速启动器）配套的前端工具：
在网页上点选、填表、增删条目，实时生成、校验并导出 `config.json`。
**离线单文件**即可使用；另外附带两个**可选的附加功能**：把配置「提交到后端」（配合启动器已有的「拉取在线配置」做多机同步），
以及「导入 config.json」的**合并模式**（按 ID 判重增量并入，可预览冲突、可撤销）。

> 在线提交是附加功能：网络不通、后端没起、CORS 没配、`file://` 直接打开……都只会在提交面板里给出错误提示，
> **不会影响本地生成 / 校验 / 复制 / 下载 / 导入** 等任何功能。

---

## 1. 快速开始

环境：Node.js 18+（本项目在 Node 22 / Windows 上开发验证）。

```bash
npm install

npm run dev          # 开发模式，http://127.0.0.1:5173
npm run build        # 产出 dist/index.html（单文件）
npm run preview      # 用 HTTP 服务打开产物，http://127.0.0.1:4173
npm run check        # 一键全量回归（见第 9 节）
```

`npm run build` 会把 Vue 代码、CSS、示例配置全部内联进 **`dist/index.html`**（约 190 KB，无任何外链资源），
可以双击用浏览器直接打开、复制到别的机器、放进网盘，**不需要服务器、不需要 node_modules**。

> 如果要使用「提交到后端」，请务必通过 HTTP(S) 服务部署（`npm run preview`、nginx、静态托管均可），
> 不要用 `file://` 打开——原因见 §4.4。

### 目录结构

```
quicklaunch-config-builder/
├── backend.config.js          ★ 编译期后端配置：默认 URL / 超时 / 鉴权模式
├── vite.config.js             Vite 配置 + 单文件内联插件 + define 注入编译期常量
├── index.html                 开发入口
├── src/
│   ├── main.js / App.vue      应用入口与主布局
│   ├── schema.js              配置字段字典（说明 / 必填 / 格式 / 适用 type）
│   ├── model.js               内部模型 ↔ config.json 的双向转换
│   ├── merge.js               ★ 合并导入纯函数：planMerge / analyzeMerge / mergeStates
│   ├── validate.js            校验引擎
│   ├── store.js               响应式状态、localStorage 自动保存、合并撤销点
│   ├── sample.config.json     内置示例（软件当前那份配置）
│   ├── styles.css
│   ├── backend/               ★ 在线提交相关（纯 JS，Node 里也能直接 import 做测试）
│   │   ├── config.js          编译期常量读取 + 页面覆盖值的读写
│   │   ├── auth.js            鉴权 provider / QL-HMAC-SHA256-v1 签名
│   │   └── submit.js          校验门禁、端点体检、fetch 提交、错误分类
│   └── components/            各编辑器；BackendPanel.vue = 云端提交面板
├── scripts/
│   ├── verify.mjs             模型层「导入→导出」无损回归 + 合并引擎 23 项用例
│   ├── verify-backend.mjs     提交 / 鉴权链路的 Node 层回归
│   ├── ui-check.mjs           无头浏览器交互回归（file:// + fetch 打桩）
│   ├── e2e-check.mjs          真实跨域端到端（两个 HTTP 服务 + CDP 驱动浏览器）
│   └── mock-backend.mjs       ★ 零依赖参考后端，已配好 CORS / 可选 HMAC 校验
└── dist/index.html            构建产物（作为离线发布物一并入库）
```

---

## 2. 配置覆盖度与校验口径

字段字典 `src/schema.js` 逐项对照 `wv2-launcher/README.md` 的
**「四、配置说明」**（含 webhook / download / jsonfile / 模板变量 / 请求头动态值）与
**「七、定时调度」**，并核对 `wv2-launcher/ui/app.js` 的归一化实现，共结构化 **49 个字段**：

| 区域 | 字段数 | 说明 |
|---|---|---|
| 顶层 | 5 | `name` / `version` / `items` / `groups` / `schedules` |
| 条目 `items[]` | 26 | 8 种 `type`（app / cmd / url / folder / ahk / webhook / download / jsonfile）动态决定哪些字段可见 |
| 参数 `params[]` | 7 | 交互参数子表，含 `{{变量}}` 支持 |
| 分组 `groups[]` | 2 | |
| 定时任务 `schedules[]` | 9 | `at` / `every` / `days` / `enabled` 等 |

界面里每个字段都带 README 对应的说明、格式、适用类型；「字段速查」页把全部字段列成表格一次看全。

**校验要点**：`id` 必填唯一且限 `[A-Za-z0-9_.-]`；`target` 按 type 校验（webhook / download 必须 http(s)）；
`timeout > 0 且 ≤120`；`method` 限 6 种、`onExists` 限 skip/overwrite；
`at` 为 `HH:MM(:SS)` 及范围、`every` 30 秒～30 天、`at`/`every` 二选一、`days` 只跟 `at`；
布尔字段严格只认真/假（写字符串或数字会报错，因为程序会按缺省处理）；
`accent` 颜色格式；`group` 引用检查；模板变量未声明直接报错、没声明 params 只警告。

### 可选字段的勾选框

README 反复强调「不写就是默认」「只有布尔 `false` / `true` 才生效」，
所以生成器必须区分「没写」和「显式写了 `false` / 空字符串」——
例如 `enabled: false`、`backup: false`、`fileName: ""` 都有实际语义。
因此每个可选字段左侧有**勾选框决定它是否写进 JSON**；新增条目默认只输出必填字段；
导入时会精确还原原文件里每个键（包括字典外的自定义键），不会静默丢弃。

---

## 3. 基本使用流程

1. 在「条目 / 分组 / 定时任务」里增删改，按需勾选可选字段；
2. 右侧「生成的 JSON」实时预览，「校验」页看错误 / 提醒；
3. 「复制 JSON」或「下载 config.json」→ 覆盖 `wv2-launcher/config.json`；
4. 在启动器里点「重载配置」（或托盘菜单）即时生效；改坏了可从 `config.json.bak` 恢复。

也支持「导入 config.json」反向编辑（可选全量覆盖 / 合并，见 §3.2）、载入内置示例、localStorage 自动保存。

### 3.1 条目多时，用左侧纵向 TAB 按 type 筛选

条目页左侧贴边有一列竖排 TAB，从上到下是 **「全部」+ 8 种 type**（app / cmd / url /
folder / ahk / webhook / download / jsonfile），每个按钮下方是该类条目的数量。

- 「全部」是默认值，列表与以前**完全一致**，显示所有条目；
- 点某个 type 只显示该类型的条目，列表标题变成「条目列表 · app」并显示 `10 / 23` 这样的计数；
- 数量为 0 的类型仍保留按钮（灰显），点进去有空状态和「+ 新增该类型条目」快捷按钮；
- 切换筛选时会自动选中该类型的第一条，中间编辑区不会留着一个列表里看不到的条目；
- 底部「新增条目」的类型下拉会跟着当前筛选走；筛选状态下新增了别的类型，筛选自动切到新类型；
  筛选状态下把某条目的 `type` 改了，筛选也会跟着改，条目不会凭空从列表里消失；
- 切到「分组 / 定时任务 / 配置总览 / 字段速查」时竖栏自动隐藏，切回来保留之前的筛选；
- **筛选只是「看哪些」，不参与 `buildConfig()`**：右侧 JSON、校验、复制、下载、提交到后端
  始终使用全部条目，不会因为你正在看 `app` 就少导出一半配置。
- 筛选状态只存在内存里，刷新页面回到「全部」；导入 / 载入示例 / 清空也会重置为「全部」。

### 3.2 导入已有配置：全量覆盖 与 合并模式

点顶栏「↑ 导入 config.json」，弹窗顶部先选导入方式（**每次打开都默认「清空原有，全量覆盖」**，所以不选直接回车的行为和以前完全一致）：

| 方式 | 行为 |
|---|---|
| 清空原有，全量覆盖 | 原有行为：用导入文件整体替换编辑区，顶层字段、可选字段开关、字典外自定义键全部按导入文件还原 |
| 合并到现有配置 | 只按 ID 把 `items` / `groups` / `schedules` 三个数组并进来；新 ID 追加在末尾，顶层 `name` / `version` / 顶层自定义键**保持现有值** |

选「合并」后还要选重复 ID 的处理策略：

| 策略 | 行为 |
|---|---|
| 保留原有配置 | 冲突的那条整条跳过，现有对象一个字段都不动（默认） |
| 用新导入的配置覆盖原配置 | 用导入那条**整条替换**现有对象，含所有字段、可选字段是否写入、`params[]` 子项、自定义键；保留原位置与原 `_key`，列表顺序与当前选中项不跳 |

**判重口径**

- 键：`items[].id` / `groups[].id` / `schedules[].id`，与校验器一致（`String(id).trim()`，大小写敏感）；**其它字段一律不参与比较**。
- `schedules[].id` 在启动器里是**可选**的（只是日志名，省略就用 `run`），所以 **id 为空的对象一律当新对象追加**，不猜指纹；`items` / `groups` 里 id 为空的脏数据同样追加，合并后校验器会提示「id 必填」，由你决定怎么修。
- 导入文件**内部自身**有重复 ID 时：`replace` 策略下后出现的胜出，`keep` 策略下现有配置优先、重复项全跳过。
- 只有「导入文件确实带 `groups` / `schedules` 键、且确实新增了对象」时才自动打开对应的输出开关；仅仅覆盖已有对象时保持你原来的开关状态，避免替你改主意。

**冲突预览**：粘进 JSON 后（不用点按钮）弹窗会只读计算并展示「新增 X / 冲突 Y 个 ID / 无 ID 追加 Z」、按类型的明细、冲突 ID 清单与导入文件内部重复提示。预览与真正执行共用同一份 `planMerge()` 操作序列，看到什么就执行什么；预览阶段绝不改动编辑区。

**撤销**：执行合并前会把编辑区的完整快照（含 `_include` / `_extra` / `_key`）写进独立的 localStorage key
`ql-merge-undo-v1`，与自动保存用的 `ql-config-builder-v1` 互不干扰。顶栏出现「↶ 撤销上次合并」，点一下回到合并前。
快照里存了「合并完成瞬间」的状态指纹：如果合并之后你又编辑过，撤销会先弹一次确认，避免静默吞掉新工作。
执行「全量覆盖 / 载入示例 / 清空」会清掉旧撤销点。

合并只改变「导入结果怎么放进 state」：`importJson()`、`stateFromJson()`、`buildConfig()`、校验引擎、提交与鉴权链路都没有改动，
导出的 JSON 始终是完整的全量配置。合并后请顺手看一眼右侧「校验」页——`group` 引用、`run` 指向的条目可能因覆盖而失效，校验器会自动重算。

---

## 4. 在线提交（附加功能）

入口：顶栏 **「↑ 提交到后端」**，或右侧输出区的 **「↑ 提交到后端」** 页签。

### 4.1 编译期默认后端 URL

**唯一需要改后端的源码文件：`backend.config.js`**

```js
export default {
  defaultUrl: 'http://127.0.0.1:8787/api/config',  // ← 默认提交地址
  timeoutMs: 10000,
  auth: { mode: 'none', keyId: '', secret: '' }
}
```

机制：`vite.config.js` 在构建时 `import` 这个文件，用 `define` 把整个对象以**字面量**注入，
`src/backend/config.js` 读到的 `COMPILED.defaultUrl` 在产物里就是一个写死的字符串常量，
运行时**不会再读任何配置文件、也不会发探测请求**。改完重新 `npm run build` 即可。

不改源码也能临时换地址（适合 CI / 多环境）：

```bash
QL_BACKEND_URL=https://cfg.example.com/api/config npm run build
```

验证是否真的编译进去了：

```bash
grep -o "https://cfg.example.com/api/config" dist/index.html | wc -l   # 应 ≥ 1（字面量已写入）
grep -o "__QL_BACKEND_CONFIG__" dist/index.html | wc -l                # 应为 0（define 已替换）
```

### 4.2 页面输入框覆盖默认值

提交面板第一行就是「后端 API URL」输入框：

- **留空** → 使用编译期默认值，输入框的 placeholder 会显示它，下方标记「编译期默认值」；
- **填了值** → 覆盖默认值，标记变成「页面输入（优先）」，并显示当前生效地址；
- 输入值存 `localStorage`（key `ql-backend-url-v1`），刷新后仍在；点「恢复默认」清空覆盖值。
- 优先级：`页面输入 > 环境变量 QL_BACKEND_URL 构建的默认值 > backend.config.js 的默认值`。

### 4.3 提交规则

| 项目 | 约定 |
|---|---|
| 触发条件 | **校验错误数 = 0** 才允许发请求；有错误时点击只会提示「还有 N 处校验错误，未发起请求」，连 `fetch` 都不调用（界面与 `submitConfig` 双重保险）。提醒（warn）不阻止提交。 |
| 方法 | `POST`，`mode: 'cors'`，`credentials: 'omit'`（首版无鉴权，不带 Cookie） |
| 请求体 | **整个 JSON 串原样作为 body**，即 `JSON.stringify(config, null, 2)` 的完整文本，不做任何包装、不加外层字段 |
| 超时 | 默认 10 秒（`backend.config.js` 的 `timeoutMs`），`AbortController` 主动取消 |
| 成功判定 | HTTP 2xx 即成功；非 2xx 展示状态码与响应体前 300 字符 |
| 响应 | 后端返回什么都行（客户端只展示文本），由后端自行决定落盘、版本、审计逻辑 |

基础请求头（自定义头会触发 CORS 预检，见 4.5）：

```
Content-Type: application/json;charset=utf-8
Accept: application/json, text/plain, */*
X-QL-Client: quicklaunch-config-builder/1.0
```

错误码一览（`src/backend/submit.js` 返回结构化结果，不抛异常）：

| code | 含义 | 是否发请求 |
|---|---|---|
| `VALIDATION_FAILED` | 校验未通过 | 否 |
| `EMPTY_BODY` | 生成的 JSON 为空 | 否 |
| `EMPTY_URL` / `BAD_URL` / `BAD_SCHEME` | 地址为空 / 不是绝对 URL / 非 http(s) | 否 |
| `MIXED_CONTENT` | HTTPS 页面请求 HTTP 后端 | 否 |
| `FILE_PROTOCOL` | 页面是 `file://` 本地打开 | 否（可点「仍然尝试」） |
| `UNSUPPORTED_PROTOCOL` | 页面协议非 http/https/file | 否 |
| `AUTH_ERROR` / `NO_FETCH` | 鉴权头生成失败 / 环境无 fetch | 否 |
| `TIMEOUT` | 超过 `timeoutMs` | 是（已取消） |
| `NETWORK_ERROR` | 后端没起、CORS 被拦、证书问题等 | 是（未完成） |
| `HTTP_ERROR` | 后端返回非 2xx | 是 |
| `OK` | 提交成功 | 是 |

### 4.4 部署方式与 `file://` 本地打开的限制

| 部署方式 | 在线提交 | 本地生成 |
|---|---|---|
| `npm run preview` / nginx / 任意 HTTP(S) 静态服务 | ✅ 正常 | ✅ |
| 双击 `dist/index.html`（`file://`） | ❌ 面板显示黄色环境提示；点提交会给出明确错误，**不发请求** | ✅ 完全正常 |
| HTTP(S) 服务但后端不可达 / CORS 未配 | ❌ 面板给出带排查清单的错误 | ✅ 完全正常 |
| HTTPS 页面 + HTTP 后端 | ❌ 提前判定混合内容并提示 | ✅ 完全正常 |

`file://` 页面的 origin 是 `null`，绝大多数后端不会放行；因此默认直接拦下并提示
「请用 `npm run preview` 通过 HTTP 部署」。如果你的后端确实允许 `Origin: null`，
错误框里有 **「仍然尝试（Origin: null）」** 按钮，会强制发起一次请求。
**所有失败路径都被 `try/catch` 兜住，只写状态框，绝不改动编辑区数据、绝不中断页面。**

### 4.5 CORS：后端必须做的事

因为 `Content-Type: application/json` 和 `X-QL-*` 都不是 CORS 安全头，
浏览器会先发一次 **`OPTIONS` 预检**。后端必须同时处理预检和实际 POST：

```
Access-Control-Allow-Origin: *                      （或精确的 Origin；credentials:'omit' 时 * 可用）
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, X-QL-Client, X-QL-Auth-Mode,
                              X-QL-Key-Id, X-QL-Timestamp, X-QL-Nonce,
                              X-QL-Body-Sha256, X-QL-Signature
Access-Control-Max-Age: 600
```

这份清单的唯一来源是 `src/backend/auth.js` 导出的 `AUTH_HEADER_NAMES`；
将来新增自定义头（例如 `Authorization`）时，**同时把它加进 Allow-Headers**。

Express 示例：

```js
const CORS_HEADERS = [
  'Content-Type', 'X-QL-Client', 'X-QL-Auth-Mode', 'X-QL-Key-Id',
  'X-QL-Timestamp', 'X-QL-Nonce', 'X-QL-Body-Sha256', 'X-QL-Signature'
].join(', ')

app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
  res.set('Access-Control-Allow-Headers', CORS_HEADERS)
  res.set('Access-Control-Max-Age', '600')
  if (req.method === 'OPTIONS') return res.sendStatus(204)   // 预检直接放行
  next()
})

// 用 raw 拿原始字节，启用 HMAC 时签名才对得上
app.post('/api/config', express.raw({ type: '*/*', limit: '2mb' }), (req, res) => {
  const text = req.body.toString('utf-8').trim()
  if (!text.startsWith('{')) return res.status(400).json({ ok: false, error: '不是 JSON 对象' })
  try { JSON.parse(text) } catch (e) { return res.status(400).json({ ok: false, error: e.message }) }
  fs.writeFileSync('/srv/quicklaunch/config.json', text + '\n', 'utf-8')
  res.json({ ok: true })
})
```

nginx 片段：

```nginx
location /api/config {
    if ($request_method = OPTIONS) {
        add_header Access-Control-Allow-Origin *;
        add_header Access-Control-Allow-Methods "POST, OPTIONS";
        add_header Access-Control-Allow-Headers "Content-Type, X-QL-Client, X-QL-Auth-Mode, X-QL-Key-Id, X-QL-Timestamp, X-QL-Nonce, X-QL-Body-Sha256, X-QL-Signature";
        add_header Access-Control-Max-Age 600;
        return 204;
    }
    add_header Access-Control-Allow-Origin * always;
    proxy_pass http://your_backend;
}
```

其他注意点：

- 后端用 HTTPS 部署时，前端也建议 HTTPS；**HTTPS 页面不能请求 HTTP 后端**（混合内容会被浏览器直接拦）。
- 如果将来改成 Cookie / 凭据鉴权，不能用 `*`：要回显具体 Origin 并加 `Access-Control-Allow-Credentials: true`，
  同时客户端把 `credentials` 改成 `include`。
- 后端保存时建议先校验「首字符是 `{` 且能 `JSON.parse`」，避免把错误页当配置存下来
  （启动器「拉取在线配置」也是这个口径）。

### 4.6 与启动器「拉取在线配置」配合

两个动作是**不同的两条链路**，后端自己决定怎么映射：

```
生成器  ──POST /api/config（完整 JSON 文本）──▶  后端保存 / 版本化
启动器  ──GET  /config.json（返回原始 JSON）──▶  覆盖本地 config.json + .bak + 重载
```

启动器侧：界面右下角「拉取在线配置」填 GET 地址，或在配置里写一个 `type: download` 条目
（`fileName: "config.json"`、`onExists: "overwrite"`、`backup: true`、`reload: true`）。
详见 `wv2-launcher/README.md` 的「拉取在线配置」章节。

### 4.7 参考后端（本地联调）

仓库自带零依赖的 `scripts/mock-backend.mjs`，已实现完整的 CORS 预检、POST 保存、GET 回读：

```bash
npm run mock:backend
# 生成器提交地址  POST http://127.0.0.1:8787/api/config
# 启动器拉取地址  GET  http://127.0.0.1:8787/config.json
```

另开一个终端 `npm run preview`，在生成器提交面板填上面的 POST 地址即可跑通全流程。
落盘位置默认是系统临时目录，可用 `QL_MOCK_SAVE_PATH` / `QL_MOCK_PORT` 改。

---

## 5. 后端鉴权协议（预留，首版不启用）

### 5.1 首版：无鉴权

`backend.config.js` 里 `auth.mode = 'none'`，provider 返回空对象，
除了 `X-QL-Client` 之外不附加任何鉴权头。**后端按无鉴权实现即可**，不需要校验任何签名。

### 5.2 扩展点（后续接鉴权时不用改提交逻辑）

提交链路统一调用 `authProvider.headers({ url, body, method })` 并合并进请求头，
因此启用鉴权只需下面任意一种方式：

1. **编译期配置**：把 `backend.config.js` 改成
   `auth: { mode: 'hmac-sha256', keyId: 'xxx', secret: 'xxx' }` 后重新构建。
2. **页面临时启用**：提交面板「高级 · 鉴权预留」里选 `hmac-sha256`，填 Key Id / Secret。
   **只存在本次会话内存里**，不写 localStorage、不随配置导出、不进 JSON。
3. **运行时注入自定义 provider**（推荐用于真实生产环境）：在加载本工具前注入，无需重新构建：

   ```html
   <script>
   window.__QL_AUTH_PROVIDER__ = {
     mode: 'custom',
     label: '短期令牌',
     async headers({ url, body }) {
       const token = await fetch('/api/token').then(r => r.text())   // 同域登录态换短期令牌
       return { Authorization: 'Bearer ' + token }
     }
   }
   </script>
   ```

   注意：新增任何自定义头都要同步加进后端 CORS 的 `Access-Control-Allow-Headers`。
4. 还可以直接在 `src/backend/auth.js` 的 `createAuthProvider()` 里加新的 `mode` 分支。

### 5.3 `QL-HMAC-SHA256-v1` 规范

**请求头**（启用时附加）：

| 头 | 含义 |
|---|---|
| `X-QL-Auth-Mode` | 固定 `hmac-sha256` |
| `X-QL-Key-Id` | 密钥标识，后端据此查 secret |
| `X-QL-Timestamp` | Unix 秒（十进制字符串） |
| `X-QL-Nonce` | 每次请求唯一的随机串（32 位 hex） |
| `X-QL-Body-Sha256` | 请求体**原始字节**的 SHA-256，小写 hex |
| `X-QL-Signature` | `v1=<HMAC-SHA256 小写 hex>` |

**待签名规范串**（UTF-8，7 行，`\n` 连接，**末尾不加换行**）：

```
QL-HMAC-SHA256-v1
<timestamp>
<nonce>
POST
<host 小写，含非默认端口>
<pathname + search，与请求 URL 完全一致>
<X-QL-Body-Sha256>
```

**签名**：`signature = 'v1=' + hex( HMAC-SHA256(secret_utf8, 规范串_utf8) )`

**后端校验顺序**（参考实现：`scripts/mock-backend.mjs`，用 `QL_MOCK_SECRET` 开启）：

1. `X-QL-Auth-Mode === 'hmac-sha256'`，按 `X-QL-Key-Id` 取出 secret；
2. `|now - timestamp| <= 300` 秒，否则拒绝（时钟偏移）；
3. `nonce` 非空且 300 秒窗口内未出现过，否则拒绝（防重放）；校验通过后再记入缓存；
4. 对**收到的原始 body 字节**算 SHA-256，用**恒定时间比较**核对 `X-QL-Body-Sha256`；
5. 用后端实际收到的 `Host` 与 `request path` 重建规范串，重算 HMAC，恒定时间比较 `X-QL-Signature`；
6. 任一失败返回 `401`，建议响应体 `{ "ok": false, "error": "签名不匹配" }` 之类便于排查。

`body` 必须按原始字节读取（Express 用 `express.raw` 而不是 `express.json`），
否则重新序列化会改变空白字符，导致哈希不一致。

### 5.4 测试向量

下面这组值由 `npm run verify:backend` 实际算出并逐项断言；后端实现可直接拿来对照：

```
url        = http://127.0.0.1:8787/api/config?src=web
body       = {"hello":"世界"}
secret     = ql-demo-secret
keyId      = demo-key
timestamp  = 1770000000
nonce      = 0f1e2d3c4b5a6978
```

规范串（`\n` 为真实换行）：

```
QL-HMAC-SHA256-v1
1770000000
0f1e2d3c4b5a6978
POST
127.0.0.1:8787
/api/config?src=web
24466f368343e7f19ff9812f46cd548b45100e1dd244815a5549c2c853b331dd
```

结果：

```
X-QL-Body-Sha256: 24466f368343e7f19ff9812f46cd548b45100e1dd244815a5549c2c853b331dd
X-QL-Signature:   v1=1db5a7e99384d5af73fb27ebe2b31afd3f8bc5f9a19b5e4d6b20e8a86cf312ca
```

`npm run verify:e2e` 会用这个协议在真实 HTTP 后端上验证：
带签名提交被受理、重放 nonce 被拒、错误签名被拒、缺少签名头被拒。

### 5.5 安全边界（务必读）

- **静态前端里的 secret 不是秘密**：它会被编译进 `dist/index.html`，任何人都能查看。
  因此这个 HMAC 方案的定位是**内网 / 可信环境下的请求完整性与防重放**，不是真正的访问控制。
- 真要做访问控制，请走 §5.2 的第 3 种方式（运行时注入自定义 provider）：
  由同域登录态签发**短期令牌**，或用反向代理 / 网关做鉴权，前端只带令牌。
- Web Crypto（`crypto.subtle`）只在**安全上下文**可用：`https://` 或 `http://localhost`。
  用 `http://192.168.x.x` 这类局域网明文地址打开时 HMAC 模式会报清晰错误；此时请用无鉴权或自定义令牌 provider。
- 客户端时钟要准，否则会落在 ±300 秒窗口外；服务端应做 nonce 缓存清理，避免无限增长。

---

## 6. 测试与回归

```bash
npm run check
```

按序跑四层：

| 层 | 脚本 | 覆盖 |
|---|---|---|
| 1 | `verify.mjs` | 把 `wv2-launcher/config.json` 导入再导出，`deepStrictEqual` 逐字段无损；真实配置跑校验 0 错 0 提醒；**合并引擎 23 项**（两种策略、无 ID、导入文件自身重复、`_key`/`_include`/`_extra`/`params`、输出开关、纯函数只读性、往返无损） |
| 2 | `verify-backend.mjs` | 编译期注入、URL 覆盖、提交门禁、端点体检、请求体/头、超时、CORS 错误分类、HMAC 签名与独立实现比对、自定义 provider |
| 3 | `ui-check.mjs` | 无头 Chrome 交互（页签、类型切换、字段开关、速查表、**纵向类型 TAB 筛选**、提交面板、不发请求/发请求、状态提示、**导入三种模式、冲突预览只读、撤销与二次确认、解析失败不改数据**），共 98 项 |
| 4 | `e2e-check.mjs` | 起两个不同端口的 HTTP 服务，CDP 驱动浏览器做**真实跨域** POST → OPTIONS 预检 → GET 回读，再对启用 HMAC 的实例验证签名/重放/篡改 |

单项运行：`npm run verify:model` / `verify:backend` / `verify:ui` / `verify:e2e`。
浏览器相关脚本找不到 Chrome / Edge 时会跳过；`verify:backend` 需要事先 `npm run build`（它要检查 `dist/index.html`）。

---

## 7. 故障排查

| 现象 | 原因 / 处理 |
|---|---|
| 点提交提示「还有 N 处校验错误」 | 设计如此，先去「校验」页修错误 |
| 提示 `FILE_PROTOCOL` | 用 `file://` 打开了；改 `npm run preview` 或任意 HTTP 服务。本地生成功能不受影响 |
| `NETWORK_ERROR`，提示 CORS | 后端没起 / URL 错 / `OPTIONS` 没返回 Allow-* 头 / 证书问题；对照 4.5 与 `mock-backend.mjs` |
| `MIXED_CONTENT` | HTTPS 页面请求了 HTTP 后端，后端也上 HTTPS |
| `TIMEOUT` | 10 秒没响应；检查后端，或调大 `backend.config.js` 的 `timeoutMs` |
| `HTTP_ERROR` + 状态码 | 后端收到但拒绝了，看响应体；确认后端按原始文本接收 `application/json` |
| `AUTH_ERROR` 提到 `crypto.subtle` | HMAC 需要安全上下文，见 5.5 |
| 改了 `backend.config.js` 没生效 | 需要重新 `npm run build`；页面输入框里若还留着旧地址，会一直覆盖默认值，点「恢复默认」 |
| 想回到软件自带配置 | 顶栏「载入示例配置」 |
| 左侧条目好像少了一半 | 多半是点到了类型 TAB，看列表标题的「条目列表 · xxx」；点最上面的「全部」恢复。导出的 JSON 一直是完整的 |
| 竖栏里的长类型名看不清 | 窗口太窄时会缩字号（≤1180px 断点）；拉宽窗口或把鼠标悬在按钮上看完整 `title` |
| 合并后某些条目没变 | 检查是不是选了「保留原有配置」；切到「用新导入的配置覆盖原配置」再导一次。冲突 ID 在预览清单里能逐条看到 |
| 合并后多出一条没名字的定时任务 | 导入文件里那条没写 `id`；按设计 id 为空一律当新任务追加，可手动补 id 或删掉 |
| 合并后校验出现 `group` / `run` 引用提醒 | 覆盖或新增让引用关系变了，校验器自动重算，按提示改 `group` / `run` 即可 |
| 点「撤销上次合并」弹确认 | 合并之后又编辑过配置；撤销会连同这些新改动一起回退，不想要就点取消 |
| 「撤销上次合并」按钮不见了 | 只有成功执行过合并才有撤销点；全量覆盖 / 载入示例 / 清空会清掉它，快照存在独立的 `ql-merge-undo-v1` |

---

## 8. 常见改动点

| 想改什么 | 改哪里 |
|---|---|
| 默认后端地址 / 超时 / 鉴权模式 | `backend.config.js`（改完重新 build） |
| 新增 / 修改字段说明、校验格式 | `src/schema.js` + `src/validate.js`（UI 自动跟随） |
| 换鉴权算法 / 加自定义头 | `src/backend/auth.js`；同时更新后端 CORS Allow-Headers |
| 改提交请求方法、包装 body、凭据策略 | `src/backend/submit.js` |
| 改界面 | `src/components/BackendPanel.vue`、`src/styles.css` |
| 类型 TAB 的样式 / 宽度 / 筛选项 | `src/App.vue` 的 `typeTabs`、`src/store.js` 的 `filteredItems`、`.type-rail` 系列样式 |
| 合并判重规则 / 冲突策略 / 开关行为 | `src/merge.js`（纯函数，改完补 `scripts/verify.mjs` 用例） |
| 导入弹窗的模式选择、冲突预览、撤销入口 | `src/App.vue` 的 `importMode` / `mergePolicy` / `mergePreview`、`src/store.js` 的 `mergeJson` / `undoMerge`、`.import-*` / `.mp-*` 样式 |
| 单文件产物 | `vite.config.js` 的 `singleFileHtml()` 插件 |

---

## 9. 边界说明

- `launcher.ini`（AHK 侧设置）不属于 `config.json`，本工具不处理。
- 顶层 `name` / `version` 在启动器 README 里没有单列说明，按「顶层元数据、启动器不读取」保留为可编辑字段。
- `params[].required` 是 `wv2-launcher/ui/app.js` 用到但 README 未记载的兼容字段，已做进子表并在界面标注来源。
- `dist/index.html` 作为「离线可直接双击使用」的发布物一并入库；`node_modules/` 与临时文件已忽略。
- 推送远端由使用者手动执行，本仓库的自动化流程不会自动 `git push`。
