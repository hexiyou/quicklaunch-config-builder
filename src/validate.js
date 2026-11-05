/**
 * 校验引擎
 * 口径与 ui/app.js 的 normalizeItem / normalizeSchedules / parseAt / parseDays /
 * parseEvery 保持一致；README 里明确「只有布尔 false/true 才生效」的地方按出错处理。
 *
 * 返回 [{ level: 'error' | 'warn', where, field, msg }]
 */
import {
  ITEM_FIELDS, ITEM_FIELD_MAP, GROUP_FIELDS, SCHEDULE_FIELDS, PARAM_FIELDS,
  TOP_FIELDS, ALL_TYPES, HTTP_METHODS, ON_EXISTS, PARAM_TYPES,
  TEMPLATE_FIELDS, fieldApplies, DAY_OPTIONS
} from './schema.js'
import { itemTemplateVars } from './model.js'

const ID_RE = /^[A-Za-z0-9_.-]+$/
const COLOR_RE = /^(#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})|(?:rgb|rgba|hsl|hsla)\(.*\)|(?:transparent|currentColor|[a-z]+))$/i
const AT_RE = /^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/
const EVERY_RE = /^(\d+(?:\.\d+)?)\s*(s|m|h|秒|分|分钟|小时)?$/i
const DAY_KEYS = new Set([
  ...DAY_OPTIONS.map(d => d.value),
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
  '周日', '周天', '周一', '周二', '周三', '周四', '周五', '周六', '日', '一', '二', '三', '四', '五', '六',
  'weekdays', 'workday', '工作日', 'weekend', '周末', '每天', 'daily', '*', 'all', '0', '1', '2', '3', '4', '5', '6'
])

function included(obj, key) {
  const f = ITEM_FIELD_MAP[key]
  return !!(f?.required || obj._include?.[key])
}

function val(obj, key) {
  return obj[key]
}

/**
 * multipart 归一化判空，口径对齐 wv2-launcher/ui/app.js 的 normalizeMultipart：
 * 三种写法都认，返回 null 表示「配了但没一个能用的文件 / 普通字段」，
 * 这时程序会静默退化成普通 body —— 正是上游注释里点名最难查的坑。
 */
function normalizeMultipartForCheck(mp) {
  if (mp == null || typeof mp !== 'object') return null
  let arr
  let fields = null
  if (Array.isArray(mp)) arr = mp
  else if (Array.isArray(mp.files)) { arr = mp.files; fields = mp.fields }
  else if (mp.path || mp.file) arr = [mp]
  else arr = []
  const files = arr.filter(f => f && typeof f === 'object' && (f.path || f.file))
  const fieldKeys = (fields && typeof fields === 'object' && !Array.isArray(fields)) ? Object.keys(fields) : []
  if (!files.length && !fieldKeys.length) return null
  return { files, fieldKeys }
}

export function validateAll(state) {
  const issues = []
  const push = (level, where, field, msg) => issues.push({ level, where, field, msg })

  /* ---------------- 顶层 ---------------- */
  if (state.meta._include?.name && !String(state.meta.name ?? '').trim()) {
    push('warn', '顶层', 'name', '配置名称为空；这个字段只是元数据，启动器不读取。')
  }
  if (state.meta._include?.version) {
    const v = Number(state.meta.version)
    if (!Number.isInteger(v) || v < 1) push('error', '顶层', 'version', 'version 必须是 ≥ 1 的整数。')
  }

  /* ---------------- 分组 ---------------- */
  const groupIds = new Set()
  state.groups.forEach((g, i) => {
    const where = `分组 #${i + 1} · ${g.id || '未命名'}`
    const id = String(g.id ?? '').trim()
    if (!id) push('error', where, 'id', 'id 必填；没有 id 的分组会被程序直接忽略。')
    else if (groupIds.has(id)) push('error', where, 'id', `分组 id「${id}」重复。`)
    else groupIds.add(id)
    if (g._include?.name && typeof g.name !== 'string') push('error', where, 'name', 'name 必须是字符串。')
  })

  /* ---------------- 条目 ---------------- */
  const itemIds = new Set()
  const itemNames = []
  const itemKeywords = new Set()

  state.items.forEach((it, i) => {
    const where = `条目 #${i + 1} · ${it.name || it.id || '未命名'}`
    const type = it.type

    // id
    const id = String(it.id ?? '').trim()
    if (!id) push('error', where, 'id', 'id 必填；ql run、schedules.run、usage.json 都靠它认条目。')
    else {
      if (!ID_RE.test(id)) push('warn', where, 'id', `id「${id}」建议只用字母、数字、_ . -，避免命令行 / 模板里出岔子。`)
      if (itemIds.has(id)) push('error', where, 'id', `id「${id}」与其他条目重复。`)
      else itemIds.add(id)
    }

    // name
    if (!String(it.name ?? '').trim()) push('error', where, 'name', 'name 必填（显示名，也是搜索主字段）。')
    else itemNames.push(String(it.name).trim())
    if (Array.isArray(it.keywords)) {
      it.keywords.filter(k => typeof k === 'string' && k.trim()).forEach(k => itemKeywords.add(k.trim()))
    }

    // type
    if (!ALL_TYPES.includes(type)) push('error', where, 'type', `type「${type}」不在支持的 8 种类型里。`)

    // target
    const target = String(it.target ?? '').trim()
    if (!target) {
      push('error', where, 'target', 'target 必填。')
    } else if (type === 'webhook' || type === 'download') {
      if (!/^https?:\/\//i.test(target)) {
        const hasTpl = /\{\{[\w.-]+\}\}/.test(target)
        push(hasTpl ? 'warn' : 'error', where, 'target',
          hasTpl
            ? '目标含模板变量，替换后必须仍是完整的 http(s) 地址。'
            : `${type} 的 target 必须是 http(s) 地址（原样传给 WinHttp，不会被当路径改写）。`)
      }
    } else if (type === 'cmd') {
      if (/\bcmd\s+\/[ck]\b/i.test(target)) {
        push('warn', where, 'target', 'cmd 类型会自动套一层 cmd /s /k，别自己再写 cmd /k；&& 直接写、不用转义。')
      }
    }

    // 已写入但对当前 type 无意义的字段：不丢数据，但提醒一声
    for (const f of ITEM_FIELDS) {
      if (!fieldApplies(f, type) && included(it, f.key)) {
        push('warn', where, f.key, `${f.key} 通常只对 ${f.applies.join(' / ')} 有意义，当前 type=${type}；仍会原样写进 JSON，可在编辑器里移除。`)
      }
    }

    // 只对「已写入且适用于当前 type」的字段做格式校验
    for (const f of ITEM_FIELDS) {
      if (!fieldApplies(f, type)) continue
      if (!included(it, f.key)) continue
      const v = val(it, f.key)
      switch (f.key) {
        case 'accent':
          if (v !== '' && !COLOR_RE.test(String(v))) {
            push('warn', where, 'accent', `「${v}」不像合法 CSS 颜色，推荐 #RRGGBB（如 #4f8cff）。`)
          }
          break
        case 'keywords':
          if (!Array.isArray(v)) push('error', where, 'keywords', 'keywords 必须是字符串数组。')
          else if (v.some(k => typeof k !== 'string')) push('error', where, 'keywords', 'keywords 里只能放字符串。')
          break
        case 'timeout': {
          const n = Number(v)
          if (!Number.isFinite(n) || n <= 0) push('error', where, 'timeout', 'timeout 必须是 > 0 的数字（秒）。')
          else if (n > 120) push('error', where, 'timeout', `timeout ${n} 超过上限 120，程序会截断成 120。`)
          break
        }
        case 'method':
          if (!HTTP_METHODS.includes(String(v).toUpperCase())) push('error', where, 'method', `method 只能是 ${HTTP_METHODS.join(' / ')}。`)
          break
        case 'onExists':
          if (!ON_EXISTS.some(o => o.value === v)) push('error', where, 'onExists', 'onExists 只能是 skip 或 overwrite。')
          break
        case 'body':
          if (type === 'webhook' && ['GET', 'HEAD'].includes(String(it.method || 'GET').toUpperCase()) && v !== '' && v != null) {
            push('warn', where, 'body', `method=${String(it.method).toUpperCase()} 时 body 会被忽略。`)
          }
          break
        case 'query':
        case 'headers':
          if (v != null && typeof v !== 'object') push('error', where, f.key, `${f.key} 必须是对象或字符串数组。`)
          break
        case 'multipart': {
          if (typeof v !== 'object' || v == null) {
            push('error', where, 'multipart', 'multipart 必须是对象或对象数组。')
            break
          }
          if (!normalizeMultipartForCheck(v)) {
            push('error', where, 'multipart', 'multipart 里没有可用的文件（files 每项至少要有 path）；程序会静默退化成普通 body。')
            break
          }
          const arr = Array.isArray(v) ? v
            : Array.isArray(v.files) ? v.files
              : (v.path || v.file ? [v] : [])
          arr.forEach((file, fi) => {
            if (!file || typeof file !== 'object') {
              push('error', where, `multipart[${fi}]`, `第 ${fi + 1} 个文件必须是对象（含 field / path）。`)
            } else if (!String(file.path ?? file.file ?? '').trim()) {
              push('error', where, `multipart[${fi}]`, `第 ${fi + 1} 个文件缺 path（或别名 file）；这一项会被程序直接过滤掉。`)
            }
          })
          if (!Array.isArray(v)) {
            if (v.fields != null && (typeof v.fields !== 'object' || Array.isArray(v.fields))) {
              push('error', where, 'multipart', 'multipart.fields 必须是对象 {"name":"值"}。')
            }
            if (v.files != null && !Array.isArray(v.files)) {
              push('error', where, 'multipart', 'multipart.files 必须是数组。')
            }
          }
          if (included(it, 'body') && it.body !== '' && it.body != null) {
            push('warn', where, 'multipart', '写了 multipart 就整个走它，body 会被忽略；两者都写不报错，但 body 不参与。')
          }
          break
        }
        case 'group':
          if (v && state.includeGroups && !state.groups.some(g => String(g.id) === String(v))) {
            push('warn', where, 'group', `分组「${v}」没有在 groups 里定义；条目会归「未分组」。`)
          }
          break
        case 'enabled':
        case 'hidden':
        case 'pinned':
        case 'backup':
        case 'reload':
          if (typeof v !== 'boolean') {
            push('error', where, f.key, `${f.key} 必须是布尔 true/false；写成字符串或数字一律按缺省值处理。`)
          }
          break
        case 'savePath':
        case 'fileName':
        case 'args':
        case 'workdir':
        case 'subtitle':
        case 'icon':
        case 'jsonPath':
          if (typeof v !== 'string') push('error', where, f.key, `${f.key} 必须是字符串。`)
          break
        default:
          break
      }
    }

    /* params 子表 */
    const paramsOn = included(it, 'params')
    const params = paramsOn && Array.isArray(it.params) ? it.params : []
    const declared = new Set()
    params.forEach((p, pi) => {
      const pw = `${where} → params[${pi + 1}]`
      const pn = String(p.name ?? '').trim()
      if (!pn) push('error', pw, 'name', '参数 name 必填（对应 {{name}}）。')
      else {
        if (!ID_RE.test(pn)) push('error', pw, 'name', `变量名「${pn}」不合法，只能是 [A-Za-z0-9_.-]（# 开头的动态值归 AHK 管）。`)
        if (declared.has(pn)) push('error', pw, 'name', `变量名「${pn}」重复。`)
        declared.add(pn)
      }
      if (p._include?.type && !PARAM_TYPES.some(t => t.value === p.type)) {
        push('warn', pw, 'type', 'type 建议写 path / dir / file 或留空。')
      }
      if (p._include?.optional && typeof p.optional !== 'boolean') push('error', pw, 'optional', 'optional 必须是布尔值。')
      if (p._include?.required && typeof p.required !== 'boolean') push('error', pw, 'required', 'required 必须是布尔值。')
      if (p._include?.optional && p.optional === true && p._include?.required && p.required === true) {
        push('warn', pw, 'required', 'required:true 会覆盖 optional:true（app.js: optional && required !== true）。')
      }
    })

    /* 模板体检（对齐 README「四条边界」） */
    const vars = itemTemplateVars(it)
    if (vars.length) {
      if (params.length) {
        vars.forEach(v => {
          if (!declared.has(v)) {
            const near = [...declared].find(n => n.toLowerCase() === v.toLowerCase())
            push('error', where, 'params', `{{${v}}} 没有在 params 里声明${near ? `（是不是想写 ${near}？）` : ''}；执行时会被拒绝。`)
          }
        })
      } else {
        push('warn', where, 'params', `字段里出现了 {{${vars.join('}} / {{')}}}，但没声明 params —— 会原样直传（也可能本来就是字面量）。`)
      }
    }
    if (it._include?.workdir && /\{\{[\w.-]+\}\}/.test(String(it.workdir))) {
      push('warn', where, 'workdir', 'workdir 不参与模板替换（载入时就展开成绝对路径了），{{x}} 会原样留在路径里。')
    }
    if (type === 'url' || type === 'folder') {
      if (params.length) push('warn', where, 'params', `${type} 类型不接受运行时参数，params 不会生效。`)
    }
  })

  /* ---------------- 定时任务 ---------------- */
  const runTargets = new Set([...itemIds, ...itemNames, ...itemKeywords])
  state.schedules.forEach((s, i) => {
    const where = `定时 #${i + 1} · ${s.id || s.run || '未命名'}`
    const run = String(s.run ?? '').trim()
    if (!run) push('error', where, 'run', 'run 必填（要执行的条目 id / 名称 / 关键词）。')
    else if (!runTargets.has(run)) {
      push('warn', where, 'run', `「${run}」不是现有条目的 id / 名称 / 关键词；带 > 或 @ 语法的写法除外。`)
    }

    const hasAt = !!s._include?.at && String(s.at ?? '').trim() !== '' && (!Array.isArray(s.at) || s.at.length > 0)
    const hasEvery = !!s._include?.every && String(s.every ?? '').trim() !== ''
    if (hasAt && hasEvery) push('error', where, 'at/every', 'at 与 every 只能写一个；这一条会被跳过并记进 sched.log。')
    if (!hasAt && !hasEvery) push('error', where, 'at/every', 'at 与 every 至少要写一个；这一条会被跳过并记进 sched.log。')

    if (hasAt) {
      const arr = Array.isArray(s.at) ? s.at : [s.at]
      arr.forEach((t, ti) => {
        const m = AT_RE.exec(String(t ?? '').trim())
        if (!m) {
          push('error', where, `at[${ti}]`, `「${t}」格式不对，示例 09:30 或 09:30:00。`)
        } else if (+m[1] > 23 || +m[2] > 59 || (m[3] != null && +m[3] > 59)) {
          push('error', where, `at[${ti}]`, `「${t}」超出范围（时 0-23，分 / 秒 0-59）。`)
        }
      })
    }
    if (hasEvery) {
      const m = EVERY_RE.exec(String(s.every).trim())
      if (!m) push('error', where, 'every', `「${s.every}」写法不对，示例 30s / 15m / 2h。`)
      else {
        const n = parseFloat(m[1])
        const u = (m[2] || 's').toLowerCase()
        const sec = (u === 'h' || u === '小时') ? n * 3600 : (u === 'm' || u === '分' || u === '分钟') ? n * 60 : n
        if (sec < 30 || sec > 2592000) push('error', where, 'every', `间隔 ${sec} 秒超出范围（30 秒 ~ 30 天）。`)
      }
    }
    if (s._include?.days) {
      if (hasEvery && !hasAt) push('error', where, 'days', 'days 只能和 at 一起用；与 every 搭配会被判错。')
      const d = s.days
      const list = Array.isArray(d) ? d : [d]
      list.forEach(x => {
        if (!DAY_KEYS.has(String(x ?? '').trim().toLowerCase())) {
          push('error', where, 'days', `「${x}」不是合法星期（mon…sun / 0-6 / weekdays / weekend / 中文）。`)
        }
      })
    }
    ;['runOnStart', 'enabled', 'first'].forEach(k => {
      if (s._include?.[k] && typeof s[k] !== 'boolean') {
        push('error', where, k, `${k} 必须是布尔 true/false；写成字符串或数字一律按缺省处理。`)
      }
    })
    if (s._include?.args && typeof s.args !== 'string') push('error', where, 'args', 'args 必须是字符串。')
  })

  return issues
}

/** 只统计错误（决定「复制」按钮是否提醒） */
export function countErrors(issues) {
  return issues.filter(x => x.level === 'error').length
}
