<script lang="ts" setup>
import { computed } from 'vue'
import { useRequestStore } from '@/stores/requestStore'
import { useCollectionStore } from '@/stores/collectionStore'
import UrlBar from './UrlBar.vue'
import RequestTabs from './RequestTabs.vue'
import KvpEditor from './KvpEditor.vue'
import BodyEditor from './BodyEditor.vue'
import WarningBanner from './WarningBanner.vue'
import { useUiStore } from '@/stores/uiStore'

const requestStore = useRequestStore()
const uiStore = useUiStore()

const collectionStore = useCollectionStore()

const requestPath = computed(() => {
  if (!req.value) return []
  const pathNodes = collectionStore.findFolderPath(collectionStore.tree, req.value.id)
  return pathNodes ? pathNodes.map(n => n.name) : []
})

const req = computed(() => requestStore.current)
const loading = computed(() => requestStore.loading)
</script>

<template>
  <div class="h-full flex flex-col p-4 overflow-y-auto">
    <div v-if="loading" class="animate-pulse space-y-4">
      <div class="h-8 bg-surface-hover rounded w-1/3"></div>
      <div class="h-10 bg-surface-hover rounded w-full"></div>
      <div class="h-32 bg-surface-hover rounded w-full"></div>
    </div>
    <div v-else-if="req" class="space-y-6">
      <!-- Name and Breadcrumb -->
      <div>
        <div v-if="requestPath.length > 1" class="flex items-center gap-1.5 text-text-muted text-xs font-medium mb-1.5 opacity-80">
          <template v-for="(part, idx) in requestPath.slice(0, -1)" :key="idx">
            <span>{{ part }}</span>
            <span v-if="idx < requestPath.length - 2" class="opacity-50">/</span>
          </template>
        </div>
        <h1 class="heading-lg m-0 flex items-center gap-2">
          {{ req.name }}
          <span v-if="requestStore.isDirty" class="w-2 h-2 rounded-full bg-unsaved-dot shrink-0" title="Chưa lưu" aria-label="Chưa lưu"></span>
        </h1>
      </div>

      <UrlBar />
      <WarningBanner />

      <!-- Request Tabs and Content -->
      <div class="flex-1 flex flex-col min-h-0 mt-2">
        <RequestTabs />
        
        <div class="flex-1 overflow-y-auto mt-4 pb-4">
          <div v-show="uiStore.activeRequestTab === 'params'" role="tabpanel" id="panel-params" aria-labelledby="tab-params">
            <KvpEditor field="params" />
          </div>
          
          <div v-show="uiStore.activeRequestTab === 'headers'" role="tabpanel" id="panel-headers" aria-labelledby="tab-headers">
            <KvpEditor field="headers" />
          </div>
          
          <div v-show="uiStore.activeRequestTab === 'body'" role="tabpanel" id="panel-body" aria-labelledby="tab-body" class="h-full flex flex-col">
            <BodyEditor />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
