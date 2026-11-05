<script setup>
/**
 * multipart 编辑器：对应 wv2-launcher README「上传本地文件（multipart）」的三种写法。
 *
 *   完整式   { "fields": {…}, "files": [ {field,path,filename,type} ] }
 *   单文件   { "field": "file", "path": "…" }
 *   文件数组 [ { "field": "…", "path": "…" } ]
 *
 * 两条设计约束：
 *  1) 导入时按「值长什么样」反推写法，用户不主动改就不 emit，保证 config.json 往返逐字段无损；
 *  2) 编辑后字典外的键（含 path 的 file 别名）仍原样带回，不静默丢数据。
 *
 * 模板里所有含花括号的文案都放在 JS 常量里 —— Vue 会把字面 {{…}} 当插值解析。
 */
import { ref, computed, watch } from 'vue'
import { DYNAMIC_VALUES } from '../schema.js'

const props = defineProps({
  modelValue: { default: null },
  context: { type: Object, default: () => ({}) }
})
const emit = defineEmits(['update:modelValue'])

const FILE_KEYS = ['field', 'path', 'filename', 'type']
const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)))
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k)

const T = {
  full: '完整式 {fields, files}',
  single: '单文件 {field, path}',
  array: '文件数组 [ {field, path} ]',
  modeNote: '三种写法程序都认：完整式可同时带普通文本字段和多个文件；单文件 / 数组只带文件，不带 fields。',
  fieldsNote: '值支持 {{参数}} 与 {{#ts}} / {{#file:…}} 这类动态值。',
  pathNote: '路径支持 {{参数}}、file://、%TEMP%、相对路径；必填。',
  pathPlaceholder: 'C:\\a.png 或 {{file}}',
  insertLabel: '插入模板 / 动态值：',
  warnBody: '有 multipart 就整个走它，body 不参与；Content-Type（含 boundary）由程序自己拼。单文件上限 8MB。',
  warnName: '文件名里的引号和换行会被替换成单引号和空格（防止往包里插假头部）。',
  stagedFields: '单文件 / 数组写法不带 fields，已填的文本字段会暂存、不写进 JSON；切回「完整式」可恢复。',
  stagedFiles: '单文件写法只输出第一个文件，其余文件已暂存；切到「完整式」或「文件数组」可恢复。'
}

function blankFile() {
  return { field: 'file', path: '', filename: '', type: '', _extra: {} }
}
function rowFromFile(f) {
  const o = f && typeof f === 'object' && !Array.isArray(f) ? f : {}
  const row = {
    field: String(o.field ?? ''),
    path: String(o.path ?? ''),
    filename: String(o.filename ?? ''),
    type: String(o.type ?? ''),
    _extra: {}
  }
  // path 的 file 别名、以及字典外的自定义键都留着
  for (const [k, v] of Object.entries(o)) {
    if (!FILE_KEYS.includes(k)) row._extra[k] = clone(v)
  }
  return row
}
function fileFromRow(row) {
  const out = {}
  if (row.field !== '') out.field = row.field
  if (row.path !== '') out.path = row.path
  if (row.filename !== '') out.filename = row.filename
  if (row.type !== '') out.type = row.type
  for (const [k, v] of Object.entries(row._extra || {})) if (!(k in out)) out[k] = clone(v)
  return out
}

/** 原始值 → 内部草稿 */
function parse(v) {
  const d = { mode: 'full', fields: [], files: [], extras: {}, hadFields: false, hadFiles: false }
  if (Array.isArray(v)) {
    d.mode = 'array'
    d.files = v.map(rowFromFile)
  } else if (v && typeof v === 'object') {
    d.hadFields = has(v, 'fields')
    d.hadFiles = has(v, 'files')
    if (d.hadFields || d.hadFiles) {
      d.mode = 'full'
      const fr = v.fields
      if (fr && typeof fr === 'object' && !Array.isArray(fr)) {
        d.fields = Object.entries(fr).map(([k, val]) => ({ k, v: typeof val === 'string' ? val : JSON.stringify(val) }))
      }
      d.files = Array.isArray(v.files) ? v.files.map(rowFromFile) : []
    } else {
      d.mode = 'single'
      d.files = [rowFromFile(v)]
    }
    for (const [k, val] of Object.entries(v)) {
      if (k === 'fields' || k === 'files') continue
      if (d.mode === 'full' || !FILE_KEYS.includes(k)) d.extras[k] = clone(val)
    }
  }
  return d
}

