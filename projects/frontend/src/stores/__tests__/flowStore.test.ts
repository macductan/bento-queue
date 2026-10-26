import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useFlowStore } from '../flowStore'
import { useUiStore } from '../uiStore'
import {
  GetFlowTree,
  GetFlow,
  CreateFlow,
  SaveFlow,
  RenameFlow,
  DeleteFlow,
  DuplicateFlow,
  CreateFlowFolder,
  RenameFlowFolder,
  DeleteFlowFolder,
  ReorderFlowNodes,
  MoveFlowNode,
  SortFlowNodes
} from '../../../wailsjs/go/main/App'

vi.mock('../../../wailsjs/go/main/App', () => ({
  GetFlowTree: vi.fn(),
  GetFlow: vi.fn(),
  CreateFlow: vi.fn(),
  SaveFlow: vi.fn(),
  RenameFlow: vi.fn(),
  DeleteFlow: vi.fn(),
  DuplicateFlow: vi.fn(),
  CreateFlowFolder: vi.fn(),
  RenameFlowFolder: vi.fn(),
  DeleteFlowFolder: vi.fn(),
  ReorderFlowNodes: vi.fn(),
  MoveFlowNode: vi.fn(),
  SortFlowNodes: vi.fn()
}))

const makeSampleFlow = (overrides: Record<string, any> = {}) => ({
  id: 'flow-1',
  name: 'Checkout Flow',
  description: 'End-to-end checkout test',
  layout: 'vertical',
  timeout_ms: 120000,
  max_steps: 200,
  nodes: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides
})

