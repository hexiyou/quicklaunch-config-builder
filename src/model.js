/**
 * 配置模型：内部对象 <-> config.json
 *
 * 内部对象比 JSON 多三个以下划线开头的元信息（导出时全部剔除）：
 *   _include  哪些「可选字段」要写进 JSON。必填字段永远写入。
 *             这样能精确表达「没写」与「显式写了 false / ""」的区别，
 *             README 里反复强调只有布尔 true / false 才生效，这个区分很关键。
 *   _extra    导入时遇到字典外的键（老配置的别名、用户自定义字段），原样保留。
 *   _key      列表渲染用的稳定 key。
 */
import {
  ITEM_FIELDS, GROUP_FIELDS, SCHEDULE_FIELDS, PARAM_FIELDS, TOP_FIELDS,
  ITEM_FIELD_MAP, fieldApplies, TEMPLATE_FIELDS
} from './schema.js'
import sampleConfig from './sample.config.json'

let seq = 0
export function uid(prefix = 'k') {
  seq += 1
  return `${prefix}-${seq}-${Math.random().toString(36).slice(2, 7)}`
}

export const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)))

function defaultsOf(fields) {
  const out = {}
  for (const f of fields) out[f.key] = clone(f.default)
  return out
}

/** 把一段原始 JSON 对象灌成内部对象 */
function hydrate(raw, fields) {
  const obj = defaultsOf(fields)
  obj._include = {}
  obj._extra = {}
  obj._key = uid()
  const known = new Set(fields.map(f => f.key))
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  for (const [key, value] of Object.entries(src)) {
    if (known.has(key)) {
      obj[key] = value === undefined ? clone(defaultsOf(fields)[key]) : clone(value)
      obj._include[key] = true
    } else {
      obj._extra[key] = clone(value)
    }
  }
  return obj
}

/** 把内部对象还原成要写进 config.json 的干净对象 */
function dehydrate(obj, fields) {
  const out = {}
  for (const f of fields) {
    if (f.required || obj._include?.[f.key]) {
      let v = obj[f.key]
      if (v === undefined) v = clone(f.default)
      out[f.key] = clone(v)
    }
  }
  // 字典外的键放在最后，保证导入后再导出不丢字段
  for (const [k, v] of Object.entries(obj._extra || {})) {
    if (!(k in out)) out[k] = clone(v)
  }
  return out
}

/** 打开某个可选字段时，把「空壳」值补成该控件能用的初值 */
export function ensureUsable(obj, field) {
  const k = field.key
  let v = obj[k]
  if (field.kind === 'tags' && !Array.isArray(v)) v = []
  else if (field.kind === 'params' && !Array.isArray(v)) v = []
  else if (field.kind === 'kv' && (v == null || typeof v !== 'object')) v = {}
  else if (field.kind === 'body' && v == null) v = ''
  else if (field.kind === 'times' && (v == null || v === '')) v = ''
  else if (field.kind === 'days' && (v == null || v === '')) v = ''
  else if (field.kind === 'number' && (v === '' || v == null || Number.isNaN(Number(v)))) v = clone(field.default)
  else if (field.kind === 'boolean' && typeof v !== 'boolean') v = clone(field.default)
  else if (v == null) v = clone(field.default)
  obj[k] = v
}

export function setInclude(obj, field, on) {
  if (field.required) return
  if (!obj._include) obj._include = {}
  if (on) {
    obj._include[field.key] = true
    ensureUsable(obj, field)
  } else {
    delete obj._include[field.key]
  }
}

/* ------------------------------------------------------------- 工厂函数 */

export function createItem(type = 'app') {
  const it = hydrate({}, ITEM_FIELDS)
  it.type = type
  // 默认把最常用的可选字段备好（用户一填就写入）
  return it
}

export function createGroup() {
  const g = hydrate({}, GROUP_FIELDS)
  g._include.name = true
  return g
}

export function createSchedule() {
  const s = hydrate({}, SCHEDULE_FIELDS)
  s._include.at = true
  s.at = '09:30'
  s._include.enabled = true
  return s
}

export function createParam() {
  const p = hydrate({}, PARAM_FIELDS)
  p._include.label = true
  return p
}

/* ----------------------------------------------------------- 顶层 state */

export function emptyState() {
  return {
    meta: hydrate({}, TOP_FIELDS),
    items: [],
    groups: [],
    schedules: [],
    includeGroups: true,
    includeSchedules: true
  }
}

