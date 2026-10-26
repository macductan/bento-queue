import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CustomSelect, { type SelectOption } from '../CustomSelect.vue'

const sampleOptions: SelectOption[] = [
  { value: 'none', label: 'None' },
  { value: 'bearer', label: 'Bearer Token', badge: 'JWT' },
  { value: 'basic', label: 'Basic Auth' },
  { value: 'oauth2', label: 'OAuth 2.0', disabled: true }
]

describe('CustomSelect.vue', () => {
  it('renders selected option label, badge, and applies size/fullWidth props', () => {
    const wrapper = mount(CustomSelect, {
      props: {
        modelValue: 'bearer',
        options: sampleOptions,
        dataTest: 'auth-select',
        size: 'xs',
        fullWidth: true
      }
    })

    const trigger = wrapper.find('[data-test="auth-select-trigger"]')
    expect(trigger.exists()).toBe(true)
    expect(trigger.text()).toContain('Bearer Token')
    expect(trigger.text()).toContain('JWT')
    expect(trigger.classes()).toContain('h-[26px]')
    expect(trigger.classes()).toContain('w-full')
  })

  it('opens menu on trigger click, selects enabled option, ignores disabled option, and closes on click outside or Escape', async () => {
    const wrapper = mount(CustomSelect, {
      attachTo: document.body,
      props: {
        modelValue: 'none',
        options: sampleOptions,
        dataTest: 'auth-select',
        align: 'right'
      }
    })

    const trigger = wrapper.find('[data-test="auth-select-trigger"]')
    expect(wrapper.find('[data-test="auth-select-menu"]').exists()).toBe(false)

    await trigger.trigger('click')
    const menu = wrapper.find('[data-test="auth-select-menu"]')
    expect(menu.exists()).toBe(true)
    expect(menu.classes()).toContain('right-0')

    const optionEls = menu.findAll('[role="option"]')
    expect(optionEls.length).toBe(4)

    // Clicking disabled option should not emit or close menu
    await optionEls[3].trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.find('[data-test="auth-select-menu"]').exists()).toBe(true)

    // Clicking enabled option emits update:modelValue and change, and closes menu
    await optionEls[2].trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['basic'])
    expect(wrapper.emitted('change')?.[0]).toEqual(['basic'])
    expect(wrapper.find('[data-test="auth-select-menu"]').exists()).toBe(false)

    // Open with ArrowDown key and close with Escape key
    await trigger.trigger('keydown.down')
    expect(wrapper.find('[data-test="auth-select-menu"]').exists()).toBe(true)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-test="auth-select-menu"]').exists()).toBe(false)

    // Open again and close via outside click
    await trigger.trigger('click')
    expect(wrapper.find('[data-test="auth-select-menu"]').exists()).toBe(true)

    document.body.click()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-test="auth-select-menu"]').exists()).toBe(false)

    wrapper.unmount()
  })

  it('respects disabled prop and syncs hidden native select change event', async () => {
    const wrapper = mount(CustomSelect, {
      props: {
        modelValue: 'none',
        options: sampleOptions,
        dataTest: 'auth-select',
        disabled: true
      }
    })

    const trigger = wrapper.find('[data-test="auth-select-trigger"]')
    await trigger.trigger('click')
    expect(wrapper.find('[data-test="auth-select-menu"]').exists()).toBe(false)

    await wrapper.setProps({ disabled: false })
    const nativeSelect = wrapper.find('select[data-test="auth-select"]')
    await nativeSelect.setValue('bearer')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['bearer'])
    expect(wrapper.emitted('change')?.[0]).toEqual(['bearer'])
  })
})
