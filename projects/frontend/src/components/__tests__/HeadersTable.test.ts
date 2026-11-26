import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import HeadersTable from '../HeadersTable.vue'

describe('HeadersTable.vue', () => {
  it('renders empty state when no headers are present', () => {
    const wrapper = mount(HeadersTable, {
      props: { headers: {} }
    })

    expect(wrapper.text()).toContain('Không có header nào.')
    expect(wrapper.find('[data-test="response-headers-header-row"]').exists()).toBe(false)
  })

  it('renders flattened headers with synchronized 2-column CSS Grid, min-w-0, and break-all select-text', () => {
    const wrapper = mount(HeadersTable, {
      props: {
        headers: {
          'Content-Type': ['application/json'],
          'X-Trace-Id': ['abc-123', 'def-456']
        }
      }
    })

    const header = wrapper.find('[data-test="response-headers-header-row"]')
    expect(header.exists()).toBe(true)
    expect(header.classes()).toContain('grid')
    expect(header.classes()).toContain('items-stretch')
    expect(header.classes()).toContain('grid-cols-[minmax(0,1fr)_minmax(0,2fr)]')

    const headerCells = header.findAll(':scope > div')
    expect(headerCells.length).toBe(2)
    expect(headerCells[0].classes()).toContain('min-w-0')
    expect(headerCells[1].classes()).toContain('min-w-0')

    const rows = wrapper.findAll('[data-test="response-headers-body-row"]')
    expect(rows.length).toBe(3)
    for (const row of rows) {
      expect(row.classes()).toContain('grid')
      expect(row.classes()).toContain('items-stretch')
      expect(row.classes()).toContain('grid-cols-[minmax(0,1fr)_minmax(0,2fr)]')
      const cells = row.findAll(':scope > div')
      expect(cells.length).toBe(2)
      expect(cells[0].classes()).toContain('min-w-0')
      expect(cells[0].classes()).toContain('break-all')
      expect(cells[0].classes()).toContain('select-text')
      expect(cells[1].classes()).toContain('min-w-0')
      expect(cells[1].classes()).toContain('break-all')
      expect(cells[1].classes()).toContain('select-text')
    }

    expect(wrapper.text()).toContain('Content-Type')
    expect(wrapper.text()).toContain('application/json')
    expect(wrapper.text()).toContain('abc-123')
    expect(wrapper.text()).toContain('def-456')
  })
})
