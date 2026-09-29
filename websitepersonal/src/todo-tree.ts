import type { Todo } from "./api";

export function isValidPaste(
  targetFolderId: string,
  clipboardId: string,
  all: readonly Todo[],
): boolean {
  if (targetFolderId === clipboardId) return false;
  let currentId = targetFolderId;
  const seen = new Set<string>();
  while (currentId) {
    if (seen.has(currentId)) return false;
    seen.add(currentId);
    const current = all.find((todo) => todo.id === currentId);
    if (!current) return true;
    if (current.parentId === clipboardId) return false;
    currentId = current.parentId;
  }
  return true;
}

export function duplicateTree(
  node: Todo,
  newParentId: string,
  nodes: readonly Todo[],
  now = Date.now(),
): Todo[] {
  const copy: Todo = {
    ...node,
    id: crypto.randomUUID(),
    parentId: newParentId,
    timestamp: now,
  };
  if (node.type !== "FOLDER") return [copy];
  const children = nodes.filter((todo) => todo.parentId === node.id);
  return [
    copy,
    ...children.flatMap((child) => duplicateTree(child, copy.id, nodes, now)),
  ];
}

export function collectDeleteOrder(
  nodeId: string,
  nodes: readonly Todo[],
): string[] {
  const children = nodes.filter((todo) => todo.parentId === nodeId);
  return [
    ...children.flatMap((child) => collectDeleteOrder(child.id, nodes)),
    nodeId,
  ];
}

export function displayTodos(nodes: readonly Todo[], parentId: string): Todo[] {
  return nodes
    .filter((todo) => todo.parentId === parentId)
    .sort((a, b) => b.timestamp - a.timestamp);
}

export function reorderTimestamps(
  current: number,
  neighbor: number,
  direction: "up" | "down",
): { current: number; neighbor: number } {
  if (current === neighbor) {
    return direction === "up"
      ? { current: neighbor + 1, neighbor: current - 1 }
      : { current: current - 1, neighbor: neighbor + 1 };
  }
  return { current: neighbor, neighbor: current };
}
