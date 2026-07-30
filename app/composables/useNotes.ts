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
 * CRUD over the member-owned notes structure.
 *
 * Scoping caveat, deliberately recorded here because it is a real open question
 * and not a detail: Kuroco's Topics list API has no "only my rows" parameter.
 * `has_permissions` looks like it might be one but is about admin resource auth
 * and writer_groups, not per-row ownership. So the endpoint MUST enforce
 * `member_id = <session member>` server-side — via a pinned filter or a
 * preprocess custom function.
 *
 * Until that is verified, treat cross-member leakage as unproven either way.
 * `assertOwnership` below is a client-side tripwire, not a security control:
 * it cannot protect data, it can only make a server-side scoping failure
 * visible instead of silent.
 */
export function useNotes() {
  const { request, apiIds, endpoints, decodeEntities } = useKuroco()
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
      const res = await request<KurocoTopicsList>(endpoints.notesList, {
        apiId: apiIds.notes,
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

  async function create(draft: NoteDraft): Promise<boolean> {
    if (!draft.title.trim() && !draft.body.trim()) return false
    isSaving.value = true
    error.value = null
    try {
      await request(endpoints.notesCreate, {
        apiId: apiIds.notes,
        method: 'POST',
        body: { subject: draft.title.trim() || 'Untitled note', contents: draft.body, note_kind: draft.kind }
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
      await request(endpoints.notesUpdate, {
        apiId: apiIds.notes,
        method: 'POST',
        body: {
          topics_id: note.id,
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
      await request(endpoints.notesDelete, {
        apiId: apiIds.notes,
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
    load, create, update, remove
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
