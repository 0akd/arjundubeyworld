const PROJECT_ID = 'arjundubey-dbe8d'
const DOCUMENT_ID = /^[A-Za-z0-9](?:[A-Za-z0-9_-]{0,127})$/
const CREATE_FIELDS = new Set(['id', 'parentId', 'type', 'task', 'isCompleted', 'timestamp', 'steps', 'whiteboardJson'])
const PATCH_FIELDS = new Set(['parentId', 'type', 'task', 'isCompleted', 'timestamp', 'steps', 'whiteboardJson'])

export type Todo = {
  id: string
  parentId: string
  type: string
  task: string
  isCompleted: boolean
  timestamp: number
  steps: string[]
  whiteboardJson: string
}

export type TodoPatch = {
  parentId?: string
  type?: string
  task?: string
  isCompleted?: boolean
  timestamp?: number
  steps?: string[]
  whiteboardJson?: string
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string }

type FirestoreValue =
  | { stringValue: string }
  | { booleanValue: boolean }
  | { integerValue: string | number }
  | { arrayValue: { values?: FirestoreValue[] } }

type FirestoreDocument = {
  name?: string
  fields?: Record<string, FirestoreValue>
}

export class FirestoreRequestError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'FirestoreRequestError'
    this.status = status
  }
}

export function isDocumentId(id: string): boolean {
  if (!DOCUMENT_ID.test(id)) return false
  return !(id.startsWith('__') && id.endsWith('__'))
}

export function parseCreateBody(body: unknown): ParseResult<Todo> {
  if (!isRecord(body)) return fail('Expected a JSON object')
  const unknown = unexpectedField(body, CREATE_FIELDS)
  if (unknown) return fail(`Unknown field: ${unknown}`)

  let id: string
  if (body.id === undefined || body.id === '') id = crypto.randomUUID()
  else if (typeof body.id === 'string' && isDocumentId(body.id)) id = body.id
  else return fail('Invalid id')

  const parentId = parseParentId(body.parentId === undefined ? '' : body.parentId)
  if (!parentId.ok) return parentId
  if (parentId.value === id) return fail('A task cannot contain itself')

  const type = parseType(body.type)
  if (!type.ok) return type
  const task = parseTask(body.task)
  if (!task.ok) return task

  let isCompleted = false
  if (body.isCompleted !== undefined) {
    if (typeof body.isCompleted !== 'boolean') return fail('isCompleted must be a boolean')
    isCompleted = body.isCompleted
  }

  const timestamp = body.timestamp === undefined ? ok(Date.now()) : parseTimestamp(body.timestamp)
  if (!timestamp.ok) return timestamp
  const steps = body.steps === undefined ? ok<string[]>([]) : parseSteps(body.steps)
  if (!steps.ok) return steps
  const whiteboardJson = body.whiteboardJson === undefined ? ok('') : parseWhiteboard(body.whiteboardJson)
  if (!whiteboardJson.ok) return whiteboardJson

  return ok({
    id,
    parentId: parentId.value,
    type: type.value,
    task: task.value,
    isCompleted,
    timestamp: timestamp.value,
    steps: steps.value,
    whiteboardJson: whiteboardJson.value,
  })
}

export function parsePatchBody(body: unknown, todoId: string): ParseResult<TodoPatch> {
  if (!isRecord(body)) return fail('Expected a JSON object')
  const unknown = unexpectedField(body, PATCH_FIELDS)
  if (unknown) return fail(`Unknown field: ${unknown}`)

  const patch: TodoPatch = {}
  if ('parentId' in body) {
    const parentId = parseParentId(body.parentId)
    if (!parentId.ok) return parentId
    if (parentId.value === todoId) return fail('A task cannot contain itself')
    patch.parentId = parentId.value
  }
  if ('type' in body) {
    const type = parseType(body.type)
    if (!type.ok) return type
    patch.type = type.value
  }
  if ('task' in body) {
    const task = parseTask(body.task)
    if (!task.ok) return task
    patch.task = task.value
  }
  if ('isCompleted' in body) {
    if (typeof body.isCompleted !== 'boolean') return fail('isCompleted must be a boolean')
    patch.isCompleted = body.isCompleted
  }
  if ('timestamp' in body) {
    const timestamp = parseTimestamp(body.timestamp)
    if (!timestamp.ok) return timestamp
    patch.timestamp = timestamp.value
  }
  if ('steps' in body) {
    const steps = parseSteps(body.steps)
    if (!steps.ok) return steps
    patch.steps = steps.value
  }
  if ('whiteboardJson' in body) {
    const whiteboardJson = parseWhiteboard(body.whiteboardJson)
    if (!whiteboardJson.ok) return whiteboardJson
    patch.whiteboardJson = whiteboardJson.value
  }

  if (Object.keys(patch).length === 0) return fail('No fields to update')
  return ok(patch)
}

