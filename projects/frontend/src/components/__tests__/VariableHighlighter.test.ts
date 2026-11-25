import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import VariableHighlighter from '../VariableHighlighter.vue'
import FolderEditor from '../FolderEditor.vue'
import { createPinia, setActivePinia } from 'pinia'
import { useEnvironmentStore } from '@/stores/environmentStore'
import { useCollectionStore } from '@/stores/collectionStore'
import { useRequestStore } from '@/stores/requestStore'
import { useUiStore } from '@/stores/uiStore'
import { nextTick } from 'vue'
import {
  LoadFolder,
  UpdateFolder,
  GetCollectionTree,
  UpdateCollection,
  SaveEnvironment,
  ListEnvironments,
  SaveRequest
} from '../../../wailsjs/go/main/App'

vi.mock('../../../wailsjs/go/main/App', () => ({
  LoadFolder: vi.fn(),
  UpdateFolder: vi.fn(),
  GetCollectionTree: vi.fn().mockResolvedValue({ success: true, data: [] }),
  UpdateCollection: vi.fn().mockResolvedValue({ success: true, data: {} }),
  SaveEnvironment: vi.fn().mockResolvedValue({ success: true, data: {} }),
  ListEnvironments: vi.fn().mockResolvedValue({ success: true, data: [] }),
  DeleteEnvironment: vi.fn().mockResolvedValue({ success: true }),
  SaveRequest: vi.fn().mockResolvedValue({ success: true, data: {} })
}))

