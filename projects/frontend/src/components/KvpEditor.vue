<script lang="ts" setup>
import { computed, nextTick, ref } from 'vue'
import { useRequestStore } from '@/stores/requestStore'
import VariableHighlighter from '@/components/VariableHighlighter.vue'

const props = defineProps<{
  field?: 'params' | 'headers'
  modelValue?: any[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: any[]): void
}>()

const requestStore = useRequestStore()

const rows = computed(() => {
  if (props.modelValue) return props.modelValue
  if (!requestStore.current || !props.field) return []
  const list = requestStore.current[props.field] || []
  if (props.field === 'headers') {
    return list.filter(h => !h._isAuto)
  }
  return list
})

const displayRows = computed(() => {
  return [...rows.value, { key: '', value: '', enabled: true, _isPhantom: true }]
})

const keyInputs = ref<HTMLInputElement[]>([])
const valueInputs = ref<HTMLTextAreaElement[]>([])
const highlighterRefs = ref<any[]>([])

const focusCell = (index: number, part: 'key' | 'value') => {
  if (part === 'key') {
    keyInputs.value[index]?.focus()
  } else if (part === 'value') {
    valueInputs.value[index]?.focus()
  }
}

const getTargetArray = (): any[] | null => {
  if (props.modelValue) return props.modelValue
  const cur = requestStore.current
  if (!cur || !props.field) return null
  if (!cur[props.field]) {
    cur[props.field] = []
  }
  return cur[props.field]
}

const ensureRealRow = (index: number) => {
  const arr = getTargetArray()
  if (!arr) return
  if (index >= rows.value.length) {
    arr.push({ key: '', value: '', enabled: true })
    if (props.modelValue) {
      emit('update:modelValue', arr)
    }
  }
}

const onCellInput = (index: number, part: 'key' | 'value', e: Event) => {
  const target = e.target as HTMLInputElement | HTMLTextAreaElement
  const v = target.value
  const arr = getTargetArray()
  if (!arr) return

  if (index >= rows.value.length) {
    arr.push({
      key: part === 'key' ? v : '',
      value: part === 'value' ? v : '',
      enabled: true
    })
  } else {
    const targetRow = rows.value[index]
    if (targetRow && !targetRow._isAuto) {
      targetRow[part] = v
    }
  }
  if (props.modelValue) {
    emit('update:modelValue', arr)
  }
}

const toggleRowEnabled = (index: number) => {
  const targetRow = rows.value[index]
  if (targetRow) {
    targetRow.enabled = !targetRow.enabled
    if (props.modelValue) {
      emit('update:modelValue', props.modelValue)
    }
  }
}

const addRow = () => {
  const arr = getTargetArray()
  if (!arr) return
  arr.push({ key: '', value: '', enabled: true })
  if (props.modelValue) {
    emit('update:modelValue', arr)
  }
  nextTick(() => focusCell(rows.value.length - 1, 'key'))
}

const removeRow = (index: number) => {
  const arr = getTargetArray()
  if (!arr) return
  const targetRow = rows.value[index]
  if (targetRow) {
    const realIdx = arr.indexOf(targetRow)
    if (realIdx !== -1) {
      arr.splice(realIdx, 1)
    } else if (index >= 0 && index < arr.length) {
      arr.splice(index, 1)
    }
    keyInputs.value.splice(index, 1)
    valueInputs.value.splice(index, 1)
    highlighterRefs.value.splice(index, 1)
    if (props.modelValue) {
      emit('update:modelValue', arr)
    }
  }
}

const onValueTab = (e: KeyboardEvent, index: number) => {
  // If not shift key, jump to the next row's key input
  if (!e.shiftKey) {
    e.preventDefault()
    // If it's the last real row, focus the phantom row's key input
    if (index === rows.value.length - 1) {
      keyInputs.value[rows.value.length]?.focus()
    } else {
      keyInputs.value[index + 1]?.focus()
    }
  }
}

const autoResize = (e: Event) => {
  const target = e.target as HTMLTextAreaElement
  if (target) {
    target.style.height = 'auto'
    target.style.height = Math.max(32, target.scrollHeight) + 'px'
  }
}

