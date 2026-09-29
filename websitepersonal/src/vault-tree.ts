export function isValidVaultPaste(
  targetFolderId: string,
  clipboardId: string,
  all: readonly { id: string; parent_id: string }[],
): boolean {
  if (targetFolderId === clipboardId) return false;
  let currentId = targetFolderId;
  const seen = new Set<string>();
  while (currentId) {
    if (seen.has(currentId)) return false;
    seen.add(currentId);
    const current = all.find((item) => item.id === currentId);
    if (!current) return true;
    if (current.parent_id === clipboardId) return false;
    currentId = current.parent_id;
  }
  return true;
}

export function collectVaultDeleteOrder(
  nodeId: string,
  nodes: readonly { id: string; parent_id: string }[],
): string[] {
  const children = nodes.filter((node) => node.parent_id === nodeId);
  return [
    ...children.flatMap((child) => collectVaultDeleteOrder(child.id, nodes)),
    nodeId,
  ];
}

export function displayVaultFiles<
  T extends { parent_id: string; timestamp: number },
>(nodes: readonly T[], parentId: string): T[] {
  return nodes
    .filter((node) => node.parent_id === parentId)
    .sort((a, b) => b.timestamp - a.timestamp);
}
