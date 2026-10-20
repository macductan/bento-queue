<script lang="ts" setup>
import { ref, computed, watch } from 'vue'
import type { DefaultHeaderItem } from '@/utils/headers'

const props = defineProps<{
  items?: DefaultHeaderItem[]
}>()

const emit = defineEmits<{
  (e: 'toggle', item: DefaultHeaderItem): void
}>()

const items = computed(() => props.items || [])
const show = ref(false)
const revealedKeys = ref<Set<string>>(new Set())

watch(() => props.items, () => {
  revealedKeys.value.clear()
})

const isRevealed = (key: string) => revealedKeys.value.has(key)
const toggleReveal = (key: string) => {
  if (revealedKeys.value.has(key)) {
    revealedKeys.value.delete(key)
  } else {
    revealedKeys.value.add(key)
  }
}

const getDisplayValue = (item: DefaultHeaderItem): string => {
  if (!item.value) return '(empty)'
  if (item.source === 'auth' && !isRevealed(item.key)) {
    if (item.value.startsWith('Bearer ')) {
      return 'Bearer ••••••••••••'
    }
    if (item.value.startsWith('Basic ')) {
      return 'Basic ••••••••••••'
    }
    return '••••••••••••••••'
  }
  return item.value
}

const getAuthBadgeLabel = (item: DefaultHeaderItem): string => {
  if (item.authSource === 'request') {
    return 'Auth (Request)'
  }
  if (item.authSource === 'folder' || item.folderLevel !== undefined) {
    return `Auth (${item.folderLevel || 1})`
  }
  return 'Auth'
}

const getAuthBadgeTitle = (item: DefaultHeaderItem): string => {
  if (item.authSource === 'request') {
    return 'Configured in request Auth tab'
  }
  if (item.authSource === 'folder' || item.folderLevel !== undefined) {
    const folderInfo = item.folderName
      ? `${item.folderName} (Folder ${item.folderLevel || 1})`
      : `Folder (${item.folderLevel || 1})`
    return `Inherited auth from: ${folderInfo}`
  }
  return 'Authentication configuration'
}
</script>

