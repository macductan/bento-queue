import type { ExecuteResponse } from '../stores/responseStore'

export interface ScriptExecutionContext {
  variables: Map<string, string>
  response?: ExecuteResponse | null
}

export interface ScriptExecutionResult {
  success: boolean
  logs: string[]
  envUpdates: Record<string, string>
  error?: string
}

function formatLogArg(arg: unknown): string {
  if (typeof arg === 'string') return arg
  if (arg === undefined) return 'undefined'
  if (arg === null) return 'null'
  if (typeof arg === 'object') {
    try {
      return JSON.stringify(arg)
    } catch {
      return String(arg)
    }
  }
  return String(arg)
}

export function executeScript(
  code: string | undefined | null,
  context: ScriptExecutionContext
): ScriptExecutionResult {
  const logs: string[] = []
  const envUpdates: Record<string, string> = {}

  if (!code || !code.trim()) {
    return {
      success: true,
      logs,
      envUpdates
    }
  }

  const getVar = (key: string): string | undefined => {
    const k = String(key ?? '').trim()
    if (!k) return undefined
    return context.variables.get(k)
  }

  const setVar = (key: string, value: unknown): void => {
    const k = String(key ?? '').trim()
    if (!k) return
    const strVal =
      value === undefined || value === null
        ? ''
        : typeof value === 'object'
          ? JSON.stringify(value)
          : String(value)
    context.variables.set(k, strVal)
    envUpdates[k] = strVal
  }

  const unsetVar = (key: string): void => {
    const k = String(key ?? '').trim()
    if (!k) return
    context.variables.delete(k)
    envUpdates[k] = ''
  }

  const haResponse = context.response
    ? {
        code: context.response.status_code,
        status: context.response.status_text,
        responseTime: context.response.time_ms,
        headers: context.response.headers || {},
        text: (): string => context.response?.body ?? '',
        json: (): any => {
          const raw = context.response?.body ?? ''
          return JSON.parse(raw)
        }
      }
    : undefined

  const ha = {
    environment: {
      get: getVar,
      set: setVar,
      unset: unsetVar
    },
    variables: {
      get: getVar,
      set: setVar
    },
    response: haResponse
  }

  const sandboxConsole = {
    log: (...args: unknown[]) => logs.push(args.map(formatLogArg).join(' ')),
    info: (...args: unknown[]) => logs.push('[INFO] ' + args.map(formatLogArg).join(' ')),
    warn: (...args: unknown[]) => logs.push('[WARN] ' + args.map(formatLogArg).join(' ')),
    error: (...args: unknown[]) => logs.push('[ERROR] ' + args.map(formatLogArg).join(' '))
  }

  try {
    const runner = new Function('ha', 'pm', 'console', `"use strict";\n${code}`)
    runner(ha, ha, sandboxConsole)
    return {
      success: true,
      logs,
      envUpdates
    }
  } catch (err: any) {
    const message = err instanceof Error ? err.message : String(err)
    logs.push(`[ERROR] ${message}`)
    return {
      success: false,
      logs,
      envUpdates,
      error: message
    }
  }
}
