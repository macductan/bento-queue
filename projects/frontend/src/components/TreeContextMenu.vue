<script lang="ts" setup>
import { computed, ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useUiStore } from '@/stores/uiStore'
import { useCollectionStore, type TreeNode } from '@/stores/collectionStore'
import { useFlowStore, type FlowTreeNode } from '@/stores/flowStore'
import { useRequestStore } from '@/stores/requestStore'

const uiStore = useUiStore()
const collectionStore = useCollectionStore()
const flowStore = useFlowStore()
const requestStore = useRequestStore()

const isFlowContext = computed(() => {
  return uiStore.contextMenu?.nodeType === 'flow_folder' || uiStore.contextMenu?.nodeType === 'flow'
})

const isTargetRequestDirty = computed(() => {
  if (uiStore.contextMenu?.nodeType === 'flow') {
    return (
      uiStore.contextMenu.nodeId !== '' &&
      flowStore.activeFlowId === uiStore.contextMenu.nodeId &&
      flowStore.currentFlow?.id === uiStore.contextMenu.nodeId &&
      flowStore.isDirty
    )
  }
  return (
    uiStore.contextMenu?.nodeType === 'request' &&
    uiStore.contextMenu.nodeId !== '' &&
    collectionStore.activeRequestId === uiStore.contextMenu.nodeId &&
    requestStore.current?.id === uiStore.contextMenu.nodeId &&
    requestStore.isDirty
  )
})

interface FlatFolder {
  id: string
  name: string
  depth: number
}

function flattenFolders(nodes: TreeNode[], depth = 0): FlatFolder[] {
  let result: FlatFolder[] = []
  for (const node of nodes) {
    if (node.type === 'folder') {
      result.push({ id: node.id, name: node.name, depth })
      if (node.children) {
        result.push(...flattenFolders(node.children, depth + 1))
      }
    }
  }
  return result
}

function flattenFlowFolders(nodes: FlowTreeNode[], depth = 0): FlatFolder[] {
  let result: FlatFolder[] = []
  for (const node of nodes) {
    if (node.type === 'flow_folder') {
      result.push({ id: node.id, name: node.name, depth })
      if (node.children) {
        result.push(...flattenFlowFolders(node.children, depth + 1))
      }
    }
  }
  return result
}

const currentFlowParentId = computed(() => {
  if (!isFlowContext.value || !uiStore.contextMenu?.nodeId) return ''
  return flowStore.findParentFolderId(flowStore.flowTree, uiStore.contextMenu.nodeId) ?? ''
})

const flatFolders = computed(() =>
  isFlowContext.value ? flattenFlowFolders(flowStore.flowTree) : flattenFolders(collectionStore.tree)
)
const availableTargetFolders = computed(() => {
  if (uiStore.contextMenu?.nodeType === 'folder' && uiStore.contextMenu.nodeId) {
    const currentFolderId = uiStore.contextMenu.nodeId
    return flatFolders.value.filter(
      f => f.id !== currentFolderId && !collectionStore.isDescendantFolder(currentFolderId, f.id)
    )
  }
  if (isFlowContext.value && uiStore.contextMenu?.nodeId) {
    const currentId = uiStore.contextMenu.nodeId
    const parentId = currentFlowParentId.value
    if (uiStore.contextMenu.nodeType === 'flow_folder') {
      return flatFolders.value.filter(
        f =>
          f.id !== currentId &&
          f.id !== parentId &&
          !flowStore.isDescendantFolder(currentId, f.id)
      )
    }
    return flatFolders.value.filter(f => f.id !== parentId)
  }
  return flatFolders.value
})
const isSubmenuOpen = ref(false)
const menuRef = ref<HTMLElement | null>(null)

const handleCreateRequest = () => {
  if (uiStore.contextMenu) {
    if (isFlowContext.value) {
      void flowStore.createFlow(uiStore.contextMenu.nodeId)
    } else {
      collectionStore.createRequest(uiStore.contextMenu.nodeId)
    }
  }
  uiStore.closeContextMenu()
}

