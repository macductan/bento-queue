import { watch, onBeforeUnmount, getCurrentInstance, computed, type Ref, type ComputedRef } from 'vue'
import { useRequestStore, type Request } from '../stores/requestStore'
import { useUiStore } from '../stores/uiStore'

export function useAutoSave(
  reqRef?: Ref<Request | null> | ComputedRef<Request | null>,
  debounceMs: number = 800
) {
  const requestStore = useRequestStore()
  const uiStore = useUiStore()

  // Deep watch on requestStore.current (or reqRef)
  const unwatch = watch(
    () => (reqRef ? reqRef.value : requestStore.current),
    (newVal) => {
      if (requestStore.loading) return
      if (!newVal) {
        requestStore.cancelAutoSave()
        return
      }
      if (requestStore.isDirty) {
        if (uiStore.autoSaveEnabled) {
          requestStore.scheduleAutoSave(debounceMs)
        } else {
          requestStore.cancelAutoSave()
          if (requestStore.saveStatus !== 'saving') {
            requestStore.saveStatus = 'unsaved'
          }
        }
      } else {
        requestStore.cancelAutoSave()
        if (requestStore.saveStatus !== 'saving') {
          requestStore.saveStatus = 'saved'
        }
      }
    },
    { deep: true }
  )

  const handleBeforeUnload = () => {
    if (requestStore.isDirty) {
      void requestStore.flush()
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', handleBeforeUnload)
  }

  if (getCurrentInstance()) {
    onBeforeUnmount(async () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('beforeunload', handleBeforeUnload)
      }
      unwatch()
      if (requestStore.isDirty) {
        await requestStore.flush()
      } else {
        requestStore.cancelAutoSave()
      }
    })
  }

  return {
    saveNow: () => requestStore.saveCurrent(),
    flush: () => requestStore.flush(),
    cancel: () => requestStore.cancelAutoSave(),
    saveStatus: computed(() => requestStore.saveStatus),
    stop: () => {
      unwatch()
      if (typeof window !== 'undefined') {
        window.removeEventListener('beforeunload', handleBeforeUnload)
      }
    }
  }
}
