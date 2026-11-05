/**
 * QuickLaunch config.json 字段字典
 * ---------------------------------------------------------------
 * 所有 desc / rule / note 均取自 wv2-launcher/README.md「四、配置说明」
 * 与「七、定时调度」，并对照 ui/app.js 的 normalizeItem / normalizeSchedules
 * 归一化实现核对过默认值与容错口径。
 *
 * 字段对象约定：
 *   key        写入 JSON 的键名
 *   label      界面显示名
 *   kind       控件类型（决定 Field.vue 渲染哪个控件）
 *   required   是否必填（必填字段一定写入 JSON）
 *   optional   可选字段：由「字段开关」决定是否写入 JSON
 *   default    新建对象时的初值
 *   applies    适用条目 type，null = 全部
 *   section    编辑器里的分组
 *   desc       字段意义（README 对应说明）
 *   format     格式 / 校验口径
 *   doc        README 章节
 */

/* ------------------------------------------------------------------ 条目类型 */

export const ITEM_TYPES = [
  {
    value: 'app',
    label: 'app · 应用',
    desc: '启动 exe。target 支持绝对路径、裸命令名（交给 PATH）、shell: / ms- 协议（如 ms-calculator:）。明确的相对路径（. / .. 开头或带分隔符）按脚本目录解析。',
    targetHint: 'C:\\Windows\\System32\\notepad.exe 或 notepad.exe 或 ms-calculator:'
  },
  {
    value: 'cmd',
    label: 'cmd · 命令',
    desc: 'cmd /s /k "<target> <追加参数>"。target 是一整条命令行（不带 cmd），如 ipconfig /all、echo hi && echo bye。别自己再写 cmd /k，那是两层 cmd，&& 还得转义成 ^&^&。/k 跑完不关窗口。',
    targetHint: 'ipconfig /all 或 echo 开始 && echo {{msg}}'
  },
  {
    value: 'url',
    label: 'url · 链接',
    desc: 'ShellExecute 打开（网址、自定义协议），target 原样使用。不接受运行时参数。',
    targetHint: 'https://example.com 或 ms-calculator:'
  },
  {
    value: 'folder',
    label: 'folder · 目录',
    desc: '用资源管理器打开目录，target 一律当路径，相对路径按脚本目录解析。不接受运行时参数。',
    targetHint: '.（脚本目录）或 D:\\工作目录'
  },
  {
    value: 'ahk',
    label: 'ahk · 脚本',
    desc: '用当前 AHK 运行另一个 .ahk 脚本，target 一律当路径，相对路径按脚本目录解析。参数逐项加引号后追加。',
    targetHint: '.\\scripts\\demo.ahk'
  },
  {
    value: 'webhook',
    label: 'webhook · HTTP 请求',
    desc: '由 AHK 侧用 WinHttp 在独立子进程发 HTTP 请求，把响应显示在面板里（JSON 自动画成可折叠的树）。不是页面 fetch，所以不受 file:// 的 CORS 限制。',
    targetHint: 'https://api.example.com/v1/data'
  },
  {
    value: 'download',
    label: 'download · 下载文件',
    desc: 'webhook 的变种：联网逻辑完全一样，只是响应体按二进制写进文件而不是显示在面板里。刻意做小（一次性进内存、先写 .part 再改名），不做断点续传 / 进度条。只认 2xx。',
    targetHint: 'https://example.com/files/report.pdf'
  },
  {
    value: 'jsonfile',
    label: 'jsonfile · 本地 JSON',
    desc: '读本地一个 JSON 文件并显示成树，借 webhook 那套 JSON 树 / Ctrl+F / jsonPath。不联网、不发请求。大小上限 8 MB，自动认 BOM，无 BOM 的 GBK 会按 936 再读一次。',
    targetHint: 'file://c:\\app\\data.json 或 C:\\data.json 或 data\\x.json'
  }
]

export const TYPE_MAP = Object.fromEntries(ITEM_TYPES.map(t => [t.value, t]))

/* ------------------------------------------------------- 请求方法 / 枚举选项 */

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']

export const ON_EXISTS = [
  { value: 'skip', label: 'skip · 跳过（默认）' },
  { value: 'overwrite', label: 'overwrite · 覆盖' }
]