/** 内部草稿 → 写进 config.json 的值 */
function build(d) {
  const files = d.files.map(fileFromRow)
  if (d.mode === 'array') return files
  if (d.mode === 'single') return { ...clone(d.extras), ...(files[0] || {}) }
  const out = clone(d.extras)
  const fields = {}
  d.fields.forEach(r => { if (r.k) fields[r.k] = r.v })
  if (d.fields.length || d.hadFields) out.fields = fields
  if (files.length || d.hadFiles) out.files = files
  return out
}

const draft = ref(parse(props.modelValue))

// 自己 emit 引起的变化不重新 parse（否则会打断正在输入的光标）；外部导入 / 撤销才同步
watch(() => JSON.stringify(props.modelValue), () => {
  if (JSON.stringify(build(draft.value)) === JSON.stringify(props.modelValue)) return
  draft.value = parse(props.modelValue)
})

function changed() { emit('update:modelValue', build(draft.value)) }

const shownFiles = computed(() => draft.value.mode === 'single' ? draft.value.files.slice(0, 1) : draft.value.files)
const hiddenFileCount = computed(() => draft.value.mode === 'single' ? Math.max(0, draft.value.files.length - 1) : 0)
const stagedFieldsCount = computed(() => draft.value.mode === 'full' ? 0 : draft.value.fields.length)

function setMode(m) {
  if (m === draft.value.mode) return
  if (m === 'single' && !draft.value.files.length) draft.value.files.push(blankFile())
  draft.value.mode = m
  changed()
}

function addFile() { draft.value.files.push(blankFile()); changed() }
function removeFile(i) { draft.value.files.splice(i, 1); changed() }
function moveFile(i, d) {
  const j = i + d
  if (j < 0 || j >= draft.value.files.length) return
  const arr = draft.value.files
  arr.splice(j, 0, arr.splice(i, 1)[0])
  changed()
}
function addField() { draft.value.fields.push({ k: '', v: '' }); changed() }
function removeField(i) { draft.value.fields.splice(i, 1); changed() }

const insertables = computed(() => {
  const list = props.context?.params
  const own = Array.isArray(list) ? list.filter(p => p && p.name).map(p => ({ tpl: `{{${p.name}}}`, desc: '参数：' + p.name })) : []
  return [...own, ...DYNAMIC_VALUES]
})
function insertInto(row, key, tpl) {
  if (!tpl) return
  row[key] = String(row[key] ?? '') + tpl
  changed()
}
function onInsert(e, row, key) {
  insertInto(row, key, e.target.value)
  e.target.value = ''
}
</script>

