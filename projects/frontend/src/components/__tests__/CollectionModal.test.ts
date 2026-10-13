import { describe, it, expect, beforeEach } from 'vitest'
import { mount, config } from '@vue/test-utils'
import CollectionModal from '../CollectionModal.vue'

config.global.stubs = {
  teleport: true
}

describe('CollectionModal.vue', () => {
  it('does not render content when modelValue is false', () => {
    const wrapper = mount(CollectionModal, {
      props: {
        modelValue: false,
        mode: 'create'
      }
    })
    expect(wrapper.find('div[role="dialog"]').exists()).toBe(false)
  })

  it('renders create mode correctly', () => {
    const wrapper = mount(CollectionModal, {
      props: {
        modelValue: true,
        mode: 'create'
      }
    })
    expect(wrapper.find('h3').text()).toBe('Tạo collection mới')
    expect(wrapper.find('button[type="submit"]').text()).toBe('Tạo')
    const input = wrapper.find('input')
    expect((input.element as HTMLInputElement).value).toBe('')
  })

  it('renders rename mode with initialName', () => {
    const wrapper = mount(CollectionModal, {
      props: {
        modelValue: true,
        mode: 'rename',
        initialName: 'Existing Collection'
      }
    })
    expect(wrapper.find('h3').text()).toBe('Đổi tên collection')
    expect(wrapper.find('button[type="submit"]').text()).toBe('Lưu')
    const input = wrapper.find('input')
    expect((input.element as HTMLInputElement).value).toBe('Existing Collection')
  })

  it('shows validation error and does not emit submit on empty input', async () => {
    const wrapper = mount(CollectionModal, {
      props: {
        modelValue: true,
        mode: 'create'
      }
    })

    const form = wrapper.find('form')
    await form.trigger('submit.prevent')

    expect(wrapper.text()).toContain('Tên không được để trống')
    expect(wrapper.emitted('submit')).toBeUndefined()

    // Test with whitespace only
    const input = wrapper.find('input')
    await input.setValue('   ')
    await form.trigger('submit.prevent')

    expect(wrapper.text()).toContain('Tên không được để trống')
    expect(wrapper.emitted('submit')).toBeUndefined()
  })

  it('clears validation error when typing', async () => {
    const wrapper = mount(CollectionModal, {
      props: {
        modelValue: true,
        mode: 'create'
      }
    })

    await wrapper.find('form').trigger('submit.prevent')
    expect(wrapper.text()).toContain('Tên không được để trống')

    const input = wrapper.find('input')
    await input.setValue('New Name')
    expect(wrapper.text()).not.toContain('Tên không được để trống')
  })

  it('emits submit with trimmed name when valid input is submitted', async () => {
    const wrapper = mount(CollectionModal, {
      props: {
        modelValue: true,
        mode: 'create'
      }
    })

    const input = wrapper.find('input')
    await input.setValue('  My Collection  ')
    await wrapper.find('form').trigger('submit.prevent')

    expect(wrapper.emitted('submit')).toBeTruthy()
    expect(wrapper.emitted('submit')![0]).toEqual(['My Collection'])
  })

  it('emits close and update:modelValue when cancel button is clicked', async () => {
    const wrapper = mount(CollectionModal, {
      props: {
        modelValue: true,
        mode: 'create'
      }
    })

    const cancelBtn = wrapper.findAll('button').find(b => b.text() === 'Hủy')
    expect(cancelBtn).toBeDefined()
    await cancelBtn!.trigger('click')

    expect(wrapper.emitted('close')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([false])
  })

  it('emits close and update:modelValue when close button is clicked', async () => {
    const wrapper = mount(CollectionModal, {
      props: {
        modelValue: true,
        mode: 'create'
      }
    })

    const closeBtn = wrapper.find('button[aria-label="Đóng"]')
    expect(closeBtn.exists()).toBe(true)
    await closeBtn.trigger('click')

    expect(wrapper.emitted('close')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([false])
  })

  it('emits close when escape key is pressed', async () => {
    const wrapper = mount(CollectionModal, {
      props: {
        modelValue: true,
        mode: 'create'
      }
    })

    const overlay = wrapper.find('.fixed.inset-0')
    await overlay.trigger('keydown.esc')

    expect(wrapper.emitted('close')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([false])
  })

  it('emits close when clicking backdrop', async () => {
    const wrapper = mount(CollectionModal, {
      props: {
        modelValue: true,
        mode: 'create'
      }
    })

    const overlay = wrapper.find('.fixed.inset-0')
    await overlay.trigger('click')

    expect(wrapper.emitted('close')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([false])
  })
})
