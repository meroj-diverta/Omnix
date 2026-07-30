import type { KurocoProfile } from '~/types/kuroco'
import { KurocoError } from '~/types/kuroco'

/**
 * Member session, held by a Kuroco cookie rather than a token in the bundle.
 *
 * The endpoints map to the Login API model (`nfs/lib/modules/login/api/v1/Login.php`):
 *   login   -> Login::login_challenge
 *   profile -> Login::profile
 *   logout  -> Login::logout
 *
 * The API structure serving these must be in `cookie` security mode with
 * allowCredentials true and this origin listed in its CORS origins.
 */
export function useAuth() {
  const { request, routes } = useKuroco()

  const member = useState<KurocoProfile | null>('omnix-member', () => null)
  const isChecking = useState('omnix-auth-checking', () => false)
  const authError = useState<string | null>('omnix-auth-error', () => null)

  const isSignedIn = computed(() => Boolean(member.value?.member_id))
  const displayName = computed(() => {
    const m = member.value
    if (!m) return ''
    return (
      m.nickname ||
      [m.name1, m.name2].filter(Boolean).join(' ') ||
      m.login_id ||
      m.email ||
      `Member ${m.member_id}`
    )
  })

  /**
   * Resolve the current session. A 401/403 here is the expected "not signed in"
   * answer, not a failure — so it clears state rather than surfacing an error.
   */
  async function refresh(): Promise<void> {
    isChecking.value = true
    authError.value = null
    try {
      const profile = await request<KurocoProfile>(routes.profile, {
        method: 'GET'
      })
      member.value = profile?.member_id ? profile : null
    } catch (error) {
      member.value = null
      if (error instanceof KurocoError && error.kind !== 'auth') {
        authError.value = error.message
      }
    } finally {
      isChecking.value = false
    }
  }

  async function signIn(email: string, password: string): Promise<boolean> {
    isChecking.value = true
    authError.value = null
    try {
      await request(routes.login, {
        method: 'POST',
        body: { email, password }
      })
      await refresh()
      if (!isSignedIn.value) {
        authError.value = 'Signed in, but the session did not stick. This usually means the cookie was blocked — check that the API structure allows credentials and lists this origin.'
      }
      return isSignedIn.value
    } catch (error) {
      member.value = null
      authError.value =
        error instanceof KurocoError
          ? error.kind === 'auth'
            ? 'Those credentials were not accepted.'
            : error.message
          : 'Sign-in failed.'
      return false
    } finally {
      isChecking.value = false
    }
  }

  async function signOut(): Promise<void> {
    try {
      await request(routes.logout, { method: 'POST' })
    } catch {
      // Clearing local state matters more than a clean server-side logout.
    } finally {
      member.value = null
      authError.value = null
    }
  }

  return { member, isSignedIn, displayName, isChecking, authError, refresh, signIn, signOut }
}
