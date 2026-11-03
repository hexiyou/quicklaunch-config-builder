<script setup>
import { computed, ref } from 'vue'
import { jsonText, config, issues, errorCount, warnCount, ui, notify } from '../store.js'
import BackendPanel from './BackendPanel.vue'

const indent = ref(2)
const text = computed(() => JSON.stringify(config.value, null, indent.value))
const lineCount = computed(() => text.value.split('\n').length)
const sizeText = computed(() => {
  const n = new Blob([text.value]).size
  return n < 1024 ? n + ' B' : (n / 1024).toFixed(1) + ' KB'
})
const sortedIssues = computed(() => [...issues.value].sort((a, b) => (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1)))

function highlight(src) {
  const esc = src.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return esc.replace(
    /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"\s*:?)|(\b(?:true|false|null)\b)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (m, str, bool, num) => {
      let cls = 'num'
      if (str) cls = /:\s*$/.test(str) ? 'key' : 'str'
      else if (bool) cls = bool === 'null' ? 'null' : 'bool'
      return `<span class="j-${cls}">${m}</span>`
    }
  )
}
const highlighted = computed(() => highlight(text.value))

async function copyJson() {
  const s = text.value
  try {
    await navigator.clipboard.writeText(s)
  } catch (e) {
    const ta = document.createElement('textarea')
    ta.value = s
    ta.style.position = 'fixed'; ta.style.opacity = '0'
    document.body.appendChild(ta); ta.select()
    try { document.execCommand('copy') } catch (err) { /* 忽略 */ }
    document.body.removeChild(ta)
  }
  notify(`已复制 ${lineCount.value} 行 JSON，可直接覆盖 config.json`, errorCount.value ? 'bad' : 'ok')
}

function downloadJson() {
  const blob = new Blob([text.value], { type: 'application/json;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'config.json'
  document.body.appendChild(a); a.click()
  setTimeout(() => { URL.revokeObjectURL(a.href); document.body.removeChild(a) }, 100)
  notify('config.json 已下载')
}
</script>

<template>
  <div class="panel output-panel">
    <div class="panel-head">
      <div class="seg">
        <button :class="{ active: ui.previewMode === 'json' }" @click="ui.previewMode = 'json'">生成的 JSON</button>
        <button :class="{ active: ui.previewMode === 'issues' }" @click="ui.previewMode = 'issues'">
          校验 {{ errorCount + warnCount ? '(' + (errorCount + warnCount) + ')' : '' }}
        </button>
        <button :class="{ active: ui.previewMode === 'submit' }" @click="ui.previewMode = 'submit'">↑ 提交到后端</button>
      </div>
      <div class="output-stats">
        <span class="tag" :class="errorCount ? 'red' : 'green'">{{ errorCount }} 错误</span>
        <span class="tag" :class="warnCount ? 'amber' : 'gray'">{{ warnCount }} 提醒</span>
      </div>
    </div>

    <div v-if="ui.previewMode === 'json'" class="output-toolbar">
      <button class="btn primary sm" @click="copyJson">⧉ 复制 JSON</button>
      <button class="btn sm" @click="downloadJson">↓ 下载 config.json</button>
      <div class="seg">
        <button :class="{ active: indent === 2 }" @click="indent = 2">2 空格</button>
        <button :class="{ active: indent === 4 }" @click="indent = 4">4 空格</button>
      </div>
      <span class="muted fs11">{{ lineCount }} 行 · {{ sizeText }}</span>
    </div>
    <div v-else-if="ui.previewMode === 'issues'" class="output-toolbar">
      <span class="muted fs11">按 README 与 ui/app.js 的归一化口径校验；「错误」会阻止条目 / 任务生效，建议改完再复制。</span>
    </div>

    <pre v-if="ui.previewMode === 'json'" class="code-area"><code v-html="highlighted"></code></pre>

    <div v-else-if="ui.previewMode === 'issues'" class="issue-list">
      <div v-if="!sortedIssues.length" class="issue-ok">✓ 没有发现问题，可以直接复制覆盖 config.json。</div>
      <div v-for="(e, i) in sortedIssues" :key="i" class="issue" :class="e.level">
        <span class="iss-ico">{{ e.level === 'error' ? '✕' : '!' }}</span>
        <div>
          <span class="iss-where">{{ e.where }}</span>
          <span class="muted mono fs11"> · {{ e.field }}</span>
          <div class="iss-msg">{{ e.msg }}</div>
        </div>
      </div>
    </div>

    <BackendPanel v-else-if="ui.previewMode === 'submit'" />

    <div v-if="ui.previewMode !== 'submit'" class="panel-foot">
      <div class="muted fs11">
        复制后覆盖到 <span class="mono">wv2-launcher/config.json</span>，再点窗口底部「重载配置」（或托盘菜单）即时生效。
        提醒：改坏了可以从 <span class="mono">config.json.bak</span> 恢复。
      </div>
    </div>
  </div>
</template>