export function stateFromJson(json) {
  const src = Array.isArray(json) ? { items: json } : (json && typeof json === 'object' ? json : {})
  const st = emptyState()
  st.meta = hydrate(src, TOP_FIELDS)
  st.items = (Array.isArray(src.items) ? src.items : []).map(x => {
    const it = hydrate(x, ITEM_FIELDS)
    // params[] 里的每一项同样是「带可选字段」的对象，必须一并 hydrate，
    // 否则导入再导出时 label / default / placeholder / optional / type 会丢光。
    if (Array.isArray(it.params)) it.params = it.params.map(p => hydrate(p, PARAM_FIELDS))
    return it
  })
  st.groups = (Array.isArray(src.groups) ? src.groups : []).map(x => hydrate(x, GROUP_FIELDS))
  st.schedules = (Array.isArray(src.schedules) ? src.schedules : []).map(x => hydrate(x, SCHEDULE_FIELDS))
  st.includeGroups = Object.prototype.hasOwnProperty.call(src, 'groups')
  st.includeSchedules = Object.prototype.hasOwnProperty.call(src, 'schedules')
  // 顶层字典外的键（例如以后新增的字段）也留着
  st.meta._extra = {}
  const known = new Set(['name', 'version', 'items', 'groups', 'schedules'])
  for (const [k, v] of Object.entries(src)) {
    if (!known.has(k)) st.meta._extra[k] = clone(v)
  }
  return st
}

/** 导出：按 README 示例的字段顺序生成最终 config.json 对象 */
export function buildConfig(state) {
  const out = {}
  for (const f of TOP_FIELDS) {
    if (f.required || state.meta._include?.[f.key]) out[f.key] = clone(state.meta[f.key] ?? f.default)
  }
  for (const [k, v] of Object.entries(state.meta._extra || {})) {
    if (!(k in out)) out[k] = clone(v)
  }
  out.items = state.items.map(it => serializeItem(it))
  if (state.includeGroups) out.groups = state.groups.map(g => dehydrate(g, GROUP_FIELDS))
  if (state.includeSchedules) out.schedules = state.schedules.map(s => dehydrate(s, SCHEDULE_FIELDS))
  return out
}

/** 条目：必填字段 + 用户显式开启的字段。
 *  这里不按 type 过滤「已写入」的字段 —— 导入的配置里可能有跨类型字段，
 *  或者用户中途改了 type；静默丢掉会造成数据损失，编辑器会用专门的
 *  「其它已写入字段」分组把它们显示出来，由用户决定是否关掉。 */
export function serializeItem(it) {
  const type = it.type
  const out = {}
  for (const f of ITEM_FIELDS) {
    if (!(f.required || it._include?.[f.key])) continue
    let v = it[f.key]
    if (v === undefined) v = clone(f.default)
    if (f.kind === 'params') {
      v = (Array.isArray(v) ? v : []).map(p => dehydrate(p, PARAM_FIELDS))
    }
    out[f.key] = clone(v)
  }
  // 导入时字典外的键（别名 / 自定义字段）照样保留
  for (const [k, val] of Object.entries(it._extra || {})) {
    if (!(k in out)) out[k] = clone(val)
  }
  return out
}

/** 悬浮卡片、列表标签用的摘要 */
export function itemSummary(it) {
  const t = it.target || ''
  return String(t).replace(/\s+/g, ' ').slice(0, 70) || '（未填 target）'
}

/* --------------------------------------------------------------- 模板体检 */

const TPL_RE = /\{\{([\w.-]+)\}\}/g

/** 取一段值（可能是对象/数组）里出现的 {{变量}} 名 */
export function collectTemplateVars(value) {
  if (value == null) return []
  let text = typeof value === 'string' ? value : JSON.stringify(value)
  // 转义口：{{{{ / }}}} 是输出字面花括号，先摘掉免得误判
  text = text.replace(/\{\{\{\{/g, '').replace(/\}\}\}\}/g, '')
  const found = new Set()
  let m
  TPL_RE.lastIndex = 0
  while ((m = TPL_RE.exec(text)) !== null) found.add(m[1])
  return [...found]
}

export function itemTemplateVars(it) {
  const vars = new Set()
  for (const k of TEMPLATE_FIELDS) {
    if (!it._include?.[k] && k !== 'target') continue
    collectTemplateVars(it[k]).forEach(v => vars.add(v))
  }
  return [...vars]
}

/* --------------------------------------------------------------- 内置示例 */

export function sampleState() {
  return stateFromJson(sampleConfig)
}

export const SAMPLE_JSON = sampleConfig