export function encodeTodoFields(todo: Todo): Record<string, FirestoreValue> {
  return {
    id: { stringValue: todo.id },
    parentId: { stringValue: todo.parentId },
    type: { stringValue: todo.type },
    task: { stringValue: todo.task },
    isCompleted: { booleanValue: todo.isCompleted },
    timestamp: { integerValue: String(todo.timestamp) },
    steps: encodeSteps(todo.steps),
    whiteboardJson: { stringValue: todo.whiteboardJson },
  }
}

export function decodeDocument(doc: FirestoreDocument): Todo {
  const fields = doc.fields ?? {}
  return {
    id: idFromName(doc.name),
    parentId: asString(fields.parentId) ?? '',
    type: asString(fields.type) ?? 'TODO',
    task: asString(fields.task) ?? '',
    isCompleted: asBoolean(fields.isCompleted) ?? false,
    timestamp: asInteger(fields.timestamp) ?? 0,
    steps: asStringArray(fields.steps),
    whiteboardJson: asString(fields.whiteboardJson) ?? '',
  }
}

export async function listTodos(token: string, userId: string): Promise<Todo[]> {
  const todos: Todo[] = []
  let pageToken = ''

  for (let page = 0; page < 40; page++) {
    const params = new URLSearchParams({ pageSize: '300' })
    if (pageToken) params.set('pageToken', pageToken)
    const response = await firestoreFetch(token, `${collectionUrl(userId)}?${params}`)
    if (!response.ok) throw await readFirestoreError(response)
    const body = await readJsonObject(response)
    const documents = Array.isArray(body.documents) ? body.documents as FirestoreDocument[] : []
    for (const doc of documents) {
      const todo = decodeDocument(doc)
      if (todo.id) todos.push(todo)
    }
    const next = body.nextPageToken
    if (typeof next !== 'string' || next.length === 0) return todos
    pageToken = next
  }

  throw new FirestoreRequestError(400, 'Too many todos to return')
}

export async function createTodo(token: string, userId: string, todo: Todo): Promise<Todo> {
  const url = `${collectionUrl(userId)}?documentId=${encodeURIComponent(todo.id)}`
  const response = await firestoreFetch(token, url, {
    method: 'POST',
    body: JSON.stringify({ fields: encodeTodoFields(todo) }),
  })
  if (!response.ok) throw await readFirestoreError(response)
  const created = decodeDocument(await readJsonObject(response) as FirestoreDocument)
  if (!created.id) throw new FirestoreRequestError(502, 'Firestore did not return a document id')
  return created
}

