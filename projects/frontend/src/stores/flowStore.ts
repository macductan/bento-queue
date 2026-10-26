import { defineStore } from 'pinia'
import { model } from '../../wailsjs/go/models'
import * as AppBinding from '../../wailsjs/go/main/App'
import {
  evaluateStepVerdict,
  evaluateCustomBranchCondition,
  selectMatchingBranch,
  mergeParallelScriptUpdates,
  type FlowMutableCollectionModel,
  type FlowMutableEnvironmentModel,
  type StepFailureCategory,
  type BranchEvalContext,
  type ParallelStepMutationItem
} from '../utils/flowRunner'
import {
  prepareRequestExecution,
  finalizeResponseExecution
} from '../utils/headless-engine'
import type { ScriptExecutionResult, ScriptTestResult } from '../utils/scriptRunner'
import type { ExecuteResponse, ExecutionLogRecord } from './responseStore'
import type { TreeNode } from './collectionStore'
import type { Request } from './requestStore'

export interface FlowTreeNode {
  id: string
  name: string
  type: 'flow_folder' | 'flow' | string
  path: string
  description?: string
  step_count?: number
  children?: FlowTreeNode[]
  created_at: any
}

export type FlowExecutionStatus = 'idle' | 'running' | 'passed' | 'failed' | 'skipped'

export interface FlowStepExecutionState {
  stepId: string
  nodeId: string
  requestId: string
  requestName?: string
  method?: string
  url?: string
  status: FlowExecutionStatus
  statusCode?: number | null
  status_code?: number | null
  durationMs?: number
  duration_ms?: number
  response?: ExecuteResponse | null
  error?: { code: string; message: string } | null
  failureCategory?: StepFailureCategory
  failureReason?: string
  testResults?: ScriptTestResult[]
  executionLogs?: ExecutionLogRecord[]
  scriptLogs?: string[]
  scriptError?: string | null
}

export interface FlowRunSummary {
  status: 'passed' | 'failed'
  stepsTotal: number
  steps_total: number
  stepsExecuted: number
  steps_executed: number
  stepsPassed: number
  steps_passed: number
  stepsFailed: number
  steps_failed: number
  stepsSkipped: number
  steps_skipped: number
  durationMs: number
  duration_ms: number
  haltedError?: string
  halted_error?: string
}

export interface FlowState {
  flowTree: FlowTreeNode[]
  expandedFlowFolders: Set<string>
  activeFlowId: string | null
  currentFlow: (model.Flow & { direction?: 'vertical' | 'horizontal' | string }) | null
  savedSnapshot: string | null
  loading: boolean
  error: string | null
  draggingNode: { id: string; type: 'flow_folder' | 'flow' } | null
  sortDirectionMap: Record<string, 'asc' | 'desc'>
  // Execution state
  isRunning: boolean
  abortRequested: boolean
  nodeStates: Record<string, FlowExecutionStatus>
  branchStates: Record<string, 'idle' | 'active' | 'skipped' | string>
  stepStates: Record<string, FlowStepExecutionState>
  stepResults: Record<string, FlowStepExecutionState>
  selectedStepId: string | null
  lastRunSummary: FlowRunSummary | null
}

function getAppFn<K extends keyof typeof AppBinding>(name: K): (typeof AppBinding)[K] | undefined {
  try {
    const fn = (AppBinding as Record<string, unknown>)[name as string]
    return typeof fn === 'function' ? (fn as (typeof AppBinding)[K]) : undefined
  } catch {
    return undefined
  }
}

function deepClone<T>(val: T): T {
  if (val === undefined || val === null) return val
  return JSON.parse(JSON.stringify(val))
}

let idCounter = 0
function generateEntityId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${++idCounter}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizeDirectionValue(val: unknown): 'vertical' | 'horizontal' | null {
  if (typeof val !== 'string') return null
  const lower = val.trim().toLowerCase()
  if (lower === 'horizontal') return 'horizontal'
  if (lower === 'vertical') return 'vertical'
  return null
}

export function ensureFlowDirectionSync(flow: any): void {
  if (!flow || typeof flow !== 'object') return

  const dirDesc = Object.getOwnPropertyDescriptor(flow, 'direction')
  const layoutDirDesc = Object.getOwnPropertyDescriptor(flow, 'layout_direction')

  const ownDirection =
    dirDesc && 'value' in dirDesc ? normalizeDirectionValue(dirDesc.value) : null
  const ownLayoutDirection =
    layoutDirDesc && 'value' in layoutDirDesc
      ? normalizeDirectionValue(layoutDirDesc.value)
      : null
  const ownLayout = normalizeDirectionValue(flow.layout)

  if (ownDirection && ownDirection !== ownLayout) {
    flow.layout = ownDirection
  } else if (ownLayoutDirection && ownLayoutDirection !== ownLayout) {
    flow.layout = ownLayoutDirection
  } else {
    flow.layout = ownLayout || ownDirection || ownLayoutDirection || 'vertical'
  }

  if (!Array.isArray(flow.nodes)) {
    flow.nodes = []
  }

  if (!dirDesc || dirDesc.enumerable !== false || typeof dirDesc.get !== 'function') {
    Object.defineProperty(flow, 'direction', {
      get() {
        return normalizeDirectionValue(this.layout) === 'horizontal'
          ? 'horizontal'
          : 'vertical'
      },
      set(val: string) {
        this.layout = normalizeDirectionValue(val) === 'horizontal' ? 'horizontal' : 'vertical'
      },
      configurable: true,
      enumerable: false
    })
  }

  if (
    !layoutDirDesc ||
    layoutDirDesc.enumerable !== false ||
    typeof layoutDirDesc.get !== 'function'
  ) {
    Object.defineProperty(flow, 'layout_direction', {
      get() {
        return normalizeDirectionValue(this.layout) === 'horizontal'
          ? 'horizontal'
          : 'vertical'
      },
      set(val: string) {
        this.layout = normalizeDirectionValue(val) === 'horizontal' ? 'horizontal' : 'vertical'
      },
      configurable: true,
      enumerable: false
    })
  }
}

export interface FlatRequestItem {
  id: string
  name: string
  method: string
  url: string
  folderPath: string
  breadcrumbPath: string
  node: TreeNode
}

export function flattenCollectionRequests(
  nodes: TreeNode[] | undefined | null,
  parentFolders: string[] = []
): FlatRequestItem[] {
  if (!Array.isArray(nodes)) return []
  const result: FlatRequestItem[] = []
  for (const node of nodes) {
    if (!node) continue
    if (node.type === 'folder') {
      const nextFolders = [...parentFolders, node.name]
      if (Array.isArray(node.children)) {
        result.push(...flattenCollectionRequests(node.children, nextFolders))
      }
    } else {
      const folderPath = parentFolders.length > 0 ? parentFolders.join(' / ') : 'Root'
      const breadcrumbPath =
        parentFolders.length > 0 ? `${folderPath} / ${node.name}` : 'Root'
      result.push({
        id: node.id,
        name: node.name || node.id,
        method: (node.method || 'GET').toUpperCase(),
        url: node.url || '',
        folderPath,
        breadcrumbPath,
        node
      })
    }
  }
  return result
}

export function findRequestInCollectionTree(
  nodes: TreeNode[] | undefined | null,
  requestId: string
): FlatRequestItem | null {
  if (!requestId) return null
  const all = flattenCollectionRequests(nodes)
  return all.find(item => item.id === requestId) || null
}

export function getMethodBadgeClass(method?: string): string {
  const m = (method || 'GET').trim().toUpperCase()
  switch (m) {
    case 'GET':
      return 'method-badge-get text-method-get'
    case 'POST':
      return 'method-badge-post text-method-post'
    case 'PUT':
      return 'method-badge-put text-method-put'
    case 'PATCH':
      return 'method-badge-patch text-method-patch'
    case 'DELETE':
      return 'method-badge-delete text-method-delete'
    case 'HEAD':
      return 'method-badge-head text-method-head'
    case 'OPTIONS':
      return 'method-badge-options text-method-options'
    default:
      return 'method-badge-options text-method-options'
  }
}

let selectFlowSeq = 0
let flowRunSeq = 0
let flowLogSeq = 0

