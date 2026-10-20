export type JsTokenType =
  | 'comment'
  | 'string'
  | 'keyword'
  | 'boolean'
  | 'number'
  | 'builtin'
  | 'method'
  | 'property'
  | 'punctuation'
  | 'plain'

export interface JsSyntaxToken {
  type: JsTokenType
  value: string
}

export interface ScriptSuggestionItem {
  label: string
  insertText: string
  detail: string
  description: string
  phase: 'both' | 'pre' | 'post'
}

const JS_KEYWORDS = new Set([
  'const',
  'let',
  'var',
  'if',
  'else',
  'for',
  'while',
  'do',
  'switch',
  'case',
  'break',
  'continue',
  'return',
  'function',
  'async',
  'await',
  'try',
  'catch',
  'finally',
  'throw',
  'new',
  'typeof',
  'instanceof',
  'in',
  'of',
  'delete',
  'void'
])

const JS_BOOLEANS = new Set(['true', 'false', 'null', 'undefined', 'NaN', 'Infinity'])

const JS_BUILTINS = new Set([
  'ha',
  'pm',
  'console',
  'JSON',
  'Date',
  'Math',
  'Object',
  'Array',
  'String',
  'Number',
  'Boolean',
  'RegExp',
  'Error',
  'Map',
  'Set',
  'encodeURIComponent',
  'decodeURIComponent',
  'btoa',
  'atob',
  'parseInt',
  'parseFloat'
])

