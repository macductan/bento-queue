<script lang="ts" setup>
import { computed, ref, nextTick, watch } from 'vue'
import { useCollectionStore, type TreeNode } from '@/stores/collectionStore'
import { useFlowStore, type FlowTreeNode } from '@/stores/flowStore'
import { useRequestStore } from '@/stores/requestStore'
import { useUiStore } from '@/stores/uiStore'
import { useI18n } from '@/i18n'

const props = defineProps<{
  node: TreeNode | FlowTreeNode
  depth: number
}>()

const { t } = useI18n()
const store = useCollectionStore()
const flowStore = useFlowStore()
const requestStore = useRequestStore()
const uiStore = useUiStore()

watch(() => uiStore.renameTrigger, (newVal) => {
  if (newVal === props.node.id) {
    uiStore.triggerRename('') // consume
    void startEdit()
  }
})

const isFlowMode = computed(
  () => props.node.type === 'flow_folder' || props.node.type === 'flow' || uiStore.workspaceMode === 'flows'
)
const isFolder = computed(() => props.node.type === 'folder' || props.node.type === 'flow_folder')
const isExpanded = computed(() =>
  isFlowMode.value
    ? flowStore.expandedFlowFolders.has(props.node.id)
    : store.expandedFolders.has(props.node.id)
)
const isHighlighted = computed(() => uiStore.highlightedNodeId === props.node.id)
const isActive = computed(() => {
  if (isFlowMode.value) {
    return !isFolder.value && flowStore.activeFlowId === props.node.id
  }
  if (isFolder.value) {
    return store.activeFolderId === props.node.id && !store.activeRequestId
  }
  return store.activeRequestId === props.node.id
})

const isDirtyNode = computed(() => {
  if (isFolder.value) return false
  if (isFlowMode.value) {
    return flowStore.activeFlowId === props.node.id && flowStore.isDirty
  }
  return isActive.value && requestStore.current?.id === props.node.id && requestStore.isDirty
})

const activeDraggingNode = computed(() =>
  isFlowMode.value ? flowStore.draggingNode : store.draggingNode
)

const toggle = () => {
  if (isEditing.value) return
  if (isFlowMode.value) {
    if (isFolder.value) {
      flowStore.toggleFlowFolder(props.node.id)
    } else {
      void flowStore.selectFlow(props.node.id)
    }
    return
  }
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
  editName.value = isFlowMode.value ? effectiveRawName.value : props.node.name
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
  
  const currentName = isFlowMode.value ? effectiveRawName.value : props.node.name
  if (newName === currentName) {
    cancelEdit()
    return
  }

  isEditing.value = false
  if (isFlowMode.value) {
    if (isFolder.value) {
      await flowStore.renameFlowFolder(props.node.id, newName)
    } else {
      await flowStore.renameFlow(props.node.id, newName)
    }
    return
  }
  if (isFolder.value) {
    await store.renameFolder(props.node.id, newName)
  } else {
    await store.renameRequest(props.node.id, newName)
  }
}

