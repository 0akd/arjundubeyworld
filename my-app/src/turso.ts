import { createClient, type Client, type ResultSet } from '@libsql/client/web'

export type TursoEnv = {
  TURSO_DATABASE_URL: string
  TURSO_AUTH_TOKEN: string
}

export type VaultFile = {
  id: string
  user_id: string
  parent_id: string
  type: string
  file_name: string
  mime_type: string
  data: string
  timestamp: number
  created_at: string | null
}

export type VaultFileInput = {
  file_name: string
  mime_type: string
  data: string
  parent_id: string
  type: string
  timestamp: number
}

export type VaultFilePatch = {
  parent_id?: string
  type?: string
  file_name?: string
  timestamp?: number
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string }

// 10MB limit (approx. 7MB file size after Base64 inflation)
const MAX_DATA_CHARS = 10_000_000

export class TursoConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TursoConfigError'
  }
}

export function parseFileBody(body: unknown): ParseResult<VaultFileInput> {
  if (!isRecord(body)) return { ok: false, error: 'Expected a JSON object' }
  const file_name = typeof body.file_name === 'string' ? body.file_name : 'unnamed_file'
  const mime_type = typeof body.mime_type === 'string' ? body.mime_type : 'application/octet-stream'
  const parent_id = typeof body.parent_id === 'string' ? body.parent_id : ''
  const type = typeof body.type === 'string' && body.type.length > 0 ? body.type : 'FILE'
  const timestamp = timestampValue(body.timestamp, Date.now())
  let data = typeof body.data === 'string' ? body.data : ''

  if (type === 'FOLDER') {
    data = ''
  } else {
    if (data.length > MAX_DATA_CHARS) return { ok: false, error: 'File is too large (Limit is ~7MB)' }
    if (data.trim().length === 0) return { ok: false, error: 'File data cannot be empty' }
  }

  return { ok: true, value: { file_name, mime_type, data, parent_id, type, timestamp } }
}

export function parseVaultPatchBody(body: unknown): ParseResult<VaultFilePatch> {
  if (!isRecord(body)) return { ok: false, error: 'Expected a JSON object' }
  const patch: VaultFilePatch = {}
  if (typeof body.parent_id === 'string') patch.parent_id = body.parent_id
  if (typeof body.type === 'string') patch.type = body.type
  if (typeof body.file_name === 'string') patch.file_name = body.file_name
  if (typeof body.timestamp === 'number' && Number.isFinite(body.timestamp)) {
    patch.timestamp = Math.trunc(body.timestamp)
  }
  return { ok: true, value: patch }
}

export async function listVaultFiles(env: TursoEnv, userId: string): Promise<VaultFile[]> {
  const result = await tursoClient(env).execute({
    sql: 'SELECT * FROM vault_files WHERE user_id = ? ORDER BY timestamp DESC, created_at DESC',
    args: [userId],
  })
  return fileRows(result)
}

export async function createVaultFile(env: TursoEnv, userId: string, file: VaultFileInput): Promise<VaultFile> {
  const result = await tursoClient(env).execute({
    sql: 'INSERT INTO vault_files (id, user_id, parent_id, type, file_name, mime_type, data, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *',
    args: [crypto.randomUUID(), userId, file.parent_id, file.type, file.file_name, file.mime_type, file.data, file.timestamp],
  })
  const created = fileRows(result)[0]
  if (!created) throw new Error('Turso did not return the inserted row')
  return created
}

export async function updateVaultFile(
  env: TursoEnv,
  userId: string,
  fileId: string,
  patch: VaultFilePatch,
): Promise<void> {
  const updates: string[] = []
  const args: Array<string | number> = []
  if (patch.parent_id !== undefined) {
    updates.push('parent_id = ?')
    args.push(patch.parent_id)
  }
  if (patch.type !== undefined) {
    updates.push('type = ?')
    args.push(patch.type)
  }
  if (patch.file_name !== undefined) {
    updates.push('file_name = ?')
    args.push(patch.file_name)
  }
  if (patch.timestamp !== undefined) {
    updates.push('timestamp = ?')
    args.push(patch.timestamp)
  }
  if (updates.length === 0) return
  args.push(fileId, userId)
  await tursoClient(env).execute({
    sql: `UPDATE vault_files SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`,
    args,
  })
}

export async function deleteVaultFile(env: TursoEnv, userId: string, fileId: string): Promise<void> {
  await tursoClient(env).execute({
    sql: 'DELETE FROM vault_files WHERE id = ? AND user_id = ?',
    args: [fileId, userId],
  })
}

function tursoClient(env: TursoEnv): Client {
  const url = env.TURSO_DATABASE_URL
  if (!url || !(url.startsWith('libsql://') || url.startsWith('https://'))) {
    throw new TursoConfigError('TURSO_DATABASE_URL is not configured')
  }
  if (!env.TURSO_AUTH_TOKEN) throw new TursoConfigError('TURSO_AUTH_TOKEN is not configured')
  return createClient({ url, authToken: env.TURSO_AUTH_TOKEN })
}

function fileRows(result: ResultSet): VaultFile[] {
  return result.rows.map((row) => {
    const record: Record<string, unknown> = {}
    result.columns.forEach((column, index) => {
      record[column] = jsonValue(row[index])
    })
    return {
      id: typeof record.id === 'string' ? record.id : '',
      user_id: typeof record.user_id === 'string' ? record.user_id : '',
      parent_id: typeof record.parent_id === 'string' ? record.parent_id : '',
      type: typeof record.type === 'string' && record.type.length > 0 ? record.type : 'FILE',
      file_name: typeof record.file_name === 'string' ? record.file_name : '',
      mime_type: typeof record.mime_type === 'string' ? record.mime_type : '',
      data: typeof record.data === 'string' ? record.data : '',
      timestamp: timestampValue(record.timestamp, 0),
      created_at: typeof record.created_at === 'string' ? record.created_at : null,
    }
  })
}

function timestampValue(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === 'bigint') {
    const parsed = Number(value)
    return Number.isSafeInteger(parsed) ? parsed : fallback
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (/^-?\d+$/.test(trimmed)) {
      const parsed = Number(trimmed)
      if (Number.isSafeInteger(parsed)) return parsed
    }
  }
  return fallback
}

function jsonValue(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof ArrayBuffer) return null
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
