<script setup>
import { computed } from 'vue'
import { createParam, setInclude } from '../model.js'
import { PARAM_FIELDS, PARAM_TYPES } from '../schema.js'

const props = defineProps({ modelValue: { type: Array, default: () => [] } })
const emit = defineEmits(['update:modelValue'])

const list = computed(() => Array.isArray(props.modelValue) ? props.modelValue : [])
const varTpl = name => '{' + '{' + (name || 'name') + '}' + '}'

function add() { emit('update:modelValue', [...list.value, createParam()]) }
function remove(i) {
  const next = [...list.value]; next.splice(i, 1)
  emit('update:modelValue', next)
}
function move(i, d) {
  const j = i + d
  if (j < 0 || j >= list.value.length) return
  const next = [...list.value]
  next.splice(j, 0, next.splice(i, 1)[0])
  emit('update:modelValue', next)
}
function toggle(p, f) { setInclude(p, f, !p._include?.[f.key]) }
function set(p, f, v) {
  if (!f.required && !p._include?.[f.key]) setInclude(p, f, true)
  p[f.key] = v
}
const byKey = Object.fromEntries(PARAM_FIELDS.map(f => [f.key, f]))
</script>

<template>
  <div>
    <div v-for="(p, i) in list" :key="p._key || i" class="sub-card">
      <div class="sub-card-head">
        <span class="tag blue">参数 {{ i + 1 }}</span>
        <span class="mono fs11 bold">{{ varTpl(p.name) }}</span>
        <span class="muted fs11">{{ p.label || '（未填 label）' }}</span>
        <div class="grow"></div>
        <button class="btn sm icon" title="上移" @click="move(i, -1)">↑</button>
        <button class="btn sm icon" title="下移" @click="move(i, 1)">↓</button>
        <button class="btn sm icon danger" title="删除这个参数" @click="remove(i)">×</button>
      </div>
      <div class="sub-card-body">
        <div v-for="f in PARAM_FIELDS" :key="f.key" class="field-row compact" :class="{ 'is-off': !f.required && !p._include?.[f.key] }">
          <button class="include-toggle" :class="{ on: f.required || p._include?.[f.key], locked: f.required }" @click="toggle(p, f)">{{ f.required ? '●' : '✓' }}</button>
          <div class="field-main">
            <div class="field-head">
              <span class="field-label">{{ f.label }}</span>
              <span class="field-key">{{ f.key }}</span>
              <span class="tag" :class="f.required ? 'req' : 'opt'">{{ f.required ? '必填' : '可选' }}</span>
            </div>
            <div class="field-format"><b>{{ f.format }}</b></div>

            <input v-if="f.kind === 'text'" class="input" :value="p[f.key]" :placeholder="f.placeholder || ''" @input="e => set(p, f, e.target.value)" />
            <select v-else-if="f.key === 'type'" class="select" :value="p[f.key]" @change="e => set(p, f, e.target.value)">
              <option v-for="o in PARAM_TYPES" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
            <div v-else class="switch" :class="{ on: p[f.key] === true }" @click="set(p, f, !p[f.key])">
              <div class="switch-track"></div><span class="switch-label">{{ p[f.key] === true ? 'true' : 'false' }}</span>
            </div>
          </div>
        </div>
        <div v-if="p.name" class="hint-box">
          在 <code>target</code> / <code>args</code> / <code>query</code> / <code>headers</code> / <code>body</code> / <code>savePath</code> / <code>fileName</code> / <code>multipart</code> 里写
          <code>{{ varTpl(p.name) }}</code> 即可把参数放到指定位置。
        </div>
      </div>
    </div>

    <div v-if="!list.length" class="muted fs11 mb8">还没有声明参数。没声明 params 时，字段里的模板变量会原样直传（只警告不拦）。</div>
    <button class="btn sm" @click="add">+ 添加参数</button>
  </div>
</template>