const handleDelete = async () => {
  const targetName = isFlowMode.value ? effectiveRawName.value : props.node.name
  const msg = isFlowMode.value
    ? isFolder.value
      ? t('contextMenu.deleteFlowFolderConfirm', { name: targetName })
      : t('contextMenu.deleteFlowConfirm', { name: targetName })
    : isFolder.value
      ? t('contextMenu.deleteFolderConfirm', { name: targetName })
      : t('contextMenu.deleteRequestConfirm', { name: targetName })

  const confirmed = await uiStore.requestConfirm(msg)
  if (confirmed) {
    if (isFlowMode.value) {
      if (isFolder.value) {
        await flowStore.deleteFlowFolder(props.node.id)
      } else {
        await flowStore.deleteFlow(props.node.id)
      }
      return
    }
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
    if (isFlowMode.value) {
      void flowStore.duplicateFlow(props.node.id)
    } else {
      store.duplicateRequest(props.node.id)
    }
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

const resolvedContextNodeType = computed<'folder' | 'request' | 'flow_folder' | 'flow'>(() => {
  if (isFlowMode.value) {
    return isFolder.value ? 'flow_folder' : 'flow'
  }
  return props.node.type as 'folder' | 'request'
})

const handleContextMenu = async (e: MouseEvent) => {
  uiStore.openContextMenu(e.clientX, e.clientY, props.node.id, resolvedContextNodeType.value)
}

const handleMenuClick = (e: MouseEvent) => {
  const btn = e.currentTarget as HTMLElement
  const rect = btn.getBoundingClientRect()
  uiStore.openContextMenu(rect.left, rect.bottom, props.node.id, resolvedContextNodeType.value)
}

const effectiveRawName = computed(() => {
  if (
    !isFolder.value &&
    isFlowMode.value &&
    isActive.value &&
    flowStore.currentFlow?.id === props.node.id &&
    typeof flowStore.currentFlow.name === 'string'
  ) {
    return flowStore.currentFlow.name
  }
  return props.node.name || ''
})

const displayName = computed(() => {
  return effectiveRawName.value.trim() || '(không tên)'
})
const isUnnamed = computed(() => !effectiveRawName.value.trim())

const methodColors: Record<string, string> = {
  get: 'text-method-get method-badge-get',
  post: 'text-method-post method-badge-post',
  put: 'text-method-put method-badge-put',
  patch: 'text-method-patch method-badge-patch',
  delete: 'text-method-delete method-badge-delete',
  head: 'text-method-head method-badge-head',
  options: 'text-method-options method-badge-options'
}

const effectiveMethod = computed(() => {
  if (isFlowMode.value) return undefined
  if (!isFolder.value && requestStore.current?.id === props.node.id && requestStore.current?.method) {
    return requestStore.current.method
  }
  return (props.node as TreeNode).method
})

const methodColorClass = computed(() => {
  if (!effectiveMethod.value) return ''
  return methodColors[effectiveMethod.value.toLowerCase()] || 'text-text-secondary method-badge-options'
})

const INDENT_STEP = 14

const paddingLeft = computed(() => {
  if (isFolder.value) {
    return `${props.depth * INDENT_STEP + 8}px`
  }
  return `${props.depth * INDENT_STEP + 8 + INDENT_STEP}px`
})

const guideOffsets = computed(() => {
  const offsets: number[] = []
  for (let i = 0; i < props.depth; i++) {
    offsets.push(i * INDENT_STEP + 14)
  }
  return offsets
})

const isDragging = ref(false)
const isDragOver = ref(false)
const isInvalidTarget = ref(false)
const dropPosition = ref<'before' | 'after' | 'inside' | null>(null)

const handleOpenFolderSettings = async () => {
  if (isFlowMode.value || !isFolder.value) return
  await store.openFolderSettings(props.node.id)
}

const handleSortFolder = async () => {
  if (isFlowMode.value) {
    await flowStore.sortFlowNodes(props.node.id)
  } else {
    await store.sortNodes(props.node.id)
  }
}

const onDragStart = (e: DragEvent) => {
  if (isEditing.value) {
    e.preventDefault()
    return
  }
  isDragging.value = true
  if (isFlowMode.value) {
    flowStore.setDraggingNode({
      id: props.node.id,
      type: isFolder.value ? 'flow_folder' : 'flow'
    })
  } else {
    store.setDraggingNode({ id: props.node.id, type: props.node.type as 'folder' | 'request' })
  }
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('application/x-hecto-tree-node', JSON.stringify({ id: props.node.id, type: props.node.type }))
    e.dataTransfer.setData('text/plain', props.node.id)
  }
}

const onDragEnd = () => {
  isDragging.value = false
  isDragOver.value = false
  isInvalidTarget.value = false
  dropPosition.value = null
  if (isFlowMode.value) {
    flowStore.setDraggingNode(null)
  } else {
    store.setDraggingNode(null)
  }
}

watch(
  () => activeDraggingNode.value,
  (node) => {
    if (!node) {
      isDragging.value = false
      isDragOver.value = false
      isInvalidTarget.value = false
      dropPosition.value = null
    }
  }
)

const onDragOver = (e: DragEvent) => {
  const dragging = activeDraggingNode.value
  if (!dragging) return

  e.stopPropagation()

  const currentTarget = e.currentTarget as HTMLElement | null
  if (!currentTarget) return

  const rect = currentTarget.getBoundingClientRect()
  const offsetY = e.clientY - rect.top

  let pos: 'before' | 'after' | 'inside' = 'after'
  if (isFolder.value) {
    if (offsetY < rect.height * 0.25) {
      pos = 'before'
    } else if (offsetY > rect.height * 0.75) {
      pos = 'after'
    } else {
      pos = 'inside'
    }
  } else {
    pos = offsetY < rect.height * 0.5 ? 'before' : 'after'
  }

  const canReorder = isFlowMode.value
    ? flowStore.canReorderNode(dragging.id, dragging.type as 'flow_folder' | 'flow', props.node.id, pos)
    : store.canReorderNode(dragging.id, dragging.type as 'folder' | 'request', props.node.id, pos)

  if (canReorder) {
    e.preventDefault()
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move'
    }
    dropPosition.value = pos
    isDragOver.value = true
    isInvalidTarget.value = false
  } else {
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'none'
    }
    dropPosition.value = null
    isDragOver.value = false
    isInvalidTarget.value = true
  }
}

