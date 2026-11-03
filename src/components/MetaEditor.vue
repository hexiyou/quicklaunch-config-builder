<script setup>
import { computed } from 'vue'
import ObjectEditor from './ObjectEditor.vue'
import { TOP_FIELDS } from '../schema.js'
import { state, config, issues, notify } from '../store.js'

const myIssues = computed(() => issues.value.filter(i => i.where === '顶层'))
const typeCounts = computed(() => {
  const m = {}
  state.items.forEach(i => { m[i.type] = (m[i.type] || 0) + 1 })
  return Object.entries(m).sort((a, b) => b[1] - a[1])
})
</script>

<template>
  <div class="editor-scroll">
    <div class="editor-title-row">
      <div>
        <div class="editor-title">配置总览</div>
        <div class="editor-subtitle">顶层字段、可选区块开关与当前配置的统计</div>
      </div>
    </div>

    <div class="row wrap mb8">
      <span class="tag blue">{{ state.items.length }} 个条目</span>
      <span class="tag">{{ state.groups.length }} 个分组</span>
      <span class="tag">{{ state.schedules.length }} 个定时任务</span>
      <span class="tag" v-for="c in typeCounts" :key="c[0]">{{ c[0] }} × {{ c[1] }}</span>
    </div>

    <ObjectEditor embedded :obj="state.meta" :fields="TOP_FIELDS" title="顶层字段" subtitle="这两个字段在现有 config.json 里存在，启动器只读取 items / groups / schedules" :issues="myIssues" />

    <div class="section">
      <div class="section-head"><span class="section-title">可选区块</span><span class="section-note">README：groups 与 schedules 都不写就是「没有」</span></div>
      <div class="section-body" style="padding-top:10px">
        <div class="row wrap" style="padding:6px 0">
          <div class="switch" :class="{ on: state.includeGroups }" @click="state.includeGroups = !state.includeGroups">
            <div class="switch-track"></div><span class="switch-label">输出 groups（{{ state.groups.length }} 项）</span>
          </div>
          <span class="muted fs11">不写就没有分组胶囊；条目没有 group 归「未分组」。</span>
        </div>
        <div class="row wrap" style="padding:6px 0">
          <div class="switch" :class="{ on: state.includeSchedules }" @click="state.includeSchedules = !state.includeSchedules">
            <div class="switch-track"></div><span class="switch-label">输出 schedules（{{ state.schedules.length }} 项）</span>
          </div>
          <span class="muted fs11">不写就一条任务都没有，连 sched.log 都不会生成。</span>
        </div>
      </div>
    </div>

    <div class="hint-box mt10">
      当前生成的 JSON 共 <b>{{ Object.keys(config).length }}</b> 个顶层键：
      <span class="mono">{{ Object.keys(config).join(', ') }}</span>。
      导出时按 <span class="mono">name → version → items → groups → schedules</span> 的顺序排列，与软件自带的 config.json 一致。
    </div>
  </div>
</template>
