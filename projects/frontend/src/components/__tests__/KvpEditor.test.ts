import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import KvpEditor from '../KvpEditor.vue'
import { createPinia, setActivePinia } from 'pinia'
import { useRequestStore, type Request, type KVPair } from '@/stores/requestStore'
import { useEnvironmentStore } from '@/stores/environmentStore'
import { useUiStore } from '@/stores/uiStore'
import { nextTick } from 'vue'

describe('KvpEditor', () => {
  const mountedWrappers: any[] = []
  const track = <T>(w: T): T => {
    mountedWrappers.push(w)
    return w
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    useUiStore().setLocale('vi')
    document.body.innerHTML = ''
  })

  afterEach(() => {
    for (const w of mountedWrappers) {
      try {
        w.unmount()
      } catch {
        // ignore
      }
    }
    mountedWrappers.length = 0
    document.body.innerHTML = ''
  })

  const createMockRequest = (overrides: Partial<Request> = {}): Request => ({
    id: 'req-1',
    name: 'Test Request',
    method: 'GET',
    url: 'https://api.example.com',
    headers: [],
    params: [
      { key: '{{my_key}}', value: '{{my_val}}', enabled: true }
    ],
    body: { type: 'none', content: '' },
    created_at: '',
    updated_at: '',
    ...overrides
  })

  it('should render Key input with text-text-primary without VariableHighlighter while Value column highlights resolved and missing variables', async () => {
    const reqStore = useRequestStore()
    reqStore.current = createMockRequest({
      params: [
        { key: 'Authorization', value: 'Bearer {{my_key}} {{my_val}}', enabled: true }
      ]
    })

    const envStore = useEnvironmentStore()
    envStore.environments = [
      {
        id: 'env-1',
        name: 'Dev',
        variables: [{ key: 'my_key', value: 'search', enabled: true }],
        created_at: '',
        updated_at: ''
      } as any
    ]
    envStore.activeEnvId = 'env-1'

    const wrapper = mount(KvpEditor, {
      props: {
        field: 'params'
      }
    })
    await nextTick()

    const keyInput = wrapper.find('input[placeholder="Key"]')
    expect(keyInput.exists()).toBe(true)
    expect(keyInput.classes()).toContain('text-text-primary')
    expect(keyInput.classes()).not.toContain('text-transparent')
    expect(keyInput.classes()).not.toContain('transparent-selection')
    expect((keyInput.element as HTMLInputElement).value).toBe('Authorization')

    // VariableHighlighter in Value column should highlight {{my_key}} as resolved and {{my_val}} as missing
    const validSpan = wrapper.find('span.text-variable-valid')
    expect(validSpan.exists()).toBe(true)
    expect(validSpan.text()).toBe('{{my_key}}')

    const missingSpan = wrapper.find('span.italic.text-variable-missing')
    expect(missingSpan.exists()).toBe(true)
    expect(missingSpan.text()).toBe('{{my_val}}')
  })

  it('should toggle enabled state when checkbox is clicked', async () => {
    const reqStore = useRequestStore()
    reqStore.current = createMockRequest()

    const wrapper = mount(KvpEditor, {
      props: {
        field: 'params'
      }
    })
    await nextTick()

    const checkbox = wrapper.find('button[role="checkbox"]')
    expect(checkbox.attributes('aria-checked')).toBe('true')

    await checkbox.trigger('click')
    expect(reqStore.current.params[0].enabled).toBe(false)
  })

  it('should remove row when delete button is clicked', async () => {
    const reqStore = useRequestStore()
    reqStore.current = createMockRequest()

    const wrapper = mount(KvpEditor, {
      props: {
        field: 'params'
      }
    })
    await nextTick()

    const deleteBtn = wrapper.find('button[aria-label="Xóa dòng"]')
    expect(deleteBtn.exists()).toBe(true)

    await deleteBtn.trigger('click')
    expect(reqStore.current.params.length).toBe(0)
  })

  it('should preserve DOM input identity and update value in real time during IME composition in phantom row', async () => {
    const model: { key: string; value: string; enabled: boolean }[] = []
    const wrapper = mount(KvpEditor, {
      props: {
        modelValue: model
      }
    })
    await nextTick()

    const firstKeyInput = wrapper.find('input[placeholder="Key"]')
    const originalDomEl = firstKeyInput.element

    // Start IME composition on phantom row
    await firstKeyInput.trigger('compositionstart')
    await nextTick()
    expect(model.length).toBe(1)

    // Type Vietnamese characters while composing
    ;(firstKeyInput.element as HTMLInputElement).value = 'tiếng'
    await firstKeyInput.trigger('input')
    await nextTick()

    // Ensure the exact same DOM input element is reused at index 0
    const inputsAfter = wrapper.findAll('input[placeholder="Key"]')
    expect(inputsAfter.length).toBe(2)
    expect(inputsAfter[0].element).toBe(originalDomEl)
    expect(model[0].key).toBe('tiếng')
  })

  it('should preserve textarea element identity during IME composition in Value column of phantom row', async () => {
    const model: { key: string; value: string; enabled: boolean }[] = []
    const wrapper = mount(KvpEditor, {
      props: {
        modelValue: model
      }
    })
    await nextTick()

    const firstValTextarea = wrapper.find('textarea[placeholder="Value"]')
    const originalTextareaEl = firstValTextarea.element

    await firstValTextarea.trigger('compositionstart')
    await nextTick()
    expect(model.length).toBe(1)

    ;(firstValTextarea.element as HTMLTextAreaElement).value = 'việt nam'
    await firstValTextarea.trigger('input')
    await nextTick()

    const textareasAfter = wrapper.findAll('textarea[placeholder="Value"]')
    expect(textareasAfter.length).toBe(2)
    expect(textareasAfter[0].element).toBe(originalTextareaEl)
    expect(model[0].value).toBe('việt nam')
  })

  it('synchronizes whitespace-pre-wrap and break-all on Value textarea to prevent caret offset', async () => {
    const wrapper = mount(KvpEditor, {
      props: {
        modelValue: [
          { key: 'wsdl_url', value: 'https://edev-ws.sanmar.com:8080/SanMarWebService/SanMarWebServicePort?wsdl', enabled: true }
        ]
      }
    })
    await nextTick()

    const textarea = wrapper.find('textarea[placeholder="Value"]')
    expect(textarea.exists()).toBe(true)
    expect(textarea.classes()).toContain('whitespace-pre-wrap')
    expect(textarea.classes()).toContain('break-all')
    expect(textarea.classes()).toContain('mono-sm')
  })

  it('toggles Text <-> Select, seeds options from non-empty value, and materializes phantom row', async () => {
    const model: KVPair[] = [{ key: 'env', value: 'dev', enabled: true }]
    const wrapper = track(
      mount(KvpEditor, {
        props: { modelValue: model }
      })
    )
    await nextTick()

    // Row 0 starts in text mode
    const toggleBtns = wrapper.findAll('[data-test="kvp-mode-toggle-btn"]')
    expect(toggleBtns.length).toBe(2) // row 0 + phantom row
    expect(wrapper.findAll('textarea[placeholder="Value"]').length).toBe(2)

    // Switch row 0 to select -> seeds options = ['dev']
    await toggleBtns[0].trigger('click')
    await nextTick()
    expect(model[0].type).toBe('select')
    expect(model[0].options).toEqual(['dev'])
    expect(wrapper.find('[data-test="kvp-select-trigger"]').text()).toContain('dev')

    // Switch row 0 back to text -> preserves options
    await wrapper.findAll('[data-test="kvp-mode-toggle-btn"]')[0].trigger('click')
    await nextTick()
    expect(model[0].type).toBe('text')
    expect(model[0].options).toEqual(['dev'])

    // Click toggle on phantom row (index 1) -> materializes real row with type: 'select' and no empty option seeded
    const phantomToggle = wrapper.findAll('[data-test="kvp-mode-toggle-btn"]')[1]
    await phantomToggle.trigger('click')
    await nextTick()
    expect(model.length).toBe(2)
    expect(model[1].type).toBe('select')
    expect(model[1].options).toBeUndefined()
  })

  it('supports 1-click option selection, + Thêm lựa chọn... (deduped & rejects empty), and options popover', async () => {
    const model: KVPair[] = [
      { key: 'mode', value: 'a', enabled: true, type: 'select', options: ['a', 'b'] }
    ]
    const wrapper = track(
      mount(KvpEditor, {
        props: { modelValue: model }
      })
    )
    await nextTick()

    // Open 1-click dropdown (teleported to body)
    await wrapper.find('[data-test="kvp-select-trigger"]').trigger('click')
    await nextTick()
    const dropdown = document.body.querySelector('[data-test="kvp-select-dropdown"]') as HTMLElement
    expect(dropdown).not.toBeNull()

    // Click option "b"
    ;(dropdown.querySelector('[data-test="kvp-select-option-b"]') as HTMLButtonElement).click()
    await nextTick()
    expect(model[0].value).toBe('b')
    expect(document.body.querySelector('[data-test="kvp-select-dropdown"]')).toBeNull()

    // Re-open dropdown and test "+ Thêm lựa chọn..."
    await wrapper.find('[data-test="kvp-select-trigger"]').trigger('click')
    await nextTick()
    ;(document.body.querySelector('[data-test="kvp-add-option-trigger"]') as HTMLButtonElement).click()
    await nextTick()

    const addInput = document.body.querySelector('[data-test="kvp-add-option-input"]') as HTMLInputElement
    const addBtn = document.body.querySelector('[data-test="kvp-add-option-confirm"]') as HTMLButtonElement

    // Reject empty/whitespace string
    addInput.value = '   '
    addInput.dispatchEvent(new Event('input'))
    addBtn.click()
    await nextTick()
    expect(document.body.querySelector('[data-test="kvp-add-option-error"]')).not.toBeNull()
    expect(model[0].options).toEqual(['a', 'b'])

    // Add duplicate "b" -> does not duplicate in options, selects "b"
    addInput.value = 'b'
    addInput.dispatchEvent(new Event('input'))
    addBtn.click()
    await nextTick()
    expect(model[0].options).toEqual(['a', 'b'])
    expect(model[0].value).toBe('b')

    // Re-open and add new option "c" -> appends to options and selects "c"
    await wrapper.find('[data-test="kvp-select-trigger"]').trigger('click')
    await nextTick()
    ;(document.body.querySelector('[data-test="kvp-add-option-trigger"]') as HTMLButtonElement).click()
    await nextTick()
    const addInput2 = document.body.querySelector('[data-test="kvp-add-option-input"]') as HTMLInputElement
    addInput2.value = 'c'
    addInput2.dispatchEvent(new Event('input'))
    ;(document.body.querySelector('[data-test="kvp-add-option-confirm"]') as HTMLButtonElement).click()
    await nextTick()
    expect(model[0].options).toEqual(['a', 'b', 'c'])
    expect(model[0].value).toBe('c')

    // Open options popover and remove option "c" -> value "c" is preserved as out-of-list!
    await wrapper.find('[data-test="kvp-edit-options-btn"]').trigger('click')
    await nextTick()
    const popover = document.body.querySelector('[data-test="kvp-options-popover"]') as HTMLElement
    expect(popover).not.toBeNull()
    ;(popover.querySelector('[data-test="kvp-remove-option-btn-2"]') as HTMLButtonElement).click()
    await nextTick()

    expect(model[0].options).toEqual(['a', 'b'])
    expect(model[0].value).toBe('c')
    expect(wrapper.find('[data-test="kvp-out-of-list-badge"]').text()).toContain('ngoài danh sách')
  })

  it('displays "(ngoài danh sách)" without deleting value when value is outside options, and hides controls for _isAuto rows', async () => {
    const model: KVPair[] = [
      { key: 'Content-Type', value: 'application/json', enabled: true, _isAuto: true },
      { key: 'tier', value: 'x', enabled: true, type: 'select', options: ['a'] }
    ]
    const wrapper = track(
      mount(KvpEditor, {
        props: { modelValue: model }
      })
    )
    await nextTick()

    // _isAuto row (index 0) must not have toggle or options button
    const rowEls = wrapper.findAll('.divide-y > div')
    expect(rowEls[0].find('[data-test="kvp-mode-toggle-btn"]').exists()).toBe(false)
    expect(rowEls[0].find('[data-test="kvp-edit-options-btn"]').exists()).toBe(false)

    // Row 1 shows out-of-list value and keeps 'x'
    expect(rowEls[1].find('[data-test="kvp-select-trigger"]').text()).toContain('x')
    expect(rowEls[1].find('[data-test="kvp-out-of-list-badge"]').text()).toContain('ngoài danh sách')
    expect(model[1].value).toBe('x')
  })

  it('supports select mode on path_params with readonlyKeys', async () => {
    const reqStore = useRequestStore()
    reqStore.current = createMockRequest({
      path_params: [{ key: 'org', value: 'acme', enabled: true }]
    })

    const wrapper = track(
      mount(KvpEditor, {
        props: { field: 'path_params', readonlyKeys: true, keyPrefix: ':' }
      })
    )
    await nextTick()

    await wrapper.find('[data-test="kvp-mode-toggle-btn"]').trigger('click')
    await nextTick()
    expect(reqStore.current.path_params?.[0].type).toBe('select')
    expect(reqStore.current.path_params?.[0].options).toEqual(['acme'])
  })

  it('edits options in popover (add/error/edit/Enter/outside-click blur commit) and Escape cancels inline-add without closing dropdown', async () => {
    const model: KVPair[] = [
      { key: 'mode', value: 'a', enabled: true, type: 'select', options: ['a', 'b'] }
    ]
    const wrapper = track(
      mount(KvpEditor, {
        attachTo: document.body,
        props: { modelValue: model }
      })
    )
    await nextTick()

    // 1. Escape inside kvp-add-option-input cancels inline-add without closing dropdown
    await wrapper.find('[data-test="kvp-select-trigger"]').trigger('click')
    await nextTick()
    ;(document.body.querySelector('[data-test="kvp-add-option-trigger"]') as HTMLButtonElement).click()
    await nextTick()

    const inlineInput = document.body.querySelector('[data-test="kvp-add-option-input"]') as HTMLInputElement
    expect(inlineInput).not.toBeNull()
    inlineInput.focus()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()

    expect(document.body.querySelector('[data-test="kvp-select-dropdown"]')).not.toBeNull()
    expect(document.body.querySelector('[data-test="kvp-add-option-input"]')).toBeNull()

    // Second Escape closes the dropdown
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()
    expect(document.body.querySelector('[data-test="kvp-select-dropdown"]')).toBeNull()

    // 2. Options popover add validation & editing existing option
    await wrapper.find('[data-test="kvp-edit-options-btn"]').trigger('click')
    await nextTick()
    const popover = document.body.querySelector('[data-test="kvp-options-popover"]') as HTMLElement
    const popAddInput = popover.querySelector('[data-test="kvp-popover-add-option-input"]') as HTMLInputElement
    const popAddBtn = popover.querySelector('[data-test="kvp-popover-add-option-btn"]') as HTMLButtonElement

    // Reject empty and duplicate
    popAddInput.value = '   '
    popAddInput.dispatchEvent(new Event('input'))
    popAddBtn.click()
    await nextTick()
    expect(popover.querySelector('[data-test="kvp-popover-option-error"]')).not.toBeNull()

    popAddInput.value = 'a'
    popAddInput.dispatchEvent(new Event('input'))
    popAddBtn.click()
    await nextTick()
    expect(popover.querySelector('[data-test="kvp-popover-option-error"]')).not.toBeNull()

    // Add valid option 'c'
    popAddInput.value = 'c'
    popAddInput.dispatchEvent(new Event('input'))
    popAddBtn.click()
    await nextTick()
    expect(model[0].options).toEqual(['a', 'b', 'c'])

    // Edit option 1 via Enter
    const opt1Input = popover.querySelector('[data-test="kvp-option-item-input-1"]') as HTMLInputElement
    opt1Input.value = 'b2'
    opt1Input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await nextTick()
    expect(model[0].options).toEqual(['a', 'b2', 'c'])

    // Edit option 0 while focused and click outside on document.body -> blur-before-close commits edit
    const opt0Input = popover.querySelector('[data-test="kvp-option-item-input-0"]') as HTMLInputElement
    opt0Input.focus()
    opt0Input.value = 'a2'
    window.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await nextTick()

    expect(model[0].options).toEqual(['a2', 'b2', 'c'])
    expect(document.body.querySelector('[data-test="kvp-options-popover"]')).toBeNull()
  })

  it('locks checkboxes, inputs, and row mutations when readonly prop is true', async () => {
    const model: KVPair[] = [{ key: 'Authorization', value: 'Bearer 1', enabled: true }]
    const wrapper = track(
      mount(KvpEditor, {
        props: { modelValue: model, readonly: true }
      })
    )
    await nextTick()

    expect((wrapper.find('[role="checkbox"]').element as HTMLButtonElement).disabled).toBe(true)
    expect((wrapper.find('input[type="text"]').element as HTMLInputElement).readOnly).toBe(true)
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).readOnly).toBe(true)
    expect(wrapper.find('[data-test="kvp-mode-toggle-btn"]').exists()).toBe(false)
    expect((wrapper.vm as any)).toBeDefined()
  })
})