const handleCreateFolder = () => {
  if (uiStore.contextMenu) {
    if (isFlowContext.value) {
      void flowStore.createFlowFolder(uiStore.contextMenu.nodeId)
    } else {
      collectionStore.createFolder(uiStore.contextMenu.nodeId)
    }
  }
  uiStore.closeContextMenu()
}

const handleRename = () => {
  if (uiStore.contextMenu?.nodeId) {
    uiStore.triggerRename(uiStore.contextMenu.nodeId)
  }
  uiStore.closeContextMenu()
}

const handleFolderSettings = () => {
  if (uiStore.contextMenu && uiStore.contextMenu.nodeId !== '') {
    void collectionStore.openFolderSettings(uiStore.contextMenu.nodeId)
    uiStore.closeContextMenu()
  }
}

const handleSortAlphabet = () => {
  if (uiStore.contextMenu) {
    if (isFlowContext.value) {
      void flowStore.sortFlowNodes(uiStore.contextMenu.nodeId)
    } else {
      collectionStore.sortNodes(uiStore.contextMenu.nodeId)
    }
  }
  uiStore.closeContextMenu()
}

const handleDuplicate = () => {
  if (uiStore.contextMenu?.nodeId) {
    if (isFlowContext.value) {
      void flowStore.duplicateFlow(uiStore.contextMenu.nodeId)
    } else {
      collectionStore.duplicateRequest(uiStore.contextMenu.nodeId)
    }
  }
  uiStore.closeContextMenu()
}

const handleMove = (targetFolderId: string) => {
  if (uiStore.contextMenu?.nodeId) {
    if (isFlowContext.value) {
      const nodeType = uiStore.contextMenu.nodeType as 'flow_folder' | 'flow'
      if (!flowStore.canMoveNodeTo(uiStore.contextMenu.nodeId, nodeType, targetFolderId)) {
        uiStore.closeContextMenu()
        return
      }
      void flowStore.moveFlowNode(
        uiStore.contextMenu.nodeId,
        nodeType,
        targetFolderId
      )
    } else if (uiStore.contextMenu.nodeType === 'folder') {
      collectionStore.moveFolder(uiStore.contextMenu.nodeId, targetFolderId)
    } else {
      collectionStore.moveRequest(uiStore.contextMenu.nodeId, targetFolderId)
    }
  }
  uiStore.closeContextMenu()
}

const handleDelete = async () => {
  if (uiStore.contextMenu?.nodeId) {
    const id = uiStore.contextMenu.nodeId
    const nodeType = uiStore.contextMenu.nodeType
    const isFlow = nodeType === 'flow_folder' || nodeType === 'flow'
    const isFolder = nodeType === 'folder' || nodeType === 'flow_folder'

    let nodeName = ''
    if (isFlow) {
      if (!isFolder && flowStore.currentFlow?.id === id && typeof flowStore.currentFlow.name === 'string') {
        nodeName = flowStore.currentFlow.name
      } else {
        const node = flowStore.findNode(flowStore.flowTree, id)
        if (node) nodeName = node.name
      }
    } else {
      const node = collectionStore.findNode(collectionStore.tree, id)
      if (node) nodeName = node.name
    }

    uiStore.closeContextMenu()

    const msg = isFlow
      ? isFolder
        ? `Xóa thư mục '${nodeName}'? Tất cả flow bên trong sẽ bị xóa. Hành động này không thể hoàn tác.`
        : `Xóa flow '${nodeName}'? Hành động này không thể hoàn tác.`
      : isFolder
        ? `Xóa thư mục '${nodeName}'? Tất cả request bên trong sẽ bị xóa. Hành động này không thể hoàn tác.`
        : `Xóa request '${nodeName}'? Hành động này không thể hoàn tác.`

    const confirmed = await uiStore.requestConfirm(msg)
    if (confirmed) {
      if (isFlow) {
        if (isFolder) {
          await flowStore.deleteFlowFolder(id)
        } else {
          await flowStore.deleteFlow(id)
        }
      } else {
        if (isFolder) {
          await collectionStore.deleteFolder(id)
        } else {
          await collectionStore.deleteRequest(id)
        }
      }
    }
  } else {
    uiStore.closeContextMenu()
  }
}

