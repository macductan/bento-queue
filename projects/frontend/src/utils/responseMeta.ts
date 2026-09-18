export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  return `${Math.floor(bytes / 1024)} KB`
}

export type StatusTone = '2xx' | '3xx' | '4xx' | '5xx' | 'other'

export function statusTone(code: number): StatusTone {
  if (code >= 200 && code < 300) return '2xx'
  if (code >= 300 && code < 400) return '3xx'
  if (code >= 400 && code < 500) return '4xx'
  if (code >= 500 && code < 600) return '5xx'
  return 'other'
}

export function formatTimestamp(iso: string, now: Date = new Date()): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null

  const pad = (n: number) => n.toString().padStart(2, '0')
  const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`

  if (
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  ) {
    return `Hôm nay, ${timeStr}`
  }

  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}, ${timeStr}`
}
