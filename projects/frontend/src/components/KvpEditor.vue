<script lang="ts" setup>
import { computed, nextTick, ref } from 'vue'
import { useRequestStore } from '@/stores/requestStore'
import VariableHighlighter from '@/components/VariableHighlighter.vue'
import KvpValueSelectControl from '@/components/KvpValueSelectControl.vue'
import { useI18n } from '@/i18n'

const props = defineProps<{
  field?: 'params' | 'headers' | 'path_params'
  modelValue?: any[]
  readonlyKeys?: boolean
  readonly?: boolean
  keyPrefix?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: any[]): void
}>()

const { t } = useI18n()
const requestStore = useRequestStore()
const isReadonly = computed(() => Boolean(props.readonly))
const keysLocked = computed(() => Boolean(props.readonlyKeys || props.readonly))

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
  if (keysLocked.value) {
    return rows.value
  }
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
  return cur[props.field] || null
}

const ensureRealRow = (index: number) => {
  if (keysLocked.value || isReadonly.value) return
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
  if (isReadonly.value) return
  if (keysLocked.value && part === 'key') return
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

const onSelectValueUpdate = (index: number, val: string) => {
  const arr = getTargetArray()
  if (!arr) return
  if (index >= rows.value.length) {
    arr.push({ key: '', value: val, enabled: true })
  } else {
    const targetRow = rows.value[index]
    if (targetRow && !targetRow._isAuto) {
      targetRow.value = val
    }
  }
  if (props.modelValue) {
    emit('update:modelValue', arr)
  }
}

const onRowTypeUpdate = (index: number, nextType: 'text' | 'select') => {
  const arr = getTargetArray()
  if (!arr) return
  if (index >= rows.value.length) {
    arr.push({ key: '', value: '', enabled: true, type: nextType })
  } else {
    const targetRow = rows.value[index]
    if (targetRow && !targetRow._isAuto) {
      targetRow.type = nextType
    }
  }
  if (props.modelValue) {
    emit('update:modelValue', arr)
  }
}

const onRowOptionsUpdate = (index: number, nextOptions: string[]) => {
  const arr = getTargetArray()
  if (!arr) return
  if (index >= rows.value.length) {
    arr.push({ key: '', value: '', enabled: true, options: nextOptions })
  } else {
    const targetRow = rows.value[index]
    if (targetRow && !targetRow._isAuto) {
      targetRow.options = nextOptions
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
  if (keysLocked.value) return
  const arr = getTargetArray()
  if (!arr) return
  arr.push({ key: '', value: '', enabled: true })
  if (props.modelValue) {
    emit('update:modelValue', arr)
  }
  nextTick(() => focusCell(rows.value.length - 1, 'key'))
}

const removeRow = (index: number) => {
  if (keysLocked.value) return
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
  if (keysLocked.value) return
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
    target.style.height = Math.max(36, target.scrollHeight) + 'px'
  }
}

const initResize = (el: any) => {
  if (el) {
    el.style.height = 'auto'
    el.style.height = Math.max(36, el.scrollHeight) + 'px'
  }
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <!-- Table Container with clear borders -->
    <div class="border border-border-default rounded-md overflow-hidden bg-surface-base">
      <!-- Table Header -->
      <div
        data-test="kvp-header-row"
        class="grid items-stretch bg-surface-raised border-b border-border-default text-text-muted text-[11px] font-semibold uppercase tracking-wider select-none"
        :class="keysLocked ? 'grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,2fr)]' : 'grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,2fr)_2.5rem]'"
      >
        <div class="flex items-center justify-center border-r border-border-default py-2">
          <span class="sr-only">Kích hoạt</span>
        </div>
        <div class="min-w-0 flex items-center px-3 py-2 border-r border-border-default">Key</div>
        <div class="min-w-0 flex items-center px-3 py-2">Value</div>
        <div v-if="!keysLocked" class="flex items-center justify-center border-l border-border-default py-2 text-center">
          <span class="sr-only">Xóa</span>
        </div>
      </div>

      <!-- Table Body / Rows -->
      <div class="divide-y divide-border-default">
        <div
          v-for="(row, index) in displayRows"
          :key="index"
          data-test="kvp-body-row"
          class="grid items-stretch group transition-colors hover:bg-surface-hover/20 focus-within:bg-surface-hover/25"
          :class="[
            keysLocked ? 'grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,2fr)]' : 'grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,2fr)_2.5rem]',
            { 'opacity-50': !row._isPhantom && !row.enabled }
          ]"
        >
          <!-- Checkbox Column -->
          <div class="flex items-center justify-center border-r border-border-default bg-surface-raised/10 py-1">
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
              :disabled="isReadonly"
              @click="!isReadonly && toggleRowEnabled(index)"
              class="w-4 h-4 rounded-[4px] border flex items-center justify-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
              :class="[
                row.enabled ? 'bg-brand-primary border-brand-primary text-white' : 'bg-surface-input border-border-default text-transparent hover:border-border-focus',
                isReadonly ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
              ]"
              :aria-label="t('kvp.toggleRow')"
            >
              <svg class="w-3.5 h-3.5 font-bold" viewBox="0 0 256 256" fill="none" stroke="currentColor" stroke-width="36" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="216 72 104 184 48 128"></polyline>
              </svg>
            </button>
          </div>
          
          <!-- Key Column -->
          <div 
            class="relative min-w-0 flex items-center border-r border-border-default bg-transparent cursor-text"
            @click="focusCell(index, 'key')"
          >
            <span
              v-if="keyPrefix"
              class="pl-3 pr-0.5 mono-sm text-brand-primary font-semibold select-none shrink-0"
            >{{ keyPrefix }}</span>
            <input 
              type="text" 
              :value="row.key"
              :readonly="row._isAuto || keysLocked"
              :ref="el => { if (el) keyInputs[index] = el as HTMLInputElement }"
              @compositionstart="ensureRealRow(index)"
              @input="e => onCellInput(index, 'key', e)"
              @compositionend="e => onCellInput(index, 'key', e)"
              placeholder="Key"
              class="bg-transparent mono-sm text-text-primary placeholder:text-text-muted/60 caret-text-primary py-2 border-0 outline-none w-full min-w-0 min-h-[36px] block focus:ring-0"
              :class="[
                keyPrefix ? 'pl-0.5 pr-3' : 'px-3',
                { 'opacity-50 cursor-not-allowed': row._isAuto || isReadonly, 'text-sky-300 font-medium cursor-default': readonlyKeys }
              ]"
              spellcheck="false"
              autocomplete="off"
            />
          </div>
          
          <!-- Value Column -->
          <div 
            class="relative min-w-0 bg-transparent flex items-center"
            :class="row.type === 'select' || isReadonly ? '' : 'cursor-text'"
            @click="row.type !== 'select' && !isReadonly && focusCell(index, 'value')"
          >
            <VariableHighlighter
              v-if="row._isAuto || isReadonly"
              :ref="el => { if (el) highlighterRefs[index] = el }"
              :value="row.value"
              overlay-class="px-3 py-2 mono-sm min-h-[36px] w-full border border-transparent rounded-none"
            >
              <textarea 
                rows="1"
                :value="row.value"
                readonly
                :ref="el => { if (el) { valueInputs[index] = el as HTMLTextAreaElement; initResize(el) } }"
                @scroll="e => highlighterRefs[index]?.syncScroll(e)"
                placeholder="Value"
                class="transparent-selection bg-transparent mono-sm text-transparent placeholder:text-text-muted/60 caret-text-primary px-3 py-2 rounded-none border border-transparent outline-none w-full min-h-[36px] resize-none overflow-hidden block whitespace-pre-wrap break-all focus:ring-0 opacity-50 cursor-not-allowed"
                spellcheck="false"
                autocomplete="off"
              ></textarea>
            </VariableHighlighter>
            <KvpValueSelectControl
              v-else
              :model-value="row.value"
              :type="row.type"
              :options="row.options"
              @update:model-value="val => onSelectValueUpdate(index, val)"
              @update:type="nextType => onRowTypeUpdate(index, nextType)"
              @update:options="nextOpts => onRowOptionsUpdate(index, nextOpts)"
            >
              <VariableHighlighter
                :ref="el => { if (el) highlighterRefs[index] = el }"
                :value="row.value"
                overlay-class="px-3 py-2 mono-sm min-h-[36px] w-full border border-transparent rounded-none"
              >
                <textarea 
                  rows="1"
                  :value="row.value"
                  :ref="el => { if (el) { valueInputs[index] = el as HTMLTextAreaElement; initResize(el) } }"
                  @compositionstart="ensureRealRow(index)"
                  @input="e => { autoResize(e); onCellInput(index, 'value', e) }"
                  @compositionend="e => { autoResize(e); onCellInput(index, 'value', e) }"
                  @paste="e => { nextTick(() => autoResize(e)) }"
                  @scroll="e => highlighterRefs[index]?.syncScroll(e)"
                  placeholder="Value"
                  class="transparent-selection bg-transparent mono-sm text-transparent placeholder:text-text-muted/60 caret-text-primary px-3 py-2 rounded-none border border-transparent outline-none w-full min-h-[36px] resize-none overflow-hidden block whitespace-pre-wrap break-all focus:ring-0"
                  spellcheck="false"
                  autocomplete="off"
                  @keydown.tab="row._isPhantom ? undefined : onValueTab($event, index)"
                ></textarea>
              </VariableHighlighter>
            </KvpValueSelectControl>
          </div>
          
          <!-- Delete Action Column -->
          <div v-if="!keysLocked" class="flex items-center justify-center border-l border-border-default bg-transparent">
            <button 
              v-if="!row._isPhantom && !row._isAuto"
              @click="removeRow(index)" 
              class="text-red-400 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 p-1 hover:bg-surface-hover rounded outline-none transition-opacity cursor-pointer"
              :aria-label="t('common.deleteRow')"
              :title="t('common.deleteRow')"
            >
              <svg class="w-4 h-4" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
                <path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"></path>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
    
    <div v-if="!keysLocked" class="flex items-center">
      <button 
        type="button"
        @click="addRow" 
        class="ui-sm flex items-center font-medium text-text-secondary hover:text-text-primary gap-1.5 px-2.5 py-1 rounded hover:bg-surface-hover border border-border-default/80 hover:border-border-default transition-colors outline-none focus-visible:ring-1 focus-visible:ring-brand-primary cursor-pointer text-xs"
      >
        <svg class="w-3.5 h-3.5" viewBox="0 0 256 256" fill="currentColor">
          <path d="M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z"></path>
        </svg>
        <span>{{ t('common.addNew') }}</span>
      </button>
    </div>
  </div>
</template>