const initResize = (el: any) => {
  if (el) {
    el.style.height = 'auto'
    el.style.height = Math.max(32, el.scrollHeight) + 'px'
  }
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-start gap-2 pl-[40px] pr-[40px]">
      <!-- Headers -->
      <div class="flex-1 ui-xs uppercase text-text-muted px-2">Key</div>
      <div class="flex-[2] ui-xs uppercase text-text-muted px-2">Value</div>
    </div>
    
    <div class="flex flex-col gap-1">
      <!-- Unified Real + Phantom rows (keyed by index so DOM inputs are preserved in-place on promotion) -->
      <div
        v-for="(row, index) in displayRows"
        :key="index"
        class="flex items-start gap-2 group"
        :class="{ 'opacity-50': !row._isPhantom && !row.enabled }"
      >
        <div class="flex items-center justify-center h-[32px] w-[32px] shrink-0">
          <button 
            v-if="row._isPhantom"
            type="button"
            role="checkbox"
            aria-checked="true"
            disabled
            class="w-4 h-4 rounded-[4px] border bg-surface-input border-border-default text-transparent flex items-center justify-center cursor-not-allowed opacity-50"
            aria-label="Bật/tắt dòng (trống)"
          >
            <svg class="w-3.5 h-3.5 font-bold" viewBox="0 0 256 256" fill="none" stroke="currentColor" stroke-width="36" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="216 72 104 184 48 128"></polyline>
            </svg>
          </button>
          <button 
            v-else
            type="button"
            role="checkbox"
            :aria-checked="row.enabled"
            @click="toggleRowEnabled(index)"
            class="w-4 h-4 rounded-[4px] border flex items-center justify-center cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
            :class="row.enabled ? 'bg-brand-primary border-brand-primary text-white' : 'bg-surface-input border-border-default text-transparent hover:border-border-focus'"
            aria-label="Bật/tắt dòng"
          >
            <svg class="w-3.5 h-3.5 font-bold" viewBox="0 0 256 256" fill="none" stroke="currentColor" stroke-width="36" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="216 72 104 184 48 128"></polyline>
            </svg>
          </button>
        </div>
        
        <div class="flex-1 relative min-h-[32px] min-w-0 bg-surface-base rounded">
          <input 
            type="text" 
            :value="row.key"
            :readonly="row._isAuto"
            :ref="el => { if (el) keyInputs[index] = el as HTMLInputElement }"
            @compositionstart="ensureRealRow(index)"
            @input="e => onCellInput(index, 'key', e)"
            @compositionend="e => onCellInput(index, 'key', e)"
            placeholder="Key"
            class="bg-transparent mono-sm text-text-primary placeholder:text-text-muted caret-text-primary px-3 py-1.5 rounded border border-transparent focus:border-border-focus focus:ring-1 focus:ring-border-focus outline-none w-full min-h-[32px] block"
            :class="{ 'opacity-50 cursor-not-allowed': row._isAuto }"
            spellcheck="false"
            autocomplete="off"
          />
        </div>
        
        <div class="flex-[2] relative min-h-[32px] min-w-0 bg-surface-base rounded">
          <VariableHighlighter
            :ref="el => { if (el) highlighterRefs[index] = el }"
            :value="row.value"
            overlay-class="px-3 py-1.5 mono-sm min-h-[32px] w-full border border-transparent"
          >
            <textarea 
              rows="1"
              :value="row.value"
              :readonly="row._isAuto"
              :ref="el => { if (el) { valueInputs[index] = el as HTMLTextAreaElement; initResize(el) } }"
              @compositionstart="ensureRealRow(index)"
              @input="e => { autoResize(e); onCellInput(index, 'value', e) }"
              @compositionend="e => { autoResize(e); onCellInput(index, 'value', e) }"
              @scroll="e => highlighterRefs[index]?.syncScroll(e)"
              placeholder="Value"
              class="transparent-selection bg-transparent mono-sm text-transparent placeholder:text-text-muted caret-text-primary px-3 py-1.5 rounded border border-transparent focus:border-border-focus focus:ring-1 focus:ring-border-focus outline-none w-full min-h-[32px] resize-none overflow-hidden block"
              :class="{ 'opacity-50 cursor-not-allowed': row._isAuto }"
              spellcheck="false"
              autocomplete="off"
              @keydown.tab="row._isPhantom ? undefined : onValueTab($event, index)"
            ></textarea>
          </VariableHighlighter>
        </div>
        
        <div class="flex items-center justify-center h-[32px] w-[32px] shrink-0">
          <button 
            v-if="!row._isPhantom && !row._isAuto"
            @click="removeRow(index)" 
            class="text-red-400 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 p-1 hover:bg-surface-hover rounded outline-none mt-0.5"
            aria-label="Xóa dòng"
          >
            <svg class="w-4 h-4" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
              <path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"></path>
            </svg>
          </button>
        </div>
      </div>
    </div>
    
    <div class="mt-2 ml-8">
      <button 
        @click="addRow" 
        class="ui-sm flex items-center font-medium text-text-secondary hover:text-text-primary gap-1 p-1 rounded hover:bg-surface-hover outline-none focus-visible:ring-1 focus-visible:ring-border-focus"
      >
        <svg class="w-4 h-4" viewBox="0 0 256 256" fill="currentColor">
          <path d="M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z"></path>
        </svg>
        Thêm mới
      </button>
    </div>
  </div>
</template>