const closeMenu = () => {
  uiStore.closeContextMenu()
}

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    closeMenu()
  }
}

const handleClickOutside = (e: MouseEvent) => {
  if (uiStore.contextMenu && menuRef.value && !menuRef.value.contains(e.target as Node)) {
    closeMenu()
  }
}

const menuStyle = ref({ top: '0px', left: '0px' })
const submenuPosition = ref<'right' | 'left'>('right')

watch(() => uiStore.contextMenu, async (newVal) => {
  if (newVal) {
    isSubmenuOpen.value = false
    document.addEventListener('keydown', handleKeyDown)
    menuStyle.value = { top: `${newVal.y}px`, left: `${newVal.x}px` }
    
    await nextTick()
    if (menuRef.value) {
      const rect = menuRef.value.getBoundingClientRect()
      const winW = window.innerWidth
      const winH = window.innerHeight
      
      let x = newVal.x
      let y = newVal.y
      
      if (x + rect.width > winW) {
        x = winW - rect.width - 8
      }
      if (y + rect.height > winH) {
        y = winH - rect.height - 8
      }
      
      if (x + rect.width + 224 > winW) {
        submenuPosition.value = 'left'
      } else {
        submenuPosition.value = 'right'
      }
      
      menuStyle.value = { top: `${Math.max(8, y)}px`, left: `${Math.max(8, x)}px` }
    }
  } else {
    document.removeEventListener('keydown', handleKeyDown)
  }
})

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside)
})
onUnmounted(() => {
  document.removeEventListener('mousedown', handleClickOutside)
  document.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <div 
    v-if="uiStore.contextMenu"
    ref="menuRef"
    class="fixed z-[1200] bg-surface-raised border border-border-default rounded shadow-lg py-1 ui-sm w-48 text-text-primary"
    :style="menuStyle"
    @contextmenu.prevent
  >
    <template v-if="uiStore.contextMenu.nodeType === 'folder' || uiStore.contextMenu.nodeType === 'flow_folder'">
      <button 
        class="w-full text-left px-3 h-8 hover:bg-surface-hover flex items-center transition-colors"
        @click="handleCreateRequest"
      >
        {{ isFlowContext ? 'Thêm flow' : 'Thêm request' }}
      </button>
      <button 
        class="w-full text-left px-3 h-8 hover:bg-surface-hover flex items-center transition-colors"
        @click="handleCreateFolder"
      >
        Thêm thư mục
      </button>
      
      <div v-if="uiStore.contextMenu.nodeId !== ''" class="h-px bg-border-default my-1"></div>
      
      <button 
        v-if="uiStore.contextMenu.nodeId !== ''"
        class="w-full text-left px-3 h-8 hover:bg-surface-hover flex items-center transition-colors"
        @click="handleRename"
      >
        Đổi tên
      </button>
      <button 
        v-if="!isFlowContext && uiStore.contextMenu.nodeId !== ''"
        type="button"
        data-test="ctx-folder-settings"
        class="w-full text-left px-3 h-8 hover:bg-surface-hover flex items-center gap-2 transition-colors"
        @click="handleFolderSettings"
      >
        <svg class="w-3.5 h-3.5 text-indigo-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
        <span>Cài đặt thư mục</span>
      </button>
      <button 
        class="w-full text-left px-3 h-8 hover:bg-surface-hover flex items-center transition-colors"
        data-test="context-menu-sort-btn"
        @click="handleSortAlphabet"
      >
        Sắp xếp A-Z
      </button>
      <div 
        v-if="uiStore.contextMenu.nodeId !== ''"
        class="relative"
        @mouseenter="isSubmenuOpen = true"
        @mouseleave="isSubmenuOpen = false"
      >
        <button class="w-full text-left px-3 h-8 hover:bg-surface-hover flex items-center justify-between transition-colors">
          Di chuyển tới 
          <span class="text-text-muted">▸</span>
        </button>
        
        <div 
          v-show="isSubmenuOpen"
          class="absolute top-0 -mt-1 bg-surface-raised border border-border-default rounded shadow-lg py-1 w-56 max-h-64 overflow-y-auto"
          :class="submenuPosition === 'right' ? 'left-full ml-1' : 'right-full mr-1'"
        >
          <button 
            v-if="!isFlowContext || currentFlowParentId !== ''"
            class="w-full text-left px-3 h-8 hover:bg-surface-hover flex items-center transition-colors font-medium"
            @click="handleMove('')"
          >
            {{ isFlowContext ? 'Gốc flows' : 'Gốc collection' }}
          </button>
          <button 
            v-for="folder in availableTargetFolders" 
            :key="folder.id"
            class="w-full text-left pr-3 h-8 hover:bg-surface-hover flex items-center truncate transition-colors"
            :style="{ paddingLeft: `${0.75 + folder.depth * 1}rem` }"
            @click="handleMove(folder.id)"
            :title="folder.name"
          >
            <span class="truncate">{{ folder.name }}</span>
          </button>
        </div>
      </div>
      <div v-if="uiStore.contextMenu.nodeId !== ''" class="h-px bg-border-default my-1"></div>
      <button 
        v-if="uiStore.contextMenu.nodeId !== ''"
        class="w-full text-left px-3 h-8 hover:bg-surface-hover flex items-center transition-colors text-text-danger"
        @click="handleDelete"
      >
        Xóa
      </button>
    </template>
    
    <template v-if="uiStore.contextMenu.nodeType === 'request' || uiStore.contextMenu.nodeType === 'flow'">
      <div
        v-if="isTargetRequestDirty"
        data-test="context-menu-unsaved-indicator"
        class="px-3 py-1.5 flex items-center gap-2 text-xs text-amber-400 border-b border-border-default mb-1 select-none"
      >
        <span class="w-2 h-2 rounded-full bg-unsaved-dot shrink-0" title="Chưa lưu" aria-label="Chưa lưu"></span>
        <span>Chưa lưu</span>
      </div>
      <button 
        class="w-full text-left px-3 h-8 hover:bg-surface-hover flex items-center transition-colors"
        @click="handleRename"
      >
        Đổi tên
      </button>
      <button 
        class="w-full text-left px-3 h-8 hover:bg-surface-hover flex items-center transition-colors"
        @click="handleDuplicate"
      >
        Sao chép
      </button>
      <div 
        class="relative"
        @mouseenter="isSubmenuOpen = true"
        @mouseleave="isSubmenuOpen = false"
      >
        <button class="w-full text-left px-3 h-8 hover:bg-surface-hover flex items-center justify-between transition-colors">
          Di chuyển tới 
          <span class="text-text-muted">▸</span>
        </button>
        
        <div 
          v-show="isSubmenuOpen"
          class="absolute top-0 -mt-1 bg-surface-raised border border-border-default rounded shadow-lg py-1 w-56 max-h-64 overflow-y-auto"
          :class="submenuPosition === 'right' ? 'left-full ml-1' : 'right-full mr-1'"
        >
          <button 
            v-if="!isFlowContext || currentFlowParentId !== ''"
            class="w-full text-left px-3 h-8 hover:bg-surface-hover flex items-center transition-colors font-medium"
            @click="handleMove('')"
          >
            {{ isFlowContext ? 'Gốc flows' : 'Gốc collection' }}
          </button>
          <button 
            v-for="folder in availableTargetFolders" 
            :key="folder.id"
            class="w-full text-left pr-3 h-8 hover:bg-surface-hover flex items-center truncate transition-colors"
            :style="{ paddingLeft: `${0.75 + folder.depth * 1}rem` }"
            @click="handleMove(folder.id)"
            :title="folder.name"
          >
            <span class="truncate">{{ folder.name }}</span>
          </button>
        </div>
      </div>
      
      <div class="h-px bg-border-default my-1"></div>
      <button 
        class="w-full text-left px-3 h-8 hover:bg-surface-hover flex items-center transition-colors text-text-danger"
        @click="handleDelete"
      >
        Xóa
      </button>
    </template>
  </div>
</template>