<template>
  <div class="mpart-editor">
    <div class="row mb8">
      <div class="seg">
        <button :class="{ active: draft.mode === 'full' }" @click="setMode('full')">{{ T.full }}</button>
        <button :class="{ active: draft.mode === 'single' }" @click="setMode('single')">{{ T.single }}</button>
        <button :class="{ active: draft.mode === 'array' }" @click="setMode('array')">{{ T.array }}</button>
      </div>
    </div>
    <div class="hint-box mb8">{{ T.modeNote }}</div>

    <!-- ---------------- 普通文本字段（仅完整式） ---------------- -->
    <template v-if="draft.mode === 'full'">
      <div class="mpart-sub">普通文本字段 <code>fields</code>
        <button class="btn sm" @click="addField">+ 添加字段</button>
      </div>
      <div v-for="(r, i) in draft.fields" :key="'f' + i" class="mpart-field-row">
        <input class="input mono" :value="r.k" placeholder="字段名" @input="e => { r.k = e.target.value; changed() }" />
        <input class="input mono" :value="r.v" placeholder="值（支持模板变量）" @input="e => { r.v = e.target.value; changed() }" />
        <select class="select mini-select" @change="onInsert($event, r, 'v')">
          <option value="">{{ T.insertLabel }}</option>
          <option v-for="o in insertables" :key="o.tpl" :value="o.tpl">{{ o.tpl }} · {{ o.desc }}</option>
        </select>
        <button class="btn sm icon danger" title="删除这一字段" @click="removeField(i)">×</button>
      </div>
      <div v-if="!draft.fields.length" class="muted fs11">还没有文本字段；只传文件可以不填。</div>
      <div class="muted fs11 mt6">{{ T.fieldsNote }}</div>
    </template>
    <div v-else-if="stagedFieldsCount" class="field-err">⚠ {{ T.stagedFields }}</div>

    <!-- ---------------- 文件列表 ---------------- -->
    <div class="mpart-sub">要上传的文件 <code>files</code>
      <span class="tag gray">{{ shownFiles.length }} 个</span>
      <button v-if="draft.mode !== 'single'" class="btn sm" @click="addFile">+ 添加文件</button>
    </div>

    <div v-for="(r, i) in shownFiles" :key="'p' + i" class="sub-card">
      <div class="sub-card-head">
        <span class="tag blue">文件 {{ i + 1 }}</span>
        <span class="mono fs11 bold">{{ r.path || '（还没填路径）' }}</span>
        <div class="grow"></div>
        <button v-if="draft.mode !== 'single'" class="btn sm icon" title="上移" @click="moveFile(i, -1)">↑</button>
        <button v-if="draft.mode !== 'single'" class="btn sm icon" title="下移" @click="moveFile(i, 1)">↓</button>
        <button v-if="draft.mode !== 'single'" class="btn sm icon danger" title="删除这个文件" @click="removeFile(i)">×</button>
      </div>
      <div class="sub-card-body">
        <div class="mpart-file-grid">
          <label class="mpart-cell"><span>field · 表单字段名（缺省 file）</span>
            <input class="input mono" :value="r.field" placeholder="file" @input="e => { r.field = e.target.value; changed() }" />
          </label>
          <label class="mpart-cell"><span>path · 本地路径（必填）</span>
            <input class="input mono" :value="r.path" :placeholder="T.pathPlaceholder" @input="e => { r.path = e.target.value; changed() }" />
          </label>
          <label class="mpart-cell"><span>filename · 上传后显示的名字</span>
            <input class="input mono" :value="r.filename" placeholder="留空 = 磁盘上的文件名" @input="e => { r.filename = e.target.value; changed() }" />
          </label>
          <label class="mpart-cell"><span>type · MIME</span>
            <input class="input mono" :value="r.type" placeholder="留空 = 按扩展名猜" @input="e => { r.type = e.target.value; changed() }" />
          </label>
        </div>
        <div class="inline-tools mt6">
          <span class="tool-label">{{ T.insertLabel }}</span>
          <select class="select mini-select" @change="onInsert($event, r, 'path')">
            <option value="">选择写法…</option>
            <option v-for="o in insertables" :key="o.tpl" :value="o.tpl">{{ o.tpl }} · {{ o.desc }}</option>
          </select>
          <span class="muted fs11">{{ T.pathNote }}</span>
        </div>
      </div>
    </div>
    <div v-if="!shownFiles.length" class="muted fs11 mb8">还没有文件；点「添加文件」开始。</div>
    <div v-if="hiddenFileCount" class="field-err">⚠ {{ T.stagedFiles }}</div>

    <div class="hint-box mt6">
      · {{ T.warnBody }}<br />
      · {{ T.warnName }}
    </div>
  </div>
</template>
