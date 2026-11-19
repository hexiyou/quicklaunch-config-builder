<script setup>
import { computed } from 'vue'
import ObjectEditor from './ObjectEditor.vue'
import { CALLBACK_FIELDS, CALLBACK_RULES } from '../schema.js'
import { state, config, issues, notify } from '../store.js'

const myIssues = computed(() => issues.value.filter(i => i.where === '顶层 · callback'))
const activeCount = computed(() => CALLBACK_FIELDS.filter(f => state.callback?._include?.[f.key]).length)
const DEFAULTS = 'enabled=true · max=5 · maxDepth=5 · allow=[] · onQuiet=notify'
const EXAMPLE = `{
  "code": 0,
  "data": { "count": 3 },
  "_ql_callback": {
    "v": 1,
    "actions": [
      { "type": "run", "id": "open-backup-dir" },
      { "type": "msg", "level": "success", "title": "备份完成", "text": "已上传 3 个文件" }
    ]
  }
}`

function toggle() {
  state.includeCallback = !state.includeCallback
  notify(state.includeCallback
    ? '已启用 callback 块；不勾任何子字段就是全用默认值'
    : '已移除 callback 块，导出的 JSON 不再含这个键')
}
</script>

<template>
  <div class="editor-scroll">
    <div class="editor-title-row">
      <div>
        <div class="editor-title">回调 callback</div>
        <div class="editor-subtitle">顶层可选块 · 响应带 _ql_callback 时执行本地动作（上游 d48be68 新增）</div>
      </div>
    </div>

    <div class="row wrap mb8">
      <div class="switch" :class="{ on: state.includeCallback }" @click="toggle">
        <div class="switch-track"></div>
        <span class="switch-label">输出 callback 块</span>
      </div>
      <span class="tag" :class="state.includeCallback ? 'green' : 'gray'">{{ state.includeCallback ? '已启用' : '未写入' }}</span>
      <span v-if="state.includeCallback" class="muted fs11">已写入 {{ activeCount }} / {{ CALLBACK_FIELDS.length }} 个子字段</span>
    </div>

    <div class="hint-box mb10">
      <b>不写就是默认值，老配置不用改。</b>上游默认值：<span class="mono">{{ DEFAULTS }}</span>。
      关掉开关时导出的 JSON 完全不含这个键；打开但一个子字段都不勾，会输出
      <span class="mono">"callback": {}</span>，效果与全默认一致。
    </div>

    <template v-if="state.includeCallback">
      <ObjectEditor
        embedded :obj="state.callback" :fields="CALLBACK_FIELDS"
        title="callback 字段"
        subtitle="左侧勾选框控制该字段是否写进 config.json；不勾 = 由程序按默认值处理"
        :issues="myIssues"
      />
      <div class="section">
        <div class="section-head">
          <span class="section-title">远端响应长什么样</span>
          <span class="section-note">下面是接口响应，不是 config.json 的内容</span>
        </div>
        <div class="section-body">
          <pre class="cb-code" v-text="EXAMPLE"></pre>
          <div class="muted fs11 mt6">
            <span class="mono">run</span> 拉起条目（受 <span class="mono">allow</span> 白名单与防环约束），
            <span class="mono">msg</span> 弹消息框；动作条数受 <span class="mono">max</span> 限制，链长受 <span class="mono">maxDepth</span> 限制。
          </div>
        </div>
      </div>
    </template>

    <div class="section">
      <div class="section-head">
        <span class="section-title">行为约定</span>
        <span class="section-note">逐条对应 wv2-launcher/README.md「回调」小节</span>
      </div>
      <div class="section-body">
        <ul class="ref-list"><li v-for="(r, i) in CALLBACK_RULES" :key="i">{{ r }}</li></ul>
      </div>
    </div>

    <div class="hint-box mt10">
      当前导出的顶层键：<span class="mono">{{ Object.keys(config).join(', ') }}</span>。
      <span class="mono">callback</span> 排在末尾，不写时原有顺序一字不变。
    </div>
  </div>
</template>
