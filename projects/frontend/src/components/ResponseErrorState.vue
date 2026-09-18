<script lang="ts" setup>
import { computed } from 'vue'
import { useResponseStore } from '@/stores/responseStore'
import { errorVariant } from '@/utils/responseError'

const props = defineProps<{
  error: { code: string; message: string }
}>()

const responseStore = useResponseStore()

const variant = computed(() => errorVariant(props.error))

const variantData = computed(() => {
  switch (variant.value) {
    case 'connection':
      return {
        iconPath: 'M221.92,210.62a8,8,0,1,1-11.84,10.76l-184-200A8,8,0,0,1,37.92,10.62L60.6,35.15C36.19,48.5,16,73.57,16,104a8,8,0,0,0,16,0c0-23.77,14.65-43.51,34.42-53.8l20.47,22.25A71.86,71.86,0,0,0,56,104a8,8,0,0,0,16,0,55.8,55.8,0,0,1,21.66-44.11l19.5,21.2a39.84,39.84,0,0,0-17.16,22.91a8,8,0,1,0,15.65,3.15A24,24,0,0,1,128,88a23.76,23.76,0,0,1,13.78,4.42l42.62,46.33A55.77,55.77,0,0,1,200,104a8,8,0,0,0-16,0,39.75,39.75,0,0,0-13.84,30l28.61,31.1A71.74,71.74,0,0,0,224,104a8,8,0,0,0-16,0c0,11.23-2.58,21.84-7.22,31.33ZM128,24C164.21,24,196.2,42.81,215,71a8,8,0,0,0,13.3-8.87C205.81,28.45,169.19,8,128,8A119.52,119.52,0,0,0,67.09,24a8,8,0,1,0,8.72,13.38A103.54,103.54,0,0,1,128,24Z',
        title: 'Không thể kết nối tới server',
        suggestion: 'Kiểm tra URL hoặc kết nối mạng'
      }
    case 'ssl':
      return {
        iconPath: 'M208,40H48A16,16,0,0,0,32,56v56c0,50.14,35.08,95.14,88,112h16c52.92-16.86,88-61.86,88-112V56A16,16,0,0,0,208,40Zm0,72c0,42.27-28.79,80-72,94.9-43.21-14.9-72-52.63-72-94.9V56H208V112Zm-72-64a8,8,0,0,1,8,8v40a8,8,0,0,1-16,0V56A8,8,0,0,1,136,48Zm0,80a12,12,0,1,1-12,12A12,12,0,0,1,136,128Z',
        title: 'Lỗi chứng chỉ SSL',
        suggestion: 'Kiểm tra chứng chỉ của server hoặc dùng HTTP cho môi trường local'
      }
    case 'timeout':
      return {
        iconPath: 'M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm64-88a8,8,0,0,1-8,8H128a8,8,0,0,1-8-8V72a8,8,0,0,1,16,0v48h48A8,8,0,0,1,192,128Z',
        title: 'Request đã hết thời gian chờ (timeout)',
        suggestion: 'Server không phản hồi trong 30 giây'
      }
    default:
      return {
        iconPath: 'M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm-8-80V80a8,8,0,0,1,16,0v56a8,8,0,0,1-16,0Zm20,36a12,12,0,1,1-12-12A12,12,0,0,1,140,172Z',
        title: 'Đã xảy ra lỗi',
        suggestion: null
      }
  }
})
</script>

<template>
  <div class="flex-1 flex flex-col items-center justify-center p-8 text-center" role="alert">
    <svg class="w-12 h-12 text-error-text mb-4" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
      <path :d="variantData.iconPath" />
    </svg>
    <h3 class="heading-sm text-error-text mb-2">{{ variantData.title }}</h3>
    <p v-if="variantData.suggestion" class="ui-sm text-text-muted mb-4">{{ variantData.suggestion }}</p>
    <div class="mono-sm text-text-muted break-all max-w-xl mb-6 bg-surface-raised p-3 rounded border border-border-subtle text-left">
      {{ error.message }}
    </div>
    <button 
      @click="responseStore.send()"
      class="border border-border-default bg-transparent hover:bg-surface-hover text-text-primary px-4 py-2 min-h-[32px] rounded focus:outline-none focus:ring-2 focus:ring-brand-primary"
    >
      Thử lại
    </button>
  </div>
</template>
