import type { KurocoTopic, KurocoTopicsList } from '~/types/kuroco'
import { KurocoError } from '~/types/kuroco'

export type NoteKind = 'note' | 'preference'

export interface Note {
  id: number
  kind: NoteKind
  title: string
  body: string
  updatedAt?: string
}

export interface NoteDraft {
  kind: NoteKind
  title: string
  body: string
}

/**
 * How much of the member's own writing rides along with a question.
 *
 * Small on purpose. This text is embedded for the content search as well as
 * read by the model, so every extra line pulls retrieval a little further from
 * what was actually asked. Named so they can be tuned once the effect on
 * retrieval is measurable.
 */
const MAX_PREFERENCES = 3
const RELEVANT_NOTES = 2
/** Per line, so one rambling note cannot dominate the prompt. */
const MAX_NOTE_CHARS = 180

function oneLine(note: Note): string {
  const text = [note.title, note.body].map((s) => s.trim()).filter(Boolean).join(': ')
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > MAX_NOTE_CHARS ? `${flat.slice(0, MAX_NOTE_CHARS - 1)}…` : flat
}

/**
 * CRUD over the member-owned notes structure.
 *
 * Scoping: `Topics::list` does have an ownership parameter — **`my_own_list`**
 * — and it is now pinned in `notes/list`'s server-side params. (An earlier
 * comment here claimed no such parameter existed and proposed a preprocess
 * custom function instead; that was wrong. `has_permissions`, the thing that
 * looks like the candidate, is admin resource auth and writer_groups, not
 * per-row ownership.) Keeping it pinned matters more than ever now that notes
 * are fed to the chat model — see noteContext().
 *
 * `assertOwnership` below stays as a client-side tripwire, not a security
 * control: it cannot protect data, it can only make a server-side scoping
 * failure visible instead of silent.
 */
