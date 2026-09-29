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
