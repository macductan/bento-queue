<script lang="ts" setup>
import { watch } from 'vue'
import EmptyStateRequest from '@/components/EmptyStateRequest.vue'
import ResponseViewer from '@/components/ResponseViewer.vue'
import RequestEditor from '@/components/RequestEditor.vue'
import { useCollectionStore } from '@/stores/collectionStore'
import { useResponseStore } from '@/stores/responseStore'

const collectionStore = useCollectionStore()
const responseStore = useResponseStore()

watch(() => collectionStore.activeRequestId, () => {
  responseStore.clear()
})
</script>

<template>
  <main class="flex-1 flex flex-col min-w-0 overflow-hidden">
    <div class="flex-1 min-w-0 overflow-y-auto">
      <RequestEditor v-if="collectionStore.activeRequestId" />
      <EmptyStateRequest v-else />
    </div>
    <div class="flex-1 min-w-0 overflow-y-auto border-t border-border-default">
      <ResponseViewer />
    </div>
  </main>
</template>
