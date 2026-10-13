<script lang="ts" setup>
import { ref, watch, nextTick } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    mode?: 'create' | 'rename'
    initialName?: string
  }>(),
  {
    mode: 'create',
    initialName: ''
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'submit', name: string): void
  (e: 'close'): void
}>()

const name = ref('')
const errorMessage = ref('')
const isSubmitting = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)

watch(
  () => props.modelValue,
  async (isOpen) => {
    if (isOpen) {
      name.value = props.mode === 'rename' ? (props.initialName || '') : ''
      errorMessage.value = ''
      isSubmitting.value = false
      await nextTick()
      inputRef.value?.focus()
      inputRef.value?.select()
    }
  },
  { immediate: true }
)

const close = () => {
  emit('update:modelValue', false)
  emit('close')
}

const handleSubmit = () => {
  if (isSubmitting.value) return
  const trimmed = name.value.trim()
  if (!trimmed) {
    errorMessage.value = 'Tên không được để trống'
    return
  }
  errorMessage.value = ''
  isSubmitting.value = true
  try {
    emit('submit', trimmed)
  } finally {
    isSubmitting.value = false
  }
}

const handleBackdropClick = (e: MouseEvent) => {
  if (e.target === e.currentTarget) {
    close()
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="fixed inset-0 z-[1100] bg-surface-base/80 backdrop-blur-xs flex items-center justify-center p-4"
      @click="handleBackdropClick"
      @keydown.esc.stop.prevent="close"
    >
      <div
        class="bg-surface-raised border border-border-default rounded-lg shadow-xl w-full max-w-md overflow-hidden flex flex-col"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="mode === 'create' ? 'modal-title-create' : 'modal-title-rename'"
      >
        <!-- Header -->
        <div class="flex items-center justify-between p-4 border-b border-border-default">
          <h3
            :id="mode === 'create' ? 'modal-title-create' : 'modal-title-rename'"
            class="heading-sm text-text-primary"
          >
            {{ mode === 'create' ? 'Tạo collection mới' : 'Đổi tên collection' }}
          </h3>
          <button
            type="button"
            @click="close"
            class="text-text-muted hover:text-text-primary p-1 rounded hover:bg-surface-overlay transition-colors"
            aria-label="Đóng"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <!-- Body / Form -->
        <form @submit.prevent="handleSubmit" class="p-4 flex flex-col gap-3">
          <div>
            <label for="collection-name-input" class="block ui-xs font-medium text-text-secondary mb-1.5">
              Tên collection
            </label>
            <input
              id="collection-name-input"
              ref="inputRef"
              v-model="name"
              type="text"
              :placeholder="mode === 'create' ? 'vd: Project E-Commerce' : 'Tên collection mới'"
              :class="[
                'w-full px-3 py-2 bg-surface-input border rounded ui-sm text-text-primary transition-colors focus:outline-none',
                errorMessage
                  ? 'border-rose-500 focus:border-rose-500 focus:ring-1 focus:ring-rose-500'
                  : 'border-border-default focus:border-brand-primary focus:ring-1 focus:ring-brand-primary'
              ]"
              @input="errorMessage = ''"
            />
            <p v-if="errorMessage" class="ui-xs text-rose-400 mt-1.5" role="alert">
              {{ errorMessage }}
            </p>
          </div>

          <!-- Footer actions -->
          <div class="flex justify-end gap-2 pt-2">
            <button
              type="button"
              @click="close"
              class="px-3 py-1.5 rounded ui-sm bg-surface-overlay hover:bg-surface-hover text-text-primary transition-colors border border-border-default"
            >
              Hủy
            </button>
            <button
              type="submit"
              :disabled="isSubmitting"
              class="px-4 py-1.5 rounded ui-sm bg-brand-primary hover:bg-brand-primary-hover text-white font-medium transition-colors disabled:opacity-50"
            >
              {{ mode === 'create' ? 'Tạo' : 'Lưu' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>