export const PARAM_TYPES = [
  { value: '', label: '（不指定）' },
  { value: 'path', label: 'path · 路径补全' },
  { value: 'dir', label: 'dir · 目录补全' },
  { value: 'file', label: 'file · 文件补全' }
]

export const DAY_OPTIONS = [
  { value: 'mon', label: '周一 mon' },
  { value: 'tue', label: '周二 tue' },
  { value: 'wed', label: '周三 wed' },
  { value: 'thu', label: '周四 thu' },
  { value: 'fri', label: '周五 fri' },
  { value: 'sat', label: '周六 sat' },
  { value: 'sun', label: '周日 sun' }
]

export const DAY_PRESETS = [
  { value: 'weekdays', label: '工作日（weekdays）' },
  { value: 'weekend', label: '周末（weekend）' },
  { value: '每天', label: '每天 / daily / * / all' }
]

export const EVERY_UNITS = [
  { value: 's', label: '秒 s' },
  { value: 'm', label: '分 m' },
  { value: 'h', label: '小时 h' }
]

/* ------------------------------------------------------------- 顶层字段 */

export const TOP_FIELDS = [
  {
    key: 'name', label: '配置名称', kind: 'text', section: 'meta',
    required: false, default: 'QuickLaunch',
    desc: '配置文件的名字。现有 config.json 里是 "QuickLaunch"。',
    format: '任意字符串',
    doc: 'README 未单列说明（顶层元数据，启动器只读 items / groups / schedules）'
  },
  {
    key: 'version', label: '配置版本', kind: 'number', section: 'meta',
    required: false, default: 1,
    desc: '配置格式版本号，现有 config.json 里是 1。',
    format: '整数，≥ 1',
    doc: 'README 未单列说明（顶层元数据）'
  }
]

/* --------------------------------------------------------------- 条目字段 */