export async function updateTodo(token: string, userId: string, todoId: string, patch: TodoPatch): Promise<Todo> {
  const encoded = encodePatch(patch)
  const params = new URLSearchParams()
  for (const field of encoded.mask) params.append('updateMask.fieldPaths', field)
  const response = await firestoreFetch(token, `${documentUrl(userId, todoId)}?${params}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields: encoded.fields }),
  })
  if (!response.ok) throw await readFirestoreError(response)
  const updated = decodeDocument(await readJsonObject(response) as FirestoreDocument)
  if (!updated.id) throw new FirestoreRequestError(502, 'Firestore did not return a document id')
  return updated
}

export async function deleteTodo(token: string, userId: string, todoId: string): Promise<void> {
  const response = await firestoreFetch(token, documentUrl(userId, todoId), { method: 'DELETE' })
  if (!response.ok) throw await readFirestoreError(response)
}

function encodePatch(patch: TodoPatch): { fields: Record<string, FirestoreValue>; mask: string[] } {
  const fields: Record<string, FirestoreValue> = {}
  const mask: string[] = []
  const write = (name: string, value: FirestoreValue) => {
    fields[name] = value
    mask.push(name)
  }
  if (patch.parentId !== undefined) write('parentId', { stringValue: patch.parentId })
  if (patch.type !== undefined) write('type', { stringValue: patch.type })
  if (patch.task !== undefined) write('task', { stringValue: patch.task })
  if (patch.isCompleted !== undefined) write('isCompleted', { booleanValue: patch.isCompleted })
  if (patch.timestamp !== undefined) write('timestamp', { integerValue: String(patch.timestamp) })
  if (patch.steps !== undefined) write('steps', encodeSteps(patch.steps))
  if (patch.whiteboardJson !== undefined) write('whiteboardJson', { stringValue: patch.whiteboardJson })
  return { fields, mask }
}

function encodeSteps(steps: string[]): FirestoreValue {
  if (steps.length === 0) return { arrayValue: {} }
  return { arrayValue: { values: steps.map((step) => ({ stringValue: step })) } }
}

function collectionUrl(userId: string): string {
  return `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${encodeURIComponent(userId)}/todos`
}

function documentUrl(userId: string, todoId: string): string {
  return `${collectionUrl(userId)}/${encodeURIComponent(todoId)}`
}

async function firestoreFetch(token: string, url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  if (init.body) headers.set('Content-Type', 'application/json')
  // Workers reject redirect: "error". "manual" keeps the Firebase token from being forwarded to another host.
  const response = await fetch(url, { ...init, headers, redirect: 'manual' })
  if (response.status >= 300 && response.status < 400) {
    throw new FirestoreRequestError(502, 'Firestore redirected the request')
  }
  return response
}

async function readFirestoreError(response: Response): Promise<FirestoreRequestError> {
  let message = 'Firestore request failed'
  try {
    const body = await response.json() as { error?: { message?: string } }
    if (typeof body.error?.message === 'string' && body.error.message.length > 0) {
      message = body.error.message.slice(0, 300)
    }
  } catch {
    // Keep the generic message when Firestore returns a non-JSON error page.
  }
  return new FirestoreRequestError(response.status, message)
}

async function readJsonObject(response: Response): Promise<Record<string, unknown>> {
  const body = await response.json()
  if (!isRecord(body)) throw new FirestoreRequestError(502, 'Unexpected Firestore response')
  return body
}

function idFromName(name: string | undefined): string {
  if (!name) return ''
  const segment = name.split('/').pop() ?? ''
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

function asString(value: FirestoreValue | undefined): string | undefined {
  if (!value || !('stringValue' in value) || typeof value.stringValue !== 'string') return undefined
  return value.stringValue
}

function asBoolean(value: FirestoreValue | undefined): boolean | undefined {
  if (!value || !('booleanValue' in value) || typeof value.booleanValue !== 'boolean') return undefined
  return value.booleanValue
}

function asInteger(value: FirestoreValue | undefined): number | undefined {
  if (!value || !('integerValue' in value)) return undefined
  const raw = value.integerValue
  const parsed = typeof raw === 'number' ? raw : Number(raw)
  return Number.isSafeInteger(parsed) ? parsed : undefined
}

function asStringArray(value: FirestoreValue | undefined): string[] {
  if (!value || !('arrayValue' in value)) return []
  const values = value.arrayValue.values ?? []
  const steps: string[] = []
  for (const item of values) {
    if ('stringValue' in item && typeof item.stringValue === 'string') steps.push(item.stringValue)
  }
  return steps
}

function parseParentId(value: unknown): ParseResult<string> {
  if (typeof value !== 'string') return fail('parentId must be a string')
  if (value.length === 0) return ok('')
  if (!isDocumentId(value)) return fail('Invalid parentId')
  return ok(value)
}

function parseType(value: unknown): ParseResult<string> {
  if (value !== 'TODO' && value !== 'FOLDER') return fail('type must be TODO or FOLDER')
  return ok(value)
}

function parseTask(value: unknown): ParseResult<string> {
  if (typeof value !== 'string' || value.length === 0 || value.trim().length === 0) return fail('task must not be empty')
  if (value.length > 4000) return fail('task is too long')
  return ok(value)
}

function parseTimestamp(value: unknown): ParseResult<number> {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) return fail('timestamp must be an integer')
  return ok(value)
}

function parseSteps(value: unknown): ParseResult<string[]> {
  if (!Array.isArray(value)) return fail('steps must be a list of strings')
  if (value.length > 500) return fail('too many steps')
  const steps: string[] = []
  for (const step of value) {
    if (typeof step !== 'string') return fail('steps must be a list of strings')
    if (step.length > 4000) return fail('a step is too long')
    steps.push(step)
  }
  return ok(steps)
}

function parseWhiteboard(value: unknown): ParseResult<string> {
  if (typeof value !== 'string') return fail('whiteboardJson must be a string')
  if (value.length > 2_000_000) return fail('whiteboard is too large')
  return ok(value)
}

function unexpectedField(body: Record<string, unknown>, allowed: Set<string>): string | null {
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) return key
  }
  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function ok<T>(value: T): ParseResult<T> {
  return { ok: true, value }
}

function fail(error: string): ParseResult<never> {
  return { ok: false, error }
}
