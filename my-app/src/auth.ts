import { isDocumentId } from './firestore'

function decodeBase64Url(segment: string): string {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (segment.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

// Reads the uid claim only. Firestore still checks the signature when the same token is forwarded.
export function uidFromFirebaseToken(token: string): string | null {
  const parts = token.split('.')
  if (parts.length !== 3 || parts.some((part) => part.length === 0 || part.length > 8192)) return null

  let payload: { sub?: unknown; user_id?: unknown }
  try {
    payload = JSON.parse(decodeBase64Url(parts[1])) as { sub?: unknown; user_id?: unknown }
  } catch {
    return null
  }

  const sub = typeof payload.sub === 'string' ? payload.sub : null
  const userId = typeof payload.user_id === 'string' ? payload.user_id : null
  if (sub && userId && sub !== userId) return null
  const uid = userId ?? sub
  if (!uid || !isDocumentId(uid)) return null
  return uid
}
