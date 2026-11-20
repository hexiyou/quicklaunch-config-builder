# QuickLaunch config.json 可视化生成器

给 [wv2-launcher](../wv2-launcher/README.md)（AHK + WebView2 的 Windows 快速启动器）配套的前端工具：
在网页上点选、填表、增删条目，实时生成、校验并导出 `config.json`。
**离线单文件**即可使用；另外附带两个**可选的附加功能**：把配置「提交到后端」（配合启动器已有的「拉取在线配置」做多机同步），
以及「导入 config.json」的**合并模式**（按 ID 判重增量并入，可预览冲突、可撤销）。

字段字典与上游 `wv2-launcher` 的 README / `ui/app.js` 保持同步，已覆盖到 **`d76e27b`**：
`d48be68` 的顶层 `callback` 回调块、`03086ae` 的 `callback.popup`（共 6 个可选字段），
以及 `713398e` / `d76e27b` 的内置变量 `{{@config}}` / `{{@fp}}` 与动态值 `{{#machine}}`（见 §3.4 / §3.5）。
顺带对齐了 jsonfile 的 YAML/TOML、download 的 headers 动态值、`savePath` 缺省目录、
`at` / `every` 宽松写法等几处文档口径。

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
│   └── components/            各编辑器；BackendPanel.vue = 云端提交，MultipartEditor.vue = 文件上传，
│                              CallbackEditor.vue = 顶层 callback 回调块
├── scripts/
│   ├── verify.mjs             模型层「导入→导出」无损回归 + 合并 23 + multipart 23 + callback 36 + 新特性 36 项用例
│   ├── verify-backend.mjs     提交 / 鉴权链路的 Node 层回归
│   ├── ui-check.mjs           无头浏览器交互回归（file:// + fetch 打桩，162 项）
│   ├── e2e-check.mjs          真实跨域端到端（两个 HTTP 服务 + CDP 驱动浏览器）
│   └── mock-backend.mjs       ★ 零依赖参考后端，已配好 CORS / 可选 HMAC 校验
└── dist/index.html            构建产物（作为离线发布物一并入库）
```

---

## 2. 配置覆盖度与校验口径

字段字典 `src/schema.js` 逐项对照 `wv2-launcher/README.md` 的
**「四、配置说明」**（含 webhook / download / jsonfile / 模板变量 / 发送前展开的动态值）与
**「七、定时调度」**，以及新增的**「回调：响应里带 `_ql_callback` 就执行本地动作」**一节；
实现细节逐条核对 `wv2-launcher/ui/app.js` 的 `cbCfg()` / `cbPlan()` / `TPL_RE` / `builtinIssues()`
归一化与模板逻辑，共结构化 **56 个字段**：

| 区域 | 字段数 | 说明 |
|---|---|---|
| 顶层 | 5 | `name` / `version` / `items` / `groups` / `schedules`（另有第 6 个顶层键 `callback`，其 6 个子字段在下行单独统计） |
| 顶层 `callback` | 6 | `enabled` / `max` / `maxDepth` / `allow` / `onQuiet` / `popup`（整块可选，见 §3.4） |
| 条目 `items[]` | 27 | 8 种 `type`（app / cmd / url / folder / ahk / webhook / download / jsonfile）动态决定哪些字段可见 |
| 参数 `params[]` | 7 | 交互参数子表，含 `{{变量}}` 支持 |
| 分组 `groups[]` | 2 | |
| 定时任务 `schedules[]` | 9 | `at` / `every` / `days` / `enabled` 等 |

界面里每个字段都带 README 对应的说明、格式、适用类型；「字段速查」页把全部字段列成表格一次看全。
**发送前展开的动态值**收录 20 种（含四个 `{{#file…}}` 文件系列与 `d76e27b` 新增的
`{{#machine}}` / `{{#machine:short}}`），口径为 **headers 与 body 都展开**，见 §3.3。
另有 **8 种内置变量** `{{@config}}` / `{{@fp}}` 一族，它们不带 `#`、不需要声明 `params`，见 §3.5。

**校验要点**：`id` 必填唯一且限 `[A-Za-z0-9_.-]`；`target` 按 type 校验（webhook / download 必须 http(s)）；
`timeout > 0 且 ≤120`；`method` 限 6 种、`onExists` 限 skip/overwrite；
`at` 为 `HH:MM(:SS)` 及范围、`every` 30 秒～30 天、`at`/`every` 二选一、`days` 只跟 `at`；
布尔字段严格只认真/假（写字符串或数字会报错，因为程序会按缺省处理）；
`accent` 颜色格式；`group` 引用检查；模板变量未声明直接报错、没声明 params 只警告，
模板正则对齐上游（认 `@` 与名字两侧的空格，`@` 开头的**不算参数**）。
`multipart` 三种写法都认，会拦截「没有任何可用文件」「`files[]` 某项缺 `path`」「值不是对象」，
并在同时写了 `body` 时提醒 body 会被忽略；`{{参数}}` 模板的生效字段已包含 `multipart`。
内置变量拼错（`{{@confg}}` / `{{@config.txt}}` / `{{@config:json}}`）按上游 `builtinIssues()` 口径**报错拦下**；
请求头里用 `{{@config}}` 会提醒改用 `.b64`，`multipart` 里用 `@config` 会提醒 boundary 风险。
`callback` 块按上游运行时口径校验：`enabled` 只认布尔、`allow` 必须是字符串数组且引用已知条目 id、
`max` / `maxDepth` 超出 1~20 或非整数只提醒（程序会夹紧/取整）、`onQuiet` 非 `notify` / `popup` 只提醒、
`popup` 不在 `native` / `custom` / `gui` / `window` 里只提醒（会静默回落 native）、
`enabled:false` 时写了其它字段会提醒；`callback` 写成非对象（数组 / 字符串 / null）则报错并原样保留。

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

### 3.3 webhook 文件上传：`multipart` 与文件类动态值

跟进上游提交 `38dc410`（「webhook 支持上传本地文件」）。在条目编辑区「HTTP 请求」分组里勾选
`multipart` 开关，会出现结构化编辑器，顶部三个按钮切换**三种写法**（程序都认）：

| 写法 | 生成的 JSON | 说明 |
|---|---|---|
| 完整式 | `{"fields":{"note":"hi"},"files":[{"field":"photo","path":"{{file}}"}]}` | 可同时带普通文本字段和多个文件 |
| 单文件 | `{"field":"file","path":"C:\\a.png"}` | 只传一个文件、不带 `fields` 的简写 |
| 文件数组 | `[{"field":"a","path":"1.png"},{"field":"b","path":"2.png"}]` | 只传多个文件、不带 `fields` 的简写 |

`files[]` 每行四个字段：`field`（表单字段名，缺省 `file`）、`path`（**必填**，本地路径）、
`filename`（上传后服务端看到的名字，缺省取磁盘文件名）、`type`（MIME，缺省按扩展名猜）。
`path` 与 `fields` 的值都支持 `{{参数}}` 和 `{{#…}}` 动态值，编辑器里各有一个插入下拉。

行为约定（与启动器一致）：

- **有 `multipart` 就整个走它，`body` 不参与**；两者都写不报错，但校验器会提醒。`Content-Type`（含 boundary）由程序自己拼，你在 `headers` 里写了就不覆盖。
- 单文件上限 **8MB**；文件名里的引号和换行会被替换成单引号和空格（防止往包里插假头部）。
- `path` 支持 `{{参数}}`、`file://`、`%TEMP%`、相对路径；代码还认 `file` 作为 `path` 的别名，导入时会原样保留。
- 写了 `multipart` 却没有任何可用文件是最容易静默失效的情况（程序会退化成普通 body），校验器会直接报「没有可用的文件」；`files[]` 某项缺 `path` 也会逐条报错。

**导入兼容性**：导入已有配置时，编辑器按值反推写法（数组 → 文件数组、带 `fields`/`files` 键 → 完整式、带 `path`/`file` → 单文件）。
你不主动改就不会重写这段 JSON，字典外的自定义键也会原样带回；`scripts/verify.mjs` 对三种写法 + `file` 别名都做了逐字段往返断言。
切换写法时数据不会丢：切到「单文件 / 文件数组」时不兼容的 `fields` 和多出来的文件会**暂存**（界面给提示、不写进 JSON），切回「完整式」即恢复。

**动态值口径**：上游把展开面从「只有 headers」扩到了 **headers + body**，并新增四个文件系列：

| 写法 | 结果 |
|---|---|
| `{{#file:路径}}` | 读本地文本文件，默认裁掉尾部换行；二进制文件报错拒发 |
| `{{#file-raw:路径}}` | 同上，保留原样的尾部换行 |
| `{{#filebase64:路径}}` | 按字节读（二进制也安全），编码成 Base64 |
| `{{#filehash:sha256:路径}}` | 文件字节的摘要，十六进制；算法支持 md5 / sha1 / sha256 / sha384 / sha512 |

`body` 整个来自一个文件时等价 `curl --data-binary @x`。模板内联上限 2MB；`{{#file:路径}}` 里的路径不能带裸花括号。
`{{#…}}` 带 `#`，前端的字符类不认它，所以不会被误判成未声明的 `{{参数}}`。
`{{变量}}` 的生效字段同步补上了 `multipart`（`ui/app.js` 的 `TPL_FIELDS` 也加了它），
因此 `multipart` 里引用了没在 `params` 声明的变量同样会被校验器拦下。

> 上游 `wv2-launcher/README.md` 的动态值小节里还留了一句「只展开请求头：target / body 里的 `{{#ts}}` 不动」，
> 那是 11-02 的旧文，本次代码改了行为但没删干净（已与项目作者确认）。**以 `launcher.ahk` 的
> `body := HdrExpand(body)` 和本节为准**；本工具、字段速查、校验说明统一按 headers + body 表述。

### 3.4 顶层 `callback` 回调块（对齐上游 `d48be68` / `32ede80` / `03086ae`）

上游在 `config.json` **顶层新增一个可选对象块 `callback`**，用于 webhook 响应带 `_ql_callback` 时执行本地动作。
`03086ae` 又补了第 6 个字段 `popup`。左侧 **「↺ 回调 callback」** 页与「配置总览 → 可选区块」都有开关。

| 字段 | 缺省 | 说明 / 校验口径 |
|---|---|---|
| `enabled` | `true` | 总开关。只有布尔 `false` 才关；写 `"false"` / `0` / `null` 一律按启用。 |
| `max` | `5` | 一次响应最多执行几个动作。整数 1~20；写 0 会被夹到 1（**不是禁用**），非数字退回 5。 |
| `maxDepth` | `5` | 一条回调链最多几跳，防环 + 祖先链判定。与 `max` 互相独立。 |
| `allow` | `[]` | 非空时只有列出的条目 id 能被 `run` 拉起（按小写比对）；空数组 = 不限制。 |
| `onQuiet` | `notify` | 只有写 `popup`（忽略大小写）才让定时任务触发的链照常弹模态框，其余一律托盘提示。 |
| `popup` | `native` | 提示框机制：`native` = 系统消息框 + `Owner<主窗口>`（缺省，模态、系统提示音、Ctrl+C 复制正文、按主窗口居中）；`custom` = 自绘置顶窗口（非模态、成功绿失败红）。也认 `gui` / `window` 别名，大小写不敏感；**其它一切值（含 `msgbox`、数字、拼错）静默回落 native**。主窗口在屏幕外时 native 自动改走 custom。 |

> `popup` 是配置键；动作里的 `"type": "popup"` 只是 `msg` 的别名，两处不相干。
> 上游 `cbCfg()` 的判定是 `['custom','gui','window'].includes(小写值) ? 'custom' : 'native'`，
> 生成器按这个口径给未知值/非字符串值只提醒、不拦。

**行为要点**：响应 JSON 的**根对象第一层**带 `_ql_callback` 才触发，深层的同名键不触发；
`actions` 支持 `msg` / `run` 两类（也认 `popup` / `exec` 别名）；
`run` 还能带 `args`（文本，也认数组）/`params`（按参数名给值，值里有空格也不会被拆坏），
动作值里的 `{{body.a.b}}` / `{{status}}` / `{{from.id}}` 等**响应模板**会在执行前填好
（和条目自己的 `{{参数}}` 是两层：一层来自远端响应，一层来自本次给的参数）。
提示框两套由 `callback.popup` 选，先回执再执行，不会把 `ql run x --wait` 堵住；
错误响应（4xx/5xx）同样能回调；日志在 `launcher.log`，每条带 `[cb]` 前缀。
完整的 14 条运行时约定在「回调 callback」页与「字段速查 → 顶层 callback 回调块」里。

**生成器侧的三个保证**：

1. **不写就是全默认值**：关掉开关时导出的 JSON 完全不含 `callback` 键；没有任何字段会被擅自注入。
   上游自带的 `config.json` 本身也没写这个块，所以老配置一个字都不用改。
2. **顺序不破坏旧文件**：`callback` 是后加的顶层块，刻意排在导出 JSON 的**末尾**；
   不写时顶层键顺序仍是 `name → version → items → groups → schedules`，
   `deepStrictEqual` 往返无损回归已覆盖。
3. **不丢自定义键**：`callback` 内字典外的子键走 `_extra` 原样保留；
   写成数组 / 字符串 / `null` 这类坏值也不当场改写，而是留在 JSON 预览里由校验器报错。
   「合并导入」按既有约定只动 `items` / `groups` / `schedules` 三个数组，
   **现有 `callback` 与顶层字段一律保留**，导入文件里的 `callback` 不会覆盖它；
   「全量覆盖」仍按导入文件整体还原（含移除 `callback`）。

> 顺带对齐的几处上游文档口径（不改结构，只改字段说明）：`jsonfile` 已支持 YAML / TOML
> （按扩展名选解析器，`.yaml` / `.toml` 上限 2 MB）；`download` 的 `headers` 也走动态值展开；
> `savePath` 缺省改为 `%USERPROFILE%\Downloads`；`at` 允许时分只写一位、`every` 允许纯数字与中文单位。

### 3.5 内置变量与设备指纹（对齐上游 `713398e` / `d76e27b`）

这两次提交**没有改 `config.json` 结构**，但新增了一整类模板写法，生成器的字段字典、模板扫描、
校验和速查都同步了。名字前面的 `@` 是「内置变量」的门牌：它们是**环境**不是**参数**，
不需要声明 `params`，也不算「引用了没声明的变量」。

| 写法 | 出来什么 | 用在哪 |
|---|---|---|
| `{{@config}}` | `config.json` 全文的 JSON 字符串内容（引号/反斜杠/换行已转义） | 字符串 body；不带修饰时按 body 形态自动选 |
| `{{@config.json}}` | 上一行的别名 | 写全一点更好读 |
| `{{@config.raw}}` | 原文，多行 | 对象 body、`text/plain`、按字节比对 |
| `{{@config.b64}}` | UTF-8 → Base64，单行纯 ASCII | **请求头只能用这个** |
| `{{@fp}}` | 浏览器指纹 `FP1-…`（页面 JS 算，Edge 升级不变） | 要拿到别的网页应用里校验 |
| `{{@fp.short}}` | 前两段 | 请求头 / URL |
| `{{@fp.bound}}` | `FPB1-…`，拌进 AHK 生成的本机盐 | 只在本机可复算的强绑定版 |
| `{{@fp.parts}}` | 明细串 `v=1\|os=…\|cores=…` | 排查 / 服务端差分 |

另有两条 AHK 侧 `#` 层动态值并进了 §3.3 的动态值表：`{{#machine}}`（WMI 主板 + 系统盘算的
`MC1-…`，32 hex，缓存在 `machine.ini`）与 `{{#machine:short}}`（前两段）。它能进请求头、
也能写成 `{{#hmac:demo:{machine}}}` 嵌进签名；`{{@fp}}` 则是页面 JS 算的，**两套算法不同**。

**生成器侧做了什么**：

1. **字段字典**：新增 `BUILTIN_VALUES`（8 条）/ `BUILTIN_KEYS` / `BUILTIN_RULES`（11 条），
   `DYNAMIC_VALUES` 从 18 补到 20；「字段速查」新增内置变量专章与规则清单。
2. **插入下拉**：任意模板生效字段（`target` / `args` / `query` / `headers` / `body` /
   `savePath` / `fileName` / `multipart`）都能选内置变量；`headers` / `body` 另外还能选 `#` 动态值。
   非模板字段（如 `id` / `name`）不显示这些选项。
3. **模板扫描对齐上游 `TPL_RE`**：认名字两侧的空格（`{{ @config }}` 等价于 `{{@config}}`）；
   `@` 开头的不进参数变量集合，`#` 开头的前端本来就不认，转义口 `{{{{` / `}}}}` 照旧剔除。
4. **校验**：用比 `TPL_RE` 更宽的正则（对齐 `builtinIssues()`）抓「形似但不合法」的
   `{{@confg}}` / `{{@config.txt}}` / `{{@config:json}}`，**报错拦下**；
   `{{{{@config}}}}` 是逃生口不算引用。另按 README 口径提醒：请求头里的 `@config` 改用 `.b64`、
   `multipart` 里别用 `@config`（不走 HdrExpand，哨兵会留下、换行会破坏 boundary）。

> 几条容易踩的：不带修饰的 `{{@config}}` 在**对象 body** 里给原文（随后 `JSON.stringify`
> 会转义一次，抢先转义就是双重转义），在**字符串 body** 里给转义形；要原文请显式写 `.raw`。
> 内置变量不会被二次展开，注入时把 `{{#` 换成哨兵躲开 AHK 的 `HdrExpand`，收尾字节级复原。
> **全文外发**：配置里的接口地址、token、路径都会发过去；`{{@fp}}` 不是秘密（算法在 JS 里，
> 只有 `bound` 的盐藏得住）；两套指纹都含硬件特征，目标地址要可信。

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
| 1 | `verify.mjs` | 把 `wv2-launcher/config.json` 导入再导出，`deepStrictEqual` 逐字段无损；真实配置跑校验 0 错 0 提醒；**合并引擎 23 项**（两种策略、无 ID、导入文件自身重复、`_key`/`_include`/`_extra`/`params`、输出开关、纯函数只读性、往返无损）；**multipart / 动态值 23 项**（三种写法 + `file` 别名逐字段往返、模板扫描、校验拦截、动态值不误判）；**callback / 文案口径 36 项**（缺省不写与键顺序、逐字段往返、坏值保留、6 类字段校验、合并保留、上游文案对齐）；**popup / 内置变量 / 设备指纹 36 项**（popup 四种合法值往返与别名回落、8 个内置键、模板正则与宽正则、拼错拦截、headers `.b64` 与 multipart 提醒、machine 清单、文案口径） |
| 2 | `verify-backend.mjs` | 编译期注入、URL 覆盖、提交门禁、端点体检、请求体/头、超时、CORS 错误分类、HMAC 签名与独立实现比对、自定义 provider |
| 3 | `ui-check.mjs` | 无头 Chrome 交互（页签、类型切换、字段开关、速查表、**纵向类型 TAB 筛选**、提交面板、不发请求/发请求、状态提示、**导入三种模式、冲突预览只读、撤销与二次确认、解析失败不改数据**、**multipart 三种写法切换与 JSON 联动、导入自动识别写法、动态值口径**、**callback 开关 / 6 字段编辑（含 popup 别名）/ 校验提醒 / 导入结构化 / 合并保留 / 速查表**、**内置变量速查专章 / 插入下拉 / 拼错拦截**），共 162 项 |
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
| 勾了 `multipart` 就报「没有可用的文件」 | 每个 `files[]` 项都要填 `path`（或别名 `file`）；只填 `fields` 而没有文件时程序会静默退化成普通 body，所以校验器直接拦下 |
| 切到「单文件 / 文件数组」后 `fields` 不见了 | 两种简写按设计不带 `fields`；内容已暂存、界面有提示，切回「完整式」即可恢复，不会丢数据 |
| 同时写了 `body` 和 `multipart` | 有 `multipart` 就整个走它，`body` 会被忽略；校验器只提醒不报错，删掉其中一个即可 |
| 导入的 multipart 写法被改了 | 不会：编辑器按值反推写法，不主动编辑就不重写 JSON，字典外自定义键也原样保留 |
| `{{#file:…}}` 被报成「没有在 params 里声明」 | 先确认写的是带 `#` 的动态值（前端不认 `#`，不会误判）；如果确实写了 `{{参数}}`，就得在 `params` 里声明它 |
| 导出的 JSON 里找不到 `callback` | 这是正常缺省：左侧「回调 callback」页的开关默认关闭，上游也全走默认值。打开后再填字段即可 |
| 打开 callback 开关后 JSON 只有 `"callback": {}` | 设计如此，效果与全默认一致；逐个勾左边字段的勾选框才会写入具体值 |
| `max` 写 0 想禁用回调 | 程序会把它夹成 1；要彻底关掉请写 `enabled: false`（只有布尔 `false` 生效） |
| 校验说 `allow` 里的 id 不存在 | `run` 动作拉起条目时会被静默跳过、只记日志；改成 `items[].id` 里的值（大小写不敏感）即可 |
| 导入的配置带 `callback` 但合并后没生效 | 合并模式按约定只动三个数组，顶层 `callback` 与 `name` / `version` 一律保留现有值；改用「清空原有，全量覆盖」才会采用导入文件的值 |
| 旧版浏览器缓存里没有 callback 编辑区 | 已做兼容：载入 localStorage 时自动补齐 `callback` / `includeCallback` 两个键，不会白屏 |
| `callback.popup` 写了 `msgbox` 却还是系统框 | 上游只认 `custom` / `gui` / `window` 为自绘，其它值（含 `msgbox`）一律静默回落 `native`；校验器会给出提醒 |
| 校验提示 `popup` 会回落 native | 值不在 `native` / `custom` / `gui` / `window` 里，或写成了数字/布尔；改成这四个之一即可（大小写不敏感） |
| `{{@config}}` 被报「没有在 params 里声明」 | 不会：生成器已按上游把 `@` 开头的内置变量排除在参数集合外。如果报的是「不是合法的内置变量」，说明拼错了，见下一条 |
| 报「不是合法的内置变量」 | `{{@confg}}` / `{{@config.txt}}` / `{{@config:json}}` 这类形似但不合法的写法会被拦下；只用 §3.5 表里的 8 种，`{{{{@config}}}}` 是逃生口不算引用 |
| 请求头里放 `{{@config}}` 被提醒 | 头值不能带换行，改用 `{{@config.b64}}`（单行纯 ASCII）；大配置还可能撞服务端头长度上限，走 body 更稳 |
| `multipart` 里用 `{{@config}}` 被提醒 | 那一路不走 HdrExpand，哨兵会留在内容里、原文换行还会破坏 boundary；要用就给 `.b64` |
| 想要机器指纹却只在 headers 里看到 `{{@fp}}` | `{{#machine}}` 是 AHK 侧 `#` 层动态值，在「发送前展开的动态值」表里；两套算法不同，可同时用 |

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
| 导入弹窗的模式选择、冲突预览、撤销入口 | `src/App.vue` 的 `importMode` / `mergePolicy` / `mergePreview`、`src/store.js` 的 `mergeJson` / `undoMerge`、`.import-*` / `.mp-*`（合并预览）样式 |
| `multipart` 三种写法 / 文件子表 | `src/components/MultipartEditor.vue`、`src/styles.css` 的 `.mpart-*`、`src/schema.js` 的 `multipart` 字段定义、`src/model.js` 的 `ensureUsable` |
| 动态值清单、展开面口径、模板生效字段 | `src/schema.js` 的 `DYNAMIC_VALUES` / `DYNAMIC_RULES` / `TEMPLATE_FIELDS`、`src/components/ReferencePanel.vue` / `KvEditor.vue` / `ParamsEditor.vue` |
| `multipart` 校验规则 | `src/validate.js` 的 `normalizeMultipartForCheck` 与 `case 'multipart'` |
| `callback` 字段说明 / 行为约定 / 校验 | `src/schema.js` 的 `CALLBACK_FIELDS` / `CALLBACK_RULES` / `README_NOTES`、`src/components/CallbackEditor.vue`、`src/validate.js` 的 `顶层 callback` 段 |
| `callback` 的导入 / 导出 / 开关 / 旧数据兼容 | `src/model.js` 的 `createCallback` / `stateFromJson` / `buildConfig`、`src/store.js` 的 `normalizeState` 与各全局操作、`src/merge.js` 的 `mergeStates` |
| `popup` 的枚举 / 别名回落 | `src/schema.js` 的 `CALLBACK_POPUP` / `CALLBACK_POPUP_CUSTOM`、`src/validate.js` 的 `case popup` 段 |
| 内置变量清单 / 模板正则 / 拼错拦截 | `src/schema.js` 的 `BUILTIN_KEYS` / `BUILTIN_VALUES` / `BUILTIN_RULES`、`src/model.js` 的 `TPL_RE` / `collectTemplateVars` / `collectBuiltinRefs` / `itemBuiltinRefs`、`src/validate.js` 的「内置变量体检」段 |
| 内置变量插入下拉 / 速查专章 | `src/components/Field.vue` 的 `allInsertables`、`src/components/ReferencePanel.vue` |
| 单文件产物 | `vite.config.js` 的 `singleFileHtml()` 插件 |

---

## 9. 边界说明

- `launcher.ini`（AHK 侧设置）不属于 `config.json`，本工具不处理。
- 顶层 `name` / `version` 在启动器 README 里没有单列说明，按「顶层元数据、启动器不读取」保留为可编辑字段。
- 顶层 `callback` 是上游 `d48be68` 新增、`03086ae` 补 `popup` 的**可选**块（共 6 个字段）；
  生成器不写它时行为与上游默认值完全一致，也不把它塞进 `meta._extra` 重复持久化。
  上游 `config.json` 本身不含这个块，因此本项目内置示例同样不含。
- `_ql_callback` 是**接口响应**里的键，不是 `config.json` 的配置项；本工具只在「回调 callback」页给出响应示例，
  不会把它写进导出结果。`run` 动作的 `args` / `params` 与 `{{body.…}}` 响应模板同理，都是响应侧内容。
- `{{@config}}` / `{{@fp}}` 与 `{{#machine}}` 是**模板变量**，不是配置字段，不新增任何 JSON 键；
  生成器只在字段字典、插入下拉、速查和校验里表达它们。设备指纹的具体值由上游运行时算，
  本工具不采集、不计算、不预览，也不会写进导出结果。
- `machine.ini`（机器码缓存 + 本机盐）是上游运行时自动生成的文件，不属于 `config.json`，本工具不处理。
- `params[].required` 是 `wv2-launcher/ui/app.js` 用到但 README 未记载的兼容字段，已做进子表并在界面标注来源。
- `dist/index.html` 作为「离线可直接双击使用」的发布物一并入库；`node_modules/` 与临时文件已忽略。
- 推送远端由使用者手动执行，本仓库的自动化流程不会自动 `git push`。
