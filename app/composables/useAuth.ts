import type { KurocoLoginChallenge, KurocoProfile } from '~/types/kuroco'
import { KurocoError } from '~/types/kuroco'

/**
 * Member session, held by a Kuroco cookie rather than a token in the bundle.
 *
 * The endpoints map to the Login API model (`nfs/lib/modules/login/api/v1/Login.php`):
 *   login   -> Login::login_challenge  (returns a grant_token, sets no session)
 *   token   -> Login::token            (exchanges it for the session)
 *   profile -> Login::profile
 *   logout  -> Login::logout
 *
 * Signing in requires **both** login and token. See signIn.
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

  // Step 1 of signup. Creates a provisional member and mails them a key —
  // email_hash is that key, and it doubles as the OTP code the user types back
  // in at step 2.
  //
  // The body structure the endpoint expects:
  // {
  //   "email": "your_mail_address@example.com",
  //   "ext_info": {
  //     "name1": "Diverta",
  //     "name2": "Taro"
  //   }
  // }
  async function getEmailOtp(email: string, name1: string, name2: string): Promise<boolean> {
    isChecking.value = true
    authError.value = null
    try {
      await request(routes.emailValidate, {
        method: 'POST',
        body: {
          email,
          ext_info: {
            name1,
            name2
          }
        }
      })
      return true
    } catch (error) {
      authError.value = describeFailure(error)
      return false
    } finally {
      isChecking.value = false
    }
  }

  // Step 2. Validates the email address from step 1 by sending back the OTP code
  // (referenced here, and by the endpoint, as email_hash). Same endpoint as step
  // 1 — a body carrying email_hash instead of email selects the verify branch,
  // so sending email/ext_info as well would re-issue the invite and mint a new
  // code instead of checking this one.
  //
  // The data structure the endpoint expects:
  // {
  //   "email_hash": "YOUR_EMAIL_HASH"
  // }
  async function verifyEmailWithOtp(email_hash: string): Promise<boolean> {
    isChecking.value = true
    authError.value = null
    try {
      await request(routes.emailValidate, {
        method: 'POST',
        body: { email_hash }
      })
      return true
    } catch (error) {
      authError.value = describeFailure(error)
      return false
    } finally {
      isChecking.value = false
    }
  }

  // Step 3. The data structure the register endpoint expects:
  // {
  //   "email": "your_mail_address@example.com",
  //   "name1": "Diverta",
  //   "name2": "Taro",
  //   "login_pwd": "PASSWORD"
  // }
  async function signUp(
    email: string,
    password: string,
    password_confirmed: string,
    name1: string,
    name2: string
  ): Promise<boolean> {
    // Checked before isChecking is raised: this one is ours, not the server's,
    // because the two fields are never both sent.
    if (password !== password_confirmed) {
      authError.value = 'Your password and password confirmation field do not match.'
      return false
    }
    isChecking.value = true
    authError.value = null
    try {
      await request(routes.register, {
        method: 'POST',
        body: {
          email,
          name1,
          name2,
          login_pwd: password
        }
      })
      return true
    } catch (error) {
      authError.value = describeFailure(error)
      return false
    } finally {
      isChecking.value = false
    }
  }

  async function signIn(email: string, password: string): Promise<boolean> {
    isChecking.value = true
    authError.value = null
    try {
      // Kuroco login is **two calls**, per tutorials/integrate-login: the first
      // is a challenge that returns a `grant_token` and sets no session, the
      // second exchanges that token for one. Stopping after the first looks like
      // success — HTTP 200, a member_id in the body — while leaving the caller
      // unauthenticated, which is exactly the "signed in but it didn't stick"
      // symptom this used to report.
      const challenge = await request<KurocoLoginChallenge>(routes.login, {
        method: 'POST',
        body: { email, password }
      })

      if (!challenge?.grant_token) {
        authError.value = 'Kuroco accepted the credentials but returned no grant token, so no session could be created.'
        return false
      }

      await request(routes.token, {
        method: 'POST',
        body: { grant_token: challenge.grant_token }
      })

      await refresh()
      if (!isSignedIn.value) {
        authError.value = 'Signed in, but the session did not stick. This usually means the cookie was blocked — check that the API structure allows credentials and lists this origin.'
      }
      return isSignedIn.value
    } catch (error) {
      member.value = null
      authError.value = describeFailure(error)
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

  return {
    member,
    isSignedIn,
    displayName,
    isChecking,
    authError,
    refresh,
    getEmailOtp,
    verifyEmailWithOtp,
    signUp,
    signIn,
    signOut
  }
}

/**
 * What to show the user when a call fails.
 *
 * A KurocoError's message is Kuroco's own wording whenever the server sent one
 * — passed through verbatim, never paraphrased and never replaced with a guess
 * at the cause. If Kuroco's wording is unclear, unclear is what gets shown.
 * Everything else gets a flatly generic line, so text written here is never
 * mistaken for text from the server.
 */
function describeFailure(error: unknown): string {
  if (error instanceof KurocoError) return error.message
  return 'Something went wrong.'
}