const TOKEN_MASTER_REGEX =
  /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`)|\b(0x[0-9a-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b|(\.[a-zA-Z_$][a-zA-Z0-9_$]*\s*(?=\())|(\.[a-zA-Z_$][a-zA-Z0-9_$]*)|\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b|([{}()[\];,.:?+-=*&|!<>~^%/]+)/g

export function tokenizeJavaScript(code: string): JsSyntaxToken[] {
  if (!code) return []

  const tokens: JsSyntaxToken[] = []
  let lastIndex = 0
  const regex = new RegExp(TOKEN_MASTER_REGEX.source, 'g')
  let match: RegExpExecArray | null

  while ((match = regex.exec(code)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({
        type: 'plain',
        value: code.slice(lastIndex, match.index)
      })
    }

    const full = match[0]
    const [, comment, str, num, dotMethod, dotProp, ident, punct] = match

    if (comment !== undefined) {
      tokens.push({ type: 'comment', value: full })
    } else if (str !== undefined) {
      tokens.push({ type: 'string', value: full })
    } else if (num !== undefined) {
      tokens.push({ type: 'number', value: full })
    } else if (dotMethod !== undefined) {
      tokens.push({ type: 'punctuation', value: '.' })
      tokens.push({ type: 'method', value: full.slice(1) })
    } else if (dotProp !== undefined) {
      tokens.push({ type: 'punctuation', value: '.' })
      tokens.push({ type: 'property', value: full.slice(1) })
    } else if (ident !== undefined) {
      if (JS_KEYWORDS.has(ident)) {
        tokens.push({ type: 'keyword', value: full })
      } else if (JS_BOOLEANS.has(ident)) {
        tokens.push({ type: 'boolean', value: full })
      } else if (JS_BUILTINS.has(ident)) {
        tokens.push({ type: 'builtin', value: full })
      } else {
        tokens.push({ type: 'plain', value: full })
      }
    } else if (punct !== undefined) {
      tokens.push({ type: 'punctuation', value: full })
    } else {
      tokens.push({ type: 'plain', value: full })
    }

    lastIndex = match.index + full.length
  }

  if (lastIndex < code.length) {
    tokens.push({
      type: 'plain',
      value: code.slice(lastIndex)
    })
  }

  return tokens
}

export function jsTokenClass(type: JsTokenType): string {
  switch (type) {
    case 'comment':
      return 'text-slate-500 italic'
    case 'string':
      return 'text-emerald-300'
    case 'keyword':
      return 'text-purple-400 font-semibold'
    case 'boolean':
      return 'text-orange-300 font-medium'
    case 'number':
      return 'text-amber-300'
    case 'builtin':
      return 'text-sky-300 font-semibold'
    case 'method':
      return 'text-cyan-300'
    case 'property':
      return 'text-indigo-300'
    case 'punctuation':
      return 'text-slate-400'
    default:
      return 'text-text-primary'
  }
}

export const SCRIPT_COMPLETION_CATALOG: ScriptSuggestionItem[] = [
  // Environment scopes (Level 1..4)
  {
    label: 'ha.environment.name',
    insertText: 'ha.environment.name',
    detail: 'Current Env',
    description: 'Tên môi trường hiện tại đang chọn (ví dụ: "Dev", "Production")',
    phase: 'both'
  },
  {
    label: 'ha.environment.getCurrent()',
    insertText: 'ha.environment.getCurrent()',
    detail: 'Current Env',
    description: 'Lấy thông tin môi trường hiện tại ({ id, name })',
    phase: 'both'
  },
  {
    label: 'ha.environment.get(key, envName?)',
    insertText: "ha.environment.get('key')",
    detail: 'Global Env',
    description: 'Lấy giá trị biến từ Global Environment đang chọn (hoặc tên Env chỉ định)',
    phase: 'both'
  },
  {
    label: 'ha.environment.set(key, value, envName?)',
    insertText: "ha.environment.set('key', 'value')",
    detail: 'Global Env',
    description: 'Gán biến vào Global Environment đang chọn (hoặc tên Env cụ thể như "Staging")',
    phase: 'both'
  },
  {
    label: 'ha.environment.unset(key, envName?)',
    insertText: "ha.environment.unset('key')",
    detail: 'Global Env',
    description: 'Xóa biến khỏi Global Environment',
    phase: 'both'
  },
  {
    label: 'ha.collectionVariables.get(key)',
    insertText: "ha.collectionVariables.get('key')",
    detail: 'Collection Env',
    description: 'Lấy giá trị biến dùng chung của toàn Collection (Level 1)',
    phase: 'both'
  },
  {
    label: 'ha.collectionVariables.set(key, value)',
    insertText: "ha.collectionVariables.set('key', 'value')",
    detail: 'Collection Env',
    description: 'Lưu biến vào Collection Env (Dùng chung cho mọi môi trường)',
    phase: 'both'
  },
  {
    label: 'ha.globals.set(key, value)',
    insertText: "ha.globals.set('key', 'value')",
    detail: 'Global / Collection',
    description: 'Alias của ha.collectionVariables.set — lưu biến toàn cục dùng chung',
    phase: 'both'
  },
  {
    label: 'ha.folderVariables.get(key, folderName?)',
    insertText: "ha.folderVariables.get('key')",
    detail: 'Folder Global',
    description: 'Lấy biến dùng chung của Folder cha gần nhất (hoặc theo tên Folder)',
    phase: 'both'
  },
  {
    label: 'ha.folderVariables.set(key, value, folderName?)',
    insertText: "ha.folderVariables.set('key', 'value')",
    detail: 'Folder Global',
    description: 'Lưu biến dùng chung vào Folder cha gần nhất (hoặc chỉ định tên Folder)',
    phase: 'both'
  },
  {
    label: "ha.env(envName?).set({ ... })",
    insertText: "ha.env().set({ token: 'abc' })",
    detail: 'Environment Scope',
    description: 'Gán nhanh biến (hoặc object nhiều biến) cho Environment',
    phase: 'both'
  },
  {
    label: "ha.env(envName?).get(key)",
    insertText: "ha.env().get('key')",
    detail: 'Environment Scope',
    description: 'Lấy giá trị biến của Environment (mặc định Environment đang chọn)',
    phase: 'both'
  },
  {
    label: "ha.env(envName?).unset(key)",
    insertText: "ha.env().unset('key')",
    detail: 'Environment Scope',
    description: 'Xóa biến khỏi Environment',
    phase: 'both'
  },
  {
    label: 'ha.env().name / ha.environment.name',
    insertText: 'ha.env().name',
    detail: 'Environment Name',
    description: 'Lấy tên Environment đang kích hoạt',
    phase: 'both'
  },
  // Folder Scope & Chained Auth
  {
    label: "ha.folder(folderName?).set({ ... })",
    insertText: "ha.folder().set({ key: 'value' })",
    detail: 'Folder Scope',
    description: 'Gán biến chung cho Folder (mặc định Folder gần nhất)',
    phase: 'both'
  },
  {
    label: "ha.folder(folderName?).get(key)",
    insertText: "ha.folder().get('key')",
    detail: 'Folder Scope',
    description: 'Lấy giá trị biến chung của Folder',
    phase: 'both'
  },
  {
    label: "ha.folder(folderName?).env(envName?).set(key, val)",
    insertText: "ha.folder().env('Dev').set('key', 'val')",
    detail: 'Folder Env Scope',
    description: 'Gán biến cho Folder theo Environment cụ thể',
    phase: 'both'
  },
  {
    label: "ha.folder(folderName?).auth.set({ type: 'bearer', value })",
    insertText: "ha.folder().auth.set({ type: 'bearer', value: 'token-xyz' })",
    detail: 'Folder Auth',
    description: 'Gán Bearer Auth cho Folder bằng JSON',
    phase: 'both'
  },
  {
    label: "ha.folder(folderName?).auth.set({ type: 'apiKey', key, value })",
    insertText: "ha.folder().auth.set({ type: 'apiKey', key: 'X-API-KEY', value: 'secret', addTo: 'header' })",
    detail: 'Folder Auth',
    description: 'Gán API Key Auth cho Folder bằng JSON',
    phase: 'both'
  },
  {
    label: "ha.folder(folderName?).auth.set({ type: 'basic', username, password })",
    insertText: "ha.folder().auth.set({ type: 'basic', username: 'admin', password: '123' })",
    detail: 'Folder Auth',
    description: 'Gán Basic Auth cho Folder bằng JSON',
    phase: 'both'
  },
  {
    label: "ha.folder(folderName?).auth.inherit()",
    insertText: "ha.folder().auth.inherit()",
    detail: 'Folder Auth',
    description: 'Kế thừa cấu hình Auth từ cha (inherit)',
    phase: 'both'
  },
  {
    label: "ha.folder(folderName?).auth.none()",
    insertText: "ha.folder().auth.none()",
    detail: 'Folder Auth',
    description: 'Tắt xác thực cho Folder (No Auth)',
    phase: 'both'
  },
  {
    label: "ha.folder(folderName?).auth.env(envName?).set({ ... })",
    insertText: "ha.folder().auth.env('Dev').set({ type: 'bearer', value: 'dev-token' })",
    detail: 'Folder Env Auth',
    description: 'Gán cấu hình Auth của Folder theo Environment cụ thể',
    phase: 'both'
  },
  {
    label: "ha.folder(folderName?).auth.get()",
    insertText: "ha.folder().auth.get()",
    detail: 'Folder Auth',
    description: 'Lấy cấu hình Auth của Folder',
    phase: 'both'
  },
  {
    label: "ha.folderAuth.set(folder, { type, ... })",
    insertText: "ha.folderAuth.set('FolderName', { type: 'apiKey', key: 'X-API-KEY', value: 'secret' })",
    detail: 'Folder Auth',
    description: 'Gán cấu hình Auth linh hoạt cho Folder bằng JSON (apiKey, bearer, basic)',
    phase: 'both'
  },
  // Request Query, Path Params, Headers, Body, Auth
  {
    label: 'ha.request.params.get(key)',
    insertText: "ha.request.params.get('page')",
    detail: 'Query Params',
    description: 'Lấy giá trị Query Param (?key=value) của request',
    phase: 'both'
  },
  {
    label: 'ha.request.params.set(key, value)',
    insertText: "ha.request.params.set('page', '1')",
    detail: 'Query Params',
    description: 'Gán hoặc thêm mới Query Param (?key=value) và tự động đồng bộ lên URL',
    phase: 'pre'
  },
  {
    label: 'ha.request.query.get(key)',
    insertText: "ha.request.query.get('search')",
    detail: 'Query Params',
    description: 'Lấy giá trị Query Param (alias của ha.request.params.get)',
    phase: 'both'
  },
  {
    label: 'ha.request.query.set(key, value)',
    insertText: "ha.request.query.set('timestamp', Date.now())",
    detail: 'Query Params',
    description: 'Gán hoặc cập nhật tham số Query trên URL trước khi gửi',
    phase: 'pre'
  },
  {
    label: 'ha.request.query.remove(key)',
    insertText: "ha.request.query.remove('debug')",
    detail: 'Query Params',
    description: 'Xóa tham số Query khỏi URL',
    phase: 'pre'
  },
  {
    label: 'ha.request.pathParams.get(key)',
    insertText: "ha.request.pathParams.get('api_key')",
    detail: 'Path Params (:param)',
    description: 'Lấy giá trị biến Path (:api_key, :id) trên URL',
    phase: 'both'
  },
  {
    label: 'ha.request.pathParams.set(key, value)',
    insertText: "ha.request.pathParams.set('api_key', 'my-secret-key')",
    detail: 'Path Params (:param)',
    description: 'Gán giá trị cho biến Path (:api_key, :id) trước khi gửi request',
    phase: 'pre'
  },
  {
    label: 'ha.request.headers.get(key)',
    insertText: "ha.request.headers.get('Authorization')",
    detail: 'Request Headers',
    description: 'Lấy giá trị Header của request (không phân biệt hoa thường)',
    phase: 'both'
  },
  {
    label: 'ha.request.headers.set(key, value)',
    insertText: "ha.request.headers.set('X-Request-Id', String(Date.now()))",
    detail: 'Request Headers',
    description: 'Thêm hoặc ghi đè Header của request trước khi gửi',
    phase: 'pre'
  },
  {
    label: 'ha.request.body.json()',
    insertText: 'ha.request.body.json()',
    detail: 'Request Body',
    description: 'Đọc payload JSON của request thành Object',
    phase: 'both'
  },
  {
    label: 'ha.request.body.set(data)',
    insertText: "ha.request.body.set({ updated_at: Date.now() })",
    detail: 'Request Body',
    description: 'Cập nhật nội dung Body của request (Object hoặc chuỗi)',
    phase: 'pre'
  },
  {
    label: 'ha.request.auth.get()',
    insertText: 'ha.request.auth.get()',
    detail: 'Request Auth',
    description: 'Lấy cấu hình Auth của request hiện tại',
    phase: 'both'
  },
  {
    label: 'ha.request.auth.setBearer(token)',
    insertText: "ha.request.auth.setBearer('token-xyz')",
    detail: 'Request Auth',
    description: 'Gán Bearer Token cho request hiện tại trước khi gửi',
    phase: 'pre'
  },
  {
    label: 'ha.request.auth.setBasic(username, password)',
    insertText: "ha.request.auth.setBasic('user', 'pass')",
    detail: 'Request Auth',
    description: 'Gán Basic Auth cho request hiện tại trước khi gửi',
    phase: 'pre'
  },
  {
    label: 'ha.request.auth.setApiKey(key, value, addTo?)',
    insertText: "ha.request.auth.setApiKey('X-API-Key', 'secret', 'header')",
    detail: 'Request Auth',
    description: 'Gán API Key cho request hiện tại trước khi gửi',
    phase: 'pre'
  },
  {
    label: 'ha.request.auth.inherit()',
    insertText: 'ha.request.auth.inherit()',
    detail: 'Request Auth',
    description: 'Kế thừa cấu hình Auth từ Folder cha hoặc Collection',
    phase: 'pre'
  },
  {
    label: 'ha.request.auth.none()',
    insertText: 'ha.request.auth.none()',
    detail: 'Request Auth',
    description: 'Tắt xác thực cho request hiện tại (No Auth)',
    phase: 'pre'
  },
  // Response APIs
  {
    label: 'ha.response.json()',
    insertText: 'ha.response.json()',
    detail: 'Response JSON',
    description: 'Parse nội dung body trả về thành đối tượng JSON',
    phase: 'post'
  },
  {
    label: 'ha.response.data',
    insertText: 'ha.response.data',
    detail: 'Response Data',
    description: 'Truy cập nhanh dữ liệu trả về (tự động parse JSON nếu hợp lệ)',
    phase: 'post'
  },
  {
    label: 'ha.response.text()',
    insertText: 'ha.response.text()',
    detail: 'Response Text',
    description: 'Lấy nội dung body trả về dưới dạng chuỗi thuần (string)',
    phase: 'post'
  },
  {
    label: 'ha.response.code',
    insertText: 'ha.response.code',
    detail: 'Status Code',
    description: 'Mã trạng thái HTTP trả về (ví dụ: 200, 201, 404)',
    phase: 'post'
  },
  {
    label: 'ha.response.headers.get(name)',
    insertText: "ha.response.headers.get('content-type')",
    detail: 'Response Header',
    description: 'Lấy giá trị Header từ phản hồi HTTP',
    phase: 'post'
  },
  {
    label: 'ha.response.responseTime',
    insertText: 'ha.response.responseTime',
    detail: 'Duration (ms)',
    description: 'Thời gian phản hồi của request tính bằng mili-giây (ms)',
    phase: 'post'
  },
  // Console & Debug logging
  {
    label: 'console.log(...args)',
    insertText: "console.log('Debug:', )",
    detail: 'Console Log',
    description: 'Ghi log ra bảng Console / Logs để debug giá trị biến & dữ liệu',
    phase: 'both'
  },
  {
    label: 'console.info(...args)',
    insertText: "console.info('Info:', )",
    detail: 'Console Info',
    description: 'Ghi log mức INFO ra bảng Console / Logs',
    phase: 'both'
  },
  {
    label: 'console.warn(...args)',
    insertText: "console.warn('Warning:', )",
    detail: 'Console Warn',
    description: 'Ghi cảnh báo mức WARN ra bảng Console / Logs',
    phase: 'both'
  },
  {
    label: 'console.error(...args)',
    insertText: "console.error('Error:', )",
    detail: 'Console Error',
    description: 'Ghi lỗi mức ERROR ra bảng Console / Logs',
    phase: 'both'
  }
]

export const OBJECT_COMPLETION_CATALOG: ScriptSuggestionItem[] = [
  {
    label: "type: 'bearer', value: ''",
    insertText: "type: 'bearer', value: ''",
    detail: 'Bearer Auth',
    description: 'Cấu hình Bearer Token cho Auth',
    phase: 'both'
  },
  {
    label: "type: 'apiKey', key: '', value: '', addTo: 'header'",
    insertText: "type: 'apiKey', key: 'X-API-KEY', value: '', addTo: 'header'",
    detail: 'API Key Auth',
    description: 'Cấu hình API Key (Header hoặc Query) cho Auth',
    phase: 'both'
  },
  {
    label: "type: 'basic', username: '', password: ''",
    insertText: "type: 'basic', username: '', password: ''",
    detail: 'Basic Auth',
    description: 'Cấu hình Basic Auth (Username / Password)',
    phase: 'both'
  },
  {
    label: "type: 'inherit'",
    insertText: "type: 'inherit'",
    detail: 'Inherit Auth',
    description: 'Kế thừa cấu hình Auth từ cấp cha',
    phase: 'both'
  },
  {
    label: "type: 'none'",
    insertText: "type: 'none'",
    detail: 'No Auth',
    description: 'Tắt xác thực (Không gửi Auth)',
    phase: 'both'
  },
  {
    label: "'bearer'",
    insertText: "'bearer'",
    detail: 'Auth Type',
    description: 'Loại xác thực Bearer Token',
    phase: 'both'
  },
  {
    label: "'apiKey'",
    insertText: "'apiKey'",
    detail: 'Auth Type',
    description: 'Loại xác thực API Key',
    phase: 'both'
  },
  {
    label: "'basic'",
    insertText: "'basic'",
    detail: 'Auth Type',
    description: 'Loại xác thực Basic Auth',
    phase: 'both'
  },
  {
    label: "'inherit'",
    insertText: "'inherit'",
    detail: 'Auth Type',
    description: 'Loại xác thực Inherit',
    phase: 'both'
  },
  {
    label: "'none'",
    insertText: "'none'",
    detail: 'Auth Type',
    description: 'Loại xác thực No Auth',
    phase: 'both'
  },
  {
    label: "key: 'value'",
    insertText: "key: 'value'",
    detail: 'Variable',
    description: 'Cặp key-value biến môi trường',
    phase: 'both'
  }
]

export function isInsideObjectLiteral(codeBeforeCursor: string): boolean {
  let braceDepth = 0
  let inString: string | null = null
  let lastOpenIndex = -1

  for (let i = 0; i < codeBeforeCursor.length; i++) {
    const char = codeBeforeCursor[i]
    const prev = i > 0 ? codeBeforeCursor[i - 1] : ''

    if (inString) {
      if (char === inString && prev !== '\\') {
        inString = null
      }
      continue
    }

    if (char === '"' || char === "'" || char === '`') {
      inString = char
      continue
    }

    if (char === '{') {
      braceDepth++
      lastOpenIndex = i
    } else if (char === '}') {
      if (braceDepth > 0) braceDepth--
    }
  }

  if (braceDepth > 0 && lastOpenIndex !== -1) {
    const beforeBrace = codeBeforeCursor.slice(0, lastOpenIndex).trimEnd()
    // Preceded by '(', ',', ':', '=', 'return' means object literal (e.g. .set({ or const obj = {)
    if (/[(,:=]\s*$/.test(beforeBrace) || /return\s*$/.test(beforeBrace)) {
      return true
    }
  }
  return false
}

