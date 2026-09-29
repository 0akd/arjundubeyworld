export const API_BASE_URL = "https://my-app.atrikumar31.workers.dev/api";

export interface Todo {
  id: string;
  parentId: string;
  type: string;
  task: string;
  isCompleted: boolean;
  timestamp: number;
  steps: string[];
  whiteboardJson: string;
}

export type TodoPatch = Partial<Omit<Todo, "id">>;

export async function getTodos(token: string, userId: string): Promise<Todo[]> {
  const response = await fetch(collectionUrl(userId), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) await fail(response, "Failed to fetch tasks");
  return response.json() as Promise<Todo[]>;
}

export async function createTodo(
  token: string,
  userId: string,
  todo: Todo,
): Promise<Todo> {
  const response = await fetch(collectionUrl(userId), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(todo),
  });
  if (!response.ok) await fail(response, "Failed to create task");
  return response.json() as Promise<Todo>;
}

export async function updateTodo(
  token: string,
  userId: string,
  todoId: string,
  patch: TodoPatch,
): Promise<Todo> {
  const response = await fetch(
    `${collectionUrl(userId)}/${encodeURIComponent(todoId)}`,
    {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(patch),
    },
  );
  if (!response.ok) await fail(response, "Failed to update task");
  return response.json() as Promise<Todo>;
}

export async function deleteTodo(
  token: string,
  userId: string,
  todoId: string,
): Promise<void> {
  const response = await fetch(
    `${collectionUrl(userId)}/${encodeURIComponent(todoId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (!response.ok) await fail(response, "Failed to delete task");
}

function collectionUrl(userId: string): string {
  return `${API_BASE_URL}/users/${encodeURIComponent(userId)}/todos`;
}

// Vault API

export interface VaultFile {
  id: string;
  user_id: string;
  parent_id: string;
  type: string;
  file_name: string;
  mime_type: string;
  data: string;
  timestamp: number;
  created_at: string | null;
}

export interface VaultFileInput {
  parent_id: string;
  type: string;
  file_name: string;
  mime_type: string;
  data: string;
  timestamp: number;
}

export type VaultFilePatch = {
  parent_id?: string;
  type?: string;
  file_name?: string;
  timestamp?: number;
};

export function normalizeVaultFile(file: VaultFile): VaultFile {
  const rawTimestamp = file.timestamp as unknown;
  const timestamp =
    typeof rawTimestamp === "number" ? rawTimestamp : Number(rawTimestamp);
  return {
    ...file,
    parent_id: typeof file.parent_id === "string" ? file.parent_id : "",
    type: file.type === "FOLDER" ? "FOLDER" : file.type || "FILE",
    timestamp: Number.isFinite(timestamp) ? Math.trunc(timestamp) : 0,
  };
}

export async function getVaultFiles(
  token: string,
  userId: string,
): Promise<VaultFile[]> {
  const response = await fetch(
    `${API_BASE_URL}/users/${encodeURIComponent(userId)}/vault`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) await fail(response, "Failed to fetch files");
  const files = (await response.json()) as VaultFile[];
  return files.map(normalizeVaultFile);
}

export async function createVaultFile(
  token: string,
  userId: string,
  data: VaultFileInput,
): Promise<VaultFile> {
  const response = await fetch(
    `${API_BASE_URL}/users/${encodeURIComponent(userId)}/vault`,
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    },
  );
  if (!response.ok) await fail(response, "Failed to upload file");
  return normalizeVaultFile((await response.json()) as VaultFile);
}

export async function updateVaultFile(
  token: string,
  userId: string,
  fileId: string,
  patch: VaultFilePatch,
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/users/${encodeURIComponent(userId)}/vault/${encodeURIComponent(fileId)}`,
    {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(patch),
    },
  );
  if (!response.ok) await fail(response, "Failed to update file");
}

export async function deleteVaultFile(
  token: string,
  userId: string,
  fileId: string,
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/users/${encodeURIComponent(userId)}/vault/${encodeURIComponent(fileId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (!response.ok) await fail(response, "Failed to delete file");
}

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function fail(response: Response, fallback: string): Promise<never> {
  let message = fallback;
  try {
    const body = (await response.json()) as { error?: string };
    if (body.error) message = body.error;
  } catch {
    // Keep the fallback when the worker does not return JSON.
  }
  throw new Error(message);
}
