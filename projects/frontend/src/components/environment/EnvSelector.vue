<script lang="ts" setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useEnvironmentStore } from '@/stores/environmentStore'
import { useUiStore } from '@/stores/uiStore'

const envStore = useEnvironmentStore()
const uiStore = useUiStore()

const containerRef = ref<HTMLElement | null>(null)
const triggerBtnRef = ref<HTMLButtonElement | null>(null)
const selectRef = ref<HTMLSelectElement | null>(null)
const isOpen = ref(false)

const selectedEnvId = computed<string | null>({
  get: () => envStore.activeEnvId,
  set: (val) => {
    void envStore.setActive(val || null)
  }
})

const activeEnv = computed(() => {
  if (!selectedEnvId.value) return null
  return envStore.environments.find(e => e.id === selectedEnvId.value) || null
})

const activeEnvName = computed(() => {
  return activeEnv.value?.name || 'Không dùng env'
})

const toggleDropdown = () => {
  isOpen.value = !isOpen.value
}

const selectEnv = (id: string | null) => {
  selectedEnvId.value = id
  isOpen.value = false
}

const openEnvSettings = () => {
  isOpen.value = false
  uiStore.envModalOpen = true
}

const handleClickOutside = (e: MouseEvent) => {
  if (containerRef.value && !containerRef.value.contains(e.target as Node)) {
    isOpen.value = false
  }
}

const handleWindowKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && isOpen.value) {
    isOpen.value = false
  }
}

watch(() => uiStore.focusEnvRequested, () => {
  isOpen.value = true
  triggerBtnRef.value?.focus()
  if (selectRef.value) {
    selectRef.value.focus()
  }
})

onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('click', handleClickOutside)
    window.addEventListener('keydown', handleWindowKeydown)
  }
})

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('click', handleClickOutside)
    window.removeEventListener('keydown', handleWindowKeydown)
  }
})
</script>

<template>
  <div ref="containerRef" class="relative flex items-center">
    <!-- Hidden select for form accessibility and unit test compatibility -->
    <select
      ref="selectRef"
      v-model="selectedEnvId"
      class="sr-only"
      aria-hidden="true"
      tabindex="-1"
    >
      <option :value="null">Không dùng env</option>
      <option v-for="env in envStore.environments" :key="env.id" :value="env.id">
        {{ env.name }}
      </option>
    </select>

    <!-- Custom Dropdown Trigger Button -->
    <button
      ref="triggerBtnRef"
      type="button"
      data-test="env-selector-trigger"
      class="flex items-center gap-2 h-[32px] px-2.5 rounded-md bg-surface-overlay hover:bg-surface-hover border border-border-default hover:border-border-hover transition-all text-xs font-medium cursor-pointer select-none focus:outline-none focus:ring-2 focus:ring-brand-primary"
      :class="selectedEnvId ? 'text-text-primary border-emerald-500/30 bg-surface-overlay/90' : 'text-text-secondary'"
      :title="`Môi trường: ${activeEnvName} (Ctrl+E)`"
      aria-haspopup="listbox"
      :aria-expanded="isOpen"
      @click.stop="toggleDropdown"
      @keydown.down.prevent="isOpen = true"
    >
      <!-- Active Env Status Dot or Inactive Icon -->
      <span
        v-if="selectedEnvId"
        class="w-2 h-2 rounded-full bg-emerald-400 shrink-0 shadow-sm shadow-emerald-400/50"
        aria-hidden="true"
      />
      <svg
        v-else
        class="w-3.5 h-3.5 text-text-muted shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M21 12a9 9 0 0 1-9 9m9-9a9 9 0 0 0-9-9m9 9H3m9 9a9 9 0 0 1-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9"/>
      </svg>

      <!-- Current Environment Name -->
      <span class="truncate max-w-[140px] font-medium leading-normal">
        {{ activeEnvName }}
      </span>

      <!-- Dropdown Chevron -->
      <svg
        class="w-3.5 h-3.5 text-text-muted transition-transform duration-200 shrink-0 ml-0.5"
        :class="{ 'rotate-180 text-brand-primary': isOpen }"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6"/>
      </svg>
    </button>

    <!-- Dropdown Menu Popover -->
    <div
      v-if="isOpen"
      data-test="env-dropdown-menu"
      class="absolute top-full right-0 mt-1.5 w-[230px] bg-surface-raised border border-border-default rounded-lg shadow-2xl py-1.5 z-50 flex flex-col text-xs select-none"
      role="listbox"
      aria-label="Danh sách môi trường"
      @click.stop
    >
      <div class="px-3 py-1 text-[10px] font-bold text-text-muted uppercase tracking-wider">
        Môi trường hoạt động
      </div>

      <!-- Option: Không dùng env -->
      <button
        type="button"
        data-test="env-option-none"
        class="w-full flex items-center justify-between px-3 py-2 hover:bg-surface-hover transition-colors text-left cursor-pointer"
        :class="selectedEnvId === null ? 'bg-brand-primary/10 text-brand-primary font-semibold' : 'text-text-secondary hover:text-text-primary'"
        role="option"
        :aria-selected="selectedEnvId === null"
        @click="selectEnv(null)"
      >
        <span class="flex items-center gap-2 truncate">
          <svg class="w-3.5 h-3.5 opacity-60 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
          </svg>
          <span class="truncate">Không dùng env</span>
        </span>
        <svg
          v-if="selectedEnvId === null"
          class="w-3.5 h-3.5 text-brand-primary shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
        >
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </button>

      <div class="my-1 border-t border-border-default/60" />

      <!-- List of Environments -->
      <div class="max-h-56 overflow-y-auto flex flex-col">
        <div v-if="envStore.environments.length === 0" class="px-3 py-2.5 text-center text-text-muted text-[11px] italic">
          Chưa tạo môi trường nào
        </div>
        <button
          v-for="env in envStore.environments"
          :key="env.id"
          type="button"
          :data-test="`env-option-${env.id}`"
          class="w-full flex items-center justify-between px-3 py-2 hover:bg-surface-hover transition-colors text-left cursor-pointer group"
          :class="selectedEnvId === env.id ? 'bg-brand-primary/10 text-brand-primary font-semibold' : 'text-text-primary'"
          role="option"
          :aria-selected="selectedEnvId === env.id"
          @click="selectEnv(env.id)"
        >
          <span class="flex items-center gap-2 truncate flex-1 min-w-0 mr-2">
            <span
              class="w-2 h-2 rounded-full shrink-0"
              :class="selectedEnvId === env.id ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50' : 'bg-text-muted/40 group-hover:bg-text-muted/70'"
            />
            <span class="truncate">{{ env.name }}</span>
          </span>
          <svg
            v-if="selectedEnvId === env.id"
            class="w-3.5 h-3.5 text-brand-primary shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
          >
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </button>
      </div>

      <div class="my-1 border-t border-border-default/60" />

      <!-- Manage environments action -->
      <button
        type="button"
        data-test="open-env-modal-btn"
        class="w-full flex items-center gap-2 px-3 py-2 hover:bg-surface-hover text-text-secondary hover:text-brand-primary transition-colors text-left cursor-pointer text-xs font-medium"
        @click="openEnvSettings"
      >
        <svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
        <span>Cài đặt môi trường...</span>
      </button>
    </div>
  </div>
</template>
