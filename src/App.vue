<script setup>
import { ref, computed, watch } from 'vue'
import ItemEditor from './components/ItemEditor.vue'
import ObjectEditor from './components/ObjectEditor.vue'
import MetaEditor from './components/MetaEditor.vue'
import ReferencePanel from './components/ReferencePanel.vue'
import JsonPreview from './components/JsonPreview.vue'
import { ITEM_TYPES, GROUP_FIELDS, SCHEDULE_FIELDS } from './schema.js'
import {
  state, ui, jsonText, errorCount, warnCount, issues, filteredItems,
  addItem, addGroup, addSchedule, removeGroup, removeSchedule,
  setItemTypeFilter,
  importJson, loadSample, clearAll, notify
} from './store.js'

const newType = ref('app')
const importOpen = ref(false)
const importText = ref('')
const importError = ref('')

const tabs = [
  { key: 'meta', ico: '◈', label: '配置总览', count: () => '' },
  { key: 'items', ico: '▤', label: '条目 items', count: () => state.items.length },
  { key: 'groups', ico: '◧', label: '分组 groups', count: () => state.groups.length },
  { key: 'schedules', ico: '◷', label: '定时任务', count: () => state.schedules.length },
  { key: 'reference', ico: '?', label: '字段速查', count: () => '' }
]

const currentItem = computed(() => state.items.find(x => x._key === ui.selectedKey))
const currentGroup = computed(() => state.groups.find(x => x._key === ui.selectedKey))
const currentSchedule = computed(() => state.schedules.find(x => x._key === ui.selectedKey))

/** 左侧竖排类型 TAB：第一个「全部」，其后固定 8 种 type（含 0 条的，方便发现/新增） */
const typeTabs = computed(() => {
  const counts = {}
  for (const it of state.items) counts[it.type] = (counts[it.type] || 0) + 1
  return [
    { key: 'all', label: '全部', count: state.items.length, title: '显示全部条目（与原来的列表一致）' },
    ...ITEM_TYPES.map(t => ({
      key: t.value,
      label: t.value,
      count: counts[t.value] || 0,
      title: t.label + ' · ' + (counts[t.value] || 0) + ' 个条目'
    }))
  ]
})

function selectTypeTab(key) {
  setItemTypeFilter(key)
  if (key !== 'all') newType.value = key
}

/* 筛选变化时让底部「新增条目」的类型下拉跟着走；addItem 在别处改筛选也能同步 */
watch(() => ui.itemTypeFilter, key => {
  if (key !== 'all') newType.value = key
}, { immediate: true })

const groupIssues = computed(() => {
  const g = currentGroup.value
  if (!g) return []
  const prefix = `分组 #${state.groups.indexOf(g) + 1} ·`
  return issues.value.filter(i => i.where.startsWith(prefix))
})
const schedIssues = computed(() => {
  const s = currentSchedule.value
  if (!s) return []
  const prefix = `定时 #${state.schedules.indexOf(s) + 1} ·`
  return issues.value.filter(i => i.where.startsWith(prefix))
})

/* 切换页签时，把选中项落到该页第一条 */
watch(() => ui.tab, (tab) => {
  const first = tab === 'items' ? filteredItems.value[0]
    : tab === 'groups' ? state.groups[0]
      : tab === 'schedules' ? state.schedules[0] : null
  const valid = tab === 'items' ? filteredItems.value.some(x => x._key === ui.selectedKey)
    : tab === 'groups' ? currentGroup.value
      : tab === 'schedules' ? currentSchedule.value : true
  if (!valid) ui.selectedKey = first?._key || ''
})

function selectTab(t) { ui.tab = t }

/* ------------------------------------------------------------ 导入 */
function onPickFile(e) {
  const f = e.target.files?.[0]
  if (!f) return
  const reader = new FileReader()
  reader.onload = () => { importText.value = String(reader.result || ''); importError.value = '' }
  reader.onerror = () => { importError.value = '文件读取失败' }
  reader.readAsText(f, 'utf-8')
}
function doImport() {
  if (!importText.value.trim()) { importError.value = '请先选择文件或粘贴 JSON 内容'; return }
  try {
    importJson(importText.value)
    importOpen.value = false
    importText.value = ''
    importError.value = ''
    notify('已载入配置，所有字段都已还原到编辑区')
  } catch (err) {
    importError.value = 'JSON 解析失败：' + err.message
  }
}
function openImport() { importOpen.value = true; importText.value = ''; importError.value = '' }

