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
})
