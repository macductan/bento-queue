<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref, nextTick } from 'vue'
import { useRequestStore, type ExampleSyncFlagKey, type RequestExample } from '@/stores/requestStore'
import { EXAMPLE_SYNC_FLAG_KEYS, normalizeSyncFlags } from '@/utils/requestExamples'
import { useI18n } from '@/i18n'

const { t } = useI18n()
const requestStore = useRequestStore()

const examples = computed(() => requestStore.examples)
const activeExampleId = computed(() => requestStore.activeExampleId)
const activeExample = computed(() => requestStore.activeExample)
const activeSyncFlags = computed(() => requestStore.activeSyncFlags)

const showSyncPopover = ref(false)
const menuExampleId = ref<string | null>(null)
const renamingExampleId = ref<string | null>(null)
const renameDraft = ref('')
const renameInputRef = ref<HTMLInputElement | null>(null)
const containerRef = ref<HTMLElement | null>(null)

const syncFlagGroups: Array<{ key: ExampleSyncFlagKey; labelKey: string }> = EXAMPLE_SYNC_FLAG_KEYS.map(
  key => ({
    key,
    labelKey: `examples.groups.${key}`
  })
)

const linkedCountForExample = (ex: RequestExample): number => {
  const flags = normalizeSyncFlags(ex.sync_flags)
  return EXAMPLE_SYNC_FLAG_KEYS.filter(k => flags[k]).length
}

const selectScenario = (exampleId: string | null) => {
  menuExampleId.value = null
  showSyncPopover.value = false
  requestStore.selectExample(exampleId)
}

const handleCreateExample = () => {
  menuExampleId.value = null
  showSyncPopover.value = false
  requestStore.createExample()
}

const startRename = async (ex: RequestExample) => {
  menuExampleId.value = null
  renamingExampleId.value = ex.id
  renameDraft.value = ex.name || ''
  await nextTick()
  renameInputRef.value?.focus()
  renameInputRef.value?.select()
}

const commitRename = () => {
  const id = renamingExampleId.value
  if (!id) return
  const nextName = renameDraft.value.trim()
  if (nextName) {
    requestStore.renameExample(id, nextName)
  }
  renamingExampleId.value = null
}

const cancelRename = () => {
  renamingExampleId.value = null
}

const handleDuplicate = (ex: RequestExample) => {
  menuExampleId.value = null
  requestStore.duplicateExample(ex.id)
}

const handleDelete = (ex: RequestExample) => {
  menuExampleId.value = null
  showSyncPopover.value = false
  requestStore.deleteExample(ex.id)
}

const handleDetach = async (ex: RequestExample) => {
  menuExampleId.value = null
  showSyncPopover.value = false
  await requestStore.detachExample(ex.id, { openNewRequest: true })
}

const handleToggleSyncFlag = (key: ExampleSyncFlagKey) => {
  if (!activeExample.value || !activeSyncFlags.value) return
  requestStore.setExampleSyncFlag(activeExample.value.id, key, !activeSyncFlags.value[key])
}

const handleSyncFromDefault = () => {
  requestStore.syncActiveExampleFromDefault()
}

const handleSyncAll = () => {
  requestStore.syncAllExamples()
}

const toggleExampleMenu = (exId: string) => {
  showSyncPopover.value = false
  menuExampleId.value = menuExampleId.value === exId ? null : exId
}

const onDocPointerDown = (e: Event) => {
  if (!containerRef.value) return
  if (!containerRef.value.contains(e.target as Node)) {
    showSyncPopover.value = false
    menuExampleId.value = null
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointerDown)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocPointerDown)
})
</script>

