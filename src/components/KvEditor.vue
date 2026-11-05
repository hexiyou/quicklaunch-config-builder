<script setup>
import { ref, computed, watch } from 'vue'
import { DYNAMIC_VALUES, DYNAMIC_RULES } from '../schema.js'

const props = defineProps({
  modelValue: { default: null },
  fieldKey: { type: String, default: 'query' },
  dynamics: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue'])

const mode = computed(() => Array.isArray(props.modelValue) ? 'array' : 'object')
const sep = computed(() => props.fieldKey === 'headers' ? ':' : '=')
const rows = ref([])

function toRows(v) {
  if (Array.isArray(v)) return v.map(x => ({ k: '', v: String(x ?? '') }))
  if (v && typeof v === 'object') return Object.entries(v).map(([k, val]) => ({ k, v: typeof val === 'string' ? val : JSON.stringify(val) }))
  return []
}
function syncRows() {
  const next = toRows(props.modelValue)
  if (JSON.stringify(next) !== JSON.stringify(rows.value)) rows.value = next
}
watch(() => JSON.stringify(props.modelValue), syncRows, { immediate: true })

function changed() {
  if (mode.value === 'array') {
    emit('update:modelValue', rows.value.map(r => r.v))
  } else {
    const out = {}
    rows.value.forEach(r => { if (r.k) out[r.k] = r.v })
    emit('update:modelValue', out)
  }
}
function addRow(preset) {
  if (mode.value === 'array') rows.value.push({ k: '', v: preset || '' })
  else rows.value.push({ k: preset?.k || '', v: preset?.v || '' })
  changed()
}
function removeRow(i) { rows.value.splice(i, 1); changed() }

function setMode(m) {
  if (m === mode.value) return
  if (m === 'array') {
    emit('update:modelValue', rows.value.map(r => r.k ? `${r.k}${sep.value}${sep.value === ':' ? ' ' : ''}${r.v}` : r.v))
  } else {
    const out = {}
    rows.value.forEach(r => {
      const s = String(r.v)
      const cut = s.indexOf(sep.value)
      if (cut >= 0) {
        const k = s.slice(0, cut).trim()
        const v = s.slice(cut + 1).trim()
        if (k) out[k] = v
      } else if (s) out[s] = ''
    })
    emit('update:modelValue', out)
  }
}

const dynChoice = ref('')
function insertDynamic() {
  if (!dynChoice.value) return
  const tpl = dynChoice.value
  if (mode.value === 'array') rows.value.push({ k: '', v: `X-Demo${sep.value}${sep.value === ':' ? ' ' : ''}${tpl}` })
  else rows.value.push({ k: 'X-Demo', v: tpl })
  dynChoice.value = ''
  changed()
}
</script>

<template>
  <div>
    <div class="row mb8">
      <div class="seg">
        <button :class="{ active: mode === 'object' }" @click="setMode('object')">对象 {"key":"value"}</button>
        <button :class="{ active: mode === 'array' }" @click="setMode('array')">数组 ["a=1"]</button>
      </div>
      <button class="btn sm" @click="addRow()">+ 添加一行</button>
    </div>

    <div v-for="(r, i) in rows" :key="i" class="kv-row" :class="{ single: mode === 'array' }">
      <input v-if="mode === 'object'" class="input mono" :value="r.k" placeholder="键名 / Header 名" @input="e => { r.k = e.target.value; changed() }" />
      <input class="input mono" :value="r.v" :placeholder="mode === 'array' ? (fieldKey === 'headers' ? 'Name: Value' : 'a=1') : '值（支持模板变量）'" @input="e => { r.v = e.target.value; changed() }" />
      <button class="btn sm icon danger" title="删除这一行" @click="removeRow(i)">×</button>
    </div>
    <div v-if="!rows.length" class="muted fs11">暂无内容；点「添加一行」开始，或切换成另一种写法。</div>

    <template v-if="dynamics">
      <div class="inline-tools">
        <span class="tool-label">插入动态值：</span>
        <select class="select mini-select" v-model="dynChoice">
          <option value="">选择动态值写法…</option>
          <option v-for="d in DYNAMIC_VALUES" :key="d.tpl" :value="d.tpl">{{ d.tpl }} · {{ d.desc }}</option>
        </select>
        <button class="btn sm" @click="insertDynamic">插入示例头</button>
      </div>
      <div class="hint-box">
        <b>动态值在 headers 与 body 都会展开</b>，由 AHK 在发送前算出，密钥不落 config.json。<br />
        <span v-for="(r, i) in DYNAMIC_RULES.slice(0, 3)" :key="i">· {{ r }}<br /></span>
      </div>
    </template>
  </div>
</template>
