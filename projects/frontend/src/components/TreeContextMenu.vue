<script lang="ts" setup>
import { computed, ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useUiStore } from '@/stores/uiStore'
import { useCollectionStore } from '@/stores/collectionStore'
import type { TreeNode } from '@/stores/collectionStore'

const uiStore = useUiStore()
const collectionStore = useCollectionStore()

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

const flatFolders = computed(() => flattenFolders(collectionStore.tree))
const isSubmenuOpen = ref(false)
const menuRef = ref<HTMLElement | null>(null)

const handleCreateRequest = () => {
  if (uiStore.contextMenu) {
    collectionStore.createRequest(uiStore.contextMenu.nodeId)
  }
  uiStore.closeContextMenu()
}

const handleCreateFolder = () => {
  if (uiStore.contextMenu) {
    collectionStore.createFolder(uiStore.contextMenu.nodeId)
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
    collectionStore.setActiveFolderId(uiStore.contextMenu.nodeId)
    uiStore.closeContextMenu()
  }
}

const handleDuplicate = () => {
  if (uiStore.contextMenu?.nodeId) {
    collectionStore.duplicateRequest(uiStore.contextMenu.nodeId)
  }
  uiStore.closeContextMenu()
}

const handleMove = (targetFolderId: string) => {
  if (uiStore.contextMenu?.nodeId) {
    collectionStore.moveRequest(uiStore.contextMenu.nodeId, targetFolderId)
  }
  uiStore.closeContextMenu()
}

const handleDelete = async () => {
  if (uiStore.contextMenu?.nodeId) {
    const isFolder = uiStore.contextMenu.nodeType === 'folder'
    const id = uiStore.contextMenu.nodeId
    
    // Find node name for the prompt
    let nodeName = ''
    const node = collectionStore.findNode(collectionStore.tree, id)
    if (node) nodeName = node.name
    
    uiStore.closeContextMenu()
    
    const msg = isFolder
      ? `Xóa thư mục '${nodeName}'? Tất cả request bên trong sẽ bị xóa. Hành động này không thể hoàn tác.`
      : `Xóa request '${nodeName}'? Hành động này không thể hoàn tác.`
      
    const confirmed = await uiStore.requestConfirm(msg)
    if (confirmed) {
      if (isFolder) {
        await collectionStore.deleteFolder(id)
      } else {
        await collectionStore.deleteRequest(id)
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
    <template v-if="uiStore.contextMenu.nodeType === 'folder'">
      <button 
        class="w-full text-left px-3 h-8 hover:bg-surface-hover flex items-center transition-colors"
        @click="handleCreateRequest"
      >
        Thêm request
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
        v-if="uiStore.contextMenu.nodeId !== ''"
        class="w-full text-left px-3 h-8 hover:bg-surface-hover flex items-center transition-colors"
        @click="handleFolderSettings"
      >
        Cài đặt thư mục
      </button>
      <button 
        v-if="uiStore.contextMenu.nodeId !== ''"
        class="w-full text-left px-3 h-8 hover:bg-surface-hover flex items-center transition-colors text-text-danger"
        @click="handleDelete"
      >
        Xóa
      </button>
    </template>
    
    <template v-if="uiStore.contextMenu.nodeType === 'request'">
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
            class="w-full text-left px-3 h-8 hover:bg-surface-hover flex items-center transition-colors font-medium"
            @click="handleMove('')"
          >
            Gốc collection
          </button>
          <button 
            v-for="folder in flatFolders" 
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
