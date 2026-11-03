<script setup>
import { ref, computed, watch } from 'vue'
import { setInclude, ensureUsable } from '../model.js'
import { DYNAMIC_VALUES, PARAM_TYPES, DAY_OPTIONS, DAY_PRESETS } from '../schema.js'
import KvEditor from './KvEditor.vue'
import ParamsEditor from './ParamsEditor.vue'

const props = defineProps({
  obj: { type: Object, required: true },
  field: { type: Object, required: true },
  context: { type: Object, default: () => ({}) },
  errors: { type: Array, default: () => [] },
  showHelp: { type: Boolean, default: true },
  compact: { type: Boolean, default: false }
})

const isOn = computed(() => props.field.required || !!props.obj._include?.[props.field.key])
const value = computed(() => props.obj[props.field.key])

function touch() {
  if (!props.field.required && !props.obj._include?.[props.field.key]) {
    setInclude(props.obj, props.field, true)
    ensureUsable(props.obj, props.field)
  }
}
function set(v) {
  touch()
  props.obj[props.field.key] = v
}
function toggleInclude() {
  if (props.field.required) return
  setInclude(props.obj, props.field, !isOn.value)
}

/* ---------------------------------------------------- 标签（keywords 等） */
const tagDraft = ref('')
function addTags(text) {
  const parts = String(text).split(/[,，\n]/).map(s => s.trim()).filter(Boolean)
  if (!parts.length) return
  const cur = Array.isArray(value.value) ? [...value.value] : []
  set([...cur, ...parts])
  tagDraft.value = ''
}
function onTagKey(e) {
  if (e.key === 'Enter' || e.key === ',' || e.key === '，') { e.preventDefault(); addTags(tagDraft.value) }
  else if (e.key === 'Backspace' && !tagDraft.value && Array.isArray(value.value) && value.value.length) {
    set(value.value.slice(0, -1))
  }
}
function removeTag(i) {
  const cur = [...(Array.isArray(value.value) ? value.value : [])]
  cur.splice(i, 1)
  set(cur)
}

/* ---------------------------------------------------- 模板变量插入 */
const tplVars = computed(() => {
  const list = props.context.params
  return Array.isArray(list) ? list.filter(p => p && p.name).map(p => p.name) : []
})
const allInsertables = computed(() => {
  const own = tplVars.value.map(v => ({ tpl: `{{${v}}}`, desc: '参数：' + v }))
  return props.field.key === 'headers' ? [...own, ...DYNAMIC_VALUES] : own
})
const insertChoice = ref('')
function insertTpl(targetRef) {
  if (!insertChoice.value) return
  const cur = String(value.value ?? '')
  set(cur + insertChoice.value)
  insertChoice.value = ''
}

/* ---------------------------------------------------- at 多时刻 */
const timesMode = computed(() => Array.isArray(value.value) ? 'multi' : 'single')
function setTimesMode(m) {
  if (m === 'multi' && !Array.isArray(value.value)) set(value.value ? [String(value.value)] : ['09:30'])
  if (m === 'single' && Array.isArray(value.value)) set(value.value[0] || '')
}
const timeDraft = ref('')
function addTime() {
  const t = timeDraft.value.trim()
  if (!t) return
  const cur = Array.isArray(value.value) ? [...value.value] : []
  if (!cur.includes(t)) set([...cur, t])
  timeDraft.value = ''
}
function removeTime(i) {
  const cur = [...value.value]; cur.splice(i, 1); set(cur)
}

/* ---------------------------------------------------- days */
const daysMode = computed(() => Array.isArray(value.value) ? 'custom' : 'preset')
function setDaysMode(m) {
  if (m === 'custom' && !Array.isArray(value.value)) set([])
  if (m === 'preset' && Array.isArray(value.value)) set('')
}
function toggleDay(d) {
  const cur = Array.isArray(value.value) ? [...value.value] : []
  const i = cur.indexOf(d)
  if (i >= 0) cur.splice(i, 1); else cur.push(d)
  set(cur)
}

