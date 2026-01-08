import { ref } from 'vue'
import { getSession, type SessionUser } from './auth'

/**
 * Tiny global session store.
 *
 * Why this exists: Shell.vue owns auth gating and the nav. VerifyPage.vue logs you in
 * via magic link, but Shell's `refresh()` only runs on mount, so the nav won't update
 * until a remount/navigation side-effect occurs. This store lets both places refresh
 * the same reactive state.
 */
export const sessionUser = ref<SessionUser | null>(null)

export async function refreshSession(): Promise<SessionUser | null> {
  const { user } = await getSession()
  sessionUser.value = user
  return user
}

export function setSessionUser(user: SessionUser | null) {
  sessionUser.value = user
}

