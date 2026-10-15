<script lang="ts" setup>
import { computed, ref, nextTick, watch } from 'vue'
import { useCollectionStore, type TreeNode } from '@/stores/collectionStore'
import { useRequestStore } from '@/stores/requestStore'
import { useUiStore } from '@/stores/uiStore'

const props = defineProps<{
  node: TreeNode
  depth: number
}>()

const store = useCollectionStore()
const requestStore = useRequestStore()
const uiStore = useUiStore()

watch(() => uiStore.renameTrigger, (newVal) => {
  if (newVal === props.node.id) {
    uiStore.triggerRename('') // consume
    void startEdit()
  }
})

const isFolder = computed(() => props.node.type === 'folder')
const isExpanded = computed(() => store.expandedFolders.has(props.node.id))
const isActive = computed(() => {
  if (isFolder.value) {
    return store.activeFolderId === props.node.id && !store.activeRequestId
  }
  return store.activeRequestId === props.node.id
})

const toggle = () => {
  if (isEditing.value) return
  if (isFolder.value) {
    store.toggleFolder(props.node.id)
  } else {
    store.selectRequest(props.node.id)
  }
}

const isEditing = ref(false)
const editName = ref('')
const nameInput = ref<HTMLInputElement | null>(null)

const startEdit = async () => {
  editName.value = props.node.name
  isEditing.value = true
  await nextTick()
  if (nameInput.value) {
    nameInput.value.focus()
    nameInput.value.select()
  }
}

const cancelEdit = () => {
  isEditing.value = false
  editName.value = ''
}

const saveEdit = async () => {
  if (!isEditing.value) return
  
  const newName = Array.from(editName.value.trim()).slice(0, 255).join('')
  if (!newName) {
    cancelEdit()
    return
  }
  
  if (newName === props.node.name) {
    cancelEdit()
    return
  }

  isEditing.value = false
  if (isFolder.value) {
    await store.renameFolder(props.node.id, newName)
  } else {
    await store.renameRequest(props.node.id, newName)
  }
}

const handleDelete = async () => {
  const msg = isFolder.value
    ? `Xóa thư mục '${props.node.name}'? Tất cả request bên trong sẽ bị xóa. Hành động này không thể hoàn tác.`
    : `Xóa request '${props.node.name}'? Hành động này không thể hoàn tác.`

  const confirmed = await uiStore.requestConfirm(msg)
  if (confirmed) {
    if (isFolder.value) {
      await store.deleteFolder(props.node.id)
    } else {
      await store.deleteRequest(props.node.id)
    }
  }
}

const onKeyDown = async (e: KeyboardEvent) => {
  // Ignore keys bubbling up from the inline rename <input> so Backspace/Delete edit text normally
  if (isEditing.value || e.target !== e.currentTarget) return
  if (e.key === 'F2') {
    e.preventDefault()
    startEdit()
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault()
    await handleDelete()
  } else if (e.ctrlKey && e.key.toLowerCase() === 'd' && !isFolder.value) {
    e.preventDefault()
    store.duplicateRequest(props.node.id)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    toggle()
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-tree-row]'))
    const idx = rows.indexOf(e.currentTarget as HTMLElement)
    if (idx !== -1) {
      if (e.key === 'ArrowDown' && idx < rows.length - 1) {
        rows[idx + 1].focus()
      } else if (e.key === 'ArrowUp' && idx > 0) {
        rows[idx - 1].focus()
      }
    }
  }
}

const handleContextMenu = async (e: MouseEvent) => {
  uiStore.openContextMenu(e.clientX, e.clientY, props.node.id, props.node.type as 'folder' | 'request')
}

const handleMenuClick = (e: MouseEvent) => {
  const btn = e.currentTarget as HTMLElement
  const rect = btn.getBoundingClientRect()
  uiStore.openContextMenu(rect.left, rect.bottom, props.node.id, props.node.type as 'folder' | 'request')
}

const displayName = computed(() => {
  return props.node.name.trim() || '(không tên)'
})
const isUnnamed = computed(() => !props.node.name.trim())

const methodColors: Record<string, string> = {
  get: 'text-method-get',
  post: 'text-method-post',
  put: 'text-method-put',
  patch: 'text-method-patch',
  delete: 'text-method-delete',
  head: 'text-cyan-400',
  options: 'text-purple-400'
}

