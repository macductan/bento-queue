import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import VariableHighlighter from '../VariableHighlighter.vue'
import { createPinia, setActivePinia } from 'pinia'
import { useEnvironmentStore } from '@/stores/environmentStore'
import { nextTick } from 'vue'

describe('VariableHighlighter', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('Biến hợp lệ: Chuỗi {{host}} hiện màu sky (#38bdf8)', async () => {
    const wrapper = mount(VariableHighlighter, {
      props: {
        value: '{{host}}'
      }
    })
    
    const store = useEnvironmentStore()
    store.environments = [
      { id: '1', name: 'Dev', variables: [{ key: 'host', value: 'localhost', enabled: true }], created_at: '', updated_at: '' } as any
    ]
    store.activeEnvId = '1'
    await nextTick()

    const validSpan = wrapper.find('span[style*="var(--color-variable-valid)"]')
    expect(validSpan.exists()).toBe(true)
    expect(validSpan.text()).toBe('{{host}}')
  })

  it('Biến thiếu: Chuỗi {{token}} hiện màu đỏ (#f87171) ', async () => {
    const wrapper = mount(VariableHighlighter, {
      props: {
        value: '{{token}}'
      }
    })
    
    const store = useEnvironmentStore()
    store.environments = []
    store.activeEnvId = null
    await nextTick()

    const missingSpan = wrapper.find('span.italic.text-variable-missing[style*="var(--color-variable-missing)"]')
    expect(missingSpan.exists()).toBe(true)
    expect(missingSpan.text()).toBe('{{token}}')
  })

  it('Đổi môi trường: Highlight tự động chuyển từ xanh sang đỏ', async () => {
    const wrapper = mount(VariableHighlighter, {
      props: {
        value: '{{token}}'
      }
    })
    
    const store = useEnvironmentStore()
    
    store.environments = [
      { id: 'envA', name: 'EnvA', variables: [{ key: 'token', value: '123', enabled: true }], created_at: '', updated_at: '' } as any,
      { id: 'envB', name: 'EnvB', variables: [], created_at: '', updated_at: '' } as any
    ]
    store.activeEnvId = 'envA'
    await nextTick()
    
    let validSpan = wrapper.find('span[style*="var(--color-variable-valid)"]')
    expect(validSpan.exists()).toBe(true)

    // Switch to Env B
    store.activeEnvId = 'envB'
    await nextTick()

    const missingSpan = wrapper.find('span.italic.text-variable-missing[style*="var(--color-variable-missing)"]')
    expect(missingSpan.exists()).toBe(true)
    
    validSpan = wrapper.find('span[style*="var(--color-variable-valid)"]')
    expect(validSpan.exists()).toBe(false)
  })

  it('Sửa text: Xóa 1 dấu } không match biến nữa', async () => {
    const wrapper = mount(VariableHighlighter, {
      props: {
        value: '{{token}'
      }
    })
    
    const store = useEnvironmentStore()
    store.environments = [
      { id: 'envA', name: 'EnvA', variables: [{ key: 'token', value: '123', enabled: true }], created_at: '', updated_at: '' } as any
    ]
    store.activeEnvId = 'envA'
    await nextTick()

    const validSpan = wrapper.find('span[style*="var(--color-variable-valid)"]')
    const missingSpan = wrapper.find('span.italic.text-variable-missing[style*="var(--color-variable-missing)"]')
    
    expect(validSpan.exists()).toBe(false)
    expect(missingSpan.exists()).toBe(false)
  })

  it('Cuộn (Scroll): Overlay cuộn đồng bộ hoàn toàn với textarea', async () => {
    const wrapper = mount(VariableHighlighter, {
      props: {
        value: 'test'
      }
    })
    
    const event = {
      target: { scrollTop: 100, scrollLeft: 50 }
    } as unknown as Event
    
    wrapper.vm.syncScroll(event)
    
    const overlay = wrapper.find('.pointer-events-none').element as HTMLElement
    expect(overlay.scrollTop).toBe(100)
    expect(overlay.scrollLeft).toBe(50)
  })

  it('singleLine mode: applies correct CSS classes', async () => {
    const wrapper = mount(VariableHighlighter, {
      props: {
        value: 'test',
        singleLine: true
      }
    })
    
    const overlay = wrapper.find('.pointer-events-none')
    expect(overlay.classes()).toContain('whitespace-pre')
    expect(overlay.classes()).toContain('overflow-hidden')
    expect(overlay.classes()).not.toContain('whitespace-pre-wrap')
  })

  it('IME Composition (Ubuntu Vietnamese): toggles is-ime-composing and syncs live input value', async () => {
    const wrapper = mount(VariableHighlighter, {
      props: {
        value: '',
        singleLine: true
      },
      slots: {
        default: '<input type="text" class="text-transparent" />'
      }
    })

    const input = wrapper.find('input')
    const overlay = wrapper.find('.pointer-events-none')

    await input.trigger('compositionstart')
    expect(wrapper.classes()).toContain('is-ime-composing')
    expect(overlay.classes()).toContain('opacity-0')

    ;(input.element as HTMLInputElement).value = 'tiếng'
    await input.trigger('compositionupdate')
    expect(overlay.text()).toContain('tiếng')

    ;(input.element as HTMLInputElement).value = 'tiếng việt'
    await input.trigger('compositionend')
    expect(wrapper.classes()).not.toContain('is-ime-composing')
    expect(overlay.classes()).not.toContain('opacity-0')
    expect(overlay.text()).toContain('tiếng việt')
  })
})