export const ITEM_FIELDS = [
  /* ---- 基础 ---- */
  {
    key: 'id', label: 'ID', kind: 'text', section: 'basic', required: true,
    default: '', applies: null,
    desc: '条目的唯一标识。搜索、ql run、schedules.run、usage.json 都靠它认条目。',
    format: '必填 · 全表唯一 · 建议 [A-Za-z0-9_.-]（代码缺省时会生成 item-N，但定时任务与命令行都依赖 id，因此生成器要求显式填写）',
    placeholder: 'notepad', doc: '四、配置说明 → config.json（数据源）'
  },
  {
    key: 'name', label: '显示名', kind: 'text', section: 'basic', required: true,
    default: '', applies: null,
    desc: '界面上显示的名字，也是搜索主字段（拼音 / 首字母 / 跳字模糊都基于它）。',
    format: '必填 · 非空字符串', placeholder: '记事本',
    doc: '四、配置说明 → config.json（数据源）'
  },
  {
    key: 'subtitle', label: '副标题', kind: 'text', section: 'basic', required: false,
    default: '', applies: null,
    desc: '列表里显示在主名下面的补充说明，也参与搜索打分（分数 ≤ 62）。',
    format: '字符串', placeholder: '快速记录文本',
    doc: '四、配置说明 → config.json（数据源）'
  },
  {
    key: 'keywords', label: '搜索关键词', kind: 'tags', section: 'basic', required: false,
    default: [], applies: null,
    desc: '额外搜索词，支持中英文。不需要堆拼音 —— 前端内置 GB2312 拼音表，会自动派生全拼和首字母。keywords 全等命中得 85 分。',
    format: '字符串数组；回车或逗号分隔',
    placeholder: 'txt, 文本, 记事',
    doc: '四、配置说明 → 搜索与排序'
  },
  {
    key: 'icon', label: '图标', kind: 'text', section: 'basic', required: false,
    default: '', applies: null,
    desc: '图标来源：exe 路径 / png|ico|svg|jpg|gif|webp|bmp 路径 / http(s) 地址 / emoji。留空时自动从 target 的 exe 里提取图标（SHGetFileInfo → GDI+ → PNG 缓存）；提不到就退化成「首字 + 渐变色」头像。',
    format: '路径（支持 UNC）/ URL / 单个 emoji / 空字符串（自动提取）',
    placeholder: 'C:\\Windows\\System32\\notepad.exe 或 ⚙ 或留空',
    doc: '四、配置说明 → target 的解析规则 / 局域网共享'
  },
  {
    key: 'type', label: '条目类型', kind: 'select', section: 'basic', required: true,
    default: 'app', applies: null, options: ITEM_TYPES,
    desc: '决定条目怎么执行、target 怎么解析、哪些字段有意义。缺省时代码按 app 处理，生成器始终显式写出。',
    format: '必填 · app | cmd | url | folder | ahk | webhook | download | jsonfile',
    doc: '四、配置说明 → type 语义'
  },
  {
    key: 'target', label: '目标 target', kind: 'textarea', section: 'basic', required: true,
    default: '', applies: null,
    desc: '条目的主体：应用路径 / 一整条命令行 / 网址 / 目录 / 脚本 / 本地文件。解析规则按 type 区分，见「字段速查」里的 target 解析表。支持 {{变量}} 模板（需声明 params）。',
    format: '必填 · 按 type 变化；webhook / download 必须是 http(s) 地址',
    placeholder: '按所选类型填写',
    doc: '四、配置说明 → target 的解析规则'
  },
  {
    key: 'accent', label: '强调色 accent', kind: 'color', section: 'basic', required: false,
    default: '#4f8cff', applies: null,
    desc: '卡片 / 头像的强调色。不写时按条目名算一个 HSL 渐变色。',
    format: 'CSS 颜色，推荐 #RRGGBB（如 #4f8cff）',
    doc: '四、配置说明 → config.json（数据源）'
  },
  {
    key: 'group', label: '所属分组', kind: 'group-select', section: 'basic', required: false,
    default: '', applies: null,
    desc: '填 groups 里的 id。分组只影响过滤（@net、分组胶囊），不影响启动；不写就归「未分组」。',
    format: '字符串 · 建议引用已定义的 groups[].id',
    doc: '四、配置说明 → 分组'
  },
  {
    key: 'pinned', label: '置顶常用', kind: 'boolean', section: 'basic', required: false,
    default: false, applies: null,
    desc: '是否进「常用」卡片。对 hidden: true 的条目无效（否则常用卡片会把它又摆出来）。',
    format: '布尔 · 默认 false',
    doc: '四、配置说明 → config.json / 隐藏条目'
  },
  {
    key: 'enabled', label: '启用状态 enabled', kind: 'boolean', section: 'basic', required: false,
    default: true, applies: null,
    desc: '临时停用一条配置又不想删掉它。停用 = 当它不存在：主界面、ql list / ql run、定时任务都取不到。',
    format: '布尔 · 可选，不写 = true；只有布尔 false 才算停用（"false" / 0 / null 一律按启用）',
    doc: '四、配置说明 → 停用条目（enabled）'
  },
  {
    key: 'hidden', label: '界面隐藏 hidden', kind: 'boolean', section: 'basic', required: false,
    default: false, applies: null,
    desc: '平时不用手点、但必须被定时器 / ql 调到的条目（拉配置、清日志、报心跳）。只在界面里隐藏，ql list / ql run / 定时任务照旧。',
    format: '布尔 · 可选，不写 = false；只有布尔 true 才算隐藏；与 enabled:false 同时写等于停用',
    doc: '四、配置说明 → 隐藏条目（hidden）'
  },

  /* ---- 启动类（app / cmd / ahk） ---- */
  {
    key: 'args', label: '固定参数 args', kind: 'textarea', section: 'launch', required: false,
    default: '', applies: ['app', 'cmd', 'ahk'],
    desc: '条目自己的固定启动参数，写在配置里、每次运行都带。注意和 schedules[].args / ql run --args 区分：后者是「本次运行」的参数，两者是「前缀 + 追加」，不是覆盖。支持 {{变量}} 模板。',
    format: '字符串 · app / ahk 每个参数单独加引号；cmd 按原文追加，引号与 > 重定向交给 cmd 自己解析',
    placeholder: 'config.json 或 {{file}}',
    doc: '四、配置说明 → config.json / 运行时参数 / 模板变量'
  },
  {
    key: 'workdir', label: '工作目录 workdir', kind: 'text', section: 'launch', required: false,
    default: '', applies: ['app', 'cmd', 'ahk'],
    desc: '工作目录，相对路径按脚本目录解析（载入配置时就展开成绝对路径）。UNC 路径原样用。',
    format: '路径字符串 · 支持相对路径 / %环境变量% / UNC；不参与 {{变量}} 模板替换（避免拼出 D:\\app\\C:\\work）',
    placeholder: '.（脚本目录）或 D:\\work',
    doc: '四、配置说明 → config.json / 模板变量（生效字段）'
  },

  /* ---- 运行时参数声明 ---- */
  {
    key: 'params', label: '参数声明 params', kind: 'params', section: 'params', required: false,
    default: [], applies: ['app', 'cmd', 'ahk', 'webhook', 'download', 'jsonfile'],
    desc: '声明运行时参数（模板变量）。有了它，条目才能带参数、target 等字段里的 {{变量}} 才会被替换；没声明则 {{x}} 原样直传，只警告不拦。folder / url 不接受参数。',
    format: '对象数组 · 见下方「参数声明」子表',
    doc: '四、配置说明 → 运行时参数 / webhook 类型 · 模板变量'
  },

  /* ---- webhook ---- */
  {
    key: 'method', label: '请求方法 method', kind: 'select', section: 'webhook', required: false,
    default: 'GET', applies: ['webhook'], options: HTTP_METHODS.map(m => ({ value: m, label: m })),
    desc: 'HTTP 方法。GET / HEAD 时 body 会被忽略。',
    format: 'GET | POST | PUT | PATCH | DELETE | HEAD · 缺省 GET',
    doc: '四、配置说明 → webhook 类型'
  },
  {
    key: 'query', label: '查询参数 query', kind: 'kv', section: 'webhook', required: false,
    default: null, applies: ['webhook'],
    desc: '拼到 URL 上的查询串，自动 URL 编码。支持 {{变量}} 模板（只替换值，键不参与）。参数留空时，query 里这个键会被整个去掉，不会拼出 ?lang=。',
    format: '对象 {"a":"1"} 或数组 ["a=1"]',
    doc: '四、配置说明 → webhook 类型 / 模板变量'
  },
  {
    key: 'headers', label: '请求头 headers', kind: 'kv', section: 'webhook', required: false,
    default: null, applies: ['webhook', 'download'],
    desc: '请求头。数组形式时每条形如 "Name: Value"。可写 {{#ts}} / {{#env:…}} / {{#file:…}} / {{#base64:…}} / {{#hmac:…}} 等动态值，由 AHK 在发送前展开；headers 与 body 都展开，密钥不落配置文件。带请求体又没指定 Content-Type 时，默认加 application/json; charset=utf-8；写了 multipart 时 Content-Type 由程序自己拼，你在 headers 里写了就不覆盖。',
    format: '对象 {"X-Token":"abc"} 或数组 ["Name: Value"]',
    doc: '四、配置说明 → webhook 类型 / 发送前展开的动态值'
  },
  {
    key: 'body', label: '请求体 body', kind: 'body', section: 'webhook', required: false,
    default: '', applies: ['webhook'],
    desc: '字符串原样发；写对象 / 数组会自动 JSON.stringify。GET / HEAD 时忽略。支持 {{变量}} 模板，也支持 {{#file:…}} / {{#filebase64:…}} 等动态值（body 整个来自本地文件时等价 curl --data-binary @x）。同时写了 multipart 时，body 会被忽略。',
    format: '字符串 或 对象 / 数组（JSON）· 可含 {{变量}} 与 {{#…}} 动态值',
    doc: '四、配置说明 → webhook 类型 / 发送前展开的动态值'
  },
  {
    key: 'multipart', label: '文件上传 multipart', kind: 'multipart', section: 'webhook', required: false,
    default: null, applies: ['webhook'],
    desc: '上传本地文件（等价 curl -F）。三种写法：完整式 {"fields":{…},"files":[…]}、单文件 {"field":"file","path":"…"}、文件数组 [{"field":…,"path":…}]。有它就整个走 multipart，body 不参与；Content-Type（含 boundary）由程序自己拼，你自己在 headers 里写了就不覆盖。单文件上限 8MB。',
    format: '对象 或 对象数组 · files[] 每项 field（缺省 file）/ path（必填）/ filename / type；path 支持 {{参数}}、file://、%TEMP%、相对路径',
    doc: '四、配置说明 → webhook 类型 / 上传本地文件（multipart）'
  },
  {
    key: 'timeout', label: '超时 timeout（秒）', kind: 'number', section: 'webhook', required: false,
    default: 15, applies: ['webhook', 'download'],
    desc: '请求超时秒数，程序会把上限截到 120。',
    format: '数字 > 0，≤ 120 · 缺省 15',
    doc: '四、配置说明 → webhook 类型 / download 类型'
  },
  {
    key: 'jsonPath', label: '结果提取 jsonPath', kind: 'text', section: 'webhook', required: false,
    default: '', applies: ['webhook', 'jsonfile'],
    desc: '从响应 JSON（或本地 JSON 文件）里取值，如 data.items[0].name；取到就只显示这个值，面板按钮可切回「完整响应」。也支持 $.data.total 这类写法。取不到值时会把原因写在正文里。',
    format: '字符串 · 如 data.items[0].name / json.from',
    placeholder: 'data.items[0].name',
    doc: '四、配置说明 → webhook 类型 / jsonfile 类型'
  },

  /* ---- download ---- */
  {
    key: 'savePath', label: '保存目录 savePath', kind: 'text', section: 'download', required: false,
    default: '', applies: ['download'],
    desc: '保存目录。支持相对路径（按脚本目录解析）、%USERPROFILE% / %TEMP% 环境变量、UNC 路径；不存在会自动创建（含多级）。"." = 脚本目录。',
    format: '路径字符串 · 缺省 = 系统「下载」目录；支持 {{变量}} 模板',
    placeholder: '%USERPROFILE%\\Downloads',
    doc: '四、配置说明 → download 类型 / 拉取在线配置'
  },
  {
    key: 'fileName', label: '保存文件名 fileName', kind: 'text', section: 'download', required: false,
    default: '', applies: ['download'],
    desc: '省略或留空时自动取远端文件名：Content-Disposition 优先，其次 URL 最后一段（curl -O 的行为），非法字符会被换掉。',
    format: '字符串 · 支持 {{变量}} 模板；留空 = 用远端文件名',
    placeholder: 'config.json 或 报表-{{day}}.xlsx',
    doc: '四、配置说明 → download 类型'
  },
  {
    key: 'onExists', label: '同名处理 onExists', kind: 'select', section: 'download', required: false,
    default: 'skip', applies: ['download'], options: ON_EXISTS,
    desc: '同名文件已存在时怎么办。skip 跳过 / overwrite 覆盖；backup 只在 overwrite 时有意义。',
    format: 'skip | overwrite · 缺省 skip',
    doc: '四、配置说明 → download 类型'
  },
  {
    key: 'backup', label: '覆盖前备份 backup', kind: 'boolean', section: 'download', required: false,
    default: true, applies: ['download'],
    desc: '覆盖前是否把原文件复制成 xxx.bak。指向 config.json 时建议配上 true，万一远端给的是错误页还能恢复。onExists=skip 时无意义。',
    format: '布尔 · 缺省 true（代码口径：backup !== false）',
    doc: '四、配置说明 → download 类型 / 拉取在线配置'
  },
  {
    key: 'reload', label: '下载后重载配置 reload', kind: 'boolean', section: 'download', required: false,
    default: false, applies: ['download'],
    desc: '下载成功后自动重载配置（拉取 config.json 时用，不用再点「重载配置」）。',
    format: '布尔 · 缺省 false（只认布尔 true）',
    doc: '四、配置说明 → download 类型 / 拉取在线配置'
  }
]

