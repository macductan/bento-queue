export function setupWailsMock() {
  if (typeof window === 'undefined') return;

  if (!window['go']) {
    const tree: any[] = [];
    const requestDetails = new Map<string, any>();
    let counter = 1;

    const clone = (data: any) => (data !== undefined && data !== null ? JSON.parse(JSON.stringify(data)) : data);

    function findNode(nodes: any[], id: string): any {
      for (const node of nodes) {
        if (node.id === id) return node;
        if (node.children && node.children.length > 0) {
          const found = findNode(node.children, id);
          if (found) return found;
        }
      }
      return null;
    }

    function removeNode(nodes: any[], id: string): boolean {
      const idx = nodes.findIndex((n) => n.id === id);
      if (idx !== -1) {
        nodes.splice(idx, 1);
        return true;
      }
      for (const n of nodes) {
        if (n.children && removeNode(n.children, id)) {
          return true;
        }
      }
      return false;
    }

    function addNode(nodes: any[], parentId: string, node: any): void {
      if (!parentId) {
        nodes.push(node);
        return;
      }
      const parent = findNode(nodes, parentId);
      if (parent) {
        if (!parent.children) parent.children = [];
        parent.children.push(node);
      } else {
        nodes.push(node);
      }
    }

    window['go'] = {
      main: {
        App: {
          GetCollectionTree: async () => ({ success: true, data: clone(tree) }),
          CreateRequest: async (parentId: string = '') => {
            const id = 'req_' + counter++;
            const req = {
              id,
              name: 'Request ' + id,
              type: 'request',
              parentId: parentId || null,
              method: 'GET',
              url: ''
            };
            addNode(tree, parentId, req);
            requestDetails.set(id, {
              id,
              name: req.name,
              method: 'GET',
              url: '',
              headers: [],
              params: [],
              body: { type: 'none', content: '' }
            });
            return { success: true, data: clone(req) };
          },
          CreateFolder: async (parentId: string = '') => {
            const id = 'folder_' + counter++;
            const folder = {
              id,
              name: 'New Folder',
              type: 'folder',
              parentId: parentId || null,
              children: []
            };
            addNode(tree, parentId, folder);
            return { success: true, data: clone(folder) };
          },
          RenameRequest: async (id: string, name: string) => {
            const node = findNode(tree, id);
            if (node) node.name = name;
            const details = requestDetails.get(id);
            if (details) details.name = name;
            return { success: true, data: clone(node || { id, name }) };
          },
          RenameFolder: async (id: string, name: string) => {
            const node = findNode(tree, id);
            if (node) node.name = name;
            return { success: true, data: clone(node || { id, name }) };
          },
          DuplicateRequest: async (id: string) => {
            const original = findNode(tree, id);
            const origDetails = requestDetails.get(id);
            const newId = 'req_' + counter++;
            const name = (original?.name || 'Request') + ' (bản sao)';
            const copy = {
              ...(original || {}),
              id: newId,
              name
            };
            addNode(tree, original?.parentId || '', copy);
            requestDetails.set(newId, {
              ...(origDetails || {}),
              id: newId,
              name
            });
            return { success: true, data: clone(copy) };
          },
          DeleteRequest: async (id: string) => {
            removeNode(tree, id);
            requestDetails.delete(id);
            return { success: true, data: null };
          },
          DeleteFolder: async (id: string) => {
            removeNode(tree, id);
            return { success: true, data: null };
          },
          GetRequest: async (id: string) => {
            const req = requestDetails.get(id) || {
              id,
              name: 'Request',
              method: 'GET',
              url: '',
              headers: [],
              params: [],
              body: { type: 'none', content: '' }
            };
            return { success: true, data: clone(req) };
          },
          SaveRequest: async (req: any) => {
            requestDetails.set(req.id, req);
            const node = findNode(tree, req.id);
            if (node) node.name = req.name;
            return { success: true, data: clone(req) };
          },
          LoadFolder: async (id: string) => ({
            success: true,
            data: { id, name: 'Folder', headers: [], auth: {} }
          }),
          UpdateFolder: async (folder: any) => ({ success: true, data: clone(folder) }),
          ListEnvironments: async () => ({ success: true, data: [] }),
          GetEnvironment: async () => ({ success: true, data: null }),
          SaveEnvironment: async (env: any) => ({ success: true, data: clone(env) }),
          DeleteEnvironment: async () => ({ success: true, data: null }),
          GetCollectionRoot: async () => ({ success: true, data: '/mock/storage' }),
          UpdateCollectionRoot: async () => ({ success: true, data: '/mock/storage' }),
          SelectDirectoryDialog: async () => ({ success: true, data: '/mock/storage' }),
          SelectPostmanFile: async () => ({ success: true, data: '' }),
          ImportPostman: async () => ({ success: true, data: null }),
          SendRequest: async () => ({
            success: true,
            data: {
              status_code: 200,
              status_text: 'OK',
              headers: {},
              body: 'OK',
              size_bytes: 2,
              time_ms: 10,
              timestamp: new Date().toISOString()
            }
          }),
          AbortRequest: async () => ({ success: true, data: null }),
          MoveRequest: async () => ({ success: true, data: null }),
          ListCollections: async () => ({
            success: true,
            data: [
              { id: 'default', name: 'Default Collection', is_default: true, is_active: true }
            ]
          }),
          SwitchCollection: async (_id: string) => ({ success: true, data: null }),
          CreateCollection: async (name: string) => ({ success: true, data: { id: 'new-uuid', name } }),
          RenameCollection: async (_id: string, _name: string) => ({ success: true, data: null }),
          DeleteCollection: async (_id: string) => ({ success: true, data: null }),
          DuplicateCollection: async (_id: string) => ({ success: true, data: null })
        }
      }
    };
  }

  if (!window['runtime']) {
    window['runtime'] = {
      EventsOn: () => () => {},
      EventsOnMultiple: () => () => {},
      EventsOff: () => {},
      EventsOffAll: () => {},
      EventsOnce: () => {},
      EventsEmit: () => {},
      ClipboardSetText: async () => true,
      WindowSetTitle: () => {},
      LogPrint: () => {},
      LogTrace: () => {},
      LogDebug: () => {},
      LogInfo: () => {},
      LogWarning: () => {},
      LogError: () => {},
      LogFatal: () => {}
    };
  }
}