const effectiveMethod = computed(() => {
  if (!isFolder.value && requestStore.current?.id === props.node.id && requestStore.current?.method) {
    return requestStore.current.method
  }
  return props.node.method
})

const methodColorClass = computed(() => {
  if (!effectiveMethod.value) return ''
  return methodColors[effectiveMethod.value.toLowerCase()] || 'text-text-secondary'
})

const paddingLeft = computed(() => {
  if (isFolder.value) {
    return `${props.depth * 8 + 8}px`
  }
  // request indent 28px more than folder
  return `${props.depth * 8 + 8 + 16}px`
})
</script>

<template>
  <div>
    <!-- The Row -->
    <div 
      class="flex items-center py-1.5 pr-2 cursor-pointer transition-colors select-none group outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-primary"
      data-tree-row="true"
      :data-active="isActive ? 'true' : undefined"
      :class="{
        'border-l-2 border-brand-primary bg-surface-hover text-text-primary': isActive,
        'border-l-2 border-transparent text-text-secondary hover:bg-surface-hover hover:text-text-primary': !isActive && !isFolder,
        'border-l-2 border-transparent text-text-primary hover:bg-surface-hover': !isActive && isFolder
      }"
      :style="{ paddingLeft }"
      @click="toggle"
      @dblclick="startEdit"
      @keydown="onKeyDown"
      @contextmenu.prevent="handleContextMenu"
      tabindex="0"
    >
      <!-- Caret for folder -->
      <svg 
        v-if="isFolder"
        class="w-4 h-4 mr-1 shrink-0 transition-transform duration-150 ease-in-out"
        :class="{ 'rotate-90': isExpanded }" 
        viewBox="0 0 16 16" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M6 4L10 8L6 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      
      <!-- Folder Icon -->
      <svg 
        v-if="isFolder"
        class="w-4 h-4 mr-2 shrink-0 text-text-muted"
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        stroke-width="2" 
        stroke-linecap="round" 
        stroke-linejoin="round"
      >
        <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-1.22-1.8A2 2 0 0 0 7.53 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"></path>
      </svg>

      <!-- Request Method Badge -->
      <span 
        v-if="!isFolder && effectiveMethod"
        class="text-[10px] font-bold mr-2 min-w-9 shrink-0 text-left"
        :class="methodColorClass"
      >
        {{ effectiveMethod }}
      </span>

      <!-- Name -->
      <span v-if="!isEditing" class="truncate ui-sm min-w-0 flex items-center gap-2 flex-1" :class="{ 'italic text-text-tertiary': isUnnamed }">
        <span data-test="tree-row-name" class="truncate">{{ displayName }}</span>
        <span v-if="isFolder" class="shrink-0 text-[10px] leading-none bg-surface-overlay text-text-muted px-1 py-0.5 rounded border border-border-default font-mono opacity-50" title="Cấp độ thư mục">
          {{ depth }}
        </span>
        <span
          v-if="!isFolder && isActive && requestStore.current?.id === props.node.id && requestStore.isDirty"
          data-test="tree-row-unsaved-dot"
          aria-label="Chưa lưu"
          class="w-2 h-2 rounded-full bg-unsaved-dot shrink-0"
          title="Chưa lưu"
        ></span>
      </span>
      <input
        v-else
        ref="nameInput"
        v-model="editName"
        type="text"
        class="ui-sm bg-surface-base border border-brand-primary rounded px-1 min-w-0 flex-1 outline-none text-text-primary h-6 -ml-1"
        maxlength="255"
        @blur="saveEdit"
        @keydown.enter.prevent="saveEdit"
        @keydown.esc.prevent="cancelEdit"
        @click.stop
      />

      <!-- Menu Button -->
      <button 
        v-if="!isEditing"
        class="w-6 h-6 ml-1 flex items-center justify-center shrink-0 rounded text-text-secondary hover:text-text-primary hover:bg-surface-elevated opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-brand-primary"
        aria-label="Tùy chọn"
        @click.stop="handleMenuClick"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="1"></circle>
          <circle cx="19" cy="12" r="1"></circle>
          <circle cx="5" cy="12" r="1"></circle>
        </svg>
      </button>
    </div>

    <!-- Children -->
    <div v-if="isFolder && isExpanded && node.children && node.children.length > 0">
      <TreeNodeRow 
        v-for="child in node.children" 
        :key="child.id"
        :node="child"
        :depth="depth + 1"
      />
    </div>
  </div>
</template>
