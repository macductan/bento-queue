import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import * as AppBinding from '../../../wailsjs/go/main/App'
import { useFlowStore, getMethodBadgeClass } from '../../stores/flowStore'
import { useCollectionStore, type TreeNode } from '../../stores/collectionStore'
import { useEnvironmentStore } from '../../stores/environmentStore'
import { useResponseStore } from '../../stores/responseStore'
import { useUiStore } from '../../stores/uiStore'
import ResponseViewer from '../ResponseViewer.vue'
import RequestPickerModal from '../flow/RequestPickerModal.vue'
import FlowEditor from '../flow/FlowEditor.vue'
import EmptyStateFlow from '../flow/EmptyStateFlow.vue'
import ContentArea from '../ContentArea.vue'

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
  MoveFlowNode: vi.fn(),
  ReorderFlowNodes: vi.fn(),
  SortFlowNodes: vi.fn(),
  LoadFolder: vi.fn(),
  GetRequest: vi.fn(),
  SendRequest: vi.fn(),
  AbortRequest: vi.fn(),
  SaveEnvironment: vi.fn()
}))

const sampleTree: TreeNode[] = [
  {
    id: 'folder-auth',
    name: 'Auth',
    type: 'folder',
    path: 'auth',
    created_at: '2026-01-01T00:00:00Z',
    children: [
      {
        id: 'req-login',
        name: 'Login',
        type: 'request',
        method: 'POST',
        url: 'https://api.example.com/auth/login',
        path: 'auth/login',
        created_at: '2026-01-01T00:00:00Z'
      },
      {
        id: 'req-profile',
        name: 'Get Profile',
        type: 'request',
        method: 'GET',
        url: 'https://api.example.com/auth/profile',
        path: 'auth/profile',
        created_at: '2026-01-01T00:00:00Z'
      }
    ]
  },
  {
    id: 'req-health',
    name: 'Health Check',
    type: 'request',
    method: 'GET',
    url: 'https://api.example.com/health',
    path: 'health',
    created_at: '2026-01-01T00:00:00Z'
  }
]

