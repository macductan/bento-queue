import { describe, it, expect } from 'vitest';
import { escapeShell, generateCurlCommand } from '../curl';
import type { Request } from '../../stores/requestStore';
import type { TreeNode } from '../../stores/collectionStore';

describe('escapeShell', () => {
  it('wraps simple string in single quotes', () => {
    expect(escapeShell('hello')).toBe("'hello'");
  });

  it('handles empty string', () => {
    expect(escapeShell('')).toBe("''");
  });

  it('escapes single quotes correctly using standard POSIX idiom', () => {
    expect(escapeShell("O'Reilly")).toBe("'O'\\''Reilly'");
    expect(escapeShell("'test'")).toBe("''\\''test'\\'''");
  });

  it('preserves special shell characters safely inside single quotes', () => {
    expect(escapeShell('$HOME && rm -rf / ; "double" `tick`')).toBe(
      "'$HOME && rm -rf / ; \"double\" `tick`'"
    );
  });
});

describe('generateCurlCommand', () => {
  const baseRequest: Request = {
    id: 'req-1',
    name: 'Test Request',
    method: 'GET',
    url: 'https://api.example.com/users',
    headers: [],
    params: [],
    body: { type: 'none', content: '' },
    created_at: '2026-10-13',
    updated_at: '2026-10-13'
  };

  it('generates basic GET command without body', () => {
    const cmd = generateCurlCommand(baseRequest);
    expect(cmd).toBe("curl -X GET 'https://api.example.com/users'");
  });

  it('generates POST command with JSON body and escapes single quotes safely', () => {
    const req: Request = {
      ...baseRequest,
      method: 'POST',
      body: {
        type: 'json',
        content: JSON.stringify({ name: "O'Reilly", message: "It's working" })
      }
    };

    const cmd = generateCurlCommand(req);
    expect(cmd).toContain('-X POST');
    expect(cmd).toContain("'https://api.example.com/users'");
    expect(cmd).toContain("-H 'Content-Type: application/json'");
    expect(cmd).toContain("--data-raw '{\"name\":\"O'\\''Reilly\",\"message\":\"It'\\''s working\"}'");
  });

  it('handles text body payload', () => {
    const req: Request = {
      ...baseRequest,
      method: 'PUT',
      headers: [{ key: 'Content-Type', value: 'text/plain', enabled: true }],
      body: {
        type: 'text',
        content: "Hello 'World'!"
      }
    };

    const cmd = generateCurlCommand(req);
    expect(cmd).toBe("curl -X PUT 'https://api.example.com/users' -H 'Content-Type: text/plain' --data-raw 'Hello '\\''World'\\''!'");
  });

  it('resolves environment variables in URL, headers, query params and body', () => {
    const req: Request = {
      ...baseRequest,
      method: 'POST',
      url: 'https://{{host}}/api/v1',
      headers: [{ key: 'X-App-Id', value: '{{app_id}}', enabled: true }],
      params: [{ key: 'limit', value: '{{page_size}}', enabled: true }],
      body: {
        type: 'json',
        content: '{"user": "{{username}}"}'
      }
    };

    const envMap = new Map<string, string>([
      ['host', 'api.example.com'],
      ['app_id', 'hecto-123'],
      ['page_size', '20'],
      ['username', 'alice']
    ]);

    const cmd = generateCurlCommand(req, envMap);
    expect(cmd).toContain("'https://api.example.com/api/v1?limit=20'");
    expect(cmd).toContain("-H 'X-App-Id: hecto-123'");
    expect(cmd).toContain("--data-raw '{\"user\": \"alice\"}'");
  });

  it('supports environment passed as object with variables array', () => {
    const req: Request = {
      ...baseRequest,
      url: 'https://{{base_url}}/test'
    };

    const envObj = {
      variables: [
        { key: 'base_url', value: 'hecto.dev', enabled: true },
        { key: 'disabled_var', value: 'ignored', enabled: false }
      ]
    };

    const cmd = generateCurlCommand(req, envObj);
    expect(cmd).toBe("curl -X GET 'https://hecto.dev/test'");
  });

  it('supports Bearer Auth', () => {
    const req: Request = {
      ...baseRequest,
      auth: {
        type: 'bearer',
        bearer: { token: 'my-secret-token' }
      }
    };

    const cmd = generateCurlCommand(req);
    expect(cmd).toBe("curl -X GET 'https://api.example.com/users' -H 'Authorization: Bearer my-secret-token'");
  });

  it('supports Basic Auth with Base64 encoding', () => {
    const req: Request = {
      ...baseRequest,
      auth: {
        type: 'basic',
        basic: { username: 'admin', password: 'password123' }
      }
    };

    const expectedB64 = btoa('admin:password123');
    const cmd = generateCurlCommand(req);
    expect(cmd).toBe(`curl -X GET 'https://api.example.com/users' -H 'Authorization: Basic ${expectedB64}'`);
  });

  it('supports API Key in Header', () => {
    const req: Request = {
      ...baseRequest,
      auth: {
        type: 'apiKey',
        apiKey: { key: 'X-API-KEY', value: 'secret-key-val', addTo: 'header' }
      }
    };

    const cmd = generateCurlCommand(req);
    expect(cmd).toBe("curl -X GET 'https://api.example.com/users' -H 'X-API-KEY: secret-key-val'");
  });

  it('supports API Key in Query Param', () => {
    const req: Request = {
      ...baseRequest,
      auth: {
        type: 'apiKey',
        apiKey: { key: 'api_key', value: 'key123', addTo: 'query' }
      }
    };

    const cmd = generateCurlCommand(req);
    expect(cmd).toBe("curl -X GET 'https://api.example.com/users?api_key=key123'");
  });

  it('preserves query params and ignores disabled params', () => {
    const req: Request = {
      ...baseRequest,
      url: 'https://api.example.com/search',
      params: [
        { key: 'q', value: 'test', enabled: true },
        { key: 'disabled', value: 'yes', enabled: false },
        { key: 'page', value: '2', enabled: true }
      ]
    };

    const cmd = generateCurlCommand(req);
    expect(cmd).toBe("curl -X GET 'https://api.example.com/search?q=test&page=2'");
  });

  it('preserves URL hash fragment with query params', () => {
    const req: Request = {
      ...baseRequest,
      url: 'https://api.example.com/docs?v=1#section-2',
      params: [
        { key: 'format', value: 'json', enabled: true }
      ]
    };

    const cmd = generateCurlCommand(req);
    expect(cmd).toBe("curl -X GET 'https://api.example.com/docs?v=1&format=json#section-2'");
  });

  it('includes inherited headers from parent folders and resolves folder variables', () => {
    const req: Request = {
      ...baseRequest,
      headers: [{ key: 'X-Request-Header', value: 'custom', enabled: true }]
    };

    const inheritedHeaders = [
      { key: 'X-Folder-Header', value: '{{folder_val}}', enabled: true }
    ];

    const pathNodes: TreeNode[] = [
      {
        id: 'f-1',
        name: 'Parent Folder',
        type: 'folder',
        path: '/Parent Folder',
        created_at: '2026-10-13',
        variables: [{ key: 'folder_val', value: 'inherited-ok', enabled: true }]
      }
    ];

    const cmd = generateCurlCommand(req, {
      inheritedHeaders,
      pathNodes
    });

    expect(cmd).toContain("-H 'X-Folder-Header: inherited-ok'");
    expect(cmd).toContain("-H 'X-Request-Header: custom'");
  });

  it('supports multiline output formatting', () => {
    const req: Request = {
      ...baseRequest,
      method: 'POST',
      headers: [{ key: 'X-Trace-Id', value: '123', enabled: true }],
      body: {
        type: 'json',
        content: '{"ok":true}'
      }
    };

    const cmd = generateCurlCommand(req, { multiline: true });
    expect(cmd).toBe(
      "curl -X POST \\\n" +
      "  'https://api.example.com/users' \\\n" +
      "  -H 'Content-Type: application/json' \\\n" +
      "  -H 'X-Trace-Id: 123' \\\n" +
      "  --data-raw '{\"ok\":true}'"
    );
  });

  it('supports custom dataFlag option like --data or -d', () => {
    const req: Request = {
      ...baseRequest,
      method: 'POST',
      body: {
        type: 'json',
        content: '{"a":1}'
      }
    };

    const cmdData = generateCurlCommand(req, { dataFlag: '--data' });
    expect(cmdData).toContain("--data '{\"a\":1}'");

    const cmdD = generateCurlCommand(req, { dataFlag: '-d' });
    expect(cmdD).toContain("-d '{\"a\":1}'");
  });

  it('supports inherited folder auth from pathNodes', () => {
    const req: Request = {
      ...baseRequest,
      auth: { type: 'inherit' }
    };

    const pathNodes: TreeNode[] = [
      {
        id: 'f-1',
        name: 'Protected Folder',
        type: 'folder',
        path: '/Protected Folder',
        created_at: '2026-10-13',
        auth: {
          type: 'bearer',
          bearer: { token: 'folder-secret-token' }
        }
      }
    ];

    const cmd = generateCurlCommand(req, { pathNodes });
    expect(cmd).toBe("curl -X GET 'https://api.example.com/users' -H 'Authorization: Bearer folder-secret-token'");
  });

  it('supports environment passed inside GenerateCurlOptions as { environment: ... }', () => {
    const req: Request = {
      ...baseRequest,
      url: 'https://{{domain}}/v2'
    };

    const cmd = generateCurlCommand(req, {
      environment: {
        variables: [{ key: 'domain', value: 'example.org', enabled: true }]
      }
    });

    expect(cmd).toBe("curl -X GET 'https://example.org/v2'");
  });

  it('handles null or undefined environment gracefully', () => {
    const req: Request = { ...baseRequest };
    expect(() => generateCurlCommand(req, null as any)).not.toThrow();
    expect(() => generateCurlCommand(req, undefined)).not.toThrow();
    expect(() => generateCurlCommand(req, { environment: null as any })).not.toThrow();
  });

  it('automatically derives inheritedHeaders when pathNodes is passed without explicit inheritedHeaders', () => {
    const req: Request = { ...baseRequest };
    const pathNodes: TreeNode[] = [
      {
        id: 'f-root',
        name: 'Root Folder',
        type: 'folder',
        path: '/Root Folder',
        created_at: '2026-10-13',
        headers: [{ key: 'X-Root-Header', value: 'auto-inherited', enabled: true }]
      }
    ];

    const cmd = generateCurlCommand(req, { pathNodes });
    expect(cmd).toContain("-H 'X-Root-Header: auto-inherited'");
  });
});
