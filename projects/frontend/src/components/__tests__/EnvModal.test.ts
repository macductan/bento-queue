import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import EnvModal from '../environment/EnvModal.vue'
import EnvSelector from '../environment/EnvSelector.vue'
import { createPinia, setActivePinia } from 'pinia'
import { useEnvironmentStore } from '@/stores/environmentStore'
import { useUiStore } from '@/stores/uiStore'

describe('EnvModal', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('does not call envStore.save when closed without changes', async () => {
    const envStore = useEnvironmentStore()
    const uiStore = useUiStore()
    const saveSpy = vi.spyOn(envStore, 'save')
    
    envStore.environments = [
      { id: '1', name: 'Test', variables: [], created_at: '', updated_at: '' } as any
    ]
    uiStore.envModalOpen = false

    const wrapper = mount(EnvModal)
    uiStore.envModalOpen = true
    await wrapper.vm.$nextTick()
    
    // Trigger closeAndSave via the backdrop
    const bg = wrapper.find('.fixed.inset-0')
    await bg.trigger('mousedown')

    expect(saveSpy).not.toHaveBeenCalled()
  })

  it('calls envStore.save only for modified environments', async () => {
    const envStore = useEnvironmentStore()
    const uiStore = useUiStore()
    const saveSpy = vi.spyOn(envStore, 'save').mockResolvedValue(true)
    
    envStore.environments = [
      { id: '1', name: 'Env 1', variables: [], created_at: '', updated_at: '' } as any,
      { id: '2', name: 'Env 2', variables: [], created_at: '', updated_at: '' } as any
    ]
    uiStore.envModalOpen = false

    const wrapper = mount(EnvModal)
    uiStore.envModalOpen = true
    await wrapper.vm.$nextTick()
    
    // Select Env 2
    const envRows = wrapper.findAll('.group')
    await envRows[1].trigger('click')

    // Change its name
    const nameInput = wrapper.find('input[placeholder="vd: Production"]')
    await nameInput.setValue('Env 2 Modified')

    // Trigger closeAndSave via the backdrop
    const bg = wrapper.find('.fixed.inset-0')
    await bg.trigger('mousedown')

    expect(saveSpy).toHaveBeenCalledTimes(1)
    expect(saveSpy).toHaveBeenCalledWith(expect.objectContaining({ id: '2', name: 'Env 2 Modified' }))
  })

  it('calls envStore.save when an environment variable is modified', async () => {
    const envStore = useEnvironmentStore()
    const uiStore = useUiStore()
    const saveSpy = vi.spyOn(envStore, 'save').mockResolvedValue(true)
    
    envStore.environments = [
      { id: '1', name: 'Env 1', variables: [{ key: 'host', value: 'localhost', enabled: true }], created_at: '', updated_at: '' } as any
    ]
    uiStore.envModalOpen = false

    const wrapper = mount(EnvModal)
    uiStore.envModalOpen = true
    await wrapper.vm.$nextTick()
    
    // Select Env 1
    const envRows = wrapper.findAll('.group')
    await envRows[0].trigger('click')

    // Change variable value
    const valueInputs = wrapper.findAll('input[placeholder="Value"]')
    await valueInputs[0].setValue('127.0.0.1')

    // Trigger closeAndSave via the backdrop
    const bg = wrapper.find('.fixed.inset-0')
    await bg.trigger('mousedown')

    expect(saveSpy).toHaveBeenCalledTimes(1)
    expect(saveSpy.mock.calls[0][0].variables[0].value).toBe('127.0.0.1')
  })
})

describe('EnvSelector', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('calls envStore.setActive when user selects an environment or "Không dùng env" (null)', async () => {
    const envStore = useEnvironmentStore()
    envStore.environments = [
      { id: 'env-local', name: 'Local', variables: [], created_at: '', updated_at: '' } as any,
      { id: 'env-prod', name: 'Prod', variables: [], created_at: '', updated_at: '' } as any
    ]
    const setActiveSpy = vi.spyOn(envStore, 'setActive')

    const wrapper = mount(EnvSelector)
    const select = wrapper.find('select')

    await select.setValue('env-local')
    expect(setActiveSpy).toHaveBeenCalledWith('env-local')
    expect(envStore.activeEnvId).toBe('env-local')

    ;(select.element as HTMLSelectElement).selectedIndex = 0
    await select.trigger('change')
    expect(setActiveSpy).toHaveBeenCalledWith(null)
    expect(envStore.activeEnvId).toBeNull()
  })

  it('supports opening custom dropdown menu and selecting an environment', async () => {
    const envStore = useEnvironmentStore()
    const uiStore = useUiStore()
    envStore.environments = [
      { id: 'env-staging', name: 'Staging', variables: [], created_at: '', updated_at: '' } as any
    ]
    const setActiveSpy = vi.spyOn(envStore, 'setActive')

    const wrapper = mount(EnvSelector)
    const trigger = wrapper.find('[data-test="env-selector-trigger"]')
    expect(trigger.exists()).toBe(true)
    expect(trigger.text()).toContain('Không dùng env')

    // Click to open custom dropdown
    await trigger.trigger('click')
    const menu = wrapper.find('[data-test="env-dropdown-menu"]')
    expect(menu.exists()).toBe(true)

    // Select Staging
    const stagingOption = wrapper.find('[data-test="env-option-env-staging"]')
    expect(stagingOption.exists()).toBe(true)
    await stagingOption.trigger('click')

    expect(setActiveSpy).toHaveBeenCalledWith('env-staging')
    expect(envStore.activeEnvId).toBe('env-staging')
    expect(wrapper.find('[data-test="env-dropdown-menu"]').exists()).toBe(false)

    // Open again and click open env modal button
    await trigger.trigger('click')
    const manageBtn = wrapper.find('[data-test="open-env-modal-btn"]')
    expect(manageBtn.exists()).toBe(true)
    await manageBtn.trigger('click')
    expect(uiStore.envModalOpen).toBe(true)
    expect(wrapper.find('[data-test="env-dropdown-menu"]').exists()).toBe(false)
  })
})