function doClear() {
  if (!window.confirm('确定清空当前编辑的全部配置吗？此操作只影响浏览器里的内容，不会改动磁盘上的 config.json。')) return
  clearAll()
  notify('已清空，可以点击「载入示例配置」恢复')
}

async function copyTop() {
  const s = jsonText.value
  try { await navigator.clipboard.writeText(s) }
  catch (e) {
    const ta = document.createElement('textarea')
    ta.value = s; ta.style.position = 'fixed'; ta.style.opacity = '0'
    document.body.appendChild(ta); ta.select()
    try { document.execCommand('copy') } catch (err) { /* 忽略 */ }
    document.body.removeChild(ta)
  }
  notify('已复制 config.json 内容', errorCount.value ? 'bad' : 'ok')
}

function accentOf(it) {
  const a = it.accent
  return (typeof a === 'string' && /^#[0-9a-f]{3,8}$/i.test(a)) ? a : '#8ea3c0'
}
function groupUsage(g) {
  return state.items.filter(i => i._include?.group && i.group === g.id).length
}
function schedMode(s) {
  if (s._include?.at && s._include?.every) return 'at + every（冲突）'
  if (s._include?.every) return 'every · ' + (s.every || '')
  if (s._include?.at) return 'at · ' + (Array.isArray(s.at) ? s.at.join(' / ') : s.at)
  return '尚未设置时刻'
}
</script>

<template>
  <div class="app-shell">
    <!-- ------------------------------------------------ 顶栏 -->
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">Q</div>
        <div>
          <div class="brand-title">QuickLaunch 配置生成器</div>
          <div class="brand-sub">config.json · 可视化编辑 / 校验 / 一键导出</div>
        </div>
      </div>

      <div class="topbar-actions">
        <button class="btn sm" @click="openImport">↑ 导入 config.json</button>
        <button class="btn sm" @click="loadSample">载入示例配置</button>
        <button class="btn sm danger" @click="doClear">清空</button>
        <button class="btn sm" @click="ui.showHelp = !ui.showHelp">{{ ui.showHelp ? '隐藏字段说明' : '显示字段说明' }}</button>
        <button class="btn sm" @click="ui.previewMode = 'submit'">↑ 提交到后端</button>
      </div>

      <div class="topbar-right">
        <span v-if="errorCount" class="tag red">{{ errorCount }} 处错误</span>
        <span v-else class="tag green">校验通过</span>
        <button class="btn primary sm" @click="copyTop">⧉ 复制 JSON</button>
      </div>
    </header>

    <!-- ------------------------------------------------ 主体 -->
    <div class="main-grid">
      <!-- 左侧列表 -->
      <aside class="panel sidebar">
        <div class="panel-body" :class="{ 'rail-body': ui.tab === 'items' }">
          <div class="nav-tabs">
            <button v-for="t in tabs" :key="t.key" class="nav-tab" :class="{ active: ui.tab === t.key }" @click="selectTab(t.key)">
              <span class="ico">{{ t.ico }}</span>
              <span>{{ t.label }}</span>
              <span v-if="t.count() !== ''" class="count">{{ t.count() }}</span>
            </button>
          </div>

          <!-- 条目页：左缘一列按 type 切换的纵向 TAB + 右侧可滚动的条目列表 -->
          <template v-if="ui.tab === 'items'">
            <div class="items-layout">
              <div class="type-rail" role="tablist" aria-label="按条目类型筛选">
                <button
                  v-for="t in typeTabs" :key="t.key" class="type-tab"
                  :class="{ active: ui.itemTypeFilter === t.key, zero: t.key !== 'all' && t.count === 0, 'type-name': t.key !== 'all' }"
                  :title="t.title" role="tab" :aria-selected="ui.itemTypeFilter === t.key"
                  @click="selectTypeTab(t.key)"
                >
                  <span class="tr-label">{{ t.label }}</span>
                  <span class="tr-count">{{ t.count }}</span>
                </button>
              </div>

              <div class="items-scroll">
                <div class="list-sep"></div>
                <div class="list-caption">
                  <span>{{ ui.itemTypeFilter === 'all' ? '条目列表' : '条目列表 · ' + ui.itemTypeFilter }}</span>
                  <span>{{ ui.itemTypeFilter === 'all' ? '点击编辑' : filteredItems.length + ' / ' + state.items.length }}</span>
                </div>

                <div v-for="it in filteredItems" :key="it._key" class="list-item" :class="{ active: ui.selectedKey === it._key }" @click="ui.selectedKey = it._key">
                  <div class="li-icon" :style="{ background: accentOf(it) }">{{ (it.name || '?').slice(0, 1) }}</div>
                  <div class="li-main">
                    <div class="li-name">{{ it.name || it.id || '未命名' }}</div>
                    <div class="li-sub">{{ it.id }}</div>
                  </div>
                  <span class="li-badge tag blue">{{ it.type }}</span>
                </div>

                <div v-if="!filteredItems.length" class="empty">
                  <span class="em-ico">▤</span>
                  <template v-if="ui.itemTypeFilter === 'all'">还没有条目<br />在下方选个类型，点「新增条目」</template>
                  <template v-else>
                    当前没有 <span class="mono">{{ ui.itemTypeFilter }}</span> 类型的条目<br />
                    <button class="btn sm mt6" @click="addItem(ui.itemTypeFilter)">+ 新增 {{ ui.itemTypeFilter }} 条目</button>
                  </template>
                </div>
              </div>
            </div>
          </template>

          <template v-else-if="ui.tab === 'groups' || ui.tab === 'schedules'">
            <div class="list-sep"></div>
            <div class="list-caption">
              <span>{{ ui.tab === 'groups' ? '分组列表' : '任务列表' }}</span>
              <span>点击编辑</span>
            </div>

            <template v-if="ui.tab === 'groups'">
              <div v-for="g in state.groups" :key="g._key" class="list-item" :class="{ active: ui.selectedKey === g._key }" @click="ui.selectedKey = g._key">
                <div class="li-icon" style="background:#7c8db0">@</div>
                <div class="li-main">
                  <div class="li-name">{{ g.name || g.id || '未命名分组' }}</div>
                  <div class="li-sub">{{ g.id }}</div>
                </div>
                <span class="li-badge">{{ groupUsage(g) }} 项</span>
              </div>
              <div v-if="!state.groups.length" class="empty"><span class="em-ico">◧</span>还没有分组<br />不写 groups 也能跑，只是没有胶囊栏</div>
            </template>

            <template v-else>
              <div v-for="s in state.schedules" :key="s._key" class="list-item" :class="{ active: ui.selectedKey === s._key }" @click="ui.selectedKey = s._key">
                <div class="li-icon" style="background:#7c8db0">◷</div>
                <div class="li-main">
                  <div class="li-name">{{ s.id || s.run || '未命名任务' }}</div>
                  <div class="li-sub">{{ schedMode(s) }}</div>
                </div>
                <span v-if="s._include?.enabled && s.enabled === false" class="tag gray">停用</span>
              </div>
              <div v-if="!state.schedules.length" class="empty"><span class="em-ico">◷</span>还没有定时任务<br />不写 schedules 就一条任务都没有</div>
            </template>
          </template>

          <template v-else>
            <div class="list-sep"></div>
            <div class="hint-box" style="margin:8px">
              <b>用法</b><br />
              1. 在「条目 / 分组 / 定时任务」里增删改；<br />
              2. 每个可选字段左侧的勾选框决定它是否写进 JSON；<br />
              3. 右侧实时预览 + 校验；<br />
              4. 复制后覆盖软件目录的 config.json，点「重载配置」。<br />
              5. 可选：右侧「提交到后端」把配置 POST 给后端，配合软件「拉取在线配置」使用。
              <div class="mt6">条目多时可用左侧竖排 TAB 按 type 筛选；它只影响列表显示，导出的 JSON 仍是全部条目。</div>
            </div>
          </template>
        </div>

        <div class="panel-foot">
          <div v-if="ui.tab === 'items'" class="row">
            <select class="select mini-select grow" v-model="newType">
              <option v-for="t in ITEM_TYPES" :key="t.value" :value="t.value">{{ t.value }}</option>
            </select>
            <button class="btn primary sm nowrap" @click="addItem(newType)">+ 新增条目</button>
          </div>
          <button v-else-if="ui.tab === 'groups'" class="btn primary sm" style="width:100%" @click="addGroup()">+ 新增分组</button>
          <button v-else-if="ui.tab === 'schedules'" class="btn primary sm" style="width:100%" @click="addSchedule()">+ 新增定时任务</button>
          <div v-else class="muted fs11">字段说明均来自 README，可在「字段速查」里一次看全。</div>
        </div>
      </aside>

      <!-- 中间编辑区 -->
      <section class="panel editor-panel">
        <template v-if="ui.tab === 'items'">
          <ItemEditor v-if="currentItem" :item="currentItem" />
          <div v-else class="empty" style="margin:auto"><span class="em-ico">▤</span>从左侧选一个条目，或新增一条开始编辑</div>
        </template>

        <template v-else-if="ui.tab === 'groups'">
          <ObjectEditor
            v-if="currentGroup" :obj="currentGroup" :fields="GROUP_FIELDS"
            :title="currentGroup.name || currentGroup.id || '未命名分组'"
            :subtitle="'分组 #' + (state.groups.indexOf(currentGroup) + 1) + ' · ' + groupUsage(currentGroup) + ' 个条目引用了它'"
            :issues="groupIssues"
          >
            <template #top>
              <div class="row wrap mb8">
                <button class="btn sm danger" @click="removeGroup(currentGroup)">删除这个分组</button>
                <span class="muted fs11">删除分组不会改动条目里的 group 值，那些条目会归「未分组」。</span>
              </div>
            </template>
            <template #bottom>
              <div class="hint-box">分组只影响过滤，不影响启动；搜索框里的 <span class="mono">@net</span> 等价于点这颗胶囊，<span class="mono">@n</span> 前缀也能命中。</div>
            </template>
          </ObjectEditor>
          <div v-else class="empty" style="margin:auto"><span class="em-ico">◧</span>从左侧选一个分组，或新增一个</div>
        </template>

        <template v-else-if="ui.tab === 'schedules'">
          <ObjectEditor
            v-if="currentSchedule" :obj="currentSchedule" :fields="SCHEDULE_FIELDS"
            :title="currentSchedule.id || currentSchedule.run || '未命名任务'"
            :subtitle="'定时任务 #' + (state.schedules.indexOf(currentSchedule) + 1) + ' · ' + schedMode(currentSchedule)"
            :issues="schedIssues" :context="{ items: state.items }"
          >
            <template #top>
              <div class="row wrap mb8">
                <span class="tag blue">{{ schedMode(currentSchedule) }}</span>
                <button class="btn sm danger" @click="removeSchedule(currentSchedule)">删除这个任务</button>
              </div>
            </template>
            <template #bottom>
              <div class="hint-box">
                at / every 二选一，days 只跟 at 搭。错过（关机 / 休眠）不补跑；执行失败不重试；到点上一条没跑完就跳过本次。
                窗口一律不显示、不抢焦点，使用频率也不计。日志写在程序目录的 <span class="mono">sched.log</span>。
              </div>
            </template>
          </ObjectEditor>
          <div v-else class="empty" style="margin:auto"><span class="em-ico">◷</span>从左侧选一个任务，或新增一个</div>
        </template>

        <MetaEditor v-else-if="ui.tab === 'meta'" />
        <ReferencePanel v-else-if="ui.tab === 'reference'" />
      </section>

      <!-- 右侧输出 -->
      <JsonPreview />
    </div>

    <!-- ------------------------------------------------ 导入弹窗 -->
    <div v-if="importOpen" class="modal-mask" @click.self="importOpen = false">
      <div class="modal">
        <div class="modal-head">
          <div class="panel-title">导入已有 config.json</div>
          <div class="grow"></div>
          <button class="btn sm ghost" @click="importOpen = false">关闭</button>
        </div>
        <div class="modal-body">
          <div class="hint-box mb8">
            导入会<b>替换当前编辑区的全部内容</b>（不会改动磁盘文件）。所有字段、包括可选字段是否写入、字典外的自定义键都会原样还原。
            想回到软件自带的那份配置，点顶栏「载入示例配置」。
          </div>
          <div class="row mb8">
            <input type="file" accept=".json,application/json" @change="onPickFile" />
          </div>
          <div class="muted fs11 mb8">或直接粘贴 JSON 文本：</div>
          <textarea class="textarea mono" rows="10" v-model="importText" placeholder="把 config.json 的内容粘到这里"></textarea>
          <div v-if="importError" class="field-err mt6">{{ importError }}</div>
        </div>
        <div class="modal-foot">
          <button class="btn" @click="importOpen = false">取消</button>
          <button class="btn primary" @click="doImport">解析并载入</button>
        </div>
      </div>
    </div>

    <div v-if="ui.toast" class="toast" :class="{ bad: ui.toastKind === 'bad' }">{{ ui.toast }}</div>
  </div>
</template>