export function useNotes() {
  const { request, routes, decodeEntities } = useKuroco()
  const { member, isSignedIn } = useAuth()

  const notes = useState<Note[]>('omnix-notes', () => [])
  const isLoading = useState('omnix-notes-loading', () => false)
  const isSaving = useState('omnix-notes-saving', () => false)
  const error = useState<string | null>('omnix-notes-error', () => null)
  const leakWarning = useState<string | null>('omnix-notes-leak', () => null)

  const myNotes = computed(() => notes.value.filter((n) => n.kind === 'note'))
  const myPreferences = computed(() => notes.value.filter((n) => n.kind === 'preference'))

  function toNote(row: KurocoTopic): Note {
    const rawKind = String(row.note_kind ?? row.kind ?? 'note').toLowerCase()
    return {
      id: Number(row.topics_id),
      kind: rawKind === 'preference' ? 'preference' : 'note',
      title: decodeEntities(String(row.subject ?? '')),
      body: decodeEntities(String(row.contents ?? '')),
      updatedAt: row.update_ymdhi
    }
  }

  /**
   * Surface, rather than hide, a server-side scoping failure. If rows come back
   * carrying another member's id, the endpoint is not scoping correctly.
   */
  function assertOwnership(rows: KurocoTopic[]) {
    const mine = member.value?.member_id
    if (!mine) return
    const foreign = rows.filter((r) => r.member_id !== undefined && Number(r.member_id) !== Number(mine))
    leakWarning.value = foreign.length
      ? `${foreign.length} of ${rows.length} returned notes belong to another member — the endpoint is not scoping to the signed-in member.`
      : null
  }

  async function load(): Promise<void> {
    if (!isSignedIn.value) {
      notes.value = []
      return
    }
    isLoading.value = true
    error.value = null
    try {
      const res = await request<KurocoTopicsList>(routes.notesList, {
        method: 'GET',
        query: { cnt: 200 }
      })
      const rows = res.list ?? res.topics_list ?? []
      assertOwnership(rows)
      notes.value = rows
        .map(toNote)
        .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
    } catch (e) {
      error.value = describe(e, 'Could not load your notes.')
    } finally {
      isLoading.value = false
    }
  }

  /**
   * The member's own notes most semantically related to a question.
   *
   * Group 23 is vectorised, so `vector_search` on Topics::list does embedding
   * search over it — and because it goes through `notes/list`, whose
   * `my_own_list` is pinned server-side, it can only ever match rows the caller
   * owns. That is the whole reason this does not go through
   * `chat_contents_search`: see noteContext() below.
   *
   * Returns nothing on failure. Personalisation is a nicety; it must never stop
   * a question being answered.
   */
  async function searchNotes(query: string, cnt = RELEVANT_NOTES): Promise<Note[]> {
    if (!isSignedIn.value || !query.trim()) return []
    try {
      const res = await request<KurocoTopicsList>(routes.notesList, {
        method: 'GET',
        query: { cnt, vector_search: query }
      })
      const rows = res.list ?? res.topics_list ?? []
      assertOwnership(rows)
      return rows.map(toNote)
    } catch {
      return []
    }
  }

  /**
   * A compact "what Omnix knows about this player" block to prepend to a
   * question, or '' when there is nothing worth saying.
   *
   * Why this is composed client-side instead of just adding group 23 to the
   * chat endpoint's `topics_group_id`, which would be one config change:
   * `OpenAI::chat_contents_search` applies no member filter — there is no
   * `member_id` or `secure_level` anywhere in its query path — so notes in the
   * shared index would be retrievable by *any* member asking a related
   * question. One person's notes surfacing in someone else's chat is a data
   * leak, not a personalisation feature. Fetching them through a member-scoped
   * endpoint and passing them as text keeps retrieval private.
   *
   * Preferences come first and always: they are short, stable, and the thing
   * that actually shapes an answer ("I play position 5 support"). Relevant
   * notes are added per question. Both are capped, because this text is also
   * what gets embedded for the content search — too much of it drags retrieval
   * away from the question, the same reason only questions are replayed as
   * conversation history.
   */
  async function noteContext(question: string): Promise<string> {
    if (!isSignedIn.value) return ''

    const prefs = myPreferences.value
      .slice(0, MAX_PREFERENCES)
      .map((n) => oneLine(n))
      .filter(Boolean)

    const related = (await searchNotes(question))
      .filter((n) => n.kind !== 'preference')
      .map((n) => oneLine(n))
      .filter(Boolean)

    const lines = [...prefs, ...related].slice(0, MAX_PREFERENCES + RELEVANT_NOTES)
    if (!lines.length) return ''

    return `About this player (their own saved notes):\n${lines.map((l) => `- ${l}`).join('\n')}`
  }

  async function create(draft: NoteDraft): Promise<boolean> {
    if (!draft.title.trim() && !draft.body.trim()) return false
    isSaving.value = true
    error.value = null
    try {
      await request(routes.notesCreate, {
        method: 'POST',
        body: { subject: draft.title.trim() || 'Untitled note', contents: draft.body, note_kind: draft.kind, open_flg: 1 }
      })
      await load()
      return true
    } catch (e) {
      error.value = describe(e, 'Could not save that note.')
      return false
    } finally {
      isSaving.value = false
    }
  }

  async function update(note: Note): Promise<boolean> {
    isSaving.value = true
    error.value = null
    try {
      await request(`${routes.notesUpdate}/${note.id}`, {
        method: 'POST',
        body: {
          subject: note.title.trim() || 'Untitled note',
          contents: note.body,
          note_kind: note.kind
        }
      })
      await load()
      return true
    } catch (e) {
      error.value = describe(e, 'Could not update that note.')
      return false
    } finally {
      isSaving.value = false
    }
  }

  async function remove(id: number): Promise<boolean> {
    isSaving.value = true
    error.value = null
    try {
      await request(`${routes.notesDelete}/${id}`, {
        method: 'POST',
        body: { topics_id: id }
      })
      notes.value = notes.value.filter((n) => n.id !== id)
      return true
    } catch (e) {
      error.value = describe(e, 'Could not delete that note.')
      return false
    } finally {
      isSaving.value = false
    }
  }

  return {
    notes, myNotes, myPreferences,
    isLoading, isSaving, error, leakWarning,
    load, create, update, remove,
    searchNotes, noteContext
  }
}

function describe(e: unknown, fallback: string): string {
  if (e instanceof KurocoError) {
    if (e.kind === 'auth') return 'Your session expired — sign in again.'
    // 'missing' already carries the structure id and path, which is the whole
    // actionable content of the failure.
    return e.message
  }
  return fallback
}