const onDragLeave = (e: DragEvent) => {
  const currentTarget = e.currentTarget as HTMLElement | null
  if (!currentTarget) {
    isDragOver.value = false
    isInvalidTarget.value = false
    dropPosition.value = null
    return
  }
  const rect = currentTarget.getBoundingClientRect()
  if (
    e.clientX >= rect.left &&
    e.clientX < rect.right &&
    e.clientY >= rect.top &&
    e.clientY < rect.bottom
  ) {
    return
  }
  isDragOver.value = false
  isInvalidTarget.value = false
  dropPosition.value = null
}

const onDrop = async (e: DragEvent) => {
  e.preventDefault()
  e.stopPropagation()

  const dragging = activeDraggingNode.value
  const pos = dropPosition.value
  dropPosition.value = null
  isDragOver.value = false
  isInvalidTarget.value = false

  if (!dragging || !pos) return

  if (isFlowMode.value) {
    flowStore.setDraggingNode(null)
    await flowStore.reorderNodePosition(
      dragging.id,
      dragging.type as 'flow_folder' | 'flow',
      props.node.id,
      pos
    )
  } else {
    store.setDraggingNode(null)
    await store.reorderNodePosition(
      dragging.id,
      dragging.type as 'folder' | 'request',
      props.node.id,
      pos
    )
  }
}
</script>