describe('Story 4: Orthogonal 2-Axis Flowchart UI, RequestPickerModal, Live Execution & StepInspectorPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()

    const collectionStore = useCollectionStore()
    collectionStore.tree = JSON.parse(JSON.stringify(sampleTree))
    collectionStore.activeCollectionId = 'col-1'
    collectionStore.collections = [
      {
        id: 'col-1',
        name: 'Test Collection',
        variables: []
      }
    ] as any

    const envStore = useEnvironmentStore()
    envStore.environments = [
      {
        id: 'env-dev',
        name: 'Dev',
        variables: [{ key: 'base_url', value: 'https://api.example.com', enabled: true }]
      }
    ] as any
    envStore.activeEnvId = 'env-dev'

    vi.mocked(AppBinding.LoadFolder).mockResolvedValue({
      success: true,
      data: { id: 'folder-auth', name: 'Auth', variables: [] }
    } as any)
    vi.mocked(AppBinding.SaveEnvironment).mockResolvedValue({ success: true } as any)
  })

  describe('1. ResponseViewer.vue with overrideData prop', () => {
    it('renders overrideData independently from responseStore and hides collapse button', async () => {
      const responseStore = useResponseStore()
      // Set responseStore to something completely different
      responseStore.response = {
        status_code: 500,
        status_text: '500 Internal Server Error',
        headers: {},
        body: '{"store":"ignored"}',
        size_bytes: 19,
        time_ms: 999,
        timestamp: '2026-01-01T00:00:00Z',
        truncated: false,
        is_binary: false
      }

      const wrapper = mount(ResponseViewer, {
        props: {
          overrideData: {
            response: {
              status_code: 201,
              status_text: '201 Created',
              headers: { 'content-type': ['application/json'] },
              body: '{"step":"override-ok"}',
              size_bytes: 22,
              time_ms: 42,
              timestamp: '2026-01-01T00:00:00Z',
              truncated: false,
              is_binary: false
            },
            testResults: [
              { name: 'status is 201', passed: true },
              { name: 'token exists', passed: false, error: 'Expected token' }
            ],
            executionLogs: [
              {
                id: 'log-1',
                timestamp: '2026-01-01T00:00:00Z',
                phase: 'http',
                level: 'info',
                message: 'POST /auth/login -> 201'
              }
            ],
            scriptLogs: ['[Post-response] logged in']
          }
        }
      })

      expect(wrapper.text()).toContain('201 Created')
      expect(wrapper.text()).toContain('42 ms')
      expect(wrapper.text()).not.toContain('500 Internal Server Error')
      expect(wrapper.find('[data-test="collapse-response-btn"]').exists()).toBe(false)

      // Check Tests tab
      const testsTab = wrapper.find('[data-test="response-tab-tests"]')
      expect(testsTab.exists()).toBe(true)
      expect(testsTab.text()).toContain('Tests (1/2)')

      await testsTab.trigger('click')
      const testsPanel = wrapper.find('[data-test="response-tests-panel"]')
      expect(testsPanel.exists()).toBe(true)
      expect(testsPanel.text()).toContain('status is 201')
      expect(testsPanel.text()).toContain('token exists')
      expect(testsPanel.text()).toContain('Expected token')

      // Check Logs tab renders executionLogs from overrideData
      const logsTab = wrapper.find('[data-test="response-tab-logs"]')
      expect(logsTab.exists()).toBe(true)
      await logsTab.trigger('click')
      expect(wrapper.text()).toContain('POST /auth/login -> 201')
    })

    it('renders overrideData error, scriptError, and scriptLogs independently of responseStore', async () => {
      const responseStore = useResponseStore()
      responseStore.error = null
      responseStore.scriptError = null

      const errorWrapper = mount(ResponseViewer, {
        props: {
          overrideData: {
            response: null,
            error: 'Connection refused on step 2'
          }
        }
      })
      expect(errorWrapper.text()).toContain('Connection refused on step 2')

      const scriptErrWrapper = mount(ResponseViewer, {
        props: {
          overrideData: {
            response: {
              status_code: 200,
              status_text: '200 OK',
              headers: {},
              body: '{}',
              size_bytes: 2,
              time_ms: 5,
              timestamp: '2026-01-01T00:00:00Z',
              truncated: false,
              is_binary: false
            },
            scriptLogs: ['[Post-response] logged in'],
            scriptError: 'ReferenceError: foo is not defined'
          }
        }
      })
      const logsTab = scriptErrWrapper.find('[data-test="response-tab-logs"]')
      await logsTab.trigger('click')
      expect(scriptErrWrapper.text()).toContain('[Post-response] logged in')
      expect(scriptErrWrapper.text()).toContain('ReferenceError: foo is not defined')
    })

    it('falls back 100% to responseStore when overrideData is not provided', () => {
      const responseStore = useResponseStore()
      responseStore.response = {
        status_code: 200,
        status_text: '200 OK',
        headers: { 'content-type': ['text/plain'] },
        body: 'from-response-store',
        size_bytes: 19,
        time_ms: 15,
        timestamp: '2026-01-01T00:00:00Z',
        truncated: false,
        is_binary: false
      }

      const wrapper = mount(ResponseViewer)
      expect(wrapper.text()).toContain('200 OK')
      expect(wrapper.text()).toContain('from-response-store')
      expect(wrapper.find('[data-test="collapse-response-btn"]').exists()).toBe(true)
    })
  })

  describe('2. RequestPickerModal.vue', () => {
    it('flattens collection tree with HTTP method & parent folder path, filters by query, and emits selected request ID', async () => {
      const wrapper = mount(RequestPickerModal, {
        props: {
          open: true
        }
      })

      const items = wrapper.findAll('[data-test="request-picker-item"]')
      expect(items.length).toBe(3)
      expect(items[0].text()).toContain('POST')
      expect(items[0].text()).toContain('Login')
      expect(items[0].text()).toContain('Auth / Login')
      expect(items[2].text()).toContain('GET')
      expect(items[2].text()).toContain('Health Check')
      expect(items[2].text()).toContain('Root')

      // Filter by search input
      const searchInput = wrapper.find('[data-test="request-picker-search-input"]')
      await searchInput.setValue('profile')

      const filteredItems = wrapper.findAll('[data-test="request-picker-item"]')
      expect(filteredItems.length).toBe(1)
      expect(filteredItems[0].text()).toContain('Get Profile')

      await filteredItems[0].trigger('click')
      expect(wrapper.emitted('select')?.[0]?.[0]).toBe('req-profile')
      expect(wrapper.emitted('close')).toBeTruthy()
    })

    it('supports keyboard navigation (ArrowDown, Enter, Escape)', async () => {
      const wrapper = mount(RequestPickerModal, {
        props: { open: true }
      })

      const modal = wrapper.find('[data-test="request-picker-modal"]')
      await modal.trigger('keydown', { key: 'ArrowDown' })
      await modal.trigger('keydown', { key: 'Enter' })

      expect(wrapper.emitted('select')?.[0]?.[0]).toBe('req-profile')

      await modal.trigger('keydown', { key: 'Escape' })
      expect(wrapper.emitted('close')).toBeTruthy()
    })
  })

  describe('3. FlowEditor.vue — Orthogonal 2-Axis Layout & Flowchart Editing', () => {
    it('toggles layout direction [ ↕ Dọc | ↔ Ngang ] and updates orthogonal main-axis & cross-axis flex classes', async () => {
      const flowStore = useFlowStore()
      flowStore.currentFlow = {
        id: 'flow-1',
        name: 'Auth Checkout Flow',
        layout: 'vertical',
        timeout_ms: 30000,
        max_steps: 100,
        nodes: [
          {
            id: 'node-1',
            steps: [
              { id: 'step-1', request_id: 'req-login', enabled: true },
              { id: 'step-2', request_id: 'req-profile', enabled: true }
            ],
            branches: [
              {
                id: 'br-1',
                name: 'Thành công',
                condition: { type: 'success' },
                nodes: []
              }
            ]
          }
        ]
      } as any

      const wrapper = mount(FlowEditor)

      // Default direction is vertical:
      // Main axis: flex-col items-center
      // Cross axis (parallel steps row & branches): flex-row items-start justify-center gap-4
      const nodeList = wrapper.find('[data-test="flow-node-list"]')
      const stepsRow = wrapper.find('[data-test="flow-node-steps-row"]')
      const branchContainer = wrapper.find('[data-test="flow-branch-container"]')

      expect(nodeList.classes()).toContain('flex-col')
      expect(stepsRow.classes()).toContain('flex-row')
      expect(branchContainer.classes()).toContain('flex-row')

      // Switch to horizontal via layout toggle
      const horizontalBtn = wrapper.find('[data-test="flow-layout-horizontal"]')
      await horizontalBtn.trigger('click')

      expect(flowStore.flowDirection).toBe('horizontal')
      expect((flowStore.currentFlow as any).direction).toBe('horizontal')
      expect(flowStore.currentFlow?.layout).toBe('horizontal')

      // In horizontal direction:
      // Main axis: flex-row items-center
      // Cross axis: flex-col items-start justify-center gap-4
      expect(nodeList.classes()).toContain('flex-row')
      expect(stepsRow.classes()).toContain('flex-col')
      expect(branchContainer.classes()).toContain('flex-col')

      // Clicking toggle container switches back to vertical
      await wrapper.find('[data-test="flow-layout-toggle"]').trigger('click')
      expect(flowStore.flowDirection).toBe('vertical')
      expect(nodeList.classes()).toContain('flex-col')
    })

    it('adds sequential step (+), parallel step (||), and 3-mode branches (success, error, custom 3 fields)', async () => {
      const flowStore = useFlowStore()
      flowStore.currentFlow = {
        id: 'flow-edit',
        name: 'Edit Flow',
        layout: 'vertical',
        nodes: []
      } as any

      const wrapper = mount(FlowEditor)

      // 1. Click "+ Thêm bước" to open RequestPickerModal and select req-login
      await wrapper.find('[data-test="flow-add-step-btn"]').trigger('click')
      expect(wrapper.find('[data-test="request-picker-modal"]').exists()).toBe(true)

      const pickerItems = wrapper.findAll('[data-test="request-picker-item"]')
      await pickerItems[0].trigger('click') // req-login

      expect(flowStore.currentFlow?.nodes.length).toBe(1)
      expect(flowStore.currentFlow?.nodes[0].steps.length).toBe(1)
      expect(flowStore.currentFlow?.nodes[0].steps[0].request_id).toBe('req-login')

      // 2. Click "|| Song song" on the step card to add a parallel step in the same FlowNode
      await wrapper.find('[data-test="flow-add-parallel-step-btn"]').trigger('click')
      expect(wrapper.find('[data-test="request-picker-modal"]').exists()).toBe(true)
      await wrapper.findAll('[data-test="request-picker-item"]')[1].trigger('click') // req-profile

      expect(flowStore.currentFlow?.nodes.length).toBe(1)
      expect(flowStore.currentFlow?.nodes[0].steps.length).toBe(2)
      expect(flowStore.currentFlow?.nodes[0].steps[1].request_id).toBe('req-profile')

      // 3. Click "+ Rẽ nhánh" 3 times to create success, error, and custom branches
      const addBranchBtn = wrapper.find('[data-test="flow-add-branch-btn"]')
      await addBranchBtn.trigger('click')
      await addBranchBtn.trigger('click')
      await addBranchBtn.trigger('click')

      const branches = flowStore.currentFlow?.nodes[0].branches || []
      expect(branches.length).toBe(3)
      expect(branches[0].condition.type).toBe('success')
      expect(branches[1].condition.type).toBe('error')
      expect(branches[2].condition.type).toBe('custom')

      // Verify custom condition 3-field UI row
      const customRow = wrapper.find('[data-test="flow-custom-condition-row"]')
      expect(customRow.exists()).toBe(true)

      const sourceSelect = customRow.find('[data-test="branch-condition-source"]')
      await sourceSelect.setValue('body_json')
      expect(branches[2].condition.source).toBe('body_json')

      const jsonPathInput = customRow.find('[data-test="branch-condition-json-path"]')
      expect(jsonPathInput.exists()).toBe(true)
      await jsonPathInput.setValue('data.status')
      expect(branches[2].condition.path).toBe('data.status')

      const operatorSelect = customRow.find('[data-test="branch-condition-operator"]')
      await operatorSelect.setValue('==')
      expect(branches[2].condition.operator).toBe('==')

      const valueInput = customRow.find('[data-test="branch-condition-value"]')
      await valueInput.setValue('READY')
      expect(branches[2].condition.value).toBe('READY')

      // When operator is 'exists', value input is hidden
      await operatorSelect.setValue('exists')
      expect(customRow.find('[data-test="branch-condition-value"]').exists()).toBe(false)

      // Switch custom condition source to 'variable' and verify variable input & stale field cleanup
      await sourceSelect.setValue('variable')
      expect(branches[2].condition.source).toBe('variable')
      expect(branches[2].condition.path).toBe('')
      expect((branches[2].condition as any).json_path).toBeUndefined()

      const varInput = customRow.find('[data-test="branch-condition-variable"]')
      expect(varInput.exists()).toBe(true)
      await varInput.setValue('auth_role')
      expect(branches[2].condition.path).toBe('auth_role')
      expect((branches[2].condition as any).variable).toBe('auth_role')

      // Click "+ Thêm bước vào nhánh" on the first branch
      const addStepToBranchBtn = wrapper.findAll('[data-test="flow-branch-add-step-btn"]')[0]
      await addStepToBranchBtn.trigger('click')
      expect(wrapper.find('[data-test="request-picker-modal"]').exists()).toBe(true)
      await wrapper.findAll('[data-test="request-picker-item"]')[2].trigger('click') // req-health
      expect(branches[0].nodes.length).toBe(1)
      expect(branches[0].nodes[0].steps[0].request_id).toBe('req-health')
    })

    it('supports FlowToolbar inputs/buttons and FlowStepCard controls (toggle enabled, timeout, change request, delete step)', async () => {
      const flowStore = useFlowStore()
      const saveFlowSpy = vi.spyOn(flowStore, 'saveCurrentFlow').mockResolvedValue(true)

      flowStore.currentFlow = {
        id: 'flow-controls',
        name: 'Initial Flow Name',
        layout: 'vertical',
        timeout_ms: 30000,
        max_steps: 100,
        nodes: [
          {
            id: 'node-1',
            steps: [
              { id: 'step-1', request_id: 'req-login', enabled: true },
              { id: 'step-2', request_id: 'req-profile', enabled: true }
            ],
            branches: []
          }
        ]
      } as any

      const wrapper = mount(FlowEditor)

      // FlowToolbar: edit name, timeout_ms, max_steps, and click Save
      const nameInput = wrapper.find('[data-test="flow-name-input"]')
      await nameInput.setValue('Updated Flow Name')
      expect(flowStore.currentFlow?.name).toBe('Updated Flow Name')

      const timeoutInput = wrapper.find('[data-test="flow-timeout-input"]')
      await timeoutInput.setValue('45000')
      expect(flowStore.currentFlow?.timeout_ms).toBe(45000)

      const maxStepsInput = wrapper.find('[data-test="flow-max-steps-input"]')
      await maxStepsInput.setValue('25')
      expect(flowStore.currentFlow?.max_steps).toBe(25)

      await wrapper.find('[data-test="flow-save-btn"]').trigger('click')
      expect(saveFlowSpy).toHaveBeenCalledTimes(1)

      // FlowStepCard: toggle enabled, set step timeout, change request, delete step
      const step1Card = wrapper.find('[data-step-id="step-1"]')
      await step1Card.find('[data-test="flow-step-toggle-enabled"]').setValue(false)
      expect(flowStore.currentFlow?.nodes[0].steps[0].enabled).toBe(false)

      const stepTimeoutInput = step1Card.find('[data-test="flow-step-timeout-input"]')
      await stepTimeoutInput.setValue('5000')
      expect(flowStore.currentFlow?.nodes[0].steps[0].timeout_ms).toBe(5000)

      await step1Card.find('[data-test="flow-step-change-request-btn"]').trigger('click')
      expect(wrapper.find('[data-test="request-picker-modal"]').exists()).toBe(true)
      await wrapper.findAll('[data-test="request-picker-item"]')[2].trigger('click') // req-health
      expect(flowStore.currentFlow?.nodes[0].steps[0].request_id).toBe('req-health')

      // Delete step-2
      const step2Card = wrapper.find('[data-step-id="step-2"]')
      await step2Card.find('[data-test="flow-delete-step-btn"]').trigger('click')
      expect(flowStore.currentFlow?.nodes[0].steps.length).toBe(1)
      expect(flowStore.currentFlow?.nodes[0].steps[0].id).toBe('step-1')
    })

    it('displays red warning badge when original request is deleted from Collection', () => {
      const flowStore = useFlowStore()
      flowStore.currentFlow = {
        id: 'flow-missing',
        name: 'Missing Req Flow',
        layout: 'vertical',
        nodes: [
          {
            id: 'node-1',
            steps: [{ id: 'step-deleted', request_id: 'req-non-existent', enabled: true }],
            branches: []
          }
        ]
      } as any

      const wrapper = mount(FlowEditor)
      const warning = wrapper.find('[data-test="flow-step-missing-warning"]')
      expect(warning.exists()).toBe(true)
      expect(warning.text()).toContain('Request gốc đã bị xóa')
    })
  })

  describe('4. Live Flow Execution (`runCurrentFlow` & `stopCurrentFlow`)', () => {
    it('executes sequential steps, parallel Promise.all row without variable race conditions, and 3-mode branches', async () => {
      const flowStore = useFlowStore()
      const envStore = useEnvironmentStore()
      const applyScopedVarSpy = vi.spyOn(envStore, 'applyScopedVariableUpdates')

      // Mock requests:
      // 1. req-login (parallel #1): sets collection variable token = 'jwt-123'
      // 2. req-profile (parallel #2): sets collection variable user_id = 'u-999' and returns {"data":{"status":"VIP"}}
      // 3. req-health (inside custom branch matching body_json data.status == VIP): uses {{token}} and {{user_id}}
      const reqMap: Record<string, any> = {
        'req-login': {
          id: 'req-login',
          name: 'Login',
          method: 'POST',
          url: '{{base_url}}/auth/login',
          headers: [],
          params: [],
          body: { type: 'none', content: '' },
          auth: { type: 'none' },
          scripts: {
            pre_request: '',
            post_response: `
              ha.collectionVariables.set('token', 'jwt-123');
              ha.test('login 200', () => { if (ha.response.code !== 200) throw new Error('Expected 200'); });
            `
          }
        },
        'req-profile': {
          id: 'req-profile',
          name: 'Get Profile',
          method: 'GET',
          url: '{{base_url}}/auth/profile',
          headers: [],
          params: [],
          body: { type: 'none', content: '' },
          auth: { type: 'none' },
          scripts: {
            pre_request: '',
            post_response: `
              ha.collectionVariables.set('user_id', 'u-999');
              ha.test('profile 200', () => { if (ha.response.code !== 200) throw new Error('Expected 200'); });
            `
          }
        },
        'req-health': {
          id: 'req-health',
          name: 'Health Check',
          method: 'GET',
          url: '{{base_url}}/health?token={{token}}&uid={{user_id}}',
          headers: [],
          params: [],
          body: { type: 'none', content: '' },
          auth: { type: 'none' },
          scripts: {
            pre_request: '',
            post_response: ''
          }
        }
      }

      vi.mocked(AppBinding.GetRequest).mockImplementation((async (id: string) => {
        if (reqMap[id]) {
          return { success: true, data: reqMap[id] }
        }
        return { success: false, error: { code: 'NOT_FOUND', message: 'Not found' } }
      }) as any)

      const executedUrls: string[] = []
      vi.mocked(AppBinding.SendRequest).mockImplementation((async (execReq: any) => {
        executedUrls.push(execReq.url)
        if (execReq.url.includes('/auth/profile')) {
          return {
            success: true,
            data: {
              status_code: 200,
              status_text: '200 OK',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ data: { status: 'VIP' } }),
              size_bytes: 27,
              time_ms: 18,
              timestamp: '2026-01-01T00:00:00Z'
            }
          }
        }
        return {
          success: true,
          data: {
            status_code: 200,
            status_text: '200 OK',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ok: true }),
            size_bytes: 11,
            time_ms: 12,
            timestamp: '2026-01-01T00:00:00Z'
          }
        }
      }) as any)

      flowStore.currentFlow = {
        id: 'flow-run-1',
        name: 'Parallel + Custom Branch Flow',
        layout: 'vertical',
        timeout_ms: 15000,
        max_steps: 50,
        nodes: [
          {
            id: 'node-parallel',
            steps: [
              { id: 'step-login', request_id: 'req-login', enabled: true },
              { id: 'step-profile', request_id: 'req-profile', enabled: true }
            ],
            branches: [
              {
                id: 'br-custom-vip',
                name: 'VIP Branch',
                condition: {
                  type: 'custom',
                  source: 'body_json',
                  path: 'data.status',
                  operator: '==',
                  value: 'VIP'
                },
                nodes: [
                  {
                    id: 'node-vip-child',
                    steps: [{ id: 'step-vip-health', request_id: 'req-health', enabled: true }],
                    branches: []
                  }
                ]
              },
              {
                id: 'br-error-catch',
                name: 'Khi Lỗi',
                condition: { type: 'error' },
                nodes: [
                  {
                    id: 'node-err-child',
                    steps: [{ id: 'step-err-skip', request_id: 'req-health', enabled: true }],
                    branches: []
                  }
                ]
              }
            ]
          }
        ]
      } as any

      const wrapper = mount(FlowEditor)
      await wrapper.find('[data-test="flow-run-btn"]').trigger('click')
      await flushPromises()

      // Verify summary in store and in FlowToolbar DOM
      expect(flowStore.lastRunSummary).toBeTruthy()
      expect(flowStore.lastRunSummary?.status).toBe('passed')
      expect(flowStore.lastRunSummary?.stepsPassed).toBe(3)
      expect(flowStore.lastRunSummary?.stepsFailed).toBe(0)
      expect(flowStore.lastRunSummary?.stepsSkipped).toBe(1)

      const summaryChip = wrapper.find('[data-test="flow-run-summary"]')
      expect(summaryChip.exists()).toBe(true)
      expect(summaryChip.text()).toContain('PASSED')
      expect(summaryChip.text()).toContain('Passed: 3')
      expect(summaryChip.text()).toContain('Failed: 0')
      expect(summaryChip.text()).toContain('Skipped: 1')

      // Parallel row persisted scoped variable updates ONCE for the row (no race conditions)
      expect(applyScopedVarSpy).toHaveBeenCalledTimes(1)

      // Child step in matched custom branch received both merged variables from the parallel row
      expect(executedUrls).toContain(
        'https://api.example.com/health?token=jwt-123&uid=u-999'
      )

      // Check step card statuses in DOM
      const loginCard = wrapper.find('[data-step-id="step-login"]')
      const profileCard = wrapper.find('[data-step-id="step-profile"]')
      const vipChildCard = wrapper.find('[data-step-id="step-vip-health"]')
      const skippedCard = wrapper.find('[data-step-id="step-err-skip"]')

      expect(loginCard.attributes('data-step-status')).toBe('passed')
      expect(profileCard.attributes('data-step-status')).toBe('passed')
      expect(vipChildCard.attributes('data-step-status')).toBe('passed')
      expect(skippedCard.attributes('data-step-status')).toBe('skipped')

      const skippedBranch = wrapper.find('[data-branch-id="br-error-catch"]')
      expect(skippedBranch.attributes('data-branch-status')).toBe('skipped')
    })

    it('calls AbortRequest when stopCurrentFlow or flow-stop-btn is triggered', async () => {
      const flowStore = useFlowStore()
      flowStore.currentFlow = {
        id: 'flow-stop',
        name: 'Stop Flow',
        layout: 'vertical',
        nodes: []
      } as any
      flowStore.isRunning = true
      flowStore.stepStates = {
        'step-1': {
          stepId: 'step-1',
          nodeId: 'node-1',
          requestId: 'req-login',
          status: 'running'
        }
      }

      const wrapper = mount(FlowEditor)
      const stopBtn = wrapper.find('[data-test="flow-stop-btn"]')
      expect(stopBtn.exists()).toBe(true)
      await stopBtn.trigger('click')

      expect(AppBinding.AbortRequest).toHaveBeenCalledTimes(1)
      expect(flowStore.isRunning).toBe(false)
      expect(flowStore.stepStates['step-1'].status).toBe('failed')
    })

    it('handles error catch branch when parent step fails, skips disabled steps, and fails on missing request', async () => {
      const flowStore = useFlowStore()

      vi.mocked(AppBinding.GetRequest).mockImplementation((async (id: string) => {
        if (id === 'req-login') {
          return {
            success: true,
            data: {
              id: 'req-login',
              name: 'Login',
              method: 'POST',
              url: 'https://api.example.com/auth/login',
              headers: [],
              params: [],
              body: { type: 'none', content: '' },
              auth: { type: 'none' }
            }
          }
        }
        if (id === 'req-health') {
          return {
            success: true,
            data: {
              id: 'req-health',
              name: 'Health Check',
              method: 'GET',
              url: 'https://api.example.com/health',
              headers: [],
              params: [],
              body: { type: 'none', content: '' },
              auth: { type: 'none' }
            }
          }
        }
        return { success: false, error: { code: 'NOT_FOUND', message: 'Deleted' } }
      }) as any)

      vi.mocked(AppBinding.SendRequest).mockImplementation((async (execReq: any) => {
        if (execReq.url.includes('/auth/login')) {
          return {
            success: true,
            data: {
              status_code: 500,
              status_text: '500 Internal Server Error',
              headers: {},
              body: '{"error":"boom"}',
              size_bytes: 16,
              time_ms: 10,
              timestamp: '2026-01-01T00:00:00Z'
            }
          }
        }
        return {
          success: true,
          data: {
            status_code: 200,
            status_text: '200 OK',
            headers: {},
            body: '{"fallback":true}',
            size_bytes: 17,
            time_ms: 8,
            timestamp: '2026-01-01T00:00:00Z'
          }
        }
      }) as any)

      flowStore.currentFlow = {
        id: 'flow-catch',
        name: 'Catch Branch Flow',
        layout: 'vertical',
        max_steps: 10,
        nodes: [
          {
            id: 'node-disabled',
            steps: [{ id: 'step-disabled', request_id: 'req-health', enabled: false }],
            branches: []
          },
          {
            id: 'node-fail',
            steps: [{ id: 'step-fail-500', request_id: 'req-login', enabled: true }],
            branches: [
              {
                id: 'br-ok',
                name: 'Thành công',
                condition: { type: 'success' },
                nodes: [
                  {
                    id: 'node-ok-child',
                    steps: [{ id: 'step-ok-skip', request_id: 'req-health', enabled: true }],
                    branches: []
                  }
                ]
              },
              {
                id: 'br-err',
                name: 'Khi Lỗi',
                condition: { type: 'error' },
                nodes: [
                  {
                    id: 'node-err-fallback',
                    steps: [{ id: 'step-err-recover', request_id: 'req-health', enabled: true }],
                    branches: []
                  }
                ]
              }
            ]
          },
          {
            id: 'node-missing',
            steps: [{ id: 'step-missing-req', request_id: 'req-deleted-999', enabled: true }],
            branches: [
              {
                id: 'br-missing-catch',
                name: 'Khi Lỗi',
                condition: { type: 'error' },
                nodes: [
                  {
                    id: 'node-missing-recovered',
                    steps: [{ id: 'step-missing-recover', request_id: 'req-health', enabled: true }],
                    branches: []
                  }
                ]
              }
            ]
          }
        ]
      } as any

      const summary = await flowStore.runCurrentFlow()
      expect(summary?.status).toBe('passed')
      expect(flowStore.stepStates['step-disabled'].status).toBe('skipped')
      expect(flowStore.stepStates['step-fail-500'].status).toBe('failed')
      expect(flowStore.branchStates['br-ok']).toBe('skipped')
      expect(flowStore.stepStates['step-ok-skip'].status).toBe('skipped')
      expect(flowStore.branchStates['br-err']).toBe('active')
      expect(flowStore.stepStates['step-err-recover'].status).toBe('passed')
      expect(flowStore.stepStates['step-missing-req'].status).toBe('failed')
      expect(flowStore.stepStates['step-missing-req'].error?.message).toContain(
        'Request gốc không tồn tại'
      )
      expect(flowStore.stepStates['step-missing-recover'].status).toBe('passed')
    })

    it('halts execution when max_steps limit is exceeded and marks remaining steps as skipped', async () => {
      const flowStore = useFlowStore()

      vi.mocked(AppBinding.GetRequest).mockResolvedValue({
        success: true,
        data: {
          id: 'req-health',
          name: 'Health Check',
          method: 'GET',
          url: 'https://api.example.com/health',
          headers: [],
          params: [],
          body: { type: 'none', content: '' },
          auth: { type: 'none' }
        }
      } as any)

      vi.mocked(AppBinding.SendRequest).mockResolvedValue({
        success: true,
        data: {
          status_code: 200,
          status_text: '200 OK',
          headers: {},
          body: '{}',
          size_bytes: 2,
          time_ms: 5,
          timestamp: '2026-01-01T00:00:00Z'
        }
      } as any)

      flowStore.currentFlow = {
        id: 'flow-max-steps',
        name: 'Max Steps Flow',
        layout: 'vertical',
        max_steps: 1,
        nodes: [
          {
            id: 'node-1',
            steps: [{ id: 'step-1', request_id: 'req-health', enabled: true }],
            branches: []
          },
          {
            id: 'node-2',
            steps: [{ id: 'step-2', request_id: 'req-health', enabled: true }],
            branches: []
          }
        ]
      } as any

      const summary = await flowStore.runCurrentFlow()
      expect(summary?.status).toBe('failed')
      expect(summary?.haltedError).toContain('max_steps')
      expect(flowStore.stepStates['step-1'].status).toBe('passed')
      expect(flowStore.stepStates['step-2'].status).toBe('skipped')
      expect(summary?.stepsPassed).toBe(1)
      expect(summary?.stepsSkipped).toBe(1)
    })

    it('halts immediately on unhandled step failure and marks subsequent sequential nodes as skipped', async () => {
      const flowStore = useFlowStore()

      vi.mocked(AppBinding.GetRequest).mockResolvedValue({
        success: true,
        data: {
          id: 'req-login',
          name: 'Login',
          method: 'POST',
          url: 'https://api.example.com/auth/login',
          headers: [],
          params: [],
          body: { type: 'none', content: '' },
          auth: { type: 'none' }
        }
      } as any)

      vi.mocked(AppBinding.SendRequest).mockResolvedValue({
        success: true,
        data: {
          status_code: 503,
          status_text: '503 Service Unavailable',
          headers: {},
          body: '{}',
          size_bytes: 2,
          time_ms: 10,
          timestamp: '2026-01-01T00:00:00Z'
        }
      } as any)

      flowStore.currentFlow = {
        id: 'flow-unhandled-fail',
        name: 'Unhandled Failure Flow',
        layout: 'vertical',
        nodes: [
          {
            id: 'node-1',
            steps: [{ id: 'step-1', request_id: 'req-login', enabled: true }],
            branches: []
          },
          {
            id: 'node-2',
            steps: [{ id: 'step-2', request_id: 'req-login', enabled: true }],
            branches: []
          }
        ]
      } as any

      const summary = await flowStore.runCurrentFlow()
      expect(summary?.status).toBe('failed')
      expect(summary?.haltedError).toContain('HTTP 503')
      expect(flowStore.stepStates['step-1'].status).toBe('failed')
      expect(flowStore.stepStates['step-2'].status).toBe('skipped')
      expect(summary?.stepsFailed).toBe(1)
      expect(summary?.stepsSkipped).toBe(1)
    })

    it('prioritizes custom branches in declaration order over earlier fallback success/error branches', async () => {
      const flowStore = useFlowStore()

      vi.mocked(AppBinding.GetRequest).mockResolvedValue({
        success: true,
        data: {
          id: 'req-health',
          name: 'Health Check',
          method: 'GET',
          url: 'https://api.example.com/health',
          headers: [],
          params: [],
          body: { type: 'none', content: '' },
          auth: { type: 'none' }
        }
      } as any)

      vi.mocked(AppBinding.SendRequest).mockResolvedValue({
        success: true,
        data: {
          status_code: 200,
          status_text: '200 OK',
          headers: {},
          body: '{"ok":true}',
          size_bytes: 11,
          time_ms: 5,
          timestamp: '2026-01-01T00:00:00Z'
        }
      } as any)

      flowStore.currentFlow = {
        id: 'flow-branch-order',
        name: 'Branch Priority Flow',
        layout: 'vertical',
        nodes: [
          {
            id: 'node-parent',
            steps: [{ id: 'step-parent', request_id: 'req-health', enabled: true }],
            branches: [
              {
                id: 'br-0-success',
                name: 'Thành công trước',
                condition: { type: 'success' },
                nodes: [
                  {
                    id: 'node-b0',
                    steps: [{ id: 'step-b0', request_id: 'req-health', enabled: true }],
                    branches: []
                  }
                ]
              },
              {
                id: 'br-1-custom',
                name: 'Custom sau',
                condition: {
                  type: 'custom',
                  source: 'status_code',
                  operator: '==',
                  value: '200'
                },
                nodes: [
                  {
                    id: 'node-b1',
                    steps: [{ id: 'step-b1', request_id: 'req-health', enabled: true }],
                    branches: []
                  }
                ]
              }
            ]
          }
        ]
      } as any

      const summary = await flowStore.runCurrentFlow()
      expect(summary?.status).toBe('passed')
      expect(flowStore.branchStates['br-1-custom']).toBe('active')
      expect(flowStore.stepStates['step-b1'].status).toBe('passed')
      expect(flowStore.branchStates['br-0-success']).toBe('skipped')
      expect(flowStore.stepStates['step-b0'].status).toBe('skipped')
    })
  })

  describe('5. StepInspectorPanel & "Mở Request gốc ↗"', () => {
    it('opens StepInspectorPanel as a right-side drawer (w-96 border-l) alongside flow-canvas on step click, switches to APIs mode on "Mở Request gốc ↗", and closes on close button click', async () => {
      const flowStore = useFlowStore()
      const uiStore = useUiStore()
      const collectionStore = useCollectionStore()
      uiStore.setWorkspaceMode('flows')

      const selectRequestSpy = vi
        .spyOn(collectionStore, 'selectRequest')
        .mockResolvedValue(undefined as any)

      flowStore.currentFlow = {
        id: 'flow-inspect',
        name: 'Inspect Flow',
        layout: 'vertical',
        nodes: [
          {
            id: 'node-1',
            steps: [{ id: 'step-1', request_id: 'req-login', enabled: true }],
            branches: []
          }
        ]
      } as any
      flowStore.stepStates['step-1'] = {
        stepId: 'step-1',
        nodeId: 'node-1',
        requestId: 'req-login',
        method: 'POST',
        url: 'https://api.example.com/auth/login',
        status: 'passed',
        statusCode: 200,
        durationMs: 25,
        response: {
          status_code: 200,
          status_text: '200 OK',
          headers: { 'content-type': ['application/json'] },
          body: '{"token":"abc"}',
          size_bytes: 15,
          time_ms: 25,
          timestamp: '2026-01-01T00:00:00Z',
          truncated: false,
          is_binary: false
        },
        testResults: [{ name: 'has token', passed: true }]
      }

      const wrapper = mount(FlowEditor)
      const workspaceBody = wrapper.find('[data-test="flow-workspace-body"]')
      expect(workspaceBody.exists()).toBe(true)
      expect(workspaceBody.classes()).toContain('flex')
      expect(workspaceBody.find('[data-test="flow-canvas"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="step-inspector-panel"]').exists()).toBe(false)

      // Check step card method badge includes .method-badge-post and active layout button has bg-indigo-600
      const stepMethodBadge = wrapper.find('[data-test="flow-step-method"]')
      expect(stepMethodBadge.classes()).toContain('method-badge-post')
      expect(stepMethodBadge.classes()).toContain('text-method-post')
      expect(wrapper.find('[data-test="flow-layout-vertical"]').classes()).toContain('bg-indigo-600')

      // Click the step card to open StepInspectorPanel
      const stepCard = wrapper.find('[data-test="flow-step-card"]')
      await stepCard.trigger('click')
      expect(stepCard.classes()).toContain('ring-2')
      expect(stepCard.classes()).toContain('ring-indigo-500/60')

      const inspector = workspaceBody.find('[data-test="step-inspector-panel"]')
      expect(inspector.exists()).toBe(true)
      expect(inspector.classes()).toContain('w-96')
      expect(inspector.classes()).toContain('border-l')
      expect(inspector.classes()).not.toContain('border-t')
      expect(inspector.classes()).not.toContain('h-[46%]')

      const inspectorMethodBadge = inspector.find('[data-test="step-inspector-method"]')
      expect(inspectorMethodBadge.classes()).toContain('method-badge-post')
      expect(inspectorMethodBadge.classes()).toContain('text-method-post')

      const httpStatusBadge = inspector.find('[data-test="step-inspector-http-status"]')
      expect(httpStatusBadge.exists()).toBe(true)
      expect(httpStatusBadge.text()).toBe('HTTP 200')
      expect(httpStatusBadge.classes()).toContain('text-emerald-400')

      expect(inspector.text()).toContain('Login')
      expect(inspector.text()).toContain('https://api.example.com/auth/login')
      expect(inspector.text()).toContain('HTTP 200')
      expect(inspector.text()).toContain('25 ms')
      expect(inspector.text()).toContain('ha.test: 1/1 Passed')
      expect(inspector.text()).toContain('200 OK')

      // Click "Mở Request gốc ↗"
      const openOriginalBtn = inspector.find('[data-test="open-original-request-btn"]')
      await openOriginalBtn.trigger('click')
      await flushPromises()

      expect(uiStore.workspaceMode).toBe('apis')
      expect(selectRequestSpy).toHaveBeenCalledWith('req-login')

      // Click close button on StepInspectorPanel
      await wrapper.find('[data-test="close-step-inspector-btn"]').trigger('click')
      expect(flowStore.selectedStepId).toBeNull()
      expect(wrapper.find('[data-test="step-inspector-panel"]').exists()).toBe(false)
    })

    it('shows toast warning if clicking "Mở Request gốc ↗" when original request was deleted', async () => {
      const flowStore = useFlowStore()
      const uiStore = useUiStore()
      const showToastSpy = vi.spyOn(uiStore, 'showToast')
      uiStore.setWorkspaceMode('flows')

      flowStore.currentFlow = {
        id: 'flow-deleted-req',
        name: 'Deleted Req Flow',
        layout: 'vertical',
        nodes: [
          {
            id: 'node-1',
            steps: [{ id: 'step-del', request_id: 'req-deleted-999', enabled: true }],
            branches: []
          }
        ]
      } as any
      flowStore.selectStep('step-del')

      const wrapper = mount(FlowEditor)
      const openBtn = wrapper.find('[data-test="open-original-request-btn"]')
      await openBtn.trigger('click')

      expect(showToastSpy).toHaveBeenCalledWith('Request gốc đã bị xóa khỏi Collection')
      expect(uiStore.workspaceMode).toBe('flows')
    })

    it('returns clean .method-badge-* and .text-method-* classes from getMethodBadgeClass across all HTTP methods and handles 3xx/4xx/5xx status badges in StepInspectorPanel', async () => {
      expect(getMethodBadgeClass('GET')).toBe('method-badge-get text-method-get')
      expect(getMethodBadgeClass('POST')).toBe('method-badge-post text-method-post')
      expect(getMethodBadgeClass(' post ')).toBe('method-badge-post text-method-post')
      expect(getMethodBadgeClass('POST')).not.toContain('bg-amber')
      expect(getMethodBadgeClass('PUT')).toBe('method-badge-put text-method-put')
      expect(getMethodBadgeClass('PUT')).not.toContain('bg-blue')
      expect(getMethodBadgeClass('PATCH')).toBe('method-badge-patch text-method-patch')
      expect(getMethodBadgeClass('DELETE')).toBe('method-badge-delete text-method-delete')
      expect(getMethodBadgeClass('HEAD')).toBe('method-badge-head text-method-head')
      expect(getMethodBadgeClass('OPTIONS')).toBe('method-badge-options text-method-options')
      expect(getMethodBadgeClass('REQ')).toBe('method-badge-options text-method-options')
      expect(getMethodBadgeClass()).toBe('method-badge-get text-method-get')

      const flowStore = useFlowStore()
      flowStore.currentFlow = {
        id: 'flow-status-codes',
        name: 'Status Codes Flow',
        layout: 'vertical',
        nodes: [
          {
            id: 'node-1',
            steps: [{ id: 'step-1', request_id: 'req-login', enabled: true }],
            branches: []
          }
        ]
      } as any
      flowStore.selectStep('step-1')

      const wrapper = mount(FlowEditor)
      // Idle selected step card has border-indigo-500 and ring-indigo-500/60
      const stepCard = wrapper.find('[data-test="flow-step-card"]')
      expect(stepCard.classes()).toContain('border-indigo-500')
      expect(stepCard.classes()).toContain('ring-indigo-500/60')

      // 3xx status code
      flowStore.stepStates['step-1'] = {
        stepId: 'step-1',
        nodeId: 'node-1',
        requestId: 'req-login',
        status: 'passed',
        status_code: 302,
        duration_ms: 12
      }
      await flushPromises()
      expect(wrapper.find('[data-test="step-inspector-http-status"]').text()).toBe('HTTP 302')
      expect(wrapper.find('[data-test="step-inspector-http-status"]').classes()).toContain('text-blue-400')

      // 5xx status code
      flowStore.stepStates['step-1'] = {
        stepId: 'step-1',
        nodeId: 'node-1',
        requestId: 'req-login',
        status: 'failed',
        statusCode: 503,
        durationMs: 40
      }
      await flushPromises()
      expect(wrapper.find('[data-test="step-inspector-http-status"]').text()).toBe('HTTP 503')
      expect(wrapper.find('[data-test="step-inspector-http-status"]').classes()).toContain('text-red-400')
    })
  })

  describe('6. ContentArea.vue integration with workspaceMode === "flows"', () => {
    it('renders EmptyStateFlow when no flow is selected, calls createFlow on button click, and renders FlowEditor when currentFlow is active', async () => {
      const uiStore = useUiStore()
      const flowStore = useFlowStore()
      const createFlowSpy = vi.spyOn(flowStore, 'createFlow').mockResolvedValue(null)
      uiStore.setWorkspaceMode('flows')
      flowStore.currentFlow = null

      const wrapper = mount(ContentArea)
      expect(wrapper.findComponent(EmptyStateFlow).exists()).toBe(true)
      const createBtn = wrapper.find('[data-test="empty-state-create-flow-btn"]')
      expect(createBtn.exists()).toBe(true)
      await createBtn.trigger('click')
      expect(createFlowSpy).toHaveBeenCalledTimes(1)

      flowStore.currentFlow = {
        id: 'flow-active',
        name: 'Active Flow',
        layout: 'vertical',
        nodes: []
      } as any
      await flushPromises()

      expect(wrapper.findComponent(FlowEditor).exists()).toBe(true)
      expect(wrapper.find('[data-test="flow-editor"]').exists()).toBe(true)
    })
  })
})
