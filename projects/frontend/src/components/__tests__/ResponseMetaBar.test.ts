import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ResponseMetaBar from '../ResponseMetaBar.vue'
import type { ExecuteResponse } from '@/stores/responseStore'
import { formatTimestamp } from '@/utils/responseMeta'

describe('ResponseMetaBar.vue', () => {
  const createMockResponse = (overrides: Partial<ExecuteResponse> = {}): ExecuteResponse => ({
    status_code: 200,
    status_text: 'OK',
    time_ms: 125,
    size_bytes: 2048,
    headers: { 'content-type': ['application/json'] },
    body: '{"ok": true}',
    timestamp: '2026-10-15T10:00:00.000Z',
    truncated: false,
    is_binary: false,
    ...overrides
  })

  it('renders status, time, size, and timestamp correctly for standard response', () => {
    const response = createMockResponse()
    const wrapper = mount(ResponseMetaBar, {
      props: { response }
    })

    expect(wrapper.text()).toContain('200 OK')
    expect(wrapper.text()).toContain('125 ms')
    expect(wrapper.text()).toContain('2 KB')
    const timestampEl = wrapper.find('.ui-xs.text-text-muted')
    expect(timestampEl.exists()).toBe(true)
    expect(timestampEl.text()).toBe(formatTimestamp(response.timestamp))
  })

  it('deduplicates redundant status code when status_text already includes it', () => {
    const response = createMockResponse({
      status_code: 201,
      status_text: '201 Created'
    })
    const wrapper = mount(ResponseMetaBar, {
      props: { response }
    })

    // Should display '201 Created', NOT '201 201 Created'
    expect(wrapper.text()).toContain('201 Created')
    expect(wrapper.text()).not.toContain('201 201 Created')
  })

  it('displays only status code when status_text is empty', () => {
    const response = createMockResponse({
      status_code: 404,
      status_text: ''
    })
    const wrapper = mount(ResponseMetaBar, {
      props: { response }
    })

    expect(wrapper.text()).toContain('404')
  })

  it('does not render timestamp element when timestamp is empty or invalid', () => {
    const response = createMockResponse({
      timestamp: ''
    })
    const wrapper = mount(ResponseMetaBar, {
      props: { response }
    })

    expect(wrapper.find('.ui-xs.text-text-muted').exists()).toBe(false)
  })
})
