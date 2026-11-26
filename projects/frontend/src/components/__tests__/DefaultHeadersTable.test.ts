import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DefaultHeadersTable from '../DefaultHeadersTable.vue'
import type { DefaultHeaderItem } from '@/utils/headers'

describe('DefaultHeadersTable', () => {
  it('is hidden by default and shows the count badge', () => {
    const items: DefaultHeaderItem[] = [
      { key: 'X-App', value: 'Hecto', source: 'folder', overridden: false }
    ]
    const wrapper = mount(DefaultHeadersTable, { props: { items } })

    expect(wrapper.text()).toContain('Default headers')
    expect(wrapper.text()).toContain('1')
    expect(wrapper.find('[aria-expanded="false"]').exists()).toBe(true)
    // Table is hidden
    expect(wrapper.find('.bg-surface-raised\\/40').exists()).toBe(false)
  })

  it('toggles visibility when clicked', async () => {
    const items: DefaultHeaderItem[] = [
      { key: 'Content-Type', value: 'application/json', source: 'auto', overridden: false }
    ]
    const wrapper = mount(DefaultHeadersTable, { props: { items } })

    const button = wrapper.find('button')
    await button.trigger('click')

    expect(wrapper.find('[aria-expanded="true"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Hide default headers')
    expect(wrapper.text()).toContain('Content-Type')
    expect(wrapper.text()).toContain('application/json')
    expect(wrapper.text()).toContain('Auto')

    // Click again to hide
    await button.trigger('click')
    expect(wrapper.find('[aria-expanded="false"]').exists()).toBe(true)
  })

  it('renders overridden badge and line-through styling for overridden items', async () => {
    const items: DefaultHeaderItem[] = [
      { key: 'X-Custom', value: 'old', source: 'folder', folderLevel: 1, overridden: true }
    ]
    const wrapper = mount(DefaultHeadersTable, { props: { items } })

    await wrapper.find('button').trigger('click')

    expect(wrapper.text()).toContain('Overridden')
    expect(wrapper.text()).toContain('Folder (1)')
    const keyEl = wrapper.find('.line-through')
    expect(keyEl.exists()).toBe(true)
  })

  it('renders strikethrough styling without disabled badge and emits toggle when checkbox button is clicked', async () => {
    const items: DefaultHeaderItem[] = [
      { key: 'X-Custom', value: 'old', source: 'folder', folderLevel: 2, overridden: false, disabled: true }
    ]
    const wrapper = mount(DefaultHeadersTable, { props: { items } })

    await wrapper.find('button').trigger('click')

    // Per user requirement: do not render "Disabled" text badge, only line-through styling
    expect(wrapper.text()).not.toContain('Disabled')
    expect(wrapper.text()).toContain('Folder (2)')
    const keyEl = wrapper.find('.line-through')
    expect(keyEl.exists()).toBe(true)

    const checkbox = wrapper.find('button[role="checkbox"]')
    expect(checkbox.exists()).toBe(true)
    expect(checkbox.attributes('aria-checked')).toBe('false')

    await checkbox.trigger('click')
    expect(wrapper.emitted('toggle')).toBeTruthy()
    expect(wrapper.emitted('toggle')![0]).toEqual([items[0]])
  })

  it('renders Auth (X) when auth is inherited from a folder, and Auth (Request) when set directly on request', async () => {
    const items: DefaultHeaderItem[] = [
      { key: 'Authorization', value: 'Bearer token1', source: 'auth', authSource: 'folder', folderLevel: 1, folderName: 'My Folder', overridden: false },
      { key: 'X-Api-Key', value: 'key123', source: 'auth', authSource: 'request', overridden: false }
    ]
    const wrapper = mount(DefaultHeadersTable, { props: { items } })

    await wrapper.find('button').trigger('click')

    expect(wrapper.text()).toContain('Auth (1)')
    expect(wrapper.text()).toContain('Auth (Request)')
  })

  it('masks auth header token by default and toggles on eye click', async () => {
    const items: DefaultHeaderItem[] = [
      { key: 'Authorization', value: 'Bearer secret-token-12345678', source: 'auth', overridden: false }
    ]
    const wrapper = mount(DefaultHeadersTable, { props: { items } })

    await wrapper.find('button').trigger('click')

    // By default, auth token is masked with dots
    expect(wrapper.text()).toContain('Bearer')
    expect(wrapper.text()).toContain('••••••••')
    expect(wrapper.text()).not.toContain('secret-token-12345678')

    // Find eye toggle button
    const eyeBtn = wrapper.find('button[aria-label="Toggle token visibility"]')
    expect(eyeBtn.exists()).toBe(true)
    await eyeBtn.trigger('click')

    // After clicking eye, token is revealed
    expect(wrapper.text()).toContain('secret-token-12345678')
  })

  it('shows empty message when items list is empty and opened', async () => {
    const wrapper = mount(DefaultHeadersTable, { props: { items: [] } })
    await wrapper.find('button').trigger('click')

    expect(wrapper.text()).toContain('No default headers.')
  })

  it('disables the checkbox and prevents toggle when item is overridden', async () => {
    const items: DefaultHeaderItem[] = [
      { key: 'X-App', value: 'old', source: 'folder', overridden: true }
    ]
    const wrapper = mount(DefaultHeadersTable, { props: { items } })
    await wrapper.find('button').trigger('click')

    const checkbox = wrapper.find('button[role="checkbox"]')
    expect(checkbox.attributes('disabled')).toBeDefined()
    expect(checkbox.classes()).toContain('cursor-not-allowed')

    await checkbox.trigger('click')
    expect(wrapper.emitted('toggle')).toBeFalsy()
  })

  it('resets revealedKeys when items prop changes', async () => {
    const items1: DefaultHeaderItem[] = [
      { key: 'Authorization', value: 'Bearer token-req-1', source: 'auth', overridden: false }
    ]
    const wrapper = mount(DefaultHeadersTable, { props: { items: items1 } })
    await wrapper.find('button').trigger('click')

    const eyeBtn = wrapper.find('button[aria-label="Toggle token visibility"]')
    await eyeBtn.trigger('click')
    expect(wrapper.text()).toContain('token-req-1')

    // Change items to represent switching to request 2
    const items2: DefaultHeaderItem[] = [
      { key: 'Authorization', value: 'Bearer token-req-2', source: 'auth', overridden: false }
    ]
    await wrapper.setProps({ items: items2 })

    // Token for request 2 should be masked again
    expect(wrapper.text()).not.toContain('token-req-2')
    expect(wrapper.text()).toContain('••••••••')
  })

  it('uses synchronized 4-column CSS Grid on header and body rows with min-w-0 on Key/Value', async () => {
    const items: DefaultHeaderItem[] = [
      { key: 'X-Very-Long-Header-Key-' + 'k'.repeat(80), value: 'v'.repeat(120), source: 'folder', overridden: false }
    ]
    const wrapper = mount(DefaultHeadersTable, { props: { items } })
    await wrapper.find('button').trigger('click')

    const header = wrapper.find('[data-test="default-headers-header-row"]')
    const bodyRows = wrapper.findAll('[data-test="default-headers-body-row"]')
    expect(header.exists()).toBe(true)
    expect(header.classes()).toContain('grid')
    expect(header.classes()).toContain('items-stretch')
    expect(header.classes()).toContain('grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,2fr)_11rem]')

    expect(bodyRows.length).toBe(1)
    expect(bodyRows[0].classes()).toContain('grid')
    expect(bodyRows[0].classes()).toContain('items-stretch')
    expect(bodyRows[0].classes()).toContain('grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,2fr)_11rem]')
    const cells = bodyRows[0].findAll(':scope > div')
    expect(cells.length).toBe(4)
    expect(cells[1].classes()).toContain('min-w-0')
    expect(cells[2].classes()).toContain('min-w-0')
  })
})
