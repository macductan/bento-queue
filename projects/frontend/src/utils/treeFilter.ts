import type { TreeNode } from '@/stores/collectionStore'
import type { FlowTreeNode } from '@/stores/flowStore'

export interface FilterTreeResult {
  filtered: TreeNode[]
  expandedFolderIds: Set<string>
}

export interface FilterFlowTreeResult {
  filtered: FlowTreeNode[]
  expandedFolderIds: Set<string>
}

export interface NodeMatchOverrides {
  activeRequestId?: string | null
  activeRequestUrl?: string
  activeRequestBody?: string
}

export function matchesTreeNode(
  node: TreeNode,
  query: string,
  overrides?: NodeMatchOverrides
): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true

  // Folder name matching
  if (node.type === 'folder') {
    return (node.name || '').toLowerCase().includes(q)
  }

  // Request name matching
  if ((node.name || '').toLowerCase().includes(q)) {
    return true
  }

  // Request URL matching
  const url = (overrides?.activeRequestId === node.id && overrides?.activeRequestUrl !== undefined
    ? overrides.activeRequestUrl
    : node.url) || ''
  if (url.toLowerCase().includes(q)) {
    return true
  }

  // Request Body content matching
  const bodyContent = (overrides?.activeRequestId === node.id && overrides?.activeRequestBody !== undefined
    ? overrides.activeRequestBody
    : node.body?.content) || ''
  if (bodyContent.toLowerCase().includes(q)) {
    return true
  }

  return false
}

export function filterTree(
  nodes: TreeNode[],
  query: string,
  overrides?: NodeMatchOverrides
): FilterTreeResult {
  const q = query.trim().toLowerCase()
  if (!q) {
    return {
      filtered: nodes,
      expandedFolderIds: new Set<string>()
    }
  }

  const expandedFolderIds = new Set<string>()

  function filterList(list: TreeNode[], ancestors: string[]): TreeNode[] {
    const result: TreeNode[] = []

    for (const node of list) {
      if (node.type === 'folder') {
        const selfMatch = (node.name || '').toLowerCase().includes(q)
        const currentAncestors = [...ancestors, node.id]
        const filteredChildren = node.children
          ? filterList(node.children, currentAncestors)
          : []

        if (selfMatch || filteredChildren.length > 0) {
          // If any child matched, this folder and all its ancestors must be expanded
          if (filteredChildren.length > 0) {
            for (const ancId of currentAncestors) {
              expandedFolderIds.add(ancId)
            }
          }
          // If the folder itself matched, expand all its ancestors and self
          if (selfMatch) {
            for (const ancId of ancestors) {
              expandedFolderIds.add(ancId)
            }
            expandedFolderIds.add(node.id)
          }

          const childrenToKeep =
            selfMatch && filteredChildren.length === 0 && node.children
              ? node.children
              : filteredChildren

          result.push({
            ...node,
            children: childrenToKeep
          })
        }
      } else {
        if (matchesTreeNode(node, q, overrides)) {
          for (const ancId of ancestors) {
            expandedFolderIds.add(ancId)
          }
          result.push(node)
        }
      }
    }

    return result
  }

  const filtered = filterList(nodes, [])
  return {
    filtered,
    expandedFolderIds
  }
}

export function matchesFlowTreeNode(
  node: FlowTreeNode,
  query: string,
  activeFlowOverrides?: { activeFlowId?: string | null; activeFlowName?: string; activeFlowDescription?: string }
): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true

  const name =
    (activeFlowOverrides?.activeFlowId === node.id && activeFlowOverrides?.activeFlowName !== undefined
      ? activeFlowOverrides.activeFlowName
      : node.name) || ''
  if (name.toLowerCase().includes(q)) {
    return true
  }

  if (node.type !== 'flow_folder') {
    const desc =
      (activeFlowOverrides?.activeFlowId === node.id && activeFlowOverrides?.activeFlowDescription !== undefined
        ? activeFlowOverrides.activeFlowDescription
        : node.description) || ''
    if (desc.toLowerCase().includes(q)) {
      return true
    }
  }

  return false
}

export function filterFlowTree(
  nodes: FlowTreeNode[],
  query: string,
  activeFlowOverrides?: { activeFlowId?: string | null; activeFlowName?: string; activeFlowDescription?: string }
): FilterFlowTreeResult {
  const q = query.trim().toLowerCase()
  if (!q) {
    return {
      filtered: nodes,
      expandedFolderIds: new Set<string>()
    }
  }

  const expandedFolderIds = new Set<string>()

  function filterList(list: FlowTreeNode[], ancestors: string[]): FlowTreeNode[] {
    const result: FlowTreeNode[] = []

    for (const node of list) {
      if (node.type === 'flow_folder') {
        const selfMatch = (node.name || '').toLowerCase().includes(q)
        const currentAncestors = [...ancestors, node.id]
        const filteredChildren = node.children
          ? filterList(node.children, currentAncestors)
          : []

        if (selfMatch || filteredChildren.length > 0) {
          if (filteredChildren.length > 0) {
            for (const ancId of currentAncestors) {
              expandedFolderIds.add(ancId)
            }
          }
          if (selfMatch) {
            for (const ancId of ancestors) {
              expandedFolderIds.add(ancId)
            }
            expandedFolderIds.add(node.id)
          }

          const childrenToKeep =
            selfMatch && filteredChildren.length === 0 && node.children
              ? node.children
              : filteredChildren

          result.push({
            ...node,
            children: childrenToKeep
          })
        }
      } else {
        if (matchesFlowTreeNode(node, q, activeFlowOverrides)) {
          for (const ancId of ancestors) {
            expandedFolderIds.add(ancId)
          }
          result.push(node)
        }
      }
    }

    return result
  }

  const filtered = filterList(nodes, [])
  return {
    filtered,
    expandedFolderIds
  }
}
