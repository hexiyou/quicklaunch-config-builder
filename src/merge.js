/**
 * 合并导入：纯函数层（Node 里可直接 import 做回归，不依赖 Vue / DOM）
 *
 * 设计要点
 *  - 判重只看 id：items[].id / groups[].id / schedules[].id。
 *    schedules[].id 在启动器里是可选的（只是日志名），所以「id 为空」一律视为
 *    没有身份，直接当新对象追加，绝不猜指纹，避免把两条本意不同的任务判成重复。
 *  - planMerge 是唯一真相源：预览（analyzeMerge）与真正落地（mergeStates）
 *    都从它生成的操作序列推导，保证「看到的」和「执行的」永远一致。
 *  - 冲突策略是整条级：keep = 跳过导入那条；replace = 整条替换。
 *    replace 时保留原位置与原 _key，列表顺序和当前选中项都不会跳。
 *  - 顶层 name / version / 顶层自定义键一律保留现有值，合并只动三个数组。
 */
import { clone } from './model.js'

export const MERGE_KINDS = ['items', 'groups', 'schedules']
export const MERGE_LABELS = { items: '条目', groups: '分组', schedules: '定时任务' }

/** 与 validate.js 的口径一致：String(...).trim()，大小写敏感 */
function idOf(x) {
  return String(x?.id ?? '').trim()
}

/**
 * 生成操作序列。
 * @returns {{ops: Record<string, Array>, result: Record<string, Array>}}
 *   ops[].op = 'add' | 'keep' | 'replace'
 *   result = 合并后的数组（浅拷贝 + 原地替换，新增项追加在末尾）
 */
export function planMerge(current, incoming, policy = 'keep') {
  const replace = policy === 'replace'
  const ops = {}
  const result = {}

  for (const kind of MERGE_KINDS) {
    const cur = Array.isArray(current?.[kind]) ? current[kind] : []
    const inc = Array.isArray(incoming?.[kind]) ? incoming[kind] : []

    // 索引指向「当前结果数组」的下标。现有数组内部若自身有重复 id，只认第一条，
    // 其余保持原样（合并不会替用户修脏数据，校验器会照常报错）。
    const index = new Map()
    cur.forEach((x, i) => {
      const id = idOf(x)
      if (id && !index.has(id)) index.set(id, i)
    })

    const list = cur.slice()
    const seq = []
    inc.forEach((x, i) => {
      const id = idOf(x)
      const at = id ? index.get(id) : undefined

      if (at === undefined) {
        // 新 ID / 无 ID：追加。加进索引后，导入文件里后面再出现同 ID 会走冲突分支，
        // 于是 replace 策略下「后出现的胜出」，keep 策略下「现有配置优先」。
        const pos = list.length
        list.push(x)
        if (id) index.set(id, pos)
        seq.push({ op: 'add', id, incomingIndex: i, at: pos, entity: x, noId: !id })
      } else if (replace) {
        const prevKey = list[at]?._key
        const next = clone(x)
        if (prevKey !== undefined) next._key = prevKey
        list[at] = next
        seq.push({ op: 'replace', id, incomingIndex: i, at, entity: x })
      } else {
        seq.push({ op: 'keep', id, incomingIndex: i, at, entity: x })
      }
    })

    ops[kind] = seq
    result[kind] = list
  }
  return { ops, result }
}

function summarize(ops) {
  const counts = {}
  const conflicts = []
  const duplicates = []
  const totals = { added: 0, kept: 0, replaced: 0, conflicts: 0, noId: 0 }

  for (const kind of MERGE_KINDS) {
    const list = ops[kind] || []
    const c = { added: 0, kept: 0, replaced: 0, noId: 0 }
    const seen = new Map()

    for (const o of list) {
      if (o.op === 'add') { c.added += 1; totals.added += 1 }
      else if (o.op === 'keep') { c.kept += 1; totals.kept += 1; conflicts.push({ kind, id: o.id, action: 'keep' }) }
      else { c.replaced += 1; totals.replaced += 1; conflicts.push({ kind, id: o.id, action: 'replace' }) }
      if (o.noId) { c.noId += 1; totals.noId += 1 }
      if (o.id) seen.set(o.id, (seen.get(o.id) || 0) + 1)
    }
    for (const [id, n] of seen) if (n > 1) duplicates.push({ kind, id, count: n })
    counts[kind] = c
  }
  totals.conflicts = totals.kept + totals.replaced
  return { counts, conflicts, duplicates, totals, hasChanges: totals.added + totals.replaced > 0 }
}

/** 只读预览：给出计数、冲突 ID 清单、导入文件内部重复 ID。绝不修改参数。 */
export function analyzeMerge(current, incoming, policy = 'keep') {
  const { ops } = planMerge(current, incoming, policy)
  const s = summarize(ops)
  const seen = new Set()
  const conflictIds = []
  for (const c of s.conflicts) {
    const k = c.kind + ':' + c.id
    if (seen.has(k)) continue
    seen.add(k)
    conflictIds.push({ kind: c.kind, label: MERGE_LABELS[c.kind], id: c.id, action: c.action })
  }
  return { ...s, conflictIds }
}

/**
 * 产出合并后的新 state（不修改 current）。
 * includeGroups / includeSchedules：只有「导入文件确实带这个键，且确实新增了对象」
 * 才把开关打开；仅仅覆盖已有对象时保持用户原来的开关状态，避免替他改主意。
 */
export function mergeStates(current, incoming, policy = 'keep') {
  const { ops, result } = planMerge(current, incoming, policy)
  const stats = summarize(ops)
  return {
    state: {
      meta: current.meta,
      items: result.items,
      groups: result.groups,
      schedules: result.schedules,
      includeGroups: Boolean(current.includeGroups || (incoming.includeGroups && stats.counts.groups.added > 0)),
      includeSchedules: Boolean(current.includeSchedules || (incoming.includeSchedules && stats.counts.schedules.added > 0))
    },
    stats
  }
}