export const ITEM_FIELD_MAP = Object.fromEntries(ITEM_FIELDS.map(f => [f.key, f]))

export const ITEM_SECTIONS = [
  { key: 'basic', title: '基础信息', note: '所有类型都适用', types: null },
  { key: 'launch', title: '固定参数 / 工作目录', note: '仅 app · cmd · ahk', types: ['app', 'cmd', 'ahk'] },
  { key: 'params', title: '运行时参数声明', note: '除 url · folder 外都适用', types: ['app', 'cmd', 'ahk', 'webhook', 'download', 'jsonfile'] },
  { key: 'webhook', title: 'HTTP 请求', note: 'webhook 专用（部分字段与 download / jsonfile 共用）', types: ['webhook', 'download', 'jsonfile'] },
  { key: 'download', title: '下载保存', note: 'download 专用', types: ['download'] }
]

/* ------------------------------------------------------- params[] 子字段 */

export const PARAM_FIELDS = [
  {
    key: 'name', label: '变量名 name', kind: 'text', required: true, default: '',
    desc: '对应 {{name}} 的变量名，区分大小写。字符类 [\\w.-]（# 开头的动态值不归前端管）。',
    format: '必填 · [A-Za-z0-9_.-] · 同一条目内唯一', placeholder: 'msg'
  },
  {
    key: 'label', label: '显示说明 label', kind: 'text', required: false, default: '',
    desc: '参数面板里显示的中文说明。', format: '字符串', placeholder: '要显示的文字'
  },
  {
    key: 'default', label: '默认值 default', kind: 'text', required: false, default: '',
    desc: '没填时用的值。', format: '字符串', placeholder: 'hello'
  },
  {
    key: 'placeholder', label: '灰字提示 placeholder', kind: 'text', required: false, default: '',
    desc: '没填时参数行里的灰字提示。', format: '字符串', placeholder: '拖一个文件进来，或手输路径'
  },
  {
    key: 'optional', label: '允许留空 optional', kind: 'boolean', required: false, default: false,
    desc: '允许留空；留空时 query 里这个键会被整个去掉（不会拼出 ?lang=）。必填项没填 → 不发请求，预览行变红并说明缺哪个。',
    format: '布尔 · 缺省 false'
  },
  {
    key: 'type', label: '补全类型 type', kind: 'select', required: false, default: '',
    options: PARAM_TYPES,
    desc: '写 path / dir / file 时，这个参数按 Tab 一定走目录补全（webhook 参数也能用）。不写时按「像路径」的启发式判断。',
    format: 'path | dir | file（可选）'
  },
  {
    key: 'required', label: '强制必填 required（兼容字段）', kind: 'boolean', required: false, default: false,
    desc: 'README 未记载，但 app.js 归一化时使用：optional = (optional === true && required !== true)。写 true 会覆盖 optional。',
    format: '布尔 · 可选'
  }
]

