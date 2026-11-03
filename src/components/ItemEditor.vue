<script setup>
import { ref, computed } from 'vue'
import Field from './Field.vue'
import { ITEM_TYPES, TYPE_MAP, ITEM_SECTIONS, ITEM_FIELDS, fieldsOf, fieldApplies } from '../schema.js'
import { state, issues, ui, removeItem, duplicateItem, moveItem } from '../store.js'

const props = defineProps({ item: { type: Object, required: true } })

const open = ref({ type: true, basic: true, launch: true, params: true, webhook: true, download: true, other: true })
function flip(k) { open.value[k] = !open.value[k] }

const idx = computed(() => state.items.indexOf(props.item))
const myIssues = computed(() => {
  const prefix = `条目 #${idx.value + 1} ·`
  return issues.value.filter(i => i.where.startsWith(prefix))
})
const context = computed(() => ({
  params: props.item.params,
  groups: state.groups,
  items: state.items,
  targetHint: TYPE_MAP[props.item.type]?.targetHint || ''
}))
const typeInfo = computed(() => TYPE_MAP[props.item.type])

function chooseType(t) {
  props.item.type = t
  if (!props.item._include) props.item._include = {}
}
function sectionFields(k) { return fieldsOf(k, props.item.type) }
function sectionCount(k) { return sectionFields(k).filter(f => f.required || props.item._include?.[f.key]).length }
/** 导入的配置 / 中途换过 type 时，可能残留不属于当前类型的字段：
 *  不静默丢弃，单独展示，让用户自己决定关不关。 */
const otherFields = computed(() => ITEM_FIELDS.filter(f =>
  !fieldApplies(f, props.item.type) && (f.required || props.item._include?.[f.key])
))
</script>

<template>
  <div class="editor-scroll">
    <div class="editor-title-row">
      <div>
        <div class="editor-title">{{ item.name || item.id || '未命名条目' }}</div>
        <div class="editor-subtitle mono">{{ item.id || '（未设置 id）' }} · 第 {{ idx + 1 }} / {{ state.items.length }} 条</div>
      </div>
      <div class="editor-actions">
        <button class="btn sm" @click="moveItem(item, -1)" :disabled="idx === 0">↑ 上移</button>
        <button class="btn sm" @click="moveItem(item, 1)" :disabled="idx === state.items.length - 1">↓ 下移</button>
        <button class="btn sm" @click="duplicateItem(item)">⧉ 复制</button>
        <button class="btn sm danger" @click="removeItem(item)">删除</button>
      </div>
    </div>

    <div class="row wrap mb8">
      <span class="tag blue">{{ item.type }}</span>
      <span v-if="item._include?.enabled && item.enabled === false" class="tag red">已停用</span>
      <span v-if="item._include?.hidden && item.hidden === true" class="tag amber">界面隐藏</span>
      <span v-if="item._include?.pinned && item.pinned === true" class="tag green">常用置顶</span>
      <span v-if="myIssues.filter(e => e.level === 'error').length" class="tag red">{{ myIssues.filter(e => e.level === 'error').length }} 处错误</span>
      <span v-if="myIssues.filter(e => e.level === 'warn').length" class="tag amber">{{ myIssues.filter(e => e.level === 'warn').length }} 处提醒</span>
    </div>

    <!-- 类型选择 -->
    <div class="section" :class="{ collapsed: !open.type }">
      <div class="section-head" @click="flip('type')">
        <span class="section-title">条目类型</span>
        <span class="section-note">决定 target 怎么解析、哪些字段有意义</span>
        <span class="section-caret">▾</span>
      </div>
      <div v-show="open.type" class="section-body" style="padding-top:10px">
        <div class="type-cards">
          <button v-for="t in ITEM_TYPES" :key="t.value" class="type-card" :class="{ active: item.type === t.value }" @click="chooseType(t.value)">
            <div class="tc-name">{{ t.value }}</div>
            <div class="muted fs11">{{ t.label.split(' · ')[1] }}</div>
          </button>
        </div>
        <div v-if="typeInfo" class="type-desc">
          <b>{{ typeInfo.label }}</b> — {{ typeInfo.desc }}
          <div class="mt6 muted fs11">target 示例：<span class="mono">{{ typeInfo.targetHint }}</span></div>
        </div>
      </div>
    </div>

    <!-- 字段分组 -->
    <div v-for="sec in ITEM_SECTIONS" :key="sec.key" class="section" :class="{ collapsed: !open[sec.key] }">
      <div class="section-head" @click="flip(sec.key)">
        <span class="section-title">{{ sec.title }}</span>
        <span class="section-note">{{ sec.note }}</span>
        <span class="tag gray">{{ sectionCount(sec.key) }} / {{ sectionFields(sec.key).length }} 已写入</span>
        <span class="section-caret">▾</span>
      </div>
      <div v-show="open[sec.key]" class="section-body">
        <div v-if="!sectionFields(sec.key).length" class="muted fs11" style="padding:10px 0">当前类型没有这一组字段。</div>
        <Field
          v-for="f in sectionFields(sec.key)"
          :key="f.key"
          :obj="item" :field="f" :context="context"
          :errors="myIssues" :showHelp="ui.showHelp"
        />
      </div>
    </div>
    <!-- 已写入但对当前 type 无意义的字段（不静默丢弃） -->
    <div v-if="otherFields.length" class="section" :class="{ collapsed: !open.other }">
      <div class="section-head" @click="flip('other')">
        <span class="section-title">其它已写入字段</span>
        <span class="section-note">不属于当前 {{ item.type }}，但会写进 JSON；点左侧勾选框可移除</span>
        <span class="tag amber">{{ otherFields.length }} 项</span>
        <span class="section-caret">▾</span>
      </div>
      <div v-show="open.other" class="section-body">
        <Field
          v-for="f in otherFields" :key="f.key"
          :obj="item" :field="f" :context="context"
          :errors="myIssues" :showHelp="ui.showHelp"
        />
      </div>
    </div>
  </div>
</template>