export function extractPrefixBeforeCursor(
  code: string,
  cursorIndex: number
): { prefix: string; startIndex: number; isInsideObject: boolean } {
  const before = code.slice(0, Math.max(0, cursorIndex))
  const isInsideObject = isInsideObjectLiteral(before)

  const match = before.match(/[a-zA-Z_$][a-zA-Z0-9_$.]*$/)
  if (!match) {
    return { prefix: '', startIndex: cursorIndex, isInsideObject }
  }
  return {
    prefix: match[0],
    startIndex: cursorIndex - match[0].length,
    isInsideObject
  }
}

export function getScriptSuggestions(
  prefix: string,
  phase: 'pre_request' | 'post_response',
  isInsideObject = false
): ScriptSuggestionItem[] {
  const trimmed = prefix.trim()
  if (!trimmed) return []

  const targetPhase = phase === 'pre_request' ? 'pre' : 'post'

  if (isInsideObject) {
    // Inside object: ONLY suggest object properties / values, never top-level ha.* lines
    const lower = trimmed.toLowerCase().replace(/['"]/g, '')
    return OBJECT_COMPLETION_CATALOG.filter(item => {
      if (item.phase !== 'both' && item.phase !== targetPhase) return false
      const labelLower = item.label.toLowerCase()
      const insertLower = item.insertText.toLowerCase()
      return (
        labelLower.startsWith(lower) ||
        insertLower.startsWith(lower) ||
        labelLower.includes(lower)
      )
    }).slice(0, 10)
  }

  // Outside object: suggestions from SCRIPT_COMPLETION_CATALOG
  const normalizedPrefix = trimmed.startsWith('pm.')
    ? 'ha.' + trimmed.slice(3)
    : trimmed === 'pm'
      ? 'ha'
      : trimmed
  const lower = normalizedPrefix.toLowerCase()

  return SCRIPT_COMPLETION_CATALOG.filter(item => {
    if (item.phase !== 'both' && item.phase !== targetPhase) return false
    const itemLower = item.label.toLowerCase()
    const insertLower = item.insertText.toLowerCase()

    // 1. Direct prefix matches
    if (itemLower.startsWith(lower) || insertLower.startsWith(lower)) {
      return true
    }

    // 2. Member / segment match (e.g. typing "folder", "auth", "resp", "env", "param", "header")
    const segments = itemLower.split(/[.()]/).filter(Boolean)
    if (segments.some(seg => seg.startsWith(lower))) {
      return true
    }

    return false
  })
    .map(item => {
      if (trimmed.startsWith('pm')) {
        return {
          ...item,
          label: item.label.replace(/^ha\./, 'pm.'),
          insertText: item.insertText.replace(/^ha\./, 'pm.')
        }
      }
      return item
    })
    .slice(0, 16)
}