/* ----------------------------------------------------------- groups 子字段 */

export const GROUP_FIELDS = [
  {
    key: 'id', label: '分组 ID', kind: 'text', required: true, default: '',
    desc: '分组标识；搜索框里 @分组 就是点这颗胶囊的等价写法，@n 也能命中 net（前缀匹配）。没有 id 的分组会被直接忽略。',
    format: '必填 · 全表唯一', placeholder: 'sys'
  },
  {
    key: 'name', label: '分组名称', kind: 'text', required: false, default: '',
    desc: '胶囊上显示的文字，省略时用 id。分组只影响过滤，不影响启动；空分组不会显示胶囊。',
    format: '字符串', placeholder: '系统'
  }
]

/* -------------------------------------------------------- schedules 子字段 */

export const SCHEDULE_FIELDS = [
  {
    key: 'id', label: '任务 ID', kind: 'text', required: false, default: '',
    desc: '日志里显示的名字；省略就用 run。', format: '字符串', placeholder: 'morning-ip'
  },
  {
    key: 'run', label: '执行条目 run', kind: 'item-select', required: true, default: '',
    desc: '要执行的条目：id / 名称 / 关键词都行，语义和 ql run 完全一样（含 >、@ 语法和参数分配）。定时任务触发时把一条 cli 请求塞进命令行队列。',
    format: '必填 · 引用 items[].id（推荐），也可写名称 / 关键词',
    placeholder: 'http-ip'
  },
  {
    key: 'args', label: '本次运行参数 args', kind: 'text', required: false, default: '',
    desc: '运行时参数，等同 ql run <run> --args "…"。注意它和 items[].args 是「前缀 + 追加」关系，不是覆盖；要跑一条独立命令就单独建一个条目，schedule 里只写 run。',
    format: '字符串', placeholder: '/k echo 你好'
  },
  {
    key: 'at', label: '固定时刻 at', kind: 'times', required: false, default: '',
    desc: '"HH:MM" 或 "HH:MM:SS"；也可以写成数组，表示一天跑多次。和 every 必须二选一。错过（关机 / 休眠）不补跑。',
    format: 'HH:MM / HH:MM:SS 或它们的数组 · 时 0-23、分秒 0-59',
    placeholder: '09:30'
  },
  {
    key: 'every', label: '固定间隔 every', kind: 'every', required: false, default: '',
    desc: '"30s" / "15m" / "2h"（也认 秒 / 分 / 分钟 / 小时），最短 30 秒、最长 30 天，从程序启动那一刻起算。锚点是上一次的计划时刻，不是执行完成的时刻。和 at 必须二选一。',
    format: '数字 + s|m|h，30 秒 ≤ 间隔 ≤ 2592000 秒',
    placeholder: '6h'
  },
  {
    key: 'days', label: '星期 days', kind: 'days', required: false, default: '',
    desc: '只在 at 模式下有效。省略 = 每天；可写 "weekdays"（工作日）/ "weekend"（周末）/ "每天"，也可写数组 ["mon","fri"]（还支持 0-6 数字、中文「周一」「一」）。',
    format: '字符串 或 字符串数组 · 仅与 at 搭配，和 every 一起写会被判错',
    placeholder: 'weekdays'
  },
  {
    key: 'runOnStart', label: '启动就跑一次 runOnStart', kind: 'boolean', required: false, default: false,
    desc: '写 true：启动器一启动就先跑一次（延时约 1 秒，给首屏渲染让路），然后照常按 at / every 排程。只在本次进程第一次装载配置时跑，「重载配置」不会再来一遍。跑完会把 every 的下次时刻从「现在」重新算。',
    format: '布尔 · 只认布尔 true（"true" / 1 都不算）'
  },
  {
    key: 'enabled', label: '启用状态 enabled', kind: 'boolean', required: false, default: true,
    desc: '写 false 就临时停用（不装、也不报错）。项目自带示例三条都写 false，是故意的。',
    format: '布尔 · 缺省 true'
  },
  {
    key: 'first', label: '歧义取最高分 first', kind: 'boolean', required: false, default: true,
    desc: '默认 true：多个条目都能匹配时取最高分那条；写 false 则要求唯一命中，歧义就算失败。',
    format: '布尔 · 缺省 true'
  }
]

