import { createClient, type Client, type ResultSet } from '@libsql/client/web'

export type TursoEnv = {
  TURSO_DATABASE_URL: string
  TURSO_AUTH_TOKEN: string
}

export type VaultFile = {
  id: string
  user_id: string
  file_name: string
  mime_type: string
  data: string
  created_at: string | null
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

export function parseFileBody(body: unknown): ParseResult<{ file_name: string; mime_type: string; data: string }> {
  if (!isRecord(body)) return { ok: false, error: 'Expected a JSON object' }
  const file_name = typeof body.file_name === 'string' ? body.file_name : 'unnamed_file'
  const mime_type = typeof body.mime_type === 'string' ? body.mime_type : 'application/octet-stream'
  const data = typeof body.data === 'string' ? body.data : ''

  if (data.length > MAX_DATA_CHARS) return { ok: false, error: 'File is too large (Limit is ~7MB)' }
  if (data.trim().length === 0) return { ok: false, error: 'File data cannot be empty' }
  return { ok: true, value: { file_name, mime_type, data } }
}

export async function listVaultFiles(env: TursoEnv, userId: string): Promise<VaultFile[]> {
  const result = await tursoClient(env).execute({
    sql: 'SELECT * FROM vault_files WHERE user_id = ? ORDER BY created_at DESC',
    args: [userId],
  })
  return fileRows(result)
}

export async function createVaultFile(
  env: TursoEnv,
  userId: string,
  file: { file_name: string; mime_type: string; data: string },
): Promise<VaultFile> {
  const result = await tursoClient(env).execute({
    sql: 'INSERT INTO vault_files (id, user_id, file_name, mime_type, data) VALUES (?, ?, ?, ?, ?) RETURNING *',
    args: [crypto.randomUUID(), userId, file.file_name, file.mime_type, file.data],
  })
  const created = fileRows(result)[0]
  if (!created) throw new Error('Turso did not return the inserted row')
  return created
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
      file_name: typeof record.file_name === 'string' ? record.file_name : '',
      mime_type: typeof record.mime_type === 'string' ? record.mime_type : '',
      data: typeof record.data === 'string' ? record.data : '',
      created_at: typeof record.created_at === 'string' ? record.created_at : null,
    }
  })
}

function jsonValue(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof ArrayBuffer) return null
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
