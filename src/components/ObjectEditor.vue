<script setup>
import Field from './Field.vue'
import { ui } from '../store.js'

defineProps({
  obj: { type: Object, required: true },
  fields: { type: Array, required: true },
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  context: { type: Object, default: () => ({}) },
  issues: { type: Array, default: () => [] },
  embedded: { type: Boolean, default: false }
})
</script>

<template>
  <div :class="embedded ? 'embedded-object' : 'editor-scroll'">
    <div class="editor-title-row">
      <div>
        <div class="editor-title">{{ title }}</div>
        <div class="editor-subtitle">{{ subtitle }}</div>
      </div>
    </div>

    <slot name="top"></slot>

    <div class="section">
      <div class="section-head">
        <span class="section-title">字段</span>
        <span class="section-note">左侧勾选框控制该字段是否写进 config.json</span>
      </div>
      <div class="section-body">
        <Field
          v-for="f in fields" :key="f.key"
          :obj="obj" :field="f" :context="context"
          :errors="issues" :showHelp="ui.showHelp"
        />
      </div>
    </div>

    <slot name="bottom"></slot>
  </div>
</template>