<template>
  <div data-tree-node="true">
    <!-- The Row -->
    <div 
      class="relative flex items-center py-1.5 pr-2 cursor-pointer select-none group outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-primary border-l-2"
      data-tree-row="true"
      :data-node-id="props.node.id"
      :data-highlighted="isHighlighted ? 'true' : undefined"
      :draggable="!isEditing"
      :data-active="isActive ? 'true' : undefined"
      :data-depth="depth"
      :data-dragging="isDragging ? 'true' : undefined"
      :data-drop-target="isDragOver ? 'valid' : (isInvalidTarget ? 'invalid' : undefined)"
      :data-drop-position="dropPosition || undefined"
      :class="{
        'opacity-50': isDragging,
        'ring-2 ring-inset ring-brand-primary bg-brand-primary/15 border-brand-primary': isDragOver && dropPosition === 'inside',
        'cursor-not-allowed opacity-60 border-transparent': isInvalidTarget,
        'ring-2 ring-inset ring-brand-primary bg-brand-primary/30 !text-brand-primary font-bold shadow-md shadow-brand-primary/20 animate-pulse': isHighlighted,
        'border-brand-primary bg-surface-hover text-text-primary': !isHighlighted && isActive && !(isDragOver && dropPosition === 'inside'),
        'border-transparent text-text-secondary hover:bg-surface-hover hover:text-text-primary': !isHighlighted && !isActive && !isFolder && !(isDragOver && dropPosition === 'inside'),
        'border-transparent text-text-primary hover:bg-surface-hover': !isHighlighted && !isActive && isFolder && !(isDragOver && dropPosition === 'inside')
      }"
      :style="{ paddingLeft }"
      @click="toggle"
      @dblclick="startEdit"
      @keydown="onKeyDown"
      @contextmenu.prevent="handleContextMenu"
      @dragstart="onDragStart"
      @dragend="onDragEnd"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
      tabindex="0"
    >
      <!-- Highlight Active Indicator -->
      <span
        v-if="isHighlighted"
        data-test="tree-row-highlight-bar"
        class="absolute left-0 top-0 bottom-0 w-1 bg-brand-primary z-30 pointer-events-none"
      />
      <!-- Drop Line Indicators -->
      <div
        v-if="isDragOver && dropPosition === 'before'"
        data-test="tree-drop-indicator-before"
        class="absolute top-0 left-0 right-0 h-0.5 bg-brand-primary z-20 pointer-events-none"
      />
      <div
        v-if="isDragOver && dropPosition === 'after'"
        data-test="tree-drop-indicator-after"
        class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-primary z-20 pointer-events-none"
      />
      <!-- Vertical Hierarchy Guide Lines -->
      <span
        v-for="(leftPx, idx) in guideOffsets"
        :key="idx"
        data-test="tree-indent-guide"
        aria-hidden="true"
        class="pointer-events-none absolute top-0 bottom-0 w-px bg-white/25"
        :style="{ left: `${leftPx}px` }"
      ></span>

      <!-- Caret for folder -->
      <svg 
        v-if="isFolder"
        class="w-4 h-4 mr-1 shrink-0 transition-transform duration-150 ease-in-out pointer-events-none"
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
        class="w-4 h-4 mr-2 shrink-0 text-text-muted pointer-events-none"
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        stroke-width="2" 
        stroke-linecap="round" 
        stroke-linejoin="round"
      >
        <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-1.22-1.8A2 2 0 0 0 7.53 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"></path>
      </svg>

      <!-- Flow Icon -->
      <span
        v-if="isFlowMode && !isFolder"
        data-test="flow-node-icon"
        aria-hidden="true"
        class="mr-2 shrink-0 text-xs pointer-events-none"
      >🔀</span>

      <!-- Request Method Badge -->
      <span 
        v-if="!isFlowMode && !isFolder && effectiveMethod"
        data-test="tree-row-method-badge"
        class="text-[10px] font-mono font-bold mr-1.5 shrink-0 text-left pointer-events-none"
        :class="methodColorClass"
      >
        {{ effectiveMethod }}
      </span>

      <!-- Name -->
      <span v-if="!isEditing" class="truncate ui-sm min-w-0 flex items-center gap-2 flex-1 pointer-events-none" :class="{ 'italic text-text-tertiary': isUnnamed }">
        <span data-test="tree-row-name" class="truncate pointer-events-none">{{ displayName }}</span>
        <span
          v-if="isDirtyNode"
          data-test="tree-row-unsaved-dot"
          :aria-label="t('common.unsaved')"
          class="w-2 h-2 rounded-full bg-unsaved-dot shrink-0 pointer-events-none"
          :title="t('common.unsaved')"
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

      <!-- Folder Settings Quick Button (APIs mode only) -->
      <button
        v-if="!isEditing && isFolder && !isFlowMode"
        type="button"
        class="w-6 h-6 ml-1 flex items-center justify-center shrink-0 rounded text-text-secondary hover:text-indigo-400 hover:bg-zinc-700/80 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-brand-primary cursor-pointer"
        :class="{ 'pointer-events-none': !!activeDraggingNode }"
        data-test="folder-settings-btn"
        :title="t('tree.folderSettingsTitle')"
        :aria-label="t('tree.folderSettingsTitle')"
        @click.stop="handleOpenFolderSettings"
        @dblclick.stop
      >
        <svg class="w-3.5 h-3.5 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="4" y1="21" x2="4" y2="14"></line>
          <line x1="4" y1="10" x2="4" y2="3"></line>
          <line x1="12" y1="21" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12" y2="3"></line>
          <line x1="20" y1="21" x2="20" y2="16"></line>
          <line x1="20" y1="12" x2="20" y2="3"></line>
          <line x1="2" y1="14" x2="6" y2="14"></line>
          <line x1="10" y1="8" x2="14" y2="8"></line>
          <line x1="18" y1="16" x2="22" y2="16"></line>
        </svg>
      </button>

      <!-- Folder Sort Button -->
      <button 
      v-if="!isEditing && isFolder"
        type="button"
        class="w-6 h-6 ml-1 flex items-center justify-center shrink-0 rounded text-text-secondary hover:text-text-primary hover:bg-zinc-700/80 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-brand-primary cursor-pointer"
        :class="{ 'pointer-events-none': !!activeDraggingNode }"
        data-test="folder-sort-btn"
        :title="t('tree.sortFolderTitle')"
        :aria-label="t('tree.sortFolderTitle')"
        @click.stop="handleSortFolder"
        @dblclick.stop
      >
        <svg class="w-3.5 h-3.5 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m3 16 4 4 4-4"/>
          <path d="M7 20V4"/>
          <path d="M20 8h-5"/>
          <path d="M15 10V6.5a2.5 2.5 0 0 1 5 0V10"/>
          <path d="M15 14h5l-5 6h5"/>
        </svg>
      </button>

      <!-- Menu Button -->
      <button 
        v-if="!isEditing"
        type="button"
        data-test="tree-node-menu-btn"
        class="w-6 h-6 ml-1 flex items-center justify-center shrink-0 rounded text-text-secondary hover:text-text-primary hover:bg-zinc-700/80 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-brand-primary"
        :class="{ 'pointer-events-none': !!activeDraggingNode }"
        :aria-label="t('common.options')"
        @click.stop="handleMenuClick"
        @dblclick.stop
      >
        <svg class="w-4 h-4 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
