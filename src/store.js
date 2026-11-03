import { reactive, computed, watch } from 'vue'
import {
  sampleState, emptyState, stateFromJson, buildConfig,
  createItem, createGroup, createSchedule, createParam, clone, uid
} from './model.js'
import { validateAll } from './validate.js'

const STORAGE_KEY = 'ql-config-builder-v1'

function initialState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && Array.isArray(parsed.items)) return parsed
    }
  } catch (e) { /* 浏览器禁用存储时直接走示例 */ }
  return sampleState()
}

export const state = reactive(initialState())

/** 当前编辑对象：{ kind: 'meta'|'item'|'group'|'schedule', key } */
export const ui = reactive({
  tab: 'items',                 // items | groups | schedules | meta | reference
  selectedKey: '',
  previewMode: 'json',          // json | issues | submit（云端提交，附加功能）
  showHelp: true,
  toast: '',
  toastKind: 'ok'
})

export const config = computed(() => buildConfig(state))
export const jsonText = computed(() => JSON.stringify(config.value, null, 2))
export const issues = computed(() => validateAll(state))
export const errorCount = computed(() => issues.value.filter(i => i.level === 'error').length)
export const warnCount = computed(() => issues.value.filter(i => i.level === 'warn').length)

let saveTimer = 0
watch(state, () => {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch (e) { /* 忽略配额错误 */ }
  }, 300)
}, { deep: true })

/* ------------------------------------------------------------ 列表操作 */

const EXAMPLE_TARGET = {
  app: 'C:\\Windows\\System32\\notepad.exe',
  cmd: 'ipconfig /all',
  url: 'https://example.com',
  folder: '.',
  ahk: '.\\scripts\\demo.ahk',
  webhook: 'https://httpbin.org/get',
  download: 'https://example.com/file.txt',
  jsonfile: 'file://c:\\data.json'
}

export function addItem(type = 'app') {
  const it = createItem(type)
  let n = state.items.length + 1
  while (state.items.some(x => String(x.id) === `item-${n}`)) n += 1
  it.id = `item-${n}`
  it.name = `新条目 ${n}`
  it.target = EXAMPLE_TARGET[type] || ''
  state.items.push(it)
  ui.tab = 'items'
  ui.selectedKey = it._key
  return it
}
export function addGroup() {
  const g = createGroup()
  state.groups.push(g)
  ui.tab = 'groups'
  ui.selectedKey = g._key
  return g
}
export function addSchedule() {
  const s = createSchedule()
  state.schedules.push(s)
  ui.tab = 'schedules'
  ui.selectedKey = s._key
  return s
}
export function addParam(item) {
  const p = createParam()
  if (!Array.isArray(item.params)) item.params = []
  item.params.push(p)
  item._include.params = true
  return p
}

export function duplicateItem(it) {
  const copy = clone(it)
  copy._key = uid()
  copy.id = String(it.id || 'item') + '-copy'
  copy.name = String(it.name || '未命名') + '（副本）'
  if (Array.isArray(copy.params)) copy.params.forEach(p => { p._key = uid() })
  const i = state.items.indexOf(it)
  state.items.splice(i + 1, 0, copy)
  ui.selectedKey = copy._key
  return copy
}

export function moveItem(it, delta) {
  const i = state.items.indexOf(it)
  const j = i + delta
  if (i < 0 || j < 0 || j >= state.items.length) return
  const arr = state.items
  arr.splice(j, 0, arr.splice(i, 1)[0])
}

export function removeItem(it) {
  const i = state.items.indexOf(it)
  if (i >= 0) state.items.splice(i, 1)
  if (ui.selectedKey === it._key) ui.selectedKey = state.items[Math.min(i, state.items.length - 1)]?._key || ''
}
export function removeGroup(g) {
  const i = state.groups.indexOf(g)
  if (i >= 0) state.groups.splice(i, 1)
  if (ui.selectedKey === g._key) ui.selectedKey = state.groups[Math.min(i, state.groups.length - 1)]?._key || ''
}
export function removeSchedule(s) {
  const i = state.schedules.indexOf(s)
  if (i >= 0) state.schedules.splice(i, 1)
  if (ui.selectedKey === s._key) ui.selectedKey = state.schedules[Math.min(i, state.schedules.length - 1)]?._key || ''
}
export function removeParam(item, p) {
  const i = item.params.indexOf(p)
  if (i >= 0) item.params.splice(i, 1)
}

/* ------------------------------------------------------------ 全局操作 */

export function importJson(text) {
  const data = JSON.parse(text)   // 解析错误交给调用方捕获
  const next = stateFromJson(data)
  state.meta = next.meta
  state.items = next.items
  state.groups = next.groups
  state.schedules = next.schedules
  state.includeGroups = next.includeGroups
  state.includeSchedules = next.includeSchedules
  ui.selectedKey = next.items[0]?._key || ''
  ui.tab = 'items'
}

export function loadSample() {
  const next = sampleState()
  state.meta = next.meta
  state.items = next.items
  state.groups = next.groups
  state.schedules = next.schedules
  state.includeGroups = next.includeGroups
  state.includeSchedules = next.includeSchedules
  ui.selectedKey = next.items[0]?._key || ''
  ui.tab = 'items'
}

export function clearAll() {
  const next = emptyState()
  state.meta = next.meta
  state.items = next.items
  state.groups = next.groups
  state.schedules = next.schedules
  state.includeGroups = false
  state.includeSchedules = false
  ui.selectedKey = ''
  ui.tab = 'items'
}

export function notify(text, kind = 'ok') {
  ui.toast = text
  ui.toastKind = kind
  setTimeout(() => { if (ui.toast === text) ui.toast = '' }, 2600)
}