/* ------------------------------------------------------------- 参考手册 */

export const DYNAMIC_VALUES = [
  { tpl: '{{#ts}}', desc: 'Unix 秒（10 位）' },
  { tpl: '{{#tsms}}', desc: 'Unix 毫秒（13 位）' },
  { tpl: '{{#uuid}}', desc: 'UUID v4' },
  { tpl: '{{#nonce:16}}', desc: '16 位随机小写字母数字（默认 16，上限 128）' },
  { tpl: '{{#env:NAME}}', desc: '环境变量 NAME 的值（取不到就报错，不会给空串）' },
  { tpl: '{{#file:路径}}', desc: '读本地文本文件，默认裁掉尾部换行；二进制文件会报错拒发' },
  { tpl: '{{#file-raw:路径}}', desc: '同上，但保留原样的尾部换行' },
  { tpl: '{{#filebase64:路径}}', desc: '按字节读（二进制也安全），编码成 Base64 字符串' },
  { tpl: '{{#filehash:sha256:路径}}', desc: '文件字节的摘要，十六进制；算法支持 md5 / sha1 / sha256 / sha384 / sha512' },
  { tpl: '{{#md5:文本}}', desc: 'MD5，十六进制小写' },
  { tpl: '{{#sha1:文本}}', desc: 'SHA-1，十六进制小写' },
  { tpl: '{{#sha256:文本}}', desc: 'SHA-256，十六进制小写' },
  { tpl: '{{#sha384:文本}}', desc: 'SHA-384，十六进制小写' },
  { tpl: '{{#sha512:文本}}', desc: 'SHA-512，十六进制小写' },
  { tpl: '{{#base64:文本}}', desc: '文本按 UTF-8 编码后的 Base64（带 = 补位）' },
  { tpl: '{{#base64url:文本}}', desc: 'base64url：+→-、/→_、去掉 =' },
  { tpl: '{{#hmac:密钥名:待签内容}}', desc: 'HMAC-SHA256；密钥取自 launcher.ahk 的 SIG_KEYS' },
  { tpl: '{{#hmac-md5:密钥名:内容}}', desc: '换算法，另有 hmac-sha1 / sha256 / sha384 / sha512' }
]