<template>
  <div class="mb-4 flex flex-col gap-2">
    <!-- Toggle Button Bar -->
    <div class="flex items-center justify-between py-1">
      <button
        type="button"
        @click="show = !show"
        class="flex items-center gap-1.5 text-xs font-medium text-text-muted hover:text-text-primary transition-colors cursor-pointer select-none outline-none focus-visible:ring-1 focus-visible:ring-brand-primary rounded px-1.5 py-1"
        :aria-expanded="show"
        aria-controls="default-headers-panel"
      >
        <svg 
          class="w-3.5 h-3.5 transition-transform duration-200" 
          :class="{ 'rotate-90': show }"
          viewBox="0 0 256 256" 
          fill="currentColor"
        >
          <path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z"></path>
        </svg>
        <span>{{ show ? 'Hide default headers' : 'Default headers' }}</span>
        <span 
          class="px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
          :class="items.length > 0 ? 'bg-surface-raised text-text-secondary' : 'bg-surface-base text-text-muted'"
        >
          {{ items.length }}
        </span>
      </button>
    </div>

    <!-- Read-Only / Inactivable Default Headers List -->
    <div 
      v-if="show" 
      id="default-headers-panel"
      class="flex flex-col bg-surface-raised/40 rounded-md border border-border-default overflow-hidden"
    >
      <div v-if="items.length === 0" class="text-xs text-text-muted py-3 px-4">
        No default headers.
      </div>
      <div v-else class="flex flex-col">
        <!-- Table Column Headers -->
        <div class="flex items-center bg-surface-raised border-b border-border-default text-text-muted text-[11px] font-semibold uppercase tracking-wider select-none">
          <div class="w-10 shrink-0 flex items-center justify-center border-r border-border-default py-2">
            <span class="sr-only">Kích hoạt</span>
          </div>
          <div class="flex-1 px-3 py-2 border-r border-border-default">Key</div>
          <div class="flex-[2] px-3 py-2 border-r border-border-default">Value</div>
          <div class="w-44 px-3 py-2 text-right">Source</div>
        </div>

        <!-- Rows -->
        <div class="divide-y divide-border-default">
          <div 
            v-for="(item, idx) in items" 
            :key="`${item.key}-${idx}`"
            class="flex items-stretch text-xs hover:bg-surface-hover/20 transition-colors group"
            :class="{ 'opacity-50': item.disabled || item.overridden }"
          >
            <!-- Inactive Checkbox -->
            <div class="w-10 shrink-0 flex items-center justify-center border-r border-border-default bg-surface-raised/10 py-1.5">
              <button
                type="button"
                role="checkbox"
                :aria-checked="!item.disabled && !item.overridden"
                :disabled="item.overridden"
                @click="!item.overridden && emit('toggle', item)"
                class="w-4 h-4 rounded-[4px] border flex items-center justify-center transition-colors outline-none focus-visible:ring-1 focus-visible:ring-brand-primary"
                :class="item.overridden 
                  ? 'bg-surface-input border-border-default text-transparent opacity-40 cursor-not-allowed' 
                  : (!item.disabled ? 'bg-brand-primary border-brand-primary text-white cursor-pointer' : 'bg-surface-input border-border-default text-transparent hover:border-border-focus cursor-pointer')"
                :title="item.overridden ? 'Overridden by request header' : (!item.disabled ? 'Disable this default header' : 'Restore this default header')"
                aria-label="Toggle default header"
              >
                <svg class="w-3.5 h-3.5 font-bold" viewBox="0 0 256 256" fill="none" stroke="currentColor" stroke-width="36" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="216 72 104 184 48 128"></polyline>
                </svg>
              </button>
            </div>

            <!-- Key -->
            <div 
              class="flex-1 px-3 py-2 border-r border-border-default mono-sm truncate flex items-center"
              :class="item.disabled || item.overridden ? 'line-through text-text-muted' : 'text-text-secondary font-medium'"
              :title="item.key"
            >
              {{ item.key }}
            </div>

            <!-- Value with Sensitive Masking for Auth -->
            <div 
              class="flex-[2] px-3 py-2 border-r border-border-default mono-sm flex items-center justify-between gap-1.5 min-w-0"
              :class="item.disabled || item.overridden ? 'line-through text-text-muted' : 'text-text-muted'"
            >
              <span 
                class="truncate" 
                :title="item.source === 'auth' && !isRevealed(item.key) ? 'Auth token is hidden. Click eye icon to show.' : item.value"
              >
                {{ getDisplayValue(item) }}
              </span>
              <button
                v-if="item.source === 'auth' && item.value"
                type="button"
                @click="toggleReveal(item.key)"
                class="text-text-muted hover:text-text-primary p-0.5 rounded cursor-pointer transition-colors shrink-0 outline-none focus-visible:ring-1 focus-visible:ring-brand-primary"
                :title="isRevealed(item.key) ? 'Hide token' : 'Show token'"
                aria-label="Toggle token visibility"
              >
                <svg v-if="isRevealed(item.key)" class="w-3.5 h-3.5" viewBox="0 0 256 256" fill="currentColor">
                  <path d="M228,128a113.88,113.88,0,0,1-19.78,33.5l16.12,16.13a8,8,0,0,1-11.31,11.31l-184-184A8,8,0,0,1,40.34,3.66L61,24.32A115.06,115.06,0,0,1,128,12a114.28,114.28,0,0,1,100,116ZM92.17,55.51A100.82,100.82,0,0,0,48.16,108.6a8,8,0,0,0,0,10.8,114.73,114.73,0,0,0,55.56,47.46l15-15A44,44,0,0,1,87.65,120.8l15.82-15.82A44.08,44.08,0,0,1,92.17,55.51ZM207.84,119.4A114.73,114.73,0,0,0,152.28,71.94L167.3,56.92A113.62,113.62,0,0,1,207.84,119.4Z"/>
                </svg>
                <svg v-else class="w-3.5 h-3.5" viewBox="0 0 256 256" fill="currentColor">
                  <path d="M247.31,124.76c-.35-.79-8.82-19.58-27.65-38.41C194.57,61.26,162.88,48,128,48S61.43,61.26,36.34,86.35C17.51,105.18,9,124,8.69,124.76a8,8,0,0,0,0,6.5c.35.79,8.82,19.57,27.65,38.4C61.43,194.74,93.12,208,128,208s66.57-13.26,91.66-38.34c18.83-18.83,27.3-37.61,27.65-38.4A8,8,0,0,0,247.31,124.76ZM128,192c-30.78,0-57.67-11.19-79.93-33.25A133.47,133.47,0,0,1,25,128,133.33,133.33,0,0,1,48.07,97.25C70.33,75.19,97.22,64,128,64s57.67,11.19,79.93,33.25A133.47,133.47,0,0,1,231,128,133.33,133.33,0,0,1,207.93,158.75C185.67,180.81,158.78,192,128,192Zm0-112a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160Z"/>
                </svg>
              </button>
            </div>

            <!-- Source & Overridden Status -->
            <div class="w-44 px-3 py-2 flex items-center justify-end gap-1.5 shrink-0 bg-surface-raised/5">
              <span 
                v-if="item.overridden && !item.disabled" 
                class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20"
                title="Overridden by request header"
              >
                Overridden
              </span>
              <span 
                v-if="item.source === 'folder'" 
                class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20"
                :title="item.folderName ? `Inherited from: ${item.folderName} (Folder ${item.folderLevel || 1})` : `Inherited from folder (${item.folderLevel || 1})`"
              >
                Folder ({{ item.folderLevel || 1 }})
              </span>
              <span 
                v-else-if="item.source === 'auth'" 
                class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                :title="getAuthBadgeTitle(item)"
              >
                {{ getAuthBadgeLabel(item) }}
              </span>
              <span 
                v-else-if="item.source === 'auto'" 
                class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20"
                title="Generated by request body"
              >
                Auto
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