describe('flowStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('loads flowTree via GetFlowTree', async () => {
    const mockTree = [
      {
        id: 'ff-1',
        name: 'Auth Flows',
        type: 'flow_folder',
        path: 'flows/auth',
        created_at: '2026-01-01T00:00:00Z',
        children: [
          {
            id: 'flow-1',
            name: 'Login Flow',
            type: 'flow',
            path: 'flows/auth/login.json',
            step_count: 2,
            created_at: '2026-01-01T00:00:00Z'
          }
        ]
      }
    ]
    vi.mocked(GetFlowTree).mockResolvedValue({ success: true, data: mockTree } as any)

    const store = useFlowStore()
    await store.loadFlowTree()

    expect(GetFlowTree).toHaveBeenCalledTimes(1)
    expect(store.flowTree).toEqual(mockTree)
    expect(store.error).toBeNull()
  })

  it('selects a flow, populates savedSnapshot, and tracks isDirty accurately', async () => {
    const flowData = makeSampleFlow()
    vi.mocked(GetFlow).mockResolvedValue({ success: true, data: flowData } as any)

    const store = useFlowStore()
    const ok = await store.selectFlow('flow-1')

    expect(ok).toBe(true)
    expect(store.activeFlowId).toBe('flow-1')
    expect(store.currentFlow?.name).toBe('Checkout Flow')
    expect(store.isDirty).toBe(false)

    // Mutate currentFlow -> isDirty becomes true
    store.currentFlow!.description = 'Modified description'
    expect(store.isDirty).toBe(true)
  })

  it('prompts for unsaved changes when switching flows while dirty', async () => {
    const flow1 = makeSampleFlow({ id: 'flow-1', name: 'Flow 1' })
    const flow2 = makeSampleFlow({ id: 'flow-2', name: 'Flow 2' })
    vi.mocked(GetFlow).mockImplementation(async (id: string) => ({
      success: true,
      data: id === 'flow-1' ? { ...flow1 } : { ...flow2 }
    }) as any)
    vi.mocked(SaveFlow).mockResolvedValue({ success: true, data: flow1 } as any)
    vi.mocked(GetFlowTree).mockResolvedValue({ success: true, data: [] } as any)

    const store = useFlowStore()
    const uiStore = useUiStore()

    await store.selectFlow('flow-1')
    store.currentFlow!.name = 'Flow 1 Edited'
    expect(store.isDirty).toBe(true)

    // 1. Cancel prompt -> stays on flow-1
    vi.spyOn(uiStore, 'requestUnsavedPrompt').mockResolvedValueOnce('cancel')
    const resCancel = await store.selectFlow('flow-2')
    expect(resCancel).toBe(false)
    expect(store.activeFlowId).toBe('flow-1')

    // 2. Save prompt -> saves flow-1 then switches to flow-2
    vi.spyOn(uiStore, 'requestUnsavedPrompt').mockResolvedValueOnce('save')
    const resSave = await store.selectFlow('flow-2')
    expect(resSave).toBe(true)
    expect(SaveFlow).toHaveBeenCalledTimes(1)
    expect(store.activeFlowId).toBe('flow-2')
    expect(store.isDirty).toBe(false)
  })

  it('creates a new flow, expands parent folder, selects it, and triggers inline rename', async () => {
    const createdFlow = makeSampleFlow({ id: 'flow-new', name: 'Flow mới' })
    vi.mocked(CreateFlow).mockResolvedValue({ success: true, data: createdFlow } as any)
    vi.mocked(GetFlowTree).mockResolvedValue({
      success: true,
      data: [
        {
          id: 'ff-1',
          name: 'Parent Folder',
          type: 'flow_folder',
          path: 'flows/ff-1',
          created_at: '',
          children: [{ id: 'flow-new', name: 'Flow mới', type: 'flow', path: 'flows/ff-1/flow-new.json', created_at: '' }]
        }
      ]
    } as any)
    vi.mocked(GetFlow).mockResolvedValue({ success: true, data: createdFlow } as any)

    const store = useFlowStore()
    const uiStore = useUiStore()

    const created = await store.createFlow('ff-1')
    expect(created?.id).toBe('flow-new')
    expect(CreateFlow).toHaveBeenCalledWith('ff-1')
    expect(store.expandedFlowFolders.has('ff-1')).toBe(true)
    expect(store.activeFlowId).toBe('flow-new')
    expect(uiStore.renameTrigger).toBe('flow-new')
  })

  it('saves currentFlow, updates savedSnapshot, and shows toast', async () => {
    const flowData = makeSampleFlow()
    vi.mocked(GetFlow).mockResolvedValue({ success: true, data: flowData } as any)
    vi.mocked(GetFlowTree).mockResolvedValue({ success: true, data: [] } as any)

    const store = useFlowStore()
    const uiStore = useUiStore()
    await store.selectFlow('flow-1')

    store.currentFlow!.name = 'Updated Flow Name'
    expect(store.isDirty).toBe(true)

    vi.mocked(SaveFlow).mockResolvedValue({
      success: true,
      data: { ...store.currentFlow }
    } as any)

    const saved = await store.saveCurrentFlow()
    expect(saved).toBe(true)
    expect(SaveFlow).toHaveBeenCalledTimes(1)
    expect(store.isDirty).toBe(false)
    expect(uiStore.toast?.text).toBe('Đã lưu Flow')
  })

  it('renames a flow and syncs currentFlow name without marking clean flow dirty', async () => {
    const flowData = makeSampleFlow({ id: 'flow-1', name: 'Old Name' })
    vi.mocked(GetFlow).mockResolvedValue({ success: true, data: flowData } as any)
    vi.mocked(RenameFlow).mockResolvedValue({
      success: true,
      data: { ...flowData, name: 'New Name' }
    } as any)
    vi.mocked(GetFlowTree).mockResolvedValue({
      success: true,
      data: [{ id: 'flow-1', name: 'New Name', type: 'flow', path: 'flows/flow-1.json', created_at: '' }]
    } as any)

    const store = useFlowStore()
    await store.selectFlow('flow-1')
    expect(store.isDirty).toBe(false)

    const ok = await store.renameFlow('flow-1', 'New Name')
    expect(ok).toBe(true)
    expect(RenameFlow).toHaveBeenCalledWith('flow-1', 'New Name')
    expect(store.currentFlow?.name).toBe('New Name')
    expect(store.isDirty).toBe(false)
  })

  it('deletes active flow and clears currentFlow', async () => {
    const flowData = makeSampleFlow({ id: 'flow-1' })
    vi.mocked(GetFlow).mockResolvedValue({ success: true, data: flowData } as any)
    vi.mocked(DeleteFlow).mockResolvedValue({ success: true, data: null } as any)
    vi.mocked(GetFlowTree).mockResolvedValue({ success: true, data: [] } as any)

    const store = useFlowStore()
    await store.selectFlow('flow-1')
    expect(store.activeFlowId).toBe('flow-1')

    const ok = await store.deleteFlow('flow-1')
    expect(ok).toBe(true)
    expect(DeleteFlow).toHaveBeenCalledWith('flow-1')
    expect(store.activeFlowId).toBeNull()
    expect(store.currentFlow).toBeNull()
  })

  it('duplicates a flow and selects the duplicated flow', async () => {
    const duplicatedFlow = makeSampleFlow({ id: 'flow-copy', name: 'Checkout Flow (Copy)' })
    vi.mocked(DuplicateFlow).mockResolvedValue({ success: true, data: duplicatedFlow } as any)
    vi.mocked(GetFlowTree).mockResolvedValue({
      success: true,
      data: [{ id: 'flow-copy', name: 'Checkout Flow (Copy)', type: 'flow', path: 'flows/copy.json', created_at: '' }]
    } as any)
    vi.mocked(GetFlow).mockResolvedValue({ success: true, data: duplicatedFlow } as any)

    const store = useFlowStore()
    const dup = await store.duplicateFlow('flow-1')

    expect(dup?.id).toBe('flow-copy')
    expect(DuplicateFlow).toHaveBeenCalledWith('flow-1')
    expect(store.activeFlowId).toBe('flow-copy')
  })

  it('creates, renames, and deletes flow folders, clearing activeFlowId if inside deleted folder', async () => {
    const createdFolder = { id: 'ff-new', name: 'Thư mục mới', order: [], created_at: '', updated_at: '' }
    vi.mocked(CreateFlowFolder).mockResolvedValue({ success: true, data: createdFolder } as any)
    vi.mocked(RenameFlowFolder).mockResolvedValue({
      success: true,
      data: { ...createdFolder, name: 'Renamed Folder' }
    } as any)
    vi.mocked(DeleteFlowFolder).mockResolvedValue({ success: true, data: null } as any)
    vi.mocked(GetFlowTree).mockResolvedValue({
      success: true,
      data: [
        {
          id: 'ff-new',
          name: 'Thư mục mới',
          type: 'flow_folder',
          path: 'flows/ff-new',
          created_at: '',
          children: [
            { id: 'flow-in-folder', name: 'Inner Flow', type: 'flow', path: 'flows/ff-new/f.json', created_at: '' }
          ]
        }
      ]
    } as any)

    const store = useFlowStore()
    const uiStore = useUiStore()

    const folder = await store.createFlowFolder('')
    expect(folder?.id).toBe('ff-new')
    expect(store.expandedFlowFolders.has('ff-new')).toBe(true)
    expect(uiStore.renameTrigger).toBe('ff-new')

    await store.renameFlowFolder('ff-new', 'Renamed Folder')
    expect(RenameFlowFolder).toHaveBeenCalledWith('ff-new', 'Renamed Folder')

    // Simulate active flow inside ff-new, then delete ff-new
    store.activeFlowId = 'flow-in-folder'
    store.currentFlow = makeSampleFlow({ id: 'flow-in-folder' }) as any
    vi.mocked(GetFlowTree).mockResolvedValueOnce({ success: true, data: [] } as any)

    await store.deleteFlowFolder('ff-new')
    expect(DeleteFlowFolder).toHaveBeenCalledWith('ff-new')
    expect(store.expandedFlowFolders.has('ff-new')).toBe(false)
    expect(store.activeFlowId).toBeNull()
    expect(store.currentFlow).toBeNull()
  })

  it('supports moveFlowNode, reorderFlowNodes, reorderNodePosition, and sortFlowNodes', async () => {
    const initialTree = [
      {
        id: 'ff-1',
        name: 'Folder A',
        type: 'flow_folder',
        path: 'flows/ff-1',
        created_at: '',
        children: []
      },
      {
        id: 'flow-b',
        name: 'Beta Flow',
        type: 'flow',
        path: 'flows/b.json',
        created_at: ''
      },
      {
        id: 'flow-a',
        name: 'Alpha Flow',
        type: 'flow',
        path: 'flows/a.json',
        created_at: ''
      }
    ]
    vi.mocked(GetFlowTree).mockResolvedValue({ success: true, data: initialTree } as any)
    vi.mocked(MoveFlowNode).mockResolvedValue({ success: true, data: null } as any)
    vi.mocked(ReorderFlowNodes).mockResolvedValue({ success: true, data: null } as any)
    vi.mocked(SortFlowNodes).mockResolvedValue({
      success: true,
      data: ['ff-1', 'flow-a', 'flow-b']
    } as any)

    const store = useFlowStore()
    await store.loadFlowTree()

    // Reorder flow-a before flow-b at root
    const reordered = await store.reorderNodePosition('flow-a', 'flow', 'flow-b', 'before')
    expect(reordered).toBe(true)
    expect(ReorderFlowNodes).toHaveBeenCalledWith('', ['ff-1', 'flow-a', 'flow-b'])

    // Move flow-b inside ff-1
    const movedInside = await store.reorderNodePosition('flow-b', 'flow', 'ff-1', 'inside')
    expect(movedInside).toBe(true)
    expect(MoveFlowNode).toHaveBeenCalledWith('flow-b', 'ff-1', -1)

    // Sort root A-Z
    const sortedAsc = await store.sortFlowNodes('')
    expect(sortedAsc).toBe(true)
    expect(SortFlowNodes).toHaveBeenCalledWith('')
    expect(store.sortDirectionMap['']).toBe('asc')
  })

  it('selectFlow is a no-op when clicking the already-active flow even if isDirty is true', async () => {
    vi.mocked(GetFlow).mockResolvedValue({ success: true, data: makeSampleFlow() } as any)
    const store = useFlowStore()
    const uiStore = useUiStore()
    const promptSpy = vi.spyOn(uiStore, 'requestUnsavedPrompt')

    await store.selectFlow('flow-1')
    store.currentFlow!.name = 'Dirty Name'
    expect(store.isDirty).toBe(true)
    vi.mocked(GetFlow).mockClear()

    const ok = await store.selectFlow('flow-1')
    expect(ok).toBe(true)
    expect(GetFlow).not.toHaveBeenCalled()
    expect(promptSpy).not.toHaveBeenCalled()
    expect(store.currentFlow?.name).toBe('Dirty Name')
    expect(store.isDirty).toBe(true)
  })

  it('duplicateFlow on a non-active flow while active flow is dirty prompts before switching to duplicated flow', async () => {
    const flow1 = makeSampleFlow({ id: 'flow-1', name: 'Flow 1' })
    const flow2Copy = makeSampleFlow({ id: 'flow-2-copy', name: 'Flow 2 (Copy)' })
    vi.mocked(GetFlow).mockImplementation(async (id: string) => {
      if (id === 'flow-1') return { success: true, data: flow1 } as any
      return { success: true, data: flow2Copy } as any
    })
    vi.mocked(DuplicateFlow).mockResolvedValue({ success: true, data: flow2Copy } as any)
    vi.mocked(GetFlowTree).mockResolvedValue({
      success: true,
      data: [
        { id: 'flow-1', name: 'Flow 1', type: 'flow', path: 'flows/1.json', created_at: '' },
        { id: 'flow-2-copy', name: 'Flow 2 (Copy)', type: 'flow', path: 'flows/2-copy.json', created_at: '' }
      ]
    } as any)

    const store = useFlowStore()
    const uiStore = useUiStore()
    await store.selectFlow('flow-1')
    store.currentFlow!.name = 'Unsaved Flow 1'
    expect(store.isDirty).toBe(true)

    const promptSpy = vi.spyOn(uiStore, 'requestUnsavedPrompt').mockResolvedValueOnce('cancel')
    await store.duplicateFlow('flow-2')

    expect(promptSpy).toHaveBeenCalled()
    expect(store.activeFlowId).toBe('flow-1')
    expect(store.currentFlow?.name).toBe('Unsaved Flow 1')
  })

  it('sortFlowNodes in desc mode returns false and does not update sortDirectionMap or show Z-A toast when ReorderFlowNodes fails', async () => {
    const initialTree = [
      { id: 'flow-a', name: 'Alpha Flow', type: 'flow', path: 'flows/a.json', created_at: '' },
      { id: 'flow-b', name: 'Beta Flow', type: 'flow', path: 'flows/b.json', created_at: '' }
    ]
    vi.mocked(GetFlowTree).mockResolvedValue({ success: true, data: initialTree } as any)
    vi.mocked(ReorderFlowNodes).mockResolvedValue({
      success: false,
      error: { message: 'Lỗi sắp xếp' }
    } as any)

    const store = useFlowStore()
    const uiStore = useUiStore()
    await store.loadFlowTree()
    store.sortDirectionMap[''] = 'asc'

    const ok = await store.sortFlowNodes('', 'desc')
    expect(ok).toBe(false)
    expect(store.sortDirectionMap['']).toBe('asc')
    expect(uiStore.toast).not.toBe('Đã sắp xếp Z-A')
  })
})

