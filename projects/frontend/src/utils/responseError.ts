export function errorVariant(err: { code: string; message: string }): 'connection' | 'ssl' | 'timeout' | 'unknown' {
  if (err.code === 'TIMEOUT') {
    return 'timeout';
  }
  if (err.code === 'CONNECTION_ERROR') {
    if (err.message.startsWith('Lỗi chứng chỉ SSL')) {
      return 'ssl';
    }
    return 'connection';
  }
  return 'unknown';
}