<template>
  <div
    v-if="requestStore.current"
    ref="containerRef"
    data-test="example-switcher"
    class="flex flex-wrap items-center justify-between gap-2 px-2 py-1.5 rounded-md bg-surface-raised/60 border border-border-default text-xs relative"
  >
    <!-- Scenario Pills -->
    <div class="flex flex-wrap items-center gap-1.5 min-w-0">
      <button
        type="button"
        data-test="example-tab-default"
        :aria-pressed="activeExampleId === null"
        class="px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer flex items-center gap-1.5 outline-none"
        :class="
          activeExampleId === null
            ? 'bg-brand-primary/20 text-brand-primary border border-brand-primary/40 shadow-sm'
            : 'bg-surface-base/70 text-text-secondary border border-border-default hover:text-text-primary hover:bg-surface-hover'
        "
        @click="selectScenario(null)"
      >
        <span class="w-1.5 h-1.5 rounded-full bg-current opacity-80"></span>
        <span>{{ t('examples.defaultLabel') }}</span>
      </button>

      <div
        v-for="ex in examples"
        :key="ex.id"
        class="relative flex items-center"
      >
        <input
          v-if="renamingExampleId === ex.id"
          ref="renameInputRef"
          v-model="renameDraft"
          data-test="example-rename-input"
          type="text"
          class="px-2 py-0.5 rounded bg-surface-input border border-brand-primary text-[11px] text-text-primary outline-none w-32"
          @keydown.enter.prevent="commitRename"
          @keydown.esc.prevent="cancelRename"
          @blur="commitRename"
        />
        <div
          v-else
          class="flex items-center rounded border transition-colors"
          :class="
            activeExampleId === ex.id
              ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
              : 'bg-surface-base/70 text-text-secondary border-border-default hover:text-text-primary hover:bg-surface-hover'
          "
        >
          <button
            type="button"
            data-test="example-tab"
            :data-example-id="ex.id"
            :aria-pressed="activeExampleId === ex.id"
            class="px-2.5 py-1 text-[11px] font-medium cursor-pointer flex items-center gap-1.5 outline-none"
            @click="selectScenario(ex.id)"
            @dblclick.stop="startRename(ex)"
          >
            <span class="truncate max-w-[140px]">{{ ex.name }}</span>
            <span
              class="text-[9px] px-1 py-0 rounded bg-surface-raised/80 text-text-muted font-mono"
              :title="t('examples.syncConfigTitle')"
            >
              {{ linkedCountForExample(ex) }}/{{ EXAMPLE_SYNC_FLAG_KEYS.length }}
            </span>
          </button>
          <button
            type="button"
            data-test="example-menu-trigger"
            :data-example-id="ex.id"
            class="pr-1.5 pl-0.5 py-1 text-text-muted hover:text-text-primary cursor-pointer outline-none"
            aria-label="Example options"
            @click.stop="toggleExampleMenu(ex.id)"
          >
            <svg class="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="8" cy="3.5" r="1.2" />
              <circle cx="8" cy="8" r="1.2" />
              <circle cx="8" cy="12.5" r="1.2" />
            </svg>
          </button>
        </div>

        <!-- Example Action Dropdown -->
        <div
          v-if="menuExampleId === ex.id"
          data-test="example-action-menu"
          class="absolute top-full left-0 mt-1 z-40 min-w-44 rounded-md border border-border-default bg-surface-overlay shadow-xl py-1 text-[11px]"
        >
          <button
            type="button"
            data-test="example-action-rename"
            class="w-full px-3 py-1.5 text-left text-text-secondary hover:text-text-primary hover:bg-surface-hover cursor-pointer"
            @click="startRename(ex)"
          >
            {{ t('examples.rename') }}
          </button>
          <button
            type="button"
            data-test="example-action-duplicate"
            class="w-full px-3 py-1.5 text-left text-text-secondary hover:text-text-primary hover:bg-surface-hover cursor-pointer"
            @click="handleDuplicate(ex)"
          >
            {{ t('examples.duplicate') }}
          </button>
          <button
            type="button"
            data-test="example-action-detach"
            class="w-full px-3 py-1.5 text-left text-sky-400 hover:bg-surface-hover cursor-pointer"
            @click="handleDetach(ex)"
          >
            {{ t('examples.detach') }}
          </button>
          <div class="my-1 border-t border-border-default"></div>
          <button
            type="button"
            data-test="example-action-delete"
            class="w-full px-3 py-1.5 text-left text-red-400 hover:bg-red-500/10 cursor-pointer"
            @click="handleDelete(ex)"
          >
            {{ t('examples.delete') }}
          </button>
        </div>
      </div>

      <button
        type="button"
        data-test="example-add-btn"
        class="px-2 py-1 rounded border border-dashed border-border-default hover:border-brand-primary/60 text-text-secondary hover:text-text-primary text-[11px] font-medium cursor-pointer transition-colors"
        @click="handleCreateExample"
      >
        + {{ t('examples.newExample') }}
      </button>
    </div>

    <!-- Right Controls: Sync Settings (when Example active) or Sync All (when Default active) -->
    <div class="flex items-center gap-1.5 shrink-0 relative">
      <template v-if="activeExample && activeSyncFlags">
        <button
          type="button"
          data-test="example-sync-default-btn"
          class="px-2 py-1 rounded bg-surface-base border border-border-default hover:bg-surface-hover text-text-secondary hover:text-text-primary text-[11px] cursor-pointer transition-colors"
          @click="handleSyncFromDefault"
        >
          ↻ {{ t('examples.syncFromDefault') }}
        </button>
        <button
          type="button"
          data-test="example-sync-config-btn"
          :aria-expanded="showSyncPopover"
          class="px-2 py-1 rounded border text-[11px] font-medium cursor-pointer transition-colors flex items-center gap-1"
          :class="
            showSyncPopover
              ? 'bg-brand-primary/20 border-brand-primary/50 text-brand-primary'
              : 'bg-surface-base border-border-default hover:bg-surface-hover text-text-secondary hover:text-text-primary'
          "
          @click="showSyncPopover = !showSyncPopover; menuExampleId = null"
        >
          <span>Sync</span>
          <span class="font-mono text-[10px] opacity-80">
            ({{ linkedCountForExample(activeExample) }}/{{ EXAMPLE_SYNC_FLAG_KEYS.length }})
          </span>
        </button>

        <div
          v-if="showSyncPopover"
          data-test="example-sync-popover"
          class="absolute right-0 top-full mt-1.5 z-40 w-64 rounded-lg border border-border-default bg-surface-overlay shadow-2xl p-2.5 space-y-2"
        >
          <div class="text-[11px] font-semibold text-text-primary border-b border-border-default pb-1.5">
            {{ t('examples.syncConfigTitle') }}
          </div>
          <div class="grid grid-cols-1 gap-1">
            <label
              v-for="item in syncFlagGroups"
              :key="item.key"
              class="flex items-center justify-between gap-2 px-1.5 py-1 rounded hover:bg-surface-hover cursor-pointer select-none"
            >
              <span class="text-[11px] text-text-secondary">{{ t(item.labelKey) }}</span>
              <input
                type="checkbox"
                :data-test="`sync-flag-${item.key}`"
                :checked="activeSyncFlags[item.key]"
                class="w-3.5 h-3.5 rounded border-border-default accent-brand-primary cursor-pointer"
                @change="handleToggleSyncFlag(item.key)"
              />
            </label>
          </div>
        </div>
      </template>

      <button
        v-else-if="examples.length > 0"
        type="button"
        data-test="example-sync-all-btn"
        :title="t('examples.syncAllTitle')"
        class="px-2 py-1 rounded bg-surface-base border border-border-default hover:bg-surface-hover text-text-secondary hover:text-text-primary text-[11px] font-medium cursor-pointer transition-colors"
        @click="handleSyncAll"
      >
        ↻ {{ t('examples.syncAll') }}
      </button>
    </div>
  </div>
</template>