export const useFlowStore = defineStore('flow', {
  state: (): FlowState => ({
    flowTree: [],
    expandedFlowFolders: new Set<string>(),
    activeFlowId: null,
    currentFlow: null,
    savedSnapshot: null,
    loading: false,
    error: null,
    draggingNode: null,
    sortDirectionMap: {},
    isRunning: false,
    abortRequested: false,
    nodeStates: {},
    branchStates: {},
    stepStates: {},
    stepResults: {},
    selectedStepId: null,
    lastRunSummary: null
  }),
  getters: {
    isDirty(state): boolean {
      if (!state.currentFlow || !state.savedSnapshot) return false
      return JSON.stringify(state.currentFlow) !== state.savedSnapshot
    },
    flowDirection(state): 'vertical' | 'horizontal' {
      const f = state.currentFlow as any
      if (!f) return 'vertical'
      const raw = f.layout || f.direction || f.layout_direction || 'vertical'
      return normalizeDirectionValue(raw) === 'horizontal' ? 'horizontal' : 'vertical'
    }
  },
  actions: {
    async loadFlowTree() {
      const getFlowTreeFn = getAppFn('GetFlowTree')
      if (!getFlowTreeFn) {
        this.loading = false
        return
      }
      this.loading = true
      this.error = null
      try {
        const result = await getFlowTreeFn()
        if (result?.success) {
          this.flowTree = (result.data as FlowTreeNode[]) || []
        } else {
          this.error = result?.error?.message || 'Không thể tải cây Flow'
        }
      } catch (err) {
        this.error = String(err)
      } finally {
        this.loading = false
      }
    },

    async selectFlow(id: string, opts?: { force?: boolean }): Promise<boolean> {
      if (!id) return false
      if (!opts?.force && this.activeFlowId === id && this.currentFlow?.id === id) {
        return true
      }

      const { useUiStore } = await import('./uiStore')
      const uiStore = useUiStore()

      if (!opts?.force && this.currentFlow && this.isDirty && this.activeFlowId !== id) {
        const choice = await uiStore.requestUnsavedPrompt(
          'Flow hiện tại có thay đổi chưa được lưu. Bạn có muốn lưu lại trước khi chuyển Flow?'
        )
        if (choice === 'cancel') return false
        if (choice === 'save') {
          const saved = await this.saveCurrentFlow()
          if (!saved || this.isDirty) return false
        }
      }

      const getFlowFn = getAppFn('GetFlow')
      if (!getFlowFn) return false

      if (this.isRunning) {
        flowRunSeq++
        this.abortRequested = true
        const abortFn = getAppFn('AbortRequest')
        if (abortFn) {
          try {
            void abortFn()
          } catch {
            // ignore abort error
          }
        }
      }

      const seq = ++selectFlowSeq
      this.loading = true
      try {
        const result = await getFlowFn(id)
        if (seq !== selectFlowSeq) return false
        if (result?.success && result.data) {
          const loadedFlow = result.data as model.Flow
          ensureFlowDirectionSync(loadedFlow)
          this.currentFlow = loadedFlow
          this.activeFlowId = id
          this.savedSnapshot = JSON.stringify(this.currentFlow)
          this.selectedStepId = null
          this.isRunning = false
          this.abortRequested = false
          this.nodeStates = {}
          this.branchStates = {}
          this.stepStates = {}
          this.stepResults = {}
          this.lastRunSummary = null
          return true
        } else {
          uiStore.showToast(result?.error?.message || 'Không thể tải Flow')
          return false
        }
      } catch (err) {
        if (seq === selectFlowSeq) {
          uiStore.showToast(String(err))
        }
        return false
      } finally {
        if (seq === selectFlowSeq) {
          this.loading = false
        }
      }
    },

    clearCurrentFlow() {
      selectFlowSeq++
      if (this.isRunning) {
        flowRunSeq++
        this.abortRequested = true
        const abortFn = getAppFn('AbortRequest')
        if (abortFn) {
          try {
            void abortFn()
          } catch {
            // ignore abort error
          }
        }
      }
      this.activeFlowId = null
      this.currentFlow = null
      this.savedSnapshot = null
      this.selectedStepId = null
      this.isRunning = false
      this.abortRequested = false
      this.nodeStates = {}
      this.branchStates = {}
      this.stepStates = {}
      this.stepResults = {}
      this.lastRunSummary = null
    },

    async createFlow(folderId: string = '', _name: string = 'New Flow'): Promise<model.Flow | null> {
      const { useUiStore } = await import('./uiStore')
      const uiStore = useUiStore()
      const createFlowFn = getAppFn('CreateFlow')
      if (!createFlowFn) return null

      if (this.currentFlow && this.isDirty) {
        const choice = await uiStore.requestUnsavedPrompt(
          'Flow hiện tại có thay đổi chưa được lưu. Bạn có muốn lưu lại trước khi tạo Flow mới?'
        )
        if (choice === 'cancel') return null
        if (choice === 'save') {
          const saved = await this.saveCurrentFlow()
          if (!saved || this.isDirty) return null
        }
      }

      try {
        const result = await createFlowFn(folderId)
        if (result?.success && result.data) {
          const created = result.data as model.Flow
          if (folderId) {
            this.expandedFlowFolders.add(folderId)
          }
          await this.loadFlowTree()
          if (folderId) {
            const path = this.findFolderPath(this.flowTree, folderId)
            if (path) path.forEach(n => this.expandedFlowFolders.add(n.id))
          }
          await this.selectFlow(created.id, { force: true })
          uiStore.triggerRename(created.id)
          return created
        } else {
          uiStore.showToast(result?.error?.message || 'Không thể tạo Flow')
          return null
        }
      } catch (err) {
        uiStore.showToast(String(err))
        return null
      }
    },

    async saveCurrentFlow(): Promise<boolean> {
      if (!this.currentFlow) return false
      const { useUiStore } = await import('./uiStore')
      const uiStore = useUiStore()
      const saveFlowFn = getAppFn('SaveFlow')
      if (!saveFlowFn) return false

      try {
        ensureFlowDirectionSync(this.currentFlow)
        const result = await saveFlowFn(this.currentFlow)
        if (result?.success) {
          if (result.data) {
            const savedData = result.data as model.Flow
            ensureFlowDirectionSync(savedData)
            this.currentFlow = savedData
          }
          this.savedSnapshot = JSON.stringify(this.currentFlow)
          await this.loadFlowTree()
          uiStore.showToast('Đã lưu Flow')
          return true
        } else {
          uiStore.showToast(result?.error?.message || 'Không thể lưu Flow')
          return false
        }
      } catch (err) {
        uiStore.showToast(String(err))
        return false
      }
    },

    async renameFlow(id: string, newName: string): Promise<boolean> {
      const { useUiStore } = await import('./uiStore')
      const uiStore = useUiStore()
      const renameFlowFn = getAppFn('RenameFlow')
      if (!renameFlowFn) return false

      try {
        const result = await renameFlowFn(id, newName)
        if (result?.success) {
          const wasDirty = this.isDirty
          await this.loadFlowTree()
          const updatedNode = this.findNode(this.flowTree, id)
          const resolvedName = updatedNode ? updatedNode.name : ((result.data as any)?.name || newName)
          if (this.currentFlow && this.currentFlow.id === id) {
            this.currentFlow.name = resolvedName
            if (!wasDirty) {
              this.savedSnapshot = JSON.stringify(this.currentFlow)
            } else if (this.savedSnapshot) {
              try {
                const parsed = JSON.parse(this.savedSnapshot)
                parsed.name = resolvedName
                this.savedSnapshot = JSON.stringify(parsed)
              } catch {
                // ignore snapshot parse error
              }
            }
          }
          return true
        } else {
          uiStore.showToast(result?.error?.message || 'Không thể đổi tên Flow')
          return false
        }
      } catch (err) {
        uiStore.showToast(String(err))
        return false
      }
    },

    async deleteFlow(id: string): Promise<boolean> {
      const { useUiStore } = await import('./uiStore')
      const uiStore = useUiStore()
      const deleteFlowFn = getAppFn('DeleteFlow')
      if (!deleteFlowFn) return false

      try {
        const result = await deleteFlowFn(id)
        if (result?.success) {
          uiStore.showToast('Đã xóa')
          if (this.activeFlowId === id) {
            this.clearCurrentFlow()
          }
          await this.loadFlowTree()
          return true
        } else {
          uiStore.showToast(result?.error?.message || 'Không thể xóa Flow')
          if (result?.error?.code === 'NOT_FOUND') {
            await this.loadFlowTree()
          }
          return false
        }
      } catch (err) {
        uiStore.showToast(String(err))
        return false
      }
    },

    async duplicateFlow(id: string): Promise<model.Flow | null> {
      const { useUiStore } = await import('./uiStore')
      const uiStore = useUiStore()
      const duplicateFlowFn = getAppFn('DuplicateFlow')
      if (!duplicateFlowFn) return null

      if (this.activeFlowId === id && this.isDirty) {
        const saved = await this.saveCurrentFlow()
        if (!saved || this.isDirty) return null
      }

      try {
        const result = await duplicateFlowFn(id)
        if (result?.success && result.data) {
          const duplicated = result.data as model.Flow
          await this.loadFlowTree()
          if (this.activeFlowId === id || !this.isDirty) {
            await this.selectFlow(duplicated.id, { force: true })
          } else {
            await this.selectFlow(duplicated.id)
          }
          return duplicated
        } else {
          uiStore.showToast(result?.error?.message || 'Không thể sao chép Flow')
          if (result?.error?.code === 'NOT_FOUND') {
            await this.loadFlowTree()
          }
          return null
        }
      } catch (err) {
        uiStore.showToast(String(err))
        return null
      }
    },

    async createFlowFolder(parentId: string = '', _name: string = 'New Folder'): Promise<model.FlowFolder | null> {
      const { useUiStore } = await import('./uiStore')
      const uiStore = useUiStore()
      const createFlowFolderFn = getAppFn('CreateFlowFolder')
      if (!createFlowFolderFn) return null

      try {
        const result = await createFlowFolderFn(parentId)
        if (result?.success && result.data) {
          const created = result.data as model.FlowFolder
          if (parentId) {
            this.expandedFlowFolders.add(parentId)
          }
          this.expandedFlowFolders.add(created.id)
          await this.loadFlowTree()
          if (parentId) {
            const path = this.findFolderPath(this.flowTree, parentId)
            if (path) path.forEach(n => this.expandedFlowFolders.add(n.id))
          }
          uiStore.triggerRename(created.id)
          return created
        } else {
          uiStore.showToast(result?.error?.message || 'Không thể tạo thư mục Flow')
          return null
        }
      } catch (err) {
        uiStore.showToast(String(err))
        return null
      }
    },

    async renameFlowFolder(id: string, newName: string): Promise<boolean> {
      const { useUiStore } = await import('./uiStore')
      const uiStore = useUiStore()
      const renameFlowFolderFn = getAppFn('RenameFlowFolder')
      if (!renameFlowFolderFn) return false

      try {
        const result = await renameFlowFolderFn(id, newName)
        if (result?.success) {
          await this.loadFlowTree()
          return true
        } else {
          uiStore.showToast(result?.error?.message || 'Không thể đổi tên thư mục Flow')
          return false
        }
      } catch (err) {
        uiStore.showToast(String(err))
        return false
      }
    },

    async deleteFlowFolder(id: string): Promise<boolean> {
      const { useUiStore } = await import('./uiStore')
      const uiStore = useUiStore()
      const deleteFlowFolderFn = getAppFn('DeleteFlowFolder')
      if (!deleteFlowFolderFn) return false

      const folderNode = this.findNode(this.flowTree, id)
      const activeInside = Boolean(
        this.activeFlowId &&
          (this.activeFlowId === id ||
            (folderNode?.children && this.findNode(folderNode.children, this.activeFlowId)))
      )
      const folderIdsToRemove = new Set<string>([id])
      const collectSubtreeFolders = (nodes?: FlowTreeNode[]) => {
        if (!nodes) return
        for (const child of nodes) {
          if (child.type === 'flow_folder') {
            folderIdsToRemove.add(child.id)
            if (child.children) collectSubtreeFolders(child.children)
          }
        }
      }
      if (folderNode?.children) {
        collectSubtreeFolders(folderNode.children)
      }

      try {
        const result = await deleteFlowFolderFn(id)
        if (result?.success) {
          uiStore.showToast('Đã xóa')
          for (const fid of folderIdsToRemove) {
            this.expandedFlowFolders.delete(fid)
          }
          if (activeInside) {
            this.clearCurrentFlow()
          }
          await this.loadFlowTree()
          if (this.activeFlowId && !this.findNode(this.flowTree, this.activeFlowId)) {
            this.clearCurrentFlow()
          }
          return true
        } else {
          uiStore.showToast(result?.error?.message || 'Không thể xóa thư mục Flow')
          if (result?.error?.code === 'NOT_FOUND') {
            await this.loadFlowTree()
          }
          return false
        }
      } catch (err) {
        uiStore.showToast(String(err))
        return false
      }
    },

    toggleFlowFolder(id: string) {
      if (this.expandedFlowFolders.has(id)) {
        this.expandedFlowFolders.delete(id)
      } else {
        this.expandedFlowFolders.add(id)
      }
    },

    setDraggingNode(node: { id: string; type: 'flow_folder' | 'flow' } | null) {
      this.draggingNode = node
    },

    findNode(nodes: FlowTreeNode[], id: string): FlowTreeNode | null {
      for (const node of nodes) {
        if (node.id === id) return node
        if (node.children) {
          const found = this.findNode(node.children, id)
          if (found) return found
        }
      }
      return null
    },

    findFolderPath(nodes: FlowTreeNode[], targetId: string, currentPath: FlowTreeNode[] = []): FlowTreeNode[] | null {
      for (const node of nodes) {
        if (node.id === targetId) return [...currentPath, node]
        if (node.children) {
          const found = this.findFolderPath(node.children, targetId, [...currentPath, node])
          if (found) return found
        }
      }
      return null
    },

    findParentFolderId(nodes: FlowTreeNode[], targetId: string, parentId = ''): string | null {
      for (const node of nodes) {
        if (node.id === targetId) return parentId
        if (node.children) {
          const found = this.findParentFolderId(node.children, targetId, node.id)
          if (found !== null) return found
        }
      }
      return null
    },

    isDescendantFolder(folderId: string, candidateTargetId: string): boolean {
      const folderNode = this.findNode(this.flowTree, folderId)
      if (!folderNode || folderNode.type !== 'flow_folder') return false
      if (folderId === candidateTargetId) return true
      return !!this.findNode(folderNode.children || [], candidateTargetId)
    },

    canMoveNodeTo(nodeId: string, nodeType: 'flow_folder' | 'flow', targetFolderId: string): boolean {
      if (!nodeId) return false
      const currentParentId = this.findParentFolderId(this.flowTree, nodeId)
      if (currentParentId === null || currentParentId === targetFolderId) return false
      if (nodeType === 'flow_folder') {
        if (nodeId === targetFolderId) return false
        if (targetFolderId !== '' && this.isDescendantFolder(nodeId, targetFolderId)) return false
      }
      return true
    },

    canReorderNode(
      nodeId: string,
      nodeType: 'flow_folder' | 'flow',
      targetNodeId: string,
      position: 'before' | 'after' | 'inside'
    ): boolean {
      if (!nodeId || !targetNodeId || nodeId === targetNodeId) return false

      if (position === 'inside') {
        const targetNode = this.findNode(this.flowTree, targetNodeId)
        if (!targetNode || targetNode.type !== 'flow_folder') return false
        return this.canMoveNodeTo(nodeId, nodeType, targetNodeId)
      }

      const targetParentId = this.findParentFolderId(this.flowTree, targetNodeId)
      if (targetParentId === null) return false

      if (nodeType === 'flow_folder') {
        if (this.isDescendantFolder(nodeId, targetNodeId)) return false
        if (targetParentId !== '' && this.isDescendantFolder(nodeId, targetParentId)) return false
      }

      return true
    },

    async moveFlowNode(
      nodeId: string,
      _nodeType: 'flow' | 'flow_folder',
      targetFolderId: string,
      targetIndex: number = -1
    ): Promise<boolean> {
      const { useUiStore } = await import('./uiStore')
      const uiStore = useUiStore()
      const moveFlowNodeFn = getAppFn('MoveFlowNode')
      if (!moveFlowNodeFn) return false

      try {
        const result = await moveFlowNodeFn(nodeId, targetFolderId, targetIndex)
        if (result?.success) {
          uiStore.showToast('Đã di chuyển')
          await this.loadFlowTree()
          if (targetFolderId) {
            const path = this.findFolderPath(this.flowTree, targetFolderId)
            if (path) {
              path.forEach(node => this.expandedFlowFolders.add(node.id))
            }
          }
          return true
        } else {
          uiStore.showToast(result?.error?.message || 'Không thể di chuyển mục Flow')
          if (result?.error?.code === 'NOT_FOUND') {
            await this.loadFlowTree()
          }
          return false
        }
      } catch (err) {
        uiStore.showToast(String(err))
        return false
      }
    },

    async reorderFlowNodes(parentFolderId: string, nodeIds: string[]): Promise<boolean> {
      const { useUiStore } = await import('./uiStore')
      const uiStore = useUiStore()
      const reorderFlowNodesFn = getAppFn('ReorderFlowNodes')
      if (!reorderFlowNodesFn) return false

      try {
        const result = await reorderFlowNodesFn(parentFolderId, nodeIds)
        if (result?.success) {
          const reorderList = (list: FlowTreeNode[]) => {
            const map = new Map(list.map(item => [item.id, item]))
            const reordered: FlowTreeNode[] = []
            for (const id of nodeIds) {
              const item = map.get(id)
              if (item) {
                reordered.push(item)
                map.delete(id)
              }
            }
            for (const item of map.values()) {
              reordered.push(item)
            }
            return reordered
          }

          if (!parentFolderId) {
            this.flowTree = reorderList(this.flowTree)
          } else {
            const folder = this.findNode(this.flowTree, parentFolderId)
            if (folder && folder.children) {
              folder.children = reorderList(folder.children)
            }
          }
          return true
        } else {
          uiStore.showToast(result?.error?.message || 'Không thể sắp xếp lại thứ tự Flow')
          return false
        }
      } catch (err) {
        uiStore.showToast(String(err))
        return false
      }
    },

    async reorderNodePosition(
      nodeId: string,
      nodeType: 'flow_folder' | 'flow',
      targetNodeId: string,
      position: 'before' | 'after' | 'inside'
    ): Promise<boolean> {
      if (!this.canReorderNode(nodeId, nodeType, targetNodeId, position)) return false

      if (position === 'inside') {
        return await this.moveFlowNode(nodeId, nodeType, targetNodeId, -1)
      }

      const targetParentId = this.findParentFolderId(this.flowTree, targetNodeId) ?? ''
      const currentParentId = this.findParentFolderId(this.flowTree, nodeId) ?? ''

      const parentNode = targetParentId ? this.findNode(this.flowTree, targetParentId) : null
      const currentSiblings = parentNode ? (parentNode.children || []) : this.flowTree
      const withoutSelf = currentSiblings.filter(n => n.id !== nodeId)
      const targetIdx = withoutSelf.findIndex(n => n.id === targetNodeId)
      const insertIdx = position === 'before' ? Math.max(0, targetIdx) : targetIdx + 1

      if (currentParentId !== targetParentId) {
        const moved = await this.moveFlowNode(nodeId, nodeType, targetParentId, insertIdx)
        if (!moved) return false
        if (targetParentId) {
          this.expandedFlowFolders.add(targetParentId)
        }
        return true
      }

      const newOrderList = [...withoutSelf]
      newOrderList.splice(insertIdx, 0, { id: nodeId } as FlowTreeNode)
      const newOrderIds = newOrderList.map(n => n.id)

      const ok = await this.reorderFlowNodes(targetParentId, newOrderIds)
      if (!ok) return false
      await this.loadFlowTree()
      if (targetParentId) {
        this.expandedFlowFolders.add(targetParentId)
      }
      return true
    },

    async sortFlowNodes(parentId: string = '', direction?: 'asc' | 'desc'): Promise<boolean> {
      const currentDir = this.sortDirectionMap[parentId] || 'desc'
      const nextDir = direction || (currentDir === 'asc' ? 'desc' : 'asc')

      const { useUiStore } = await import('./uiStore')
      const uiStore = useUiStore()
      const sortFlowNodesFn = getAppFn('SortFlowNodes')
      if (!sortFlowNodesFn) return false

      try {
        const result = await sortFlowNodesFn(parentId)
        if (!result?.success) {
          uiStore.showToast(result?.error?.message || 'Không thể sắp xếp danh sách Flow')
          return false
        }

        const targetList: FlowTreeNode[] = !parentId
          ? [...this.flowTree]
          : [...(this.findNode(this.flowTree, parentId)?.children || [])]

        if (targetList.length > 1) {
          const folders = targetList.filter(n => n.type === 'flow_folder')
          const flows = targetList.filter(n => n.type !== 'flow_folder')
          const comparator = (a: FlowTreeNode, b: FlowTreeNode) => {
            const cmp = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
            return nextDir === 'asc' ? cmp : -cmp
          }
          folders.sort(comparator)
          flows.sort(comparator)
          const sortedIds = [...folders, ...flows].map(n => n.id)
          if (nextDir === 'desc') {
            const reordered = await this.reorderFlowNodes(parentId, sortedIds)
            if (!reordered) return false
          }
        }

        this.sortDirectionMap[parentId] = nextDir
        await this.loadFlowTree()
        uiStore.showToast(`Đã sắp xếp ${nextDir === 'asc' ? 'A-Z' : 'Z-A'}`)
        return true
      } catch (err) {
        uiStore.showToast(String(err))
        return false
      }
    },

    // =========================================================================
    // Flowchart Canvas & Step Selection Actions (Story 4)
    // =========================================================================

    selectStep(stepId: string | null) {
      this.selectedStepId = stepId
    },

    setFlowDirection(direction: 'vertical' | 'horizontal') {
      if (!this.currentFlow) return
      ensureFlowDirectionSync(this.currentFlow)
      const normalized =
        normalizeDirectionValue(direction) === 'horizontal' ? 'horizontal' : 'vertical'
      this.currentFlow.layout = normalized
      ;(this.currentFlow as any).direction = normalized
      ;(this.currentFlow as any).layout_direction = normalized
    },

    toggleFlowDirection() {
      const next = this.flowDirection === 'vertical' ? 'horizontal' : 'vertical'
      this.setFlowDirection(next)
    },

    findStepInNodes(
      stepId: string,
      nodes?: model.FlowNode[]
    ): {
      step: model.FlowStep
      node: model.FlowNode
      parentNodes: model.FlowNode[]
      nodeIndex: number
      stepIndex: number
    } | null {
      const targetNodes = nodes ?? this.currentFlow?.nodes
      if (!Array.isArray(targetNodes)) return null
      for (let nIdx = 0; nIdx < targetNodes.length; nIdx++) {
        const node = targetNodes[nIdx]
        if (!node) continue
        if (Array.isArray(node.steps)) {
          for (let sIdx = 0; sIdx < node.steps.length; sIdx++) {
            const step = node.steps[sIdx]
            if (step && step.id === stepId) {
              return { step, node, parentNodes: targetNodes, nodeIndex: nIdx, stepIndex: sIdx }
            }
          }
        }
        if (Array.isArray(node.branches)) {
          for (const br of node.branches) {
            if (br && Array.isArray(br.nodes)) {
              const found = this.findStepInNodes(stepId, br.nodes)
              if (found) return found
            }
          }
        }
      }
      return null
    },

    findCanvasNode(
      nodeId: string,
      nodes?: model.FlowNode[]
    ): {
      node: model.FlowNode
      parentNodes: model.FlowNode[]
      nodeIndex: number
    } | null {
      const targetNodes = nodes ?? this.currentFlow?.nodes
      if (!Array.isArray(targetNodes)) return null
      for (let i = 0; i < targetNodes.length; i++) {
        const node = targetNodes[i]
        if (!node) continue
        if (node.id === nodeId) {
          return { node, parentNodes: targetNodes, nodeIndex: i }
        }
        if (Array.isArray(node.branches)) {
          for (const br of node.branches) {
            if (br && Array.isArray(br.nodes)) {
              const found = this.findCanvasNode(nodeId, br.nodes)
              if (found) return found
            }
          }
        }
      }
      return null
    },

    addSequentialStep(
      requestId: string,
      insertIndex?: number,
      targetNodes?: model.FlowNode[]
    ): { node: model.FlowNode; step: model.FlowStep } | null {
      if (!this.currentFlow) return null
      if (!Array.isArray(this.currentFlow.nodes)) {
        this.currentFlow.nodes = []
      }
      const list = targetNodes ?? this.currentFlow.nodes
      const newStep = {
        id: generateEntityId('step'),
        request_id: requestId,
        enabled: true
      } as model.FlowStep
      const newNode = {
        id: generateEntityId('node'),
        steps: [newStep],
        branches: []
      } as unknown as model.FlowNode

      if (typeof insertIndex === 'number' && insertIndex >= 0 && insertIndex <= list.length) {
        list.splice(insertIndex, 0, newNode)
      } else {
        list.push(newNode)
      }
      return { node: newNode, step: newStep }
    },

    addParallelStep(nodeId: string, requestId: string): model.FlowStep | null {
      const found = this.findCanvasNode(nodeId)
      if (!found) return null
      if (!Array.isArray(found.node.steps)) {
        found.node.steps = []
      }
      const newStep = {
        id: generateEntityId('step'),
        request_id: requestId,
        enabled: true
      } as model.FlowStep
      found.node.steps.push(newStep)
      return newStep
    },

    changeStepRequest(stepId: string, newRequestId: string): boolean {
      const found = this.findStepInNodes(stepId)
      if (!found) return false
      found.step.request_id = newRequestId
      return true
    },

    deleteStep(stepId: string): boolean {
      const found = this.findStepInNodes(stepId)
      if (!found) return false
      found.node.steps.splice(found.stepIndex, 1)
      if (this.selectedStepId === stepId) {
        this.selectedStepId = null
      }
      if (found.node.steps.length === 0) {
        if (this.selectedStepId && this.findStepInNodes(this.selectedStepId, [found.node])) {
          this.selectedStepId = null
        }
        found.parentNodes.splice(found.nodeIndex, 1)
      }
      return true
    },

    deleteCanvasNode(nodeId: string): boolean {
      const found = this.findCanvasNode(nodeId)
      if (!found) return false
      if (this.selectedStepId) {
        const stepInside = this.findStepInNodes(this.selectedStepId, [found.node])
        if (stepInside) {
          this.selectedStepId = null
        }
      }
      found.parentNodes.splice(found.nodeIndex, 1)
      return true
    },

    addBranchToNode(
      nodeId: string,
      conditionType?: 'success' | 'error' | 'custom'
    ): model.FlowBranch | null {
      const found = this.findCanvasNode(nodeId)
      if (!found) return null
      if (!Array.isArray(found.node.branches)) {
        found.node.branches = []
      }
      const existingTypes = new Set(
        found.node.branches.map(b => (b.condition?.type || '').toLowerCase())
      )
      let type: 'success' | 'error' | 'custom' = conditionType || 'success'
      if (!conditionType) {
        if (!existingTypes.has('success')) {
          type = 'success'
        } else if (!existingTypes.has('error')) {
          type = 'error'
        } else {
          type = 'custom'
        }
      }

      const condition: model.FlowBranchCondition =
        type === 'custom'
          ? ({
              type: 'custom',
              source: 'status_code',
              path: '',
              operator: '==',
              value: '200'
            } as model.FlowBranchCondition)
          : ({
              type
            } as model.FlowBranchCondition)

      const newBranch = {
        id: generateEntityId('branch'),
        name:
          type === 'success'
            ? 'Thành công'
            : type === 'error'
              ? 'Khi Lỗi'
              : 'Điều kiện tùy chỉnh',
        condition,
        nodes: []
      } as unknown as model.FlowBranch

      found.node.branches.push(newBranch)
      return newBranch
    },

    deleteBranchFromNode(nodeId: string, branchId: string): boolean {
      const found = this.findCanvasNode(nodeId)
      if (!found || !Array.isArray(found.node.branches)) return false
      const idx = found.node.branches.findIndex(b => b.id === branchId)
      if (idx === -1) return false
      const branch = found.node.branches[idx]
      if (this.selectedStepId && Array.isArray(branch.nodes)) {
        if (this.findStepInNodes(this.selectedStepId, branch.nodes)) {
          this.selectedStepId = null
        }
      }
      found.node.branches.splice(idx, 1)
      return true
    },

    moveCanvasNode(nodeId: string, direction: 'up' | 'down'): boolean {
      const found = this.findCanvasNode(nodeId)
      if (!found) return false
      const targetIndex = direction === 'up' ? found.nodeIndex - 1 : found.nodeIndex + 1
      if (targetIndex < 0 || targetIndex >= found.parentNodes.length) return false
      const [removed] = found.parentNodes.splice(found.nodeIndex, 1)
      found.parentNodes.splice(targetIndex, 0, removed)
      return true
    },

    reorderCanvasNodes(sourceNodeId: string, targetNodeId: string): boolean {
      if (!sourceNodeId || !targetNodeId || sourceNodeId === targetNodeId) return false
      const src = this.findCanvasNode(sourceNodeId)
      const dst = this.findCanvasNode(targetNodeId)
      if (!src || !dst || src.parentNodes !== dst.parentNodes) return false
      const targetIndex = dst.nodeIndex
      const [removed] = src.parentNodes.splice(src.nodeIndex, 1)
      src.parentNodes.splice(targetIndex, 0, removed)
      return true
    },

    // =========================================================================
    // Live Flow Execution Actions (`runCurrentFlow` & `stopCurrentFlow`)
    // =========================================================================

    async runCurrentFlow(): Promise<FlowRunSummary | null> {
      if (!this.currentFlow || this.isRunning) return null

      const runSeq = ++flowRunSeq
      const isStaleRun = () => runSeq !== flowRunSeq

      const startTime = Date.now()
      this.isRunning = true
      this.abortRequested = false
      this.lastRunSummary = null
      this.nodeStates = {}
      this.branchStates = {}
      this.stepStates = {}
      this.stepResults = {}

      const initGraphStates = (nodes?: model.FlowNode[]) => {
        if (!Array.isArray(nodes)) return
        for (const node of nodes) {
          if (!node) continue
          this.nodeStates[node.id] = 'idle'
          if (Array.isArray(node.steps)) {
            for (const step of node.steps) {
              if (!step) continue
              const initial: FlowStepExecutionState = {
                stepId: step.id,
                nodeId: node.id,
                requestId: step.request_id,
                status: 'idle'
              }
              this.stepStates[step.id] = initial
              this.stepResults[step.id] = initial
            }
          }
          if (Array.isArray(node.branches)) {
            for (const br of node.branches) {
              if (!br) continue
              this.branchStates[br.id] = 'idle'
              if (Array.isArray(br.nodes)) {
                initGraphStates(br.nodes)
              }
            }
          }
        }
      }
      initGraphStates(this.currentFlow.nodes)

      const { useCollectionStore } = await import('./collectionStore')
      const { useEnvironmentStore } = await import('./environmentStore')
      const { useRequestStore } = await import('./requestStore')
      const collectionStore = useCollectionStore()
      const envStore = useEnvironmentStore()
      const requestStore = useRequestStore()

      const loadFolderFn = getAppFn('LoadFolder')
      const getRequestFn = getAppFn('GetRequest')
      const sendRequestFn = getAppFn('SendRequest')

      // Collect all folders from collectionStore.tree and enrich via LoadFolder when available
      const collectedFolders: TreeNode[] = []
      const walkFolders = (items: TreeNode[] | undefined) => {
        if (!Array.isArray(items)) return
        for (const item of items) {
          if (item && item.type === 'folder') {
            collectedFolders.push(deepClone(item))
            if (Array.isArray(item.children)) {
              walkFolders(item.children)
            }
          }
        }
      }
      walkFolders(collectionStore.tree)

      if (loadFolderFn && collectedFolders.length > 0) {
        await Promise.all(
          collectedFolders.map(async folder => {
            try {
              const res = await loadFolderFn(folder.id)
              if (res?.success && res.data) {
                const fData = res.data as any
                if (Array.isArray(fData.variables)) folder.variables = fData.variables
                if (fData.folder_envs) folder.folder_envs = fData.folder_envs
                if (Array.isArray(fData.headers)) folder.headers = fData.headers
                if (fData.auth) folder.auth = fData.auth
                if (fData.auth_envs) folder.auth_envs = fData.auth_envs
              }
            } catch {
              // ignore folder load failure in tests
            }
          })
        )
      }

      let mutableCollection: FlowMutableCollectionModel = deepClone(
        (collectionStore.activeCollection as any) || {
          id: collectionStore.activeCollectionId || 'default',
          name: 'Default',
          variables: []
        }
      )
      let mutableEnvironments: FlowMutableEnvironmentModel[] = deepClone(
        (envStore.environments as any) || []
      )
      const activeEnvId: string | null =
        envStore.activeEnvId || mutableCollection.active_env_id || null
      let allFolders: TreeNode[] = deepClone(collectedFolders)
      const accumulatedFolderIds: string[] = []

      const recordOrderedFolderId = (fid: string | undefined | null) => {
        if (!fid) return
        const idx = accumulatedFolderIds.indexOf(fid)
        if (idx !== -1) accumulatedFolderIds.splice(idx, 1)
        accumulatedFolderIds.push(fid)
      }

      const initialMerged = mergeParallelScriptUpdates(
        {
          collection: mutableCollection,
          environments: mutableEnvironments,
          activeEnvId,
          allFolders,
          orderedStepFolderIds: accumulatedFolderIds
        },
        [],
        accumulatedFolderIds
      )
      let currentResolvedVars: Record<string, string> = initialMerged.resolvedVariables || {}

      const maxSteps =
        this.currentFlow.max_steps && this.currentFlow.max_steps > 0
          ? this.currentFlow.max_steps
          : 100
      const flowTimeoutMs =
        this.currentFlow.timeout_ms && this.currentFlow.timeout_ms > 0
          ? this.currentFlow.timeout_ms
          : 0

      let stepsExecuted = 0
      let stepsPassed = 0
      let stepsFailed = 0
      let stepsSkipped = 0
      const countedSkippedStepIds = new Set<string>()
      let halted = false
      let unhandledFailure = false
      let haltedError = ''

      const setStepState = (stepId: string, patch: Partial<FlowStepExecutionState>) => {
        if (isStaleRun()) return
        const prev = this.stepStates[stepId] || {
          stepId,
          nodeId: '',
          requestId: '',
          status: 'idle' as FlowExecutionStatus
        }
        const updated: FlowStepExecutionState = { ...prev, ...patch }
        this.stepStates[stepId] = updated
        this.stepResults[stepId] = updated
      }

      const markNodesSkipped = (nodes?: model.FlowNode[]) => {
        if (isStaleRun() || !Array.isArray(nodes)) return
        for (const node of nodes) {
          if (!node) continue
          this.nodeStates[node.id] = 'skipped'
          if (Array.isArray(node.steps)) {
            for (const st of node.steps) {
              if (!st) continue
              const curStatus = this.stepStates[st.id]?.status
              if (curStatus === 'passed' || curStatus === 'failed') continue
              if (!countedSkippedStepIds.has(st.id)) {
                countedSkippedStepIds.add(st.id)
                stepsSkipped++
              }
              setStepState(st.id, {
                stepId: st.id,
                nodeId: node.id,
                requestId: st.request_id,
                status: 'skipped'
              })
            }
          }
          if (Array.isArray(node.branches)) {
            for (const br of node.branches) {
              if (!br) continue
              this.branchStates[br.id] = 'skipped'
              if (Array.isArray(br.nodes)) {
                markNodesSkipped(br.nodes)
              }
            }
          }
        }
      }

      const markBranchSkipped = (br: model.FlowBranch) => {
        if (isStaleRun() || !br) return
        this.branchStates[br.id] = 'skipped'
        if (Array.isArray(br.nodes)) {
          markNodesSkipped(br.nodes)
        }
      }

      const resolveStepRequestAndFolders = async (
        requestId: string,
        foldersSnapshot: TreeNode[]
      ): Promise<{ req: Request | null; pathFolders: TreeNode[]; missing: boolean }> => {
        const trimmedId = (requestId || '').trim()
        if (!trimmedId) {
          return { req: null, pathFolders: [], missing: true }
        }

        const hasTree = Array.isArray(collectionStore.tree) && collectionStore.tree.length > 0
        const treeNode = hasTree
          ? collectionStore.findNode(collectionStore.tree, trimmedId)
          : null

        if (hasTree && (!treeNode || treeNode.type === 'folder')) {
          return { req: null, pathFolders: [], missing: true }
        }

        const rawPathNodes = hasTree
          ? (collectionStore.findFolderPath(collectionStore.tree, trimmedId) || []).filter(
              n => n.type === 'folder'
            )
          : []
        const syncedPathFolders = rawPathNodes.map(pf => {
          const foundInAll = foldersSnapshot.find(af => af.id === pf.id)
          return deepClone(foundInAll || pf)
        })

        let loadedReq: Request | null = null
        if (getRequestFn) {
          try {
            const res = await getRequestFn(trimmedId)
            if (res !== undefined) {
              if (!res?.success || !res.data) {
                return { req: null, pathFolders: syncedPathFolders, missing: true }
              }
              loadedReq = deepClone(res.data as Request)
            }
          } catch {
            return { req: null, pathFolders: syncedPathFolders, missing: true }
          }
        }

        if (!loadedReq && requestStore.current && requestStore.current.id === trimmedId) {
          loadedReq = deepClone(requestStore.current)
        }

        if (!loadedReq && treeNode && treeNode.type !== 'folder') {
          loadedReq = {
            id: treeNode.id,
            name: treeNode.name,
            method: treeNode.method || 'GET',
            url: treeNode.url || 'http://localhost',
            headers: deepClone((treeNode as any).headers || []),
            params: deepClone((treeNode as any).params || []),
            path_params: deepClone((treeNode as any).path_params || []),
            body: deepClone(treeNode.body || { type: 'none', content: '' }) as any,
            auth: deepClone(treeNode.auth || { type: 'inherit' }),
            auth_envs: deepClone(treeNode.auth_envs),
            scripts: deepClone((treeNode as any).scripts),
            created_at: treeNode.created_at || '',
            updated_at: ''
          }
        }

        if (!loadedReq) {
          return { req: null, pathFolders: syncedPathFolders, missing: true }
        }

        return { req: loadedReq, pathFolders: syncedPathFolders, missing: false }
      }

      interface ExecutedStepRawResult {
        step: model.FlowStep
        nodeId: string
        missing: boolean
        req: Request | null
        execReqMethod?: string
        execReqUrl?: string
        pathFolders: TreeNode[]
        preScriptResult: ScriptExecutionResult | null
        postScriptResult: ScriptExecutionResult | null
        response: ExecuteResponse | null
        errorObj: { code: string; message: string } | null
        networkError: string | null
        scriptError: string | null
        testResults: ScriptTestResult[]
        executionLogs: ExecutionLogRecord[]
        scriptLogs: string[]
        durationMs: number
      }

      const executeSingleStepWithSnapshot = async (
        step: model.FlowStep,
        nodeId: string,
        snapshot: {
          collection: FlowMutableCollectionModel
          environments: FlowMutableEnvironmentModel[]
          activeEnvId: string | null
          allFolders: TreeNode[]
        }
      ): Promise<ExecutedStepRawResult> => {
        const stepStart = Date.now()
        const { req, pathFolders, missing } = await resolveStepRequestAndFolders(
          step.request_id,
          snapshot.allFolders
        )

        if (this.abortRequested || isStaleRun()) {
          return {
            step,
            nodeId,
            missing: false,
            req,
            pathFolders,
            preScriptResult: null,
            postScriptResult: null,
            response: null,
            errorObj: {
              code: 'ABORTED',
              message: 'Đã dừng Flow theo yêu cầu người dùng'
            },
            networkError: 'Đã dừng Flow theo yêu cầu người dùng',
            scriptError: null,
            testResults: [],
            executionLogs: [],
            scriptLogs: [],
            durationMs: Math.max(0, Date.now() - stepStart)
          }
        }

        if (missing || !req) {
          return {
            step,
            nodeId,
            missing: true,
            req: null,
            pathFolders,
            preScriptResult: null,
            postScriptResult: null,
            response: null,
            errorObj: {
              code: 'NOT_FOUND',
              message: 'Request gốc không tồn tại (đã bị xóa)'
            },
            networkError: null,
            scriptError: null,
            testResults: [],
            executionLogs: [],
            scriptLogs: [],
            durationMs: 0
          }
        }

        const preOut = prepareRequestExecution({
          request: req,
          collection: snapshot.collection,
          environments: snapshot.environments,
          activeEnvId: snapshot.activeEnvId,
          pathFolders,
          allFolders: snapshot.allFolders
        })

        const effectiveTimeout =
          step.timeout_ms && step.timeout_ms > 0 ? step.timeout_ms : flowTimeoutMs
        const execReq = {
          ...preOut.executeRequest,
          ...(effectiveTimeout > 0 ? { timeout_ms: effectiveTimeout } : {})
        }

        const executionLogs: ExecutionLogRecord[] = []
        const scriptLogs: string[] = []
        const testResults: ScriptTestResult[] = []
        let scriptError: string | null = null

        if (preOut.preScriptResult) {
          if (preOut.preScriptResult.logs?.length > 0) {
            scriptLogs.push(...preOut.preScriptResult.logs.map(l => `[Pre-request] ${l}`))
          }
          for (const entry of preOut.preScriptResult.logEntries || []) {
            executionLogs.push({
              id: `flow-log-${Date.now()}-${++flowLogSeq}`,
              timestamp: entry.timestamp,
              phase: 'pre-request',
              level: entry.level,
              message: entry.message
            })
          }
          if (preOut.preScriptResult.testResults?.length > 0) {
            testResults.push(...preOut.preScriptResult.testResults)
          }
          if (!preOut.preScriptResult.success) {
            scriptError = preOut.preScriptResult.error || 'Lỗi thực thi Pre-request Script'
          }
        }

        let response: ExecuteResponse | null = null
        let errorObj: { code: string; message: string } | null = null
        let networkError: string | null = null
        let postScriptResult: ScriptExecutionResult | null = null

        if (!sendRequestFn) {
          networkError = 'SendRequest binding is not available'
          errorObj = { code: 'UNAVAILABLE', message: networkError }
        } else {
          try {
            const sendRes = await sendRequestFn(execReq as any)
            if (isStaleRun()) {
              return {
                step,
                nodeId,
                missing: false,
                req: preOut.effectiveRequest,
                execReqMethod: execReq.method,
                execReqUrl: execReq.url,
                pathFolders,
                preScriptResult: preOut.preScriptResult,
                postScriptResult: null,
                response: null,
                errorObj: {
                  code: 'ABORTED',
                  message: 'Đã dừng Flow theo yêu cầu người dùng'
                },
                networkError: 'Đã dừng Flow theo yêu cầu người dùng',
                scriptError,
                testResults,
                executionLogs,
                scriptLogs,
                durationMs: Math.max(0, Date.now() - stepStart)
              }
            }
            if (sendRes?.success && sendRes.data) {
              response = sendRes.data as ExecuteResponse
              executionLogs.push({
                id: `flow-log-${Date.now()}-${++flowLogSeq}`,
                timestamp: response.timestamp || new Date().toISOString(),
                phase: 'http',
                level: response.status_code >= 400 ? 'warn' : 'info',
                message: `${execReq.method} ${execReq.url} → ${response.status_code} ${response.status_text} (${response.time_ms}ms)`,
                detail: {
                  method: execReq.method,
                  url: execReq.url,
                  requestHeaders: (execReq.headers || []).map(h => ({
                    key: h.key,
                    value: h.value
                  })),
                  requestBody: execReq.body || '',
                  statusCode: response.status_code,
                  statusText: response.status_text,
                  timeMs: response.time_ms,
                  sizeBytes: response.size_bytes,
                  responseHeaders: response.headers,
                  responseBodyPreview: (response.body || '').slice(0, 1000)
                }
              })

              postScriptResult = finalizeResponseExecution({
                effectiveRequest: preOut.effectiveRequest,
                response,
                resolvedVariables: preOut.resolvedVariables,
                collection: preOut.mutatedCollection,
                environments: preOut.mutatedEnvironments,
                activeEnvId: snapshot.activeEnvId,
                pathFolders: preOut.mutatedPathFolders,
                allFolders: preOut.mutatedAllFolders
              })

              if (postScriptResult) {
                if (postScriptResult.logs?.length > 0) {
                  scriptLogs.push(...postScriptResult.logs.map(l => `[Post-response] ${l}`))
                }
                for (const entry of postScriptResult.logEntries || []) {
                  executionLogs.push({
                    id: `flow-log-${Date.now()}-${++flowLogSeq}`,
                    timestamp: entry.timestamp,
                    phase: 'post-response',
                    level: entry.level,
                    message: entry.message
                  })
                }
                if (postScriptResult.testResults?.length > 0) {
                  testResults.push(...postScriptResult.testResults)
                }
                if (!postScriptResult.success) {
                  const pErr =
                    postScriptResult.error || 'Lỗi thực thi Post-response Script'
                  scriptError = scriptError ? `${scriptError}; ${pErr}` : pErr
                }
              }
            } else {
              const code = sendRes?.error?.code || 'CONNECTION_ERROR'
              const msg = sendRes?.error?.message || 'Lỗi kết nối HTTP'
              networkError = msg
              errorObj = { code, message: msg }
              executionLogs.push({
                id: `flow-log-${Date.now()}-${++flowLogSeq}`,
                timestamp: new Date().toISOString(),
                phase: 'http',
                level: 'error',
                message: `${execReq.method} ${execReq.url} → LỖI [${code}]: ${msg}`,
                detail: {
                  method: execReq.method,
                  url: execReq.url,
                  requestHeaders: (execReq.headers || []).map(h => ({
                    key: h.key,
                    value: h.value
                  })),
                  requestBody: execReq.body || ''
                }
              })
            }
          } catch (err) {
            const msg = String(err)
            networkError = msg
            errorObj = { code: 'UNKNOWN', message: msg }
            executionLogs.push({
              id: `flow-log-${Date.now()}-${++flowLogSeq}`,
              timestamp: new Date().toISOString(),
              phase: 'http',
              level: 'error',
              message: `${execReq.method} ${execReq.url} → ${msg}`
            })
          }
        }

        const durationMs =
          response && typeof response.time_ms === 'number' && response.time_ms >= 0
            ? response.time_ms
            : Math.max(0, Date.now() - stepStart)

        return {
          step,
          nodeId,
          missing: false,
          req: preOut.effectiveRequest,
          execReqMethod: execReq.method,
          execReqUrl: execReq.url,
          pathFolders,
          preScriptResult: preOut.preScriptResult,
          postScriptResult,
          response,
          errorObj,
          networkError,
          scriptError,
          testResults,
          executionLogs,
          scriptLogs,
          durationMs
        }
      }

      const persistMergedUpdatesOnce = async (mergedRes: ScriptExecutionResult) => {
        if (isStaleRun()) return

        const envUpdateKeys = Object.keys(mergedRes.envUpdates || {})
        const hasEnvUpdates = envUpdateKeys.length > 0
        const scoped = mergedRes.scopedEnvUpdates
        const hasScopedEnv = Boolean(
          scoped &&
            (Object.keys(scoped.collection || {}).length > 0 ||
              Object.keys(scoped.globalEnvs || {}).length > 0 ||
              Object.keys(scoped.folderGlobals || {}).length > 0 ||
              (Array.isArray(scoped.folderEnvs) && scoped.folderEnvs.length > 0))
        )
        const authUpd = mergedRes.scopedAuthUpdates
        const hasScopedAuth = Boolean(
          authUpd &&
            (authUpd.collectionGlobal !== undefined ||
              (Array.isArray(authUpd.collectionEnvs) && authUpd.collectionEnvs.length > 0) ||
              Object.keys(authUpd.folderGlobals || {}).length > 0 ||
              (Array.isArray(authUpd.folderEnvs) && authUpd.folderEnvs.length > 0))
        )

        if (hasEnvUpdates && !hasScopedEnv) {
          await envStore.applyVariableUpdates(mergedRes.envUpdates)
        } else if (hasScopedEnv) {
          // Fold any default envUpdates into effectiveScoped using the declaration-order winning values
          const effectiveScoped = deepClone(mergedRes.scopedEnvUpdates)
          if (hasEnvUpdates) {
            const activeEnvObj = activeEnvId
              ? mutableEnvironments.find(e => e && e.id === activeEnvId)
              : null
            if (activeEnvObj && activeEnvId) {
              if (!effectiveScoped.globalEnvs[activeEnvId]) {
                effectiveScoped.globalEnvs[activeEnvId] = {}
              }
              for (const k of envUpdateKeys) {
                const winningPair = (activeEnvObj.variables || []).find(v => v && v.key === k)
                effectiveScoped.globalEnvs[activeEnvId][k] = winningPair
                  ? winningPair.value
                  : mergedRes.envUpdates[k]
              }
            } else {
              for (const k of envUpdateKeys) {
                const winningPair = (mutableCollection.variables || []).find(
                  v => v && v.key === k
                )
                effectiveScoped.collection[k] = winningPair
                  ? winningPair.value
                  : mergedRes.envUpdates[k]
              }
            }
          }
          await envStore.applyScopedVariableUpdates(effectiveScoped, allFolders)
        }

        if (isStaleRun()) return
        if (hasScopedAuth) {
          await envStore.applyScopedAuthUpdates(mergedRes.scopedAuthUpdates, allFolders)
        }

        if (isStaleRun()) return
        // Sync in-memory stores with merged state
        if (collectionStore.activeCollection && mutableCollection.variables) {
          collectionStore.activeCollection.variables = deepClone(
            mutableCollection.variables
          ) as any
        }
        if (Array.isArray(mutableEnvironments) && mutableEnvironments.length > 0) {
          envStore.environments = deepClone(mutableEnvironments) as any
        }
      }

      const buildBranchEvalContext = (raw: ExecutedStepRawResult | undefined): BranchEvalContext => ({
        statusCode: raw?.response?.status_code ?? null,
        responseBody: raw?.response?.body ?? null,
        variables: currentResolvedVars,
        requestMissing: raw?.missing ?? false,
        networkError: raw?.networkError ?? null
      })

      const executeNodeList = async (nodes: model.FlowNode[]): Promise<void> => {
        for (let nodeIdx = 0; nodeIdx < nodes.length; nodeIdx++) {
          if (isStaleRun()) return
          const node = nodes[nodeIdx]
          if (!node) continue

          if (halted || this.abortRequested) {
            markNodesSkipped(nodes.slice(nodeIdx))
            return
          }

          const allSteps = Array.isArray(node.steps) ? node.steps : []
          const enabledSteps: model.FlowStep[] = []
          for (const st of allSteps) {
            if (!st) continue
            if (st.enabled === false) {
              if (!countedSkippedStepIds.has(st.id)) {
                countedSkippedStepIds.add(st.id)
                stepsSkipped++
              }
              setStepState(st.id, {
                stepId: st.id,
                nodeId: node.id,
                requestId: st.request_id,
                status: 'skipped'
              })
            } else {
              enabledSteps.push(st)
            }
          }

          if (enabledSteps.length === 0) {
            this.nodeStates[node.id] = 'skipped'
            for (const br of node.branches || []) {
              markBranchSkipped(br)
            }
            continue
          }

          if (stepsExecuted >= maxSteps) {
            haltedError = `Đã vượt quá giới hạn số bước thực thi tối đa (max_steps = ${maxSteps})`
            halted = true
            unhandledFailure = true
            markNodesSkipped(nodes.slice(nodeIdx))
            return
          }

          let hitMaxStepsMidRow = false
          let stepsToRun = enabledSteps
          if (stepsExecuted + enabledSteps.length > maxSteps) {
            const allowed = maxSteps - stepsExecuted
            stepsToRun = enabledSteps.slice(0, allowed)
            const skippedOverflow = enabledSteps.slice(allowed)
            for (const st of skippedOverflow) {
              if (!countedSkippedStepIds.has(st.id)) {
                countedSkippedStepIds.add(st.id)
                stepsSkipped++
              }
              setStepState(st.id, {
                stepId: st.id,
                nodeId: node.id,
                requestId: st.request_id,
                status: 'skipped'
              })
            }
            hitMaxStepsMidRow = true
          }

          // Mark node and steps as running
          this.nodeStates[node.id] = 'running'
          for (const st of stepsToRun) {
            setStepState(st.id, {
              stepId: st.id,
              nodeId: node.id,
              requestId: st.request_id,
              status: 'running'
            })
          }

          let executedResults: ExecutedStepRawResult[] = []
          if (stepsToRun.length === 1) {
            const singleSnapshot = {
              collection: deepClone(mutableCollection),
              environments: deepClone(mutableEnvironments),
              activeEnvId,
              allFolders: deepClone(allFolders)
            }
            const res = await executeSingleStepWithSnapshot(
              stepsToRun[0],
              node.id,
              singleSnapshot
            )
            executedResults = [res]
          } else {
            // Parallel row (>= 2 steps): clone context per step and execute concurrently via Promise.all
            const snapshots = stepsToRun.map(() => ({
              collection: deepClone(mutableCollection),
              environments: deepClone(mutableEnvironments),
              activeEnvId,
              allFolders: deepClone(allFolders)
            }))
            executedResults = await Promise.all(
              stepsToRun.map((st, idx) =>
                executeSingleStepWithSnapshot(st, node.id, snapshots[idx])
              )
            )
          }

          if (isStaleRun()) return

          if (this.abortRequested) {
            halted = true
            unhandledFailure = true
            for (const r of executedResults) {
              stepsExecuted++
              const completedNormally =
                Boolean(r.response) && !r.networkError && r.errorObj?.code !== 'ABORTED'
              if (completedNormally) {
                const verdict = evaluateStepVerdict({
                  requestMissing: false,
                  networkError: null,
                  scriptError: r.scriptError,
                  scriptTests: r.testResults,
                  statusCode: r.response?.status_code ?? null
                })
                if (verdict.passed) {
                  stepsPassed++
                } else {
                  stepsFailed++
                }
                setStepState(r.step.id, {
                  stepId: r.step.id,
                  nodeId: node.id,
                  requestId: r.step.request_id,
                  requestName: r.req?.name,
                  method: r.execReqMethod || r.req?.method,
                  url: r.execReqUrl || r.req?.url,
                  status: verdict.passed ? 'passed' : 'failed',
                  statusCode: r.response?.status_code ?? null,
                  status_code: r.response?.status_code ?? null,
                  durationMs: r.durationMs,
                  duration_ms: r.durationMs,
                  response: r.response,
                  error: verdict.passed
                    ? null
                    : {
                        code: verdict.failureCategory || 'STEP_FAILED',
                        message: verdict.failureReason || 'Bước thực thi thất bại'
                      },
                  failureCategory: verdict.failureCategory,
                  failureReason: verdict.failureReason,
                  testResults: r.testResults,
                  executionLogs: r.executionLogs,
                  scriptLogs: r.scriptLogs,
                  scriptError: r.scriptError
                })
              } else {
                stepsFailed++
                setStepState(r.step.id, {
                  stepId: r.step.id,
                  nodeId: node.id,
                  requestId: r.step.request_id,
                  status: 'failed',
                  error: { code: 'ABORTED', message: 'Đã dừng Flow theo yêu cầu người dùng' },
                  failureReason: 'Đã dừng Flow theo yêu cầu người dùng'
                })
              }
            }
            if (!haltedError) {
              haltedError = 'Đã dừng Flow theo yêu cầu người dùng'
            }
            this.nodeStates[node.id] = 'failed'
            for (const br of node.branches || []) {
              markBranchSkipped(br)
            }
            if (nodeIdx + 1 < nodes.length) {
              markNodesSkipped(nodes.slice(nodeIdx + 1))
            }
            return
          }

          // Record folder order and merge parallel/sequential script updates in declaration order (0 -> N-1)
          for (const r of executedResults) {
            for (const pf of r.pathFolders) {
              recordOrderedFolderId(pf.id)
            }
          }

          const mutationItems: ParallelStepMutationItem[] = executedResults.map(r => ({
            stepId: r.step.id,
            requestId: r.step.request_id,
            pathFolders: r.pathFolders,
            preScriptResult: r.preScriptResult,
            postScriptResult: r.postScriptResult
          }))

          const mergedState = mergeParallelScriptUpdates(
            {
              collection: mutableCollection,
              environments: mutableEnvironments,
              activeEnvId,
              allFolders,
              orderedStepFolderIds: accumulatedFolderIds
            },
            mutationItems,
            accumulatedFolderIds
          )

          for (const fid of Object.keys(
            mergedState.mergedScriptResult.scopedEnvUpdates?.folderGlobals || {}
          )) {
            recordOrderedFolderId(fid)
          }
          for (const fe of mergedState.mergedScriptResult.scopedEnvUpdates?.folderEnvs || []) {
            if (fe?.folder) recordOrderedFolderId(fe.folder)
          }

          mutableCollection = mergedState.collection
          mutableEnvironments = mergedState.environments
          allFolders = mergedState.allFolders as TreeNode[]
          currentResolvedVars = mergedState.resolvedVariables || {}

          // Persist variable/auth updates to disk ONCE per step / parallel row
          await persistMergedUpdatesOnce(mergedState.mergedScriptResult)
          if (isStaleRun()) return

          // Evaluate verdicts in declaration order
          let nodePassed = true
          let firstFailedRaw: ExecutedStepRawResult | undefined
          let firstFailedReason = ''
          let lastExecutedRaw: ExecutedStepRawResult | undefined

          for (const r of executedResults) {
            lastExecutedRaw = r
            stepsExecuted++

            const verdict = r.missing
              ? evaluateStepVerdict({ requestMissing: true })
              : evaluateStepVerdict({
                  requestMissing: false,
                  networkError: r.networkError,
                  scriptError: r.scriptError,
                  scriptTests: r.testResults,
                  statusCode: r.response?.status_code ?? null
                })

            const stepStatus: FlowExecutionStatus = verdict.passed ? 'passed' : 'failed'
            if (verdict.passed) {
              stepsPassed++
            } else {
              stepsFailed++
              nodePassed = false
              if (!firstFailedRaw) {
                firstFailedRaw = r
              }
              if (!firstFailedReason && verdict.failureReason) {
                firstFailedReason = verdict.failureReason
              }
            }

            const effectiveError =
              r.errorObj ||
              (verdict.passed
                ? null
                : {
                    code: verdict.failureCategory || 'STEP_FAILED',
                    message: verdict.failureReason || 'Bước thực thi thất bại'
                  })

            setStepState(r.step.id, {
              stepId: r.step.id,
              nodeId: node.id,
              requestId: r.step.request_id,
              requestName: r.req?.name,
              method: r.execReqMethod || r.req?.method,
              url: r.execReqUrl || r.req?.url,
              status: stepStatus,
              statusCode: r.response?.status_code ?? null,
              status_code: r.response?.status_code ?? null,
              durationMs: r.durationMs,
              duration_ms: r.durationMs,
              response: r.response,
              error: effectiveError,
              failureCategory: verdict.failureCategory,
              failureReason: verdict.failureReason,
              testResults: r.testResults,
              executionLogs: r.executionLogs,
              scriptLogs: r.scriptLogs,
              scriptError: r.scriptError
            })
          }

          if (hitMaxStepsMidRow) {
            this.nodeStates[node.id] = 'failed'
            haltedError = `Đã vượt quá giới hạn số bước thực thi tối đa (max_steps = ${maxSteps})`
            halted = true
            unhandledFailure = true
            for (const br of node.branches || []) {
              markBranchSkipped(br)
            }
            if (nodeIdx + 1 < nodes.length) {
              markNodesSkipped(nodes.slice(nodeIdx + 1))
            }
            return
          }

          this.nodeStates[node.id] = nodePassed ? 'passed' : 'failed'

          // Branch evaluation in strict declaration order (0..K-1)
          const branches = Array.isArray(node.branches) ? node.branches : []
          if (branches.length === 0) {
            if (!nodePassed) {
              if (!haltedError && firstFailedReason) {
                haltedError = firstFailedReason
              }
              halted = true
              unhandledFailure = true
              if (nodeIdx + 1 < nodes.length) {
                markNodesSkipped(nodes.slice(nodeIdx + 1))
              }
              return
            }
            continue
          }

          const repStep = !nodePassed && firstFailedRaw ? firstFailedRaw : lastExecutedRaw
          let matchedBranchId: string | null = null
          let skippedBranchIds: string[] = []

          for (const br of branches) {
            if (!br || !br.condition) continue
            const condType = (br.condition.type || '').trim().toLowerCase()
            if (condType !== 'custom') continue
            let isMatch = false
            for (const cand of executedResults) {
              if (evaluateCustomBranchCondition(br.condition, buildBranchEvalContext(cand))) {
                isMatch = true
                break
              }
            }
            if (isMatch) {
              matchedBranchId = br.id
              skippedBranchIds = branches.filter(b => b && b.id !== br.id).map(b => b.id)
              break
            }
          }

          if (!matchedBranchId) {
            const sel = selectMatchingBranch(
              branches,
              nodePassed,
              buildBranchEvalContext(repStep)
            )
            matchedBranchId = sel.matchedBranchId
            skippedBranchIds = sel.skippedBranchIds
          }

          for (const skipId of skippedBranchIds) {
            const skipBr = branches.find(b => b && b.id === skipId)
            if (skipBr) markBranchSkipped(skipBr)
          }

          if (!matchedBranchId) {
            for (const br of branches) {
              markBranchSkipped(br)
            }
            if (!nodePassed) {
              if (!haltedError && firstFailedReason) {
                haltedError = firstFailedReason
              }
              halted = true
              unhandledFailure = true
              if (nodeIdx + 1 < nodes.length) {
                markNodesSkipped(nodes.slice(nodeIdx + 1))
              }
              return
            }
            continue
          }

          this.branchStates[matchedBranchId] = 'active'
          const matchedBranch = branches.find(b => b && b.id === matchedBranchId)
          if (matchedBranch && Array.isArray(matchedBranch.nodes) && matchedBranch.nodes.length > 0) {
            await executeNodeList(matchedBranch.nodes)
          }

          if (halted || this.abortRequested) {
            if (nodeIdx + 1 < nodes.length) {
              markNodesSkipped(nodes.slice(nodeIdx + 1))
            }
            return
          }
        }
      }

      try {
        await executeNodeList(this.currentFlow.nodes || [])
      } finally {
        if (!isStaleRun()) {
          const totalDurationMs = Math.max(0, Date.now() - startTime)
          const overallStatus: 'passed' | 'failed' =
            halted || unhandledFailure || this.abortRequested ? 'failed' : 'passed'
          const stepsTotal = stepsPassed + stepsFailed + stepsSkipped

          this.lastRunSummary = {
            status: overallStatus,
            stepsTotal,
            steps_total: stepsTotal,
            stepsExecuted,
            steps_executed: stepsExecuted,
            stepsPassed,
            steps_passed: stepsPassed,
            stepsFailed,
            steps_failed: stepsFailed,
            stepsSkipped,
            steps_skipped: stepsSkipped,
            durationMs: totalDurationMs,
            duration_ms: totalDurationMs,
            ...(haltedError ? { haltedError, halted_error: haltedError } : {})
          }
          this.isRunning = false
        }
      }

      return isStaleRun() ? null : this.lastRunSummary
    },

    async stopCurrentFlow(): Promise<void> {
      this.abortRequested = true
      const abortRequestFn = getAppFn('AbortRequest')
      if (abortRequestFn) {
        try {
          await abortRequestFn()
        } catch {
          // ignore abort errors
        }
      }

      for (const [stepId, st] of Object.entries(this.stepStates)) {
        if (!st) continue
        if (st.status === 'running') {
          const updated: FlowStepExecutionState = {
            ...st,
            status: 'failed',
            error: { code: 'ABORTED', message: 'Đã dừng Flow theo yêu cầu người dùng' },
            failureReason: 'Đã dừng Flow theo yêu cầu người dùng'
          }
          this.stepStates[stepId] = updated
          this.stepResults[stepId] = updated
        } else if (st.status === 'idle') {
          const updated: FlowStepExecutionState = {
            ...st,
            status: 'skipped'
          }
          this.stepStates[stepId] = updated
          this.stepResults[stepId] = updated
        }
      }

      for (const [nodeId, nStatus] of Object.entries(this.nodeStates)) {
        if (nStatus === 'running') {
          this.nodeStates[nodeId] = 'failed'
        } else if (nStatus === 'idle') {
          this.nodeStates[nodeId] = 'skipped'
        }
      }

      for (const [branchId, bStatus] of Object.entries(this.branchStates)) {
        if (bStatus === 'idle') {
          this.branchStates[branchId] = 'skipped'
        }
      }

      this.isRunning = false
    }
  }
})

