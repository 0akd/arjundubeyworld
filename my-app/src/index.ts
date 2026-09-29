import { Hono, type Context } from 'hono'
import { cors } from 'hono/cors'
import { uidFromFirebaseToken } from './auth'
import {
  FirestoreRequestError,
  createTodo,
  deleteTodo,
  isDocumentId,
  listTodos,
  parseCreateBody,
  parsePatchBody,
  updateTodo,
} from './firestore'
import {
  TursoConfigError,
  createVaultFile,
  deleteVaultFile,
  listVaultFiles,
  parseFileBody,
} from './turso'

type Bindings = {
  TURSO_DATABASE_URL: string
  TURSO_AUTH_TOKEN: string
}

type Variables = {
  token: string
  uid: string
}

type AppContext = Context<{ Bindings: Bindings; Variables: Variables }>
type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 429 | 500 | 502

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

app.get('/', (c) => c.text('Hello Hono!'))

app.use('/api/*', async (c, next) => {
  await next()
  c.header('Cache-Control', 'no-store')
})

app.use('/api/*', cors({
  origin: '*',
  allowHeaders: ['Authorization', 'Content-Type'],
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  maxAge: 86400,
}))

// Workers cannot run the firebase-admin SDK. Forward the Firebase ID token so Firestore rules still apply.
app.use('/api/*', async (c, next) => {
  if (c.req.method === 'OPTIONS') return next()

  const header = c.req.header('Authorization') ?? ''
  const match = /^Bearer\s+(\S+)$/.exec(header)
  if (!match || match[1].length > 16384) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401)
  }

  const uid = uidFromFirebaseToken(match[1])
  if (!uid) return c.json({ error: 'Missing or invalid Authorization header' }, 401)

  c.set('token', match[1])
  c.set('uid', uid)
  await next()
})

app.get('/api/users/:userId/todos', async (c) => {
  const userId = c.req.param('userId')
  const denied = gate(c, userId)
  if (denied) return denied
  try {
    return c.json(await listTodos(c.get('token'), userId))
  } catch (error) {
    return firestoreFailure(c, error)
  }
})

app.post('/api/users/:userId/todos', async (c) => {
  const userId = c.req.param('userId')
  const denied = gate(c, userId)
  if (denied) return denied
  const body = await readJson(c)
  if (body instanceof Response) return body
  const parsed = parseCreateBody(body)
  if (!parsed.ok) return c.json({ error: parsed.error }, 400)
  try {
    return c.json(await createTodo(c.get('token'), userId, parsed.value), 201)
  } catch (error) {
    return firestoreFailure(c, error)
  }
})

app.patch('/api/users/:userId/todos/:todoId', async (c) => {
  const userId = c.req.param('userId')
  const todoId = c.req.param('todoId')
  const denied = gate(c, userId)
  if (denied) return denied
  if (!isDocumentId(todoId)) return c.json({ error: 'Invalid todo id' }, 400)
  const body = await readJson(c)
  if (body instanceof Response) return body
  const parsed = parsePatchBody(body, todoId)
  if (!parsed.ok) return c.json({ error: parsed.error }, 400)
  try {
    return c.json(await updateTodo(c.get('token'), userId, todoId, parsed.value))
  } catch (error) {
    return firestoreFailure(c, error)
  }
})

app.delete('/api/users/:userId/todos/:todoId', async (c) => {
  const userId = c.req.param('userId')
  const todoId = c.req.param('todoId')
  const denied = gate(c, userId)
  if (denied) return denied
  if (!isDocumentId(todoId)) return c.json({ error: 'Invalid todo id' }, 400)
  try {
    await deleteTodo(c.get('token'), userId, todoId)
    return c.body(null, 204)
  } catch (error) {
    return firestoreFailure(c, error)
  }
})

app.get('/api/users/:userId/vault', async (c) => {
  const userId = c.req.param('userId')
  const denied = gate(c, userId)
  if (denied) return denied
  try {
    return c.json(await listVaultFiles(c.env, userId))
  } catch (error) {
    return tursoFailure(c, error, 'Database request failed')
  }
})

app.post('/api/users/:userId/vault', async (c) => {
  const userId = c.req.param('userId')
  const denied = gate(c, userId)
  if (denied) return denied
  const body = await readJson(c)
  if (body instanceof Response) return body
  const parsed = parseFileBody(body)
  if (!parsed.ok) return c.json({ error: parsed.error }, 400)
  try {
    return c.json(await createVaultFile(c.env, userId, parsed.value), 201)
  } catch (error) {
    return tursoFailure(c, error, 'Failed to insert into Turso')
  }
})

app.delete('/api/users/:userId/vault/:fileId', async (c) => {
  const userId = c.req.param('userId')
  const fileId = c.req.param('fileId')
  const denied = gate(c, userId)
  if (denied) return denied
  try {
    await deleteVaultFile(c.env, userId, fileId)
    return c.body(null, 204)
  } catch (error) {
    return tursoFailure(c, error, 'Database request failed')
  }
})

app.onError((error, c) => {
  console.error(error instanceof Error ? error.message : 'Unhandled error')
  return c.json({ error: 'Internal error' }, 500)
})

function gate(c: AppContext, userId: string): Response | null {
  if (!isDocumentId(userId)) return c.json({ error: 'Invalid user id' }, 400)
  if (c.get('uid') !== userId) return c.json({ error: 'Forbidden' }, 403)
  return null
}

async function readJson(c: AppContext): Promise<unknown> {
  try {
    return await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }
}

function tursoFailure(c: AppContext, error: unknown, fallback: string): Response {
  if (error instanceof TursoConfigError) return c.json({ error: error.message }, 500)
  console.error(error instanceof Error ? error.message : fallback)
  return c.json({ error: fallback }, 502)
}

function firestoreFailure(c: AppContext, error: unknown): Response {
  if (error instanceof FirestoreRequestError) {
    return c.json({ error: error.message }, normalizeStatus(error.status))
  }
  console.error(error instanceof Error ? error.message : 'Firestore request failed')
  return c.json({ error: 'Could not reach Firestore' }, 502)
}

function normalizeStatus(status: number): ErrorStatus {
  switch (status) {
    case 400:
    case 401:
    case 403:
    case 404:
    case 409:
    case 429:
      return status
    default:
      return status >= 400 && status < 500 ? 400 : 502
  }
}

export default app