export const DYNAMIC_RULES = [
  '# 是关键：前端不认它，原样交给 AHK，避免和 params 变量冲突。',
  '展开面：headers 与 body 都展开（body 可整个来自 {{#file:…}}，等价 curl --data-binary @x）；file 参数的路径本身也展开。',
  '认不出来的一律原样保留（大小写敏感），不会误伤老配置里的字面量。',
  '密钥名写错、环境变量取不到、展开后带 CR/LF（请求头注入）都会拒发。',
  '{{#file:…}} 默认裁尾部换行，{{#file-raw:…}} 才保留；二进制文件改用 {{#filebase64:…}} 或 multipart。',
  '摘要 / Base64 / HMAC 的参数里可用单花括号 {ts} {tsms} {uuid} {nonce:N} 引用动态值。',
  '不要写成 {{#hmac:demo:{{#ts}}}} —— 收尾会凑出 }}}} 被当成转义，改用 {ts}。',
  '模板内联上限 2MB，multipart 单文件上限 8MB；{{#file:路径}} 里的路径不能带裸花括号。'
]

export const TARGET_RULES = [
  { type: 'cmd', rule: '原样交给 cmd，绝不按路径改写', example: 'ipconfig /all → ipconfig /all' },
  { type: 'url', rule: '原样', example: 'ms-calculator:、https://…' },
  { type: 'webhook / download', rule: '原样（是网址，不是路径）', example: 'https://api… → 原样' },
  { type: 'jsonfile', rule: '原样交给 AHK 解析（file:// 剥壳 / %20 解码 / 环境变量 / 相对路径都在 AHK 侧做）', example: 'file://c:\\x\\y.json' },
  { type: 'folder / ahk', rule: '一律当路径，相对路径按脚本目录解析', example: 'docs → <脚本目录>\\docs' },
  { type: 'app', rule: '绝对路径 / 协议原样；. .. 或带分隔符的相对路径按脚本目录解析；裸命令名交给 PATH', example: '.\\tool.exe → <脚本目录>\\tool.exe；notepad.exe → PATH' }
]