/* ---------------------------------------------------- body（字符串 / JSON） */
const bodyKind = computed(() => {
  const v = value.value
  if (Array.isArray(v)) return 'array'
  if (v && typeof v === 'object') return 'object'
  return 'string'
})
const bodyText = ref('')
const bodyErr = ref('')
watch(() => JSON.stringify(value.value), () => {
  if (bodyKind.value !== 'string') bodyText.value = JSON.stringify(value.value, null, 2)
  else bodyText.value = String(value.value ?? '')
  bodyErr.value = ''
}, { immediate: true })
function onBodyText(e) {
  const t = e.target.value
  bodyText.value = t
  if (bodyKind.value === 'string') { set(t); bodyErr.value = ''; return }
  try {
    const parsed = JSON.parse(t)
    const ok = bodyKind.value === 'array' ? Array.isArray(parsed) : (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
    if (!ok) { bodyErr.value = bodyKind.value === 'array' ? '顶层必须是 JSON 数组 [...]' : '顶层必须是 JSON 对象 {...}'; return }
    bodyErr.value = ''
    set(parsed)
  } catch (err) { bodyErr.value = 'JSON 暂时不完整：' + err.message }
}
function setBodyKind(k) {
  if (k === bodyKind.value) return
  if (k === 'string') set(typeof value.value === 'string' ? value.value : JSON.stringify(value.value, null, 2))
  else if (k === 'object') set({})
  else set([])
}

/* ---------------------------------------------------- 其它小工具 */
const groupOptions = computed(() => (props.context.groups || []).map(g => g.id).filter(Boolean))
const itemOptions = computed(() => (props.context.items || []).map(i => i.id || i.name).filter(Boolean))
const defaultLabel = computed(() => {
  const d = props.field.default
  if (typeof d === 'boolean') return String(d)
  if (d === '' || d == null) return '未写入'
  return JSON.stringify(d)
})
const fieldErrors = computed(() => props.errors.filter(e => e.field === props.field.key || e.field?.startsWith(props.field.key + '[')))
</script>

<template>
  <div class="field-row" :class="{ 'is-off': !isOn, 'has-error': fieldErrors.length, compact }">
    <!-- 可选字段开关：关 = 不写进 JSON，开 = 显式写入 -->
    <button
      class="include-toggle"
      :class="{ on: isOn, locked: field.required }"
      :title="field.required ? '必填字段，始终写入 JSON' : '点击切换：是否把这一项写进 config.json'"
      @click="toggleInclude"
    >{{ field.required ? '●' : '✓' }}</button>

    <div class="field-main">
      <div class="field-head">
        <span class="field-label">{{ field.label }}</span>
        <span class="field-key">{{ field.key }}</span>
        <span class="tag" :class="field.required ? 'req' : 'opt'">{{ field.required ? '必填' : '可选' }}</span>
        <span v-if="!isOn" class="tag gray">不写入（默认 {{ defaultLabel }}）</span>
        <span v-if="field.applies" class="tag blue">{{ field.applies.join(' · ') }}</span>
      </div>

      <div v-if="showHelp && !compact" class="field-desc">{{ field.desc }}</div>
      <div v-if="showHelp && field.format && !compact" class="field-format">
        <b>格式</b><span>{{ field.format }}</span>
      </div>

      <!-- ---------------- 文本 / 数字 / 带候选的输入 ---------------- -->
      <template v-if="['text', 'number', 'group-select', 'item-select'].includes(field.kind)">
        <input
          class="input" :class="{ mono: field.key === 'id' || field.key === 'jsonPath' }"
          :type="field.kind === 'number' ? 'number' : 'text'"
          :value="value" :placeholder="field.placeholder || ''"
          :list="(field.key === 'group' && groupOptions.length) || (field.key === 'run' && itemOptions.length) ? 'dl-' + field.key : undefined"
          @input="e => set(field.kind === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)"
        />
        <datalist v-if="field.key === 'group'" :id="'dl-' + field.key">
          <option v-for="g in groupOptions" :key="g" :value="g" />
        </datalist>
        <datalist v-if="field.key === 'run'" :id="'dl-' + field.key">
          <option v-for="o in itemOptions" :key="o" :value="o" />
        </datalist>
        <div v-if="field.key === 'group' && groupOptions.length" class="inline-tools">
          <span class="tool-label">已定义分组：</span>
          <button v-for="g in groupOptions" :key="g" class="btn sm" @click="set(g)">{{ g }}</button>
        </div>
      </template>

      <template v-else-if="field.kind === 'select'">
        <select class="select" :value="value" @change="e => set(e.target.value)">
          <option v-for="o in field.options" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
      </template>

      <template v-else-if="field.kind === 'boolean'">
        <div class="row">
          <div class="switch" :class="{ on: value === true }" @click="set(!value)">
            <div class="switch-track"></div>
            <span class="switch-label">{{ value === true ? 'true' : value === false ? 'false' : '未设置' }}</span>
          </div>
          <span class="muted fs11">缺省 {{ defaultLabel }}</span>
        </div>
      </template>

      <template v-else-if="field.kind === 'color'">
        <div class="color-wrap">
          <input type="color" :value="/^#[0-9a-f]{6}$/i.test(String(value)) ? value : '#4f8cff'" @input="e => set(e.target.value)" />
          <input class="input mono" :value="value" placeholder="#4f8cff" @input="e => set(e.target.value)" />
        </div>
      </template>

      <!-- ---------------- 多行文本 + 模板变量插入 ---------------- -->
      <template v-else-if="field.kind === 'textarea'">
        <textarea class="textarea mono" rows="2" :value="value" :placeholder="field.placeholder || context.targetHint || ''" @input="e => set(e.target.value)" />
        <div v-if="allInsertables.length" class="inline-tools">
          <span class="tool-label">插入：</span>
          <select class="select mini-select" v-model="insertChoice">
            <option value="">选择模板变量…</option>
            <option v-for="t in allInsertables" :key="t.tpl" :value="t.tpl">{{ t.tpl }} · {{ t.desc }}</option>
          </select>
          <button class="btn sm" @click="insertTpl()">插到末尾</button>
        </div>
      </template>

      <!-- ---------------- 字符串数组 ---------------- -->
      <template v-else-if="field.kind === 'tags'">
        <input class="input" v-model="tagDraft" :placeholder="field.placeholder || '输入后回车 / 逗号添加'" @keydown="onTagKey" @blur="addTags(tagDraft)" />
        <div class="chips">
          <span v-for="(t, i) in (Array.isArray(value) ? value : [])" :key="i" class="chip">{{ t }}<button @click="removeTag(i)">×</button></span>
          <span v-if="!Array.isArray(value) || !value.length" class="muted fs11">还没有关键词</span>
        </div>
      </template>

      <!-- ---------------- 对象 / 数组 KV ---------------- -->
      <template v-else-if="field.kind === 'kv'">
        <KvEditor :modelValue="value" :fieldKey="field.key" :dynamics="field.key === 'headers'" @update:modelValue="set" />
      </template>

      <!-- ---------------- 请求体 ---------------- -->
      <template v-else-if="field.kind === 'body'">
        <div class="seg mb8">
          <button :class="{ active: bodyKind === 'string' }" @click="setBodyKind('string')">字符串（原样发）</button>
          <button :class="{ active: bodyKind === 'object' }" @click="setBodyKind('object')">JSON 对象</button>
          <button :class="{ active: bodyKind === 'array' }" @click="setBodyKind('array')">JSON 数组</button>
        </div>
        <textarea class="textarea mono" rows="4" :value="bodyText" @input="onBodyText" placeholder='{"hello":"world"}' />
        <div v-if="bodyErr" class="field-err">{{ bodyErr }}</div>
        <div v-else-if="bodyKind !== 'string'" class="hint-box">对象 / 数组会自动 <code>JSON.stringify</code> 后发送；带请求体又没指定 Content-Type 时，默认加 <code>application/json; charset=utf-8</code>。</div>
      </template>

      <!-- ---------------- params ---------------- -->
      <template v-else-if="field.kind === 'params'">
        <ParamsEditor :modelValue="value" @update:modelValue="set" />
      </template>

      <!-- ---------------- at ---------------- -->
      <template v-else-if="field.kind === 'times'">
        <div class="seg mb8">
          <button :class="{ active: timesMode === 'single' }" @click="setTimesMode('single')">单个时刻</button>
          <button :class="{ active: timesMode === 'multi' }" @click="setTimesMode('multi')">一天多次（数组）</button>
        </div>
        <input v-if="timesMode === 'single'" class="input mono" :value="value" placeholder="09:30 或 09:30:00" @input="e => set(e.target.value)" />
        <template v-else>
          <div class="row">
            <input class="input mono" v-model="timeDraft" placeholder="09:30" @keydown.enter.prevent="addTime" />
            <button class="btn sm" @click="addTime">添加</button>
          </div>
          <div class="chips">
            <span v-for="(t, i) in value" :key="i" class="chip">{{ t }}<button @click="removeTime(i)">×</button></span>
          </div>
        </template>
      </template>

      <!-- ---------------- every ---------------- -->
      <template v-else-if="field.kind === 'every'">
        <div class="row">
          <input class="input mono grow" :value="value" placeholder="30s / 15m / 2h" @input="e => set(e.target.value)" />
        </div>
        <div class="inline-tools">
          <span class="tool-label">快捷：</span>
          <button v-for="u in ['30s', '15m', '1h', '6h', '24h']" :key="u" class="btn sm" @click="set(u)">{{ u }}</button>
        </div>
      </template>

      <!-- ---------------- days ---------------- -->
      <template v-else-if="field.kind === 'days'">
        <div class="seg mb8">
          <button :class="{ active: daysMode === 'preset' }" @click="setDaysMode('preset')">预设字符串</button>
          <button :class="{ active: daysMode === 'custom' }" @click="setDaysMode('custom')">自定义星期（数组）</button>
        </div>
        <select v-if="daysMode === 'preset'" class="select" :value="value" @change="e => set(e.target.value)">
          <option value="">（省略 = 每天）</option>
          <option v-for="p in DAY_PRESETS" :key="p.value" :value="p.value">{{ p.label }}</option>
          <option v-for="d in DAY_OPTIONS" :key="d.value" :value="d.value">{{ d.label }}</option>
        </select>
        <div v-else class="day-grid">
          <button v-for="d in DAY_OPTIONS" :key="d.value" class="day-pill" :class="{ on: Array.isArray(value) && value.includes(d.value) }" @click="toggleDay(d.value)">{{ d.label }}</button>
        </div>
      </template>

      <div v-for="(e, i) in fieldErrors" :key="i" class="field-err">⚠ {{ e.msg }}</div>
    </div>
  </div>
</template>