describe('VariableHighlighter', () => {
  let activeWrappers: any[] = []

  const trackWrapper = (w: any) => {
    activeWrappers.push(w)
    return w
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    for (const w of activeWrappers) {
      try {
        w.unmount()
      } catch {
        // ignore
      }
    }
    activeWrappers = []
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('Biến hợp lệ: Chuỗi {{host}} hiện màu sky (#38bdf8) và gắn data-var-name', async () => {
    const wrapper = trackWrapper(mount(VariableHighlighter, {
      props: {
        value: '{{host}}'
      }
    }))
    
    const store = useEnvironmentStore()
    store.environments = [
      { id: '1', name: 'Dev', variables: [{ key: 'host', value: 'localhost', enabled: true }], created_at: '', updated_at: '' } as any
    ]
    store.activeEnvId = '1'
    await nextTick()

    const validSpan = wrapper.find('span[style*="var(--color-variable-valid)"]')
    expect(validSpan.exists()).toBe(true)
    expect(validSpan.text()).toBe('{{host}}')
    expect(validSpan.attributes('data-var-name')).toBe('host')
  })

  it('Biến thiếu: Chuỗi {{token}} hiện màu đỏ (#f87171) và gắn data-var-name', async () => {
    const wrapper = trackWrapper(mount(VariableHighlighter, {
      props: {
        value: '{{token}}'
      }
    }))
    
    const store = useEnvironmentStore()
    store.environments = []
    store.activeEnvId = null
    await nextTick()

    const missingSpan = wrapper.find('span.italic.text-variable-missing[style*="var(--color-variable-missing)"]')
    expect(missingSpan.exists()).toBe(true)
    expect(missingSpan.text()).toBe('{{token}}')
    expect(missingSpan.attributes('data-var-name')).toBe('token')
  })

  it('Đổi môi trường: Highlight tự động chuyển từ xanh sang đỏ', async () => {
    const wrapper = trackWrapper(mount(VariableHighlighter, {
      props: {
        value: '{{token}}'
      }
    }))
    
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
    const wrapper = trackWrapper(mount(VariableHighlighter, {
      props: {
        value: '{{token}'
      }
    }))
    
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
    const wrapper = trackWrapper(mount(VariableHighlighter, {
      props: {
        value: 'test'
      }
    }))
    
    const event = {
      target: { scrollTop: 100, scrollLeft: 50 }
    } as unknown as Event
    
    wrapper.vm.syncScroll(event)
    
    const overlay = wrapper.find('.pointer-events-none').element as HTMLElement
    expect(overlay.scrollTop).toBe(100)
    expect(overlay.scrollLeft).toBe(50)
  })

  it('singleLine mode: applies correct CSS classes', async () => {
    const wrapper = trackWrapper(mount(VariableHighlighter, {
      props: {
        value: 'test',
        singleLine: true
      }
    }))
    
    const overlay = wrapper.find('.pointer-events-none')
    expect(overlay.classes()).toContain('whitespace-pre')
    expect(overlay.classes()).toContain('overflow-hidden')
    expect(overlay.classes()).not.toContain('whitespace-pre-wrap')
  })

  it('IME Composition (Ubuntu Vietnamese): toggles is-ime-composing and syncs live input value', async () => {
    const wrapper = trackWrapper(mount(VariableHighlighter, {
      props: {
        value: '',
        singleLine: true
      },
      slots: {
        default: '<input type="text" class="text-transparent" />'
      }
    }))

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

  describe('VariableHoverPopover & Hover Interaction (CAP-4)', () => {
    const setupHierarchyState = () => {
      const colStore = useCollectionStore()
      const envStore = useEnvironmentStore()

      colStore.collections = [
        {
          id: 'Test-Collection',
          name: 'Test-Collection',
          is_active: true,
          active_env_id: 'env-local',
          variables: [{ key: 'baseUrl', value: 'http://coll', enabled: true }]
        } as any
      ]
      colStore.activeCollectionId = 'Test-Collection'

      envStore.environments = [
        {
          id: 'env-local',
          name: 'Local',
          variables: [{ key: 'globalOnly', value: 'from-local', enabled: true }]
        } as any,
        {
          id: 'env-staging',
          name: 'Staging',
          variables: [{ key: 'baseUrl', value: 'http://staging', enabled: true }]
        } as any
      ]
      envStore.activeEnvId = 'env-local'

      const folderA = {
        id: 'folder-a',
        name: 'Folder A',
        type: 'folder',
        path: '/Folder A',
        created_at: '',
        variables: [],
        folder_envs: {}
      }
      const folderB = {
        id: 'folder-b',
        name: 'Folder B',
        type: 'folder',
        path: '/Folder A/Folder B',
        created_at: '',
        variables: [],
        folder_envs: {
          'env-local': [{ key: 'baseUrl', value: 'http://folder-b-local', enabled: true }]
        }
      }

      vi.mocked(SaveEnvironment).mockImplementation(async (savedEnv: any) => {
        const idx = envStore.environments.findIndex(e => e.id === savedEnv.id)
        if (idx !== -1) {
          envStore.environments[idx] = { ...envStore.environments[idx], ...savedEnv }
        } else {
          envStore.environments.push(savedEnv)
        }
        return { success: true, data: savedEnv } as any
      })
      vi.mocked(ListEnvironments).mockImplementation(async () => ({
        success: true,
        data: envStore.environments
      }) as any)
      vi.mocked(GetCollectionTree).mockImplementation(async () => ({
        success: true,
        data: colStore.tree
      }) as any)

      return { colStore, envStore, folderA, folderB, pathFolders: [folderA, folderB] }
    }

    it('opens Popover on hover over resolved variable, selects Winning Tier, filters out inactive envs, and updates input when switching scope', async () => {
      vi.useFakeTimers()
      const { pathFolders } = setupHierarchyState()

      const wrapper = trackWrapper(
        mount(VariableHighlighter, {
          props: {
            value: '{{baseUrl}}/users'
          },
          global: {
            provide: {
              variableHierarchyFolders: pathFolders
            }
          },
          slots: {
            default: '<input type="text" value="{{baseUrl}}/users" />'
          }
        })
      )

      // Overlay keeps pointer-events-none
      const overlay = wrapper.find('.pointer-events-none')
      expect(overlay.exists()).toBe(true)

      const varSpan = wrapper.find('[data-var-name="baseUrl"]')
      expect(varSpan.exists()).toBe(true)
      vi.spyOn(varSpan.element as HTMLElement, 'getBoundingClientRect').mockReturnValue({
        top: 10,
        left: 20,
        bottom: 30,
        right: 100,
        width: 80,
        height: 20,
        x: 20,
        y: 10,
        toJSON: () => ({})
      })

      await wrapper.trigger('mousemove', { clientX: 50, clientY: 20 })
      expect(document.body.querySelector('[data-test="variable-hover-popover"]')).toBeNull()

      await vi.advanceTimersByTimeAsync(150)
      await nextTick()

      const popover = document.body.querySelector('[data-test="variable-hover-popover"]') as HTMLElement
      expect(popover).not.toBeNull()
      expect(popover.textContent).toContain('{{baseUrl}}')

      const selectEl = popover.querySelector('[data-test="variable-scope-select"]') as HTMLSelectElement
      const inputEl = popover.querySelector('[data-test="variable-value-input"]') as HTMLInputElement
      expect(selectEl).not.toBeNull()
      expect(inputEl).not.toBeNull()

      const optionLabels = Array.from(selectEl.options).map(o => o.textContent?.trim())
      expect(optionLabels).toEqual([
        'Folder: Folder B (Local)',
        'Folder: Folder B (Dùng chung)',
        'Folder: Folder A (Local)',
        'Folder: Folder A (Dùng chung)',
        'Global Env (Local)',
        'Collection Env (Dùng chung)'
      ])
      expect(optionLabels.some(l => l?.includes('Staging'))).toBe(false)

      // Winning tier is Folder: Folder B (Local)
      expect(selectEl.value).toBe('folder-env:folder-b:env-local')
      expect(inputEl.value).toBe('http://folder-b-local')

      // Switch scope to Collection Env (Dùng chung)
      selectEl.value = 'collection'
      selectEl.dispatchEvent(new Event('change'))
      await nextTick()
      expect(inputEl.value).toBe('http://coll')

      // Switch scope to Folder: Folder A (Local) where variable is not defined
      selectEl.value = 'folder-env:folder-a:env-local'
      selectEl.dispatchEvent(new Event('change'))
      await nextTick()
      expect(inputEl.value).toBe('')
    })

    it('shows "Chưa định nghĩa" badge and defaults to Global Env (Local) when hovering missing variable with active env', async () => {
      vi.useFakeTimers()
      const { pathFolders } = setupHierarchyState()

      const wrapper = trackWrapper(
        mount(VariableHighlighter, {
          props: {
            value: '{{newKey}}'
          },
          global: {
            provide: {
              variableHierarchyFolders: pathFolders
            }
          }
        })
      )

      const varSpan = wrapper.find('[data-var-name="newKey"]')
      await varSpan.trigger('mousemove')
      await vi.advanceTimersByTimeAsync(150)
      await nextTick()

      const popover = document.body.querySelector('[data-test="variable-hover-popover"]') as HTMLElement
      expect(popover).not.toBeNull()

      const badge = popover.querySelector('[data-test="variable-status-badge"]')
      expect(badge?.textContent?.trim()).toBe('Chưa định nghĩa')

      const selectEl = popover.querySelector('[data-test="variable-scope-select"]') as HTMLSelectElement
      const inputEl = popover.querySelector('[data-test="variable-value-input"]') as HTMLInputElement
      expect(selectEl.value).toBe('global-env:env-local')
      expect(inputEl.value).toBe('')
      expect(inputEl.getAttribute('placeholder')).toBe('Nhập giá trị cho {{newKey}}...')
    })

    it('lists only Folder Global and Collection Env and defaults to Collection Env when activeEnvId is null', async () => {
      vi.useFakeTimers()
      const { envStore, folderA } = setupHierarchyState()
      envStore.activeEnvId = null

      const wrapper = trackWrapper(
        mount(VariableHighlighter, {
          props: {
            value: '{{newKey}}'
          },
          global: {
            provide: {
              variableHierarchyFolders: [folderA]
            }
          }
        })
      )

      const varSpan = wrapper.find('[data-var-name="newKey"]')
      await varSpan.trigger('mousemove')
      await vi.advanceTimersByTimeAsync(150)
      await nextTick()

      const popover = document.body.querySelector('[data-test="variable-hover-popover"]') as HTMLElement
      expect(popover).not.toBeNull()

      const selectEl = popover.querySelector('[data-test="variable-scope-select"]') as HTMLSelectElement
      const optionLabels = Array.from(selectEl.options).map(o => o.textContent?.trim())
      expect(optionLabels).toEqual([
        'Folder: Folder A (Dùng chung)',
        'Collection Env (Dùng chung)'
      ])
      expect(selectEl.value).toBe('collection')
    })

    it('saves variable to Global Env and Collection Env and immediately updates highlight to resolved', async () => {
      vi.useFakeTimers()
      const { colStore, envStore, pathFolders } = setupHierarchyState()

      const wrapper = trackWrapper(
        mount(VariableHighlighter, {
          props: {
            value: '{{newKey}}'
          },
          global: {
            provide: {
              variableHierarchyFolders: pathFolders
            }
          }
        })
      )

      // Initially missing
      expect(wrapper.find('span.text-variable-missing').exists()).toBe(true)

      await wrapper.find('[data-var-name="newKey"]').trigger('mousemove')
      await vi.advanceTimersByTimeAsync(150)
      await nextTick()

      const popover = document.body.querySelector('[data-test="variable-hover-popover"]') as HTMLElement
      const inputEl = popover.querySelector('[data-test="variable-value-input"]') as HTMLInputElement
      const saveBtn = popover.querySelector('[data-test="variable-save-btn"]') as HTMLButtonElement

      inputEl.value = 'https://api.new'
      inputEl.dispatchEvent(new Event('input'))
      await nextTick()

      saveBtn.click()
      await flushPromises()
      await nextTick()

      expect(SaveEnvironment).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'env-local',
          variables: expect.arrayContaining([
            { key: 'newKey', value: 'https://api.new', enabled: true }
          ])
        })
      )

      // Highlight immediately switches from missing to resolved
      expect(wrapper.find('span.text-variable-valid').exists()).toBe(true)
      expect(wrapper.find('span.text-variable-missing').exists()).toBe(false)

      // Now switch scope to Collection Env and save via Enter key
      const selectEl = popover.querySelector('[data-test="variable-scope-select"]') as HTMLSelectElement
      selectEl.value = 'collection'
      selectEl.dispatchEvent(new Event('change'))
      await nextTick()

      inputEl.value = 'https://coll.new'
      inputEl.dispatchEvent(new Event('input'))
      inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      await flushPromises()
      await nextTick()

      expect(UpdateCollection).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'Test-Collection',
          variables: expect.arrayContaining([
            { key: 'newKey', value: 'https://coll.new', enabled: true }
          ])
        })
      )
      expect(
        colStore.activeCollection?.variables?.some(
          v => v.key === 'newKey' && v.value === 'https://coll.new' && v.enabled
        )
      ).toBe(true)
      expect(envStore.variablesMap.get('newKey')).toBe('https://api.new')
    })

    it('saves variable to Folder-Env and Folder Global and syncs open FolderEditor immediately', async () => {
      vi.useFakeTimers()
      const { colStore, folderA, folderB, pathFolders } = setupHierarchyState()
      colStore.tree = [
        {
          ...folderA,
          children: [folderB as any]
        } as any
      ]
      colStore.activeFolderId = 'folder-a'

      let storedFolderA: any = {
        id: 'folder-a',
        name: 'Folder A',
        variables: [],
        folder_envs: {},
        headers: [],
        auth: { type: 'inherit' }
      }
      vi.mocked(LoadFolder).mockImplementation(async () => ({
        success: true,
        data: JSON.parse(JSON.stringify(storedFolderA))
      }) as any)
      vi.mocked(UpdateFolder).mockImplementation(async (updated: any) => {
        storedFolderA = JSON.parse(JSON.stringify(updated))
        return { success: true, data: storedFolderA } as any
      })

      const folderEditorWrapper = trackWrapper(
        mount(FolderEditor, {
          global: {
            stubs: {
              KvpEditor: true,
              AuthEditor: true
            }
          }
        })
      )
      await flushPromises()

      const wrapper = trackWrapper(
        mount(VariableHighlighter, {
          props: {
            value: '{{folderKey}}'
          },
          global: {
            provide: {
              variableHierarchyFolders: pathFolders
            }
          }
        })
      )

      await wrapper.find('[data-var-name="folderKey"]').trigger('mousemove')
      await vi.advanceTimersByTimeAsync(150)
      await nextTick()

      const popover = document.body.querySelector('[data-test="variable-hover-popover"]') as HTMLElement
      const selectEl = popover.querySelector('[data-test="variable-scope-select"]') as HTMLSelectElement
      const inputEl = popover.querySelector('[data-test="variable-value-input"]') as HTMLInputElement
      const saveBtn = popover.querySelector('[data-test="variable-save-btn"]') as HTMLButtonElement

      selectEl.value = 'folder-env:folder-a:env-local'
      selectEl.dispatchEvent(new Event('change'))
      await nextTick()

      inputEl.value = 'val-folder'
      inputEl.dispatchEvent(new Event('input'))
      await nextTick()

      saveBtn.click()
      await flushPromises()
      await nextTick()

      expect(LoadFolder).toHaveBeenCalledWith('folder-a')
      expect(UpdateFolder).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'folder-a',
          folder_envs: {
            'env-local': [{ key: 'folderKey', value: 'val-folder', enabled: true }]
          }
        })
      )
      expect(GetCollectionTree).toHaveBeenCalled()

      // Highlight updates immediately
      expect(wrapper.find('span.text-variable-valid').exists()).toBe(true)

      // Open FolderEditor for folder-a also synced immediately
      const folderVm = folderEditorWrapper.vm as any
      expect(folderVm.folder_envs['env-local']).toEqual([
        { key: 'folderKey', value: 'val-folder', enabled: true }
      ])

      // Also save to Folder Global (Folder: Folder A (Dùng chung))
      selectEl.value = 'folder-global:folder-a'
      selectEl.dispatchEvent(new Event('change'))
      await nextTick()
      expect(inputEl.value).toBe('')

      inputEl.value = 'val-folder-shared'
      inputEl.dispatchEvent(new Event('input'))
      await nextTick()

      saveBtn.click()
      await flushPromises()
      await nextTick()

      expect(UpdateFolder).toHaveBeenLastCalledWith(
        expect.objectContaining({
          id: 'folder-a',
          variables: [{ key: 'folderKey', value: 'val-folder-shared', enabled: true }]
        })
      )
      expect(folderVm.variables).toEqual([
        { key: 'folderKey', value: 'val-folder-shared', enabled: true }
      ])
    })

    it('closes Popover on typing, Escape (including during hover delay), or syncScroll, and preserves hover when mouse enters Popover', async () => {
      vi.useFakeTimers()
      const { pathFolders } = setupHierarchyState()

      const wrapper = trackWrapper(
        mount(VariableHighlighter, {
          props: {
            value: '{{baseUrl}}'
          },
          global: {
            provide: {
              variableHierarchyFolders: pathFolders
            }
          },
          slots: {
            default: '<input type="text" value="{{baseUrl}}" />'
          }
        })
      )

      // Pressing Escape during the 150ms hover delay cancels opening the popover
      await wrapper.find('[data-var-name="baseUrl"]').trigger('mousemove')
      await vi.advanceTimersByTimeAsync(50)
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      await vi.advanceTimersByTimeAsync(150)
      await nextTick()
      expect(document.body.querySelector('[data-test="variable-hover-popover"]')).toBeNull()

      // Hover and open popover
      await wrapper.find('[data-var-name="baseUrl"]').trigger('mousemove')
      await vi.advanceTimersByTimeAsync(150)
      await nextTick()

      const popover = document.body.querySelector('[data-test="variable-hover-popover"]') as HTMLElement
      expect(popover).not.toBeNull()

      // Mouse leaves highlighter but enters popover within 200ms grace period
      await wrapper.trigger('mouseleave')
      await vi.advanceTimersByTimeAsync(100)
      popover.dispatchEvent(new MouseEvent('mouseenter'))
      await vi.advanceTimersByTimeAsync(200)
      await nextTick()

      expect(document.body.querySelector('[data-test="variable-hover-popover"]')).not.toBeNull()

      // syncScroll closes the open popover immediately
      wrapper.vm.syncScroll({ target: { scrollTop: 20, scrollLeft: 0 } } as unknown as Event)
      await nextTick()
      expect(document.body.querySelector('[data-test="variable-hover-popover"]')).toBeNull()

      // Re-open and verify typing in main input closes popover
      await wrapper.find('[data-var-name="baseUrl"]').trigger('mousemove')
      await vi.advanceTimersByTimeAsync(150)
      await nextTick()
      expect(document.body.querySelector('[data-test="variable-hover-popover"]')).not.toBeNull()

      const mainInput = wrapper.find('input')
      ;(mainInput.element as HTMLInputElement).value = '{{baseUrl}}/v2'
      await mainInput.trigger('input')
      await nextTick()
      expect(document.body.querySelector('[data-test="variable-hover-popover"]')).toBeNull()
    })

    it('highlights XML syntax tokens while preserving {{variable}} placeholders when syntax="xml"', async () => {
      const store = useEnvironmentStore()
      store.environments = [
        { id: 'env-1', name: 'Dev', variables: [{ key: 'user_name', value: 'Alice', enabled: true }], created_at: '', updated_at: '' } as any
      ]
      store.activeEnvId = 'env-1'

      const wrapper = trackWrapper(
        mount(VariableHighlighter, {
          props: {
            value: '<user id="42" active="true"><name>{{user_name}}</name></user>',
            syntax: 'xml'
          }
        })
      )
      await nextTick()

      // XML syntax tokens should be rendered
      const tagTokens = wrapper.findAll('[data-xml-token="tag-name"]')
      expect(tagTokens.length).toBeGreaterThan(0)
      expect(tagTokens.some((t: any) => t.text() === 'user')).toBe(true)
      expect(tagTokens.some((t: any) => t.text() === 'name')).toBe(true)

      const attrNameTokens = wrapper.findAll('[data-xml-token="attr-name"]')
      expect(attrNameTokens.some((t: any) => t.text() === 'id')).toBe(true)
      expect(attrNameTokens.some((t: any) => t.text() === 'active')).toBe(true)

      const attrValTokens = wrapper.findAll('[data-xml-token="attr-value"]')
      expect(attrValTokens.some((t: any) => t.text() === '"42"')).toBe(true)

      // Variable placeholder {{user_name}} must be preserved with valid highlight
      const varSpan = wrapper.find('[data-var-name="user_name"]')
      expect(varSpan.exists()).toBe(true)
      expect(varSpan.text()).toBe('{{user_name}}')
      expect(varSpan.classes()).toContain('text-variable-valid')
    })

    it('supports 1-click select, + Thêm lựa chọn... auto-save, out-of-list preservation, and 4-tier options inheritance in VariableHoverPopover', async () => {
      vi.useFakeTimers()
      useUiStore().setLocale('vi')
      const { envStore, pathFolders } = setupHierarchyState()

      envStore.environments = [
        {
          id: 'env-local',
          name: 'Local',
          variables: [
            { key: 'role', value: 'admin', enabled: true, type: 'select', options: ['admin', 'user'] },
            { key: 'otherSelect', value: 'keep', enabled: true, type: 'select', options: ['keep', 'other'] }
          ]
        } as any
      ]

      let storedFolderA: any = {
        id: 'folder-a',
        name: 'Folder A',
        variables: [],
        folder_envs: {},
        headers: [],
        auth: { type: 'inherit' }
      }
      vi.mocked(LoadFolder).mockImplementation(async () => ({
        success: true,
        data: JSON.parse(JSON.stringify(storedFolderA))
      }) as any)
      vi.mocked(UpdateFolder).mockImplementation(async (updated: any) => {
        storedFolderA = JSON.parse(JSON.stringify(updated))
        return { success: true, data: storedFolderA } as any
      })

      const wrapper = trackWrapper(
        mount(VariableHighlighter, {
          props: {
            value: '{{role}}'
          },
          global: {
            provide: {
              variableHierarchyFolders: pathFolders
            }
          }
        })
      )

      await wrapper.find('[data-var-name="role"]').trigger('mousemove')
      await vi.advanceTimersByTimeAsync(150)
      await nextTick()

      const popover = document.body.querySelector('[data-test="variable-hover-popover"]') as HTMLElement
      expect(popover).not.toBeNull()

      // Winning scope is Global Env (Local), which is select ['admin', 'user']
      const triggerBtn = popover.querySelector('[data-test="kvp-select-trigger"]') as HTMLButtonElement
      expect(triggerBtn).not.toBeNull()
      expect(triggerBtn.textContent).toContain('admin')

      // 1-click select "user" -> saves immediately and preserves otherSelect's type/options
      triggerBtn.click()
      await nextTick()
      ;(document.body.querySelector('[data-test="kvp-select-option-user"]') as HTMLButtonElement).click()
      await flushPromises()
      await nextTick()

      expect(SaveEnvironment).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'env-local',
          variables: [
            { key: 'role', value: 'user', enabled: true, type: 'select', options: ['admin', 'user'] },
            { key: 'otherSelect', value: 'keep', enabled: true, type: 'select', options: ['keep', 'other'] }
          ]
        })
      )

      // Switch scope to Folder A (Dùng chung) which does NOT define 'role' yet -> inherits ['admin', 'user']
      const selectEl = popover.querySelector('[data-test="variable-scope-select"]') as HTMLSelectElement
      selectEl.value = 'folder-global:folder-a'
      selectEl.dispatchEvent(new Event('change'))
      await nextTick()

      const folderTrigger = popover.querySelector('[data-test="kvp-select-trigger"]') as HTMLButtonElement
      expect(folderTrigger).not.toBeNull()
      folderTrigger.click()
      await nextTick()

      // Inherits 'admin' & 'user' in dropdown
      expect(document.body.querySelector('[data-test="kvp-select-option-admin"]')).not.toBeNull()
      expect(document.body.querySelector('[data-test="kvp-select-option-user"]')).not.toBeNull()

      // Add "guest" via "+ Thêm lựa chọn..." -> saves type: 'select', options: ['admin', 'user', 'guest'] onto Folder A
      ;(document.body.querySelector('[data-test="kvp-add-option-trigger"]') as HTMLButtonElement).click()
      await nextTick()
      const addInput = document.body.querySelector('[data-test="kvp-add-option-input"]') as HTMLInputElement
      addInput.value = 'guest'
      addInput.dispatchEvent(new Event('input'))
      ;(document.body.querySelector('[data-test="kvp-add-option-confirm"]') as HTMLButtonElement).click()
      await flushPromises()
      await nextTick()

      expect(UpdateFolder).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'folder-a',
          variables: [
            { key: 'role', value: 'guest', enabled: true, type: 'select', options: ['admin', 'user', 'guest'] }
          ]
        })
      )
    })

    it('shows out-of-list label in VariableHoverPopover without deleting value', async () => {
      vi.useFakeTimers()
      useUiStore().setLocale('vi')
      const { envStore, pathFolders } = setupHierarchyState()
      envStore.environments = [
        {
          id: 'env-local',
          name: 'Local',
          variables: [
            { key: 'mode', value: 'x', enabled: true, type: 'select', options: ['a'] }
          ]
        } as any
      ]

      const wrapper = trackWrapper(
        mount(VariableHighlighter, {
          props: { value: '{{mode}}' },
          global: {
            provide: { variableHierarchyFolders: pathFolders }
          }
        })
      )

      await wrapper.find('[data-var-name="mode"]').trigger('mousemove')
      await vi.advanceTimersByTimeAsync(150)
      await nextTick()

      const popover = document.body.querySelector('[data-test="variable-hover-popover"]') as HTMLElement
      expect(popover.querySelector('[data-test="kvp-select-trigger"]')?.textContent).toContain('x')
      expect(popover.querySelector('[data-test="kvp-out-of-list-badge"]')?.textContent).toContain('ngoài danh sách')
    })

    it('supports select :param in path_params with empty value and 1-click save, and retains popover when focus is inside teleported portal', async () => {
      vi.useFakeTimers()
      useUiStore().setLocale('vi')
      const { pathFolders } = setupHierarchyState()
      const reqStore = useRequestStore()
      reqStore.current = {
        id: 'req-p',
        name: 'Path Select',
        method: 'GET',
        url: 'https://api.example.com/:ver/items',
        headers: [],
        params: [],
        path_params: [{ key: 'ver', value: '', enabled: true, type: 'select', options: ['v1', 'v2'] }],
        body: { type: 'none', content: '' },
        created_at: '',
        updated_at: ''
      }

      const wrapper = trackWrapper(
        mount(VariableHighlighter, {
          attachTo: document.body,
          props: { value: 'https://api.example.com/:ver/items', enablePathParams: true },
          global: {
            provide: { variableHierarchyFolders: pathFolders }
          }
        })
      )

      const pathSpan = wrapper.find('[data-var-name="ver"][data-var-kind="path"]')
      expect(pathSpan.exists()).toBe(true)
      await pathSpan.trigger('mousemove')
      await vi.advanceTimersByTimeAsync(150)
      await nextTick()

      const popover = document.body.querySelector('[data-test="variable-hover-popover"]') as HTMLElement
      expect(popover).not.toBeNull()

      const triggerBtn = popover.querySelector('[data-test="kvp-select-trigger"]') as HTMLButtonElement
      expect(triggerBtn).not.toBeNull()
      triggerBtn.click()
      await nextTick()

      // Open inline add input inside teleported portal and focus it
      ;(document.body.querySelector('[data-test="kvp-add-option-trigger"]') as HTMLButtonElement).click()
      await nextTick()
      const inlineInput = document.body.querySelector('[data-test="kvp-add-option-input"]') as HTMLInputElement
      expect(inlineInput).not.toBeNull()
      inlineInput.focus()

      // Trigger mouseleave + focusout on popover while focus is inside [data-kvp-portal="true"]
      popover.dispatchEvent(new MouseEvent('mouseleave'))
      popover.dispatchEvent(new FocusEvent('focusout'))
      await vi.advanceTimersByTimeAsync(300)
      await nextTick()

      // Popover must still be open
      expect(document.body.querySelector('[data-test="variable-hover-popover"]')).not.toBeNull()

      // Cancel inline add and 1-click select 'v2'
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await nextTick()
      ;(document.body.querySelector('[data-test="kvp-select-option-v2"]') as HTMLButtonElement).click()
      await flushPromises()
      await nextTick()

      expect(reqStore.current.path_params?.[0]).toEqual({
        key: 'ver',
        value: 'v2',
        enabled: true,
        type: 'select',
        options: ['v1', 'v2']
      })
    })

    it('toggles select back to text without leaking inherited options and deletes options when emptied', async () => {
      vi.useFakeTimers()
      useUiStore().setLocale('vi')
      const { envStore, pathFolders } = setupHierarchyState()
      envStore.environments = [
        {
          id: 'env-local',
          name: 'Local',
          variables: [
            { key: 'role', value: 'admin', enabled: true, type: 'select', options: ['admin', 'user'] }
          ]
        } as any
      ]

      let storedFolderA: any = {
        id: 'folder-a',
        name: 'Folder A',
        variables: [],
        folder_envs: {},
        headers: [],
        auth: { type: 'inherit' }
      }
      vi.mocked(LoadFolder).mockImplementation(async () => ({
        success: true,
        data: JSON.parse(JSON.stringify(storedFolderA))
      }) as any)
      vi.mocked(UpdateFolder).mockImplementation(async (updated: any) => {
        storedFolderA = JSON.parse(JSON.stringify(updated))
        return { success: true, data: storedFolderA } as any
      })

      const wrapper = trackWrapper(
        mount(VariableHighlighter, {
          props: { value: '{{role}}' },
          global: {
            provide: { variableHierarchyFolders: pathFolders }
          }
        })
      )

      await wrapper.find('[data-var-name="role"]').trigger('mousemove')
      await vi.advanceTimersByTimeAsync(150)
      await nextTick()

      const popover = document.body.querySelector('[data-test="variable-hover-popover"]') as HTMLElement

      // 1. Switch to undefined Folder A (inherits select ['admin', 'user']), toggle to text, save -> must NOT leak options
      const selectEl = popover.querySelector('[data-test="variable-scope-select"]') as HTMLSelectElement
      selectEl.value = 'folder-global:folder-a'
      selectEl.dispatchEvent(new Event('change'))
      await nextTick()

      expect(popover.querySelector('[data-test="variable-save-dirty-dot"]')).toBeNull()
      ;(popover.querySelector('[data-test="kvp-mode-toggle-btn"]') as HTMLButtonElement).click()
      await nextTick()
      expect(popover.querySelector('[data-test="variable-save-dirty-dot"]')).not.toBeNull()

      const valueInput = popover.querySelector('[data-test="variable-value-input"]') as HTMLInputElement
      valueInput.value = 'plain-role'
      valueInput.dispatchEvent(new Event('input'))
      ;(popover.querySelector('[data-test="variable-save-btn"]') as HTMLButtonElement).click()
      await flushPromises()
      await nextTick()

      expect(UpdateFolder).toHaveBeenLastCalledWith(
        expect.objectContaining({
          id: 'folder-a',
          variables: [{ key: 'role', value: 'plain-role', enabled: true }]
        })
      )

      // 2. Switch back to Global Env (existing select ['admin', 'user']), delete all options, toggle to text, save -> type: 'text' and options deleted
      selectEl.value = 'global-env:env-local'
      selectEl.dispatchEvent(new Event('change'))
      await nextTick()

      ;(popover.querySelector('[data-test="kvp-edit-options-btn"]') as HTMLButtonElement).click()
      await nextTick()
      ;(document.body.querySelector('[data-test="kvp-remove-option-btn-0"]') as HTMLButtonElement).click()
      await nextTick()
      ;(document.body.querySelector('[data-test="kvp-remove-option-btn-0"]') as HTMLButtonElement).click()
      await nextTick()

      ;(popover.querySelector('[data-test="kvp-mode-toggle-btn"]') as HTMLButtonElement).click()
      await nextTick()
      ;(popover.querySelector('[data-test="variable-save-btn"]') as HTMLButtonElement).click()
      await flushPromises()
      await nextTick()

      expect(SaveEnvironment).toHaveBeenLastCalledWith(
        expect.objectContaining({
          id: 'env-local',
          variables: [{ key: 'role', value: 'admin', enabled: true, type: 'text' }]
        })
      )
    })

    it('defaults select variable to Request scope so Request A selection does not affect Request B, syncs Env options, and supports resetting override', async () => {
      vi.useFakeTimers()
      useUiStore().setLocale('vi')
      const { envStore, pathFolders } = setupHierarchyState()
      envStore.environments = [
        {
          id: 'env-local',
          name: 'Local',
          variables: [
            { key: 'role', value: 'admin', enabled: true, type: 'select', options: ['admin', 'user'] },
            { key: 'host', value: 'https://dev.api', enabled: true, type: 'text' }
          ]
        } as any
      ]

      const reqStore = useRequestStore()
      const reqA: any = {
        id: 'req-a',
        name: 'Request A',
        method: 'GET',
        url: 'https://api.example.com?role={{role}}&host={{host}}',
        headers: [],
        params: [],
        variables: [],
        body: { type: 'none', content: '' },
        created_at: '',
        updated_at: ''
      }
      const reqB: any = {
        id: 'req-b',
        name: 'Request B',
        method: 'GET',
        url: 'https://api.example.com?role={{role}}',
        headers: [],
        params: [],
        variables: [],
        body: { type: 'none', content: '' },
        created_at: '',
        updated_at: ''
      }
      reqStore.original = JSON.parse(JSON.stringify(reqA))
      reqStore.current = reqA

      const wrapper = trackWrapper(
        mount(VariableHighlighter, {
          props: { value: '{{role}} {{host}}' },
          global: {
            provide: {
              variableHierarchyFolders: pathFolders,
              variableScopeContext: 'request'
            }
          }
        })
      )

      // 1. Hover {{role}} (select var) -> defaults to 'request' scope and shows effective value 'admin'
      await wrapper.find('[data-var-name="role"]').trigger('mousemove')
      await vi.advanceTimersByTimeAsync(150)
      await nextTick()

      const popover = document.body.querySelector('[data-test="variable-hover-popover"]') as HTMLElement
      const scopeSelect = popover.querySelector('[data-test="variable-scope-select"]') as HTMLSelectElement
      expect(scopeSelect.value).toBe('request')
      expect(popover.querySelector('[data-test="kvp-select-trigger"]')?.textContent).toContain('admin')
      expect(popover.querySelector('[data-test="variable-reset-request-override-btn"]')).toBeNull()

      // 2. 1-click select 'user' on Request A -> saves pure value override to reqA.variables, does NOT modify Global Env
      ;(popover.querySelector('[data-test="kvp-select-trigger"]') as HTMLButtonElement).click()
      await nextTick()
      ;(document.body.querySelector('[data-test="kvp-select-option-user"]') as HTMLButtonElement).click()
      await flushPromises()
      await nextTick()

      expect(SaveEnvironment).not.toHaveBeenCalled()
      expect(SaveRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'req-a',
          variables: [{ key: 'role', value: 'user', enabled: true }]
        })
      )
      expect(reqA.variables).toEqual([{ key: 'role', value: 'user', enabled: true }])
      expect(reqB.variables).toEqual([])
      expect(envStore.environments[0].variables[0].value).toBe('admin')
      expect(popover.querySelector('[data-test="variable-reset-request-override-btn"]')).not.toBeNull()

      // 3. Updating options on Global Env immediately reflects in Request A because Request A only stored a pure value override
      envStore.environments[0].variables[0].options = ['admin', 'user', 'moderator']
      await nextTick()
      ;(popover.querySelector('[data-test="kvp-select-trigger"]') as HTMLButtonElement).click()
      await nextTick()
      expect(document.body.querySelector('[data-test="kvp-select-option-moderator"]')).not.toBeNull()
      // Close dropdown
      ;(popover.querySelector('[data-test="kvp-select-trigger"]') as HTMLButtonElement).click()
      await nextTick()

      // 4. Switch to Request B -> still sees Global Env value 'admin' (not polluted by Request A)
      reqStore.original = JSON.parse(JSON.stringify(reqB))
      reqStore.current = reqB
      await nextTick()
      expect(popover.querySelector('[data-test="kvp-select-trigger"]')?.textContent).toContain('admin')
      expect(popover.querySelector('[data-test="variable-reset-request-override-btn"]')).toBeNull()

      // 5. Switch back to Request A and click "Bỏ ghi đè" -> clears reqA override back to 'admin'
      reqStore.original = JSON.parse(JSON.stringify(reqA))
      reqStore.current = reqA
      await nextTick()
      ;(popover.querySelector('[data-test="variable-reset-request-override-btn"]') as HTMLButtonElement).click()
      await flushPromises()
      await nextTick()

      expect(reqA.variables).toEqual([])
      expect(popover.querySelector('[data-test="kvp-select-trigger"]')?.textContent).toContain('admin')

      // 6. Normal text variable {{host}} still defaults to Global Env scope
      await wrapper.find('[data-var-name="host"]').trigger('mousemove')
      await vi.advanceTimersByTimeAsync(150)
      await nextTick()
      const hostPopover = document.body.querySelector('[data-test="variable-hover-popover"]') as HTMLElement
      const hostScopeSelect = hostPopover.querySelector('[data-test="variable-scope-select"]') as HTMLSelectElement
      expect(hostScopeSelect.value).toBe('global-env:env-local')
    })

    it('respects Example sync_flags.variables in VariableHoverPopover (readonly when linked, editable when unlinked)', async () => {
      vi.useFakeTimers()
      try {
      const envStore = useEnvironmentStore()
      const reqStore = useRequestStore()
      const collectionStore = useCollectionStore()

      collectionStore.collections = [
        { id: 'c1', name: 'Default', description: '', variables: [] }
      ] as any
      collectionStore.activeCollectionId = 'c1'
      envStore.environments = [
        { id: 'env-local', name: 'Local', variables: [{ key: 'tier', value: 'free', enabled: true }], created_at: '', updated_at: '' } as any
      ]
      envStore.activeEnvId = 'env-local'

      const baseReq: any = {
        id: 'req-ex-var-lock',
        name: 'Ex Var Lock',
        method: 'GET',
        url: 'https://api.example.com?tier={{tier}}',
        headers: [],
        params: [],
        variables: [{ key: 'tier', value: 'pro', enabled: true, type: 'select', options: ['free', 'pro'] }],
        body: { type: 'none', content: '' },
        examples: [
          {
            id: 'ex-locked',
            name: 'Locked Vars',
            method: 'GET',
            url: 'https://api.example.com?tier={{tier}}',
            headers: [],
            params: [],
            variables: [{ key: 'tier', value: 'pro', enabled: true, type: 'select', options: ['free', 'pro'] }],
            body: { type: 'none', content: '' },
            auth: { type: 'inherit' },
            sync_flags: {
              url: true,
              method: true,
              auth: true,
              scripts: true,
              body: false,
              params: false,
              path_params: false,
              headers: false,
              variables: true
            },
            created_at: '',
            updated_at: ''
          }
        ],
        created_at: '',
        updated_at: ''
      }
      reqStore.original = JSON.parse(JSON.stringify(baseReq))
      reqStore.draft = JSON.parse(JSON.stringify(baseReq))
      reqStore.selectExample('ex-locked')

      const wrapper = trackWrapper(
        mount(VariableHighlighter, {
          props: { value: '{{tier}}' },
          global: {
            provide: {
              variableHierarchyFolders: [],
              variableScopeContext: 'request'
            }
          }
        })
      )

      await wrapper.find('[data-var-name="tier"]').trigger('mousemove')
      await vi.advanceTimersByTimeAsync(150)
      await nextTick()

      const popover = document.body.querySelector('[data-test="variable-hover-popover"]') as HTMLElement
      const selectTrigger = popover.querySelector('[data-test="kvp-select-trigger"]') as HTMLButtonElement
      const modeToggle = popover.querySelector('[data-test="kvp-mode-toggle-btn"]') as HTMLButtonElement | null
      const saveBtn = popover.querySelector('[data-test="variable-save-btn"]') as HTMLButtonElement
      expect(selectTrigger.disabled).toBe(true)
      expect(modeToggle).toBeNull()
      expect(saveBtn.disabled).toBe(true)

      // Unlink variables flag -> select control & save button unlock
      reqStore.setExampleSyncFlag('ex-locked', 'variables', false)
      await nextTick()
      expect(selectTrigger.disabled).toBe(false)
      expect(popover.querySelector('[data-test="kvp-mode-toggle-btn"]')).not.toBeNull()
      expect(saveBtn.disabled).toBe(false)
      } finally {
        vi.useRealTimers()
      }
    })
  })
})