export const TEMPLATE_FIELDS = ['target', 'args', 'query', 'headers', 'body', 'savePath', 'fileName', 'multipart']

export const TEMPLATE_RULES = [
  '只有声明了 params 的条目才替换；没声明就整条不替换，{{x}} 原样直传（老配置一个字节都不变）。',
  '被模板用掉的参数不再追加到末尾；没用到的照旧按声明顺序追加。',
  '引用了没声明的变量 → 拒绝执行，不静默替换成空串（错误消息里会列出变量名）。',
  '{{{{ 输出字面 {{，}}}} 输出字面 }} —— 给「参数本身就是模板语法」留逃生口。',
  '生效字段：target / args / query / headers / body / savePath / fileName / multipart；query 的键不参与（只替换值）。',
  'workdir 不在生效字段里：载入时已展开成绝对路径，再套模板会得到 D:\\app\\C:\\work。',
  'app / ahk 的 args 里，独占一个位置的变量会自动补引号；cmd 不补。',
  '按声明顺序位置填（条目名 值1 值2），也可以命名填（lang=en）跳过前面的变量。'
]

export const README_NOTES = [
  { title: '停用 vs 隐藏', text: 'enabled:false 是「当它不存在」（搜索、ql、定时任务全取不到）；hidden:true 是「别在界面上烦我」（ql 与定时任务照旧）。两个一起写等于停用。' },
  { title: '两处 args', text: 'items[].args 是条目固定参数，schedules[].args / ql run --args 是本次运行参数；两者「前缀 + 追加」，不是覆盖。' },
  { title: '布尔写法', text: 'enabled 只有 false 算停用，hidden 只有 true 算隐藏，runOnStart 只有 true 算生效。写成字符串 / 0 / 1 一律按缺省处理。' },
  { title: '分组', text: '分组只影响过滤，不影响启动；条目没有 group 就归「未分组」；groups 不写也能跑（只是没有胶囊栏）。' },
  { title: '定时调度', text: 'at 与 every 必须二选一，days 只跟 at 搭；写错的那一条只跳过自己，原因写进 sched.log，不影响别的任务。不配 schedules 连日志都不会生成。' },
  { title: '请求失败排查', text: '带状态码（401/403/429/503）是服务端回话了；没有状态码（DNS / TLS / 超时 / 连接被中断）是根本没聊上。' }
]

/* --------------------------------------------------------------- 工具 */

export const ALL_TYPES = ITEM_TYPES.map(t => t.value)

/** 字段是否适用于某个 type */
export function fieldApplies(field, type) {
  return !field.applies || field.applies.includes(type)
}

/** 某 type 下、某 section 里有哪些字段 */
export function fieldsOf(section, type) {
  return ITEM_FIELDS.filter(f => f.section === section && fieldApplies(f, type))
}
