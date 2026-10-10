import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Button, Spinner } from '../../components/Button'
import { Card, Divider, Row } from '../../components/Card'
import { TextInput } from '../../components/Input'
import { Note } from '../../components/Note'
import { Screen } from '../../components/Screen'
import { Sheet } from '../../components/Sheet'
import type { MemberRow } from '../../lib/database.types'
import { friendlyError } from '../../lib/errors'
import { useMe } from '../../lib/session'
import { supabase } from '../../lib/supabase'

/** Admin: add, rename, deactivate, reactivate. Deactivated members keep their history. */
export function Members() {
  const me = useMe()
  const [members, setMembers] = useState<MemberRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<MemberRow | null>(null)
  const [showInactive, setShowInactive] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('members').select('*').order('name')
    if (error) setError(friendlyError(error))
    else setMembers(data)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function add(e: FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    setAdding(true)
    setError(null)
    const { error } = await supabase.from('members').insert({ name })
    setAdding(false)
    if (error) return setError(friendlyError(error))
    setNewName('')
    await load()
  }

  const active = members?.filter((m) => m.is_active) ?? []
  const inactive = members?.filter((m) => !m.is_active) ?? []

  return (
    <Screen title="Members" back="/more">
      {error && <Note kind="error" className="mb-4">{error}</Note>}

      <Card title="Add someone" className="mb-4">
        <form onSubmit={add} className="flex gap-2">
          <div className="flex-1">
            <TextInput
              name="newName"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Name, like Uncle Mike"
              autoComplete="off"
              enterKeyHint="done"
              maxLength={40}
            />
          </div>
          <Button type="submit" busy={adding} disabled={!newName.trim()}>
            Add
          </Button>
        </form>
        <p className="mt-2 text-sm text-ink-muted">They'll see their name on the list after they enter the family code.</p>
      </Card>

      {!members ? (
        <div className="flex justify-center py-8 text-pine-900"><Spinner /></div>
      ) : (
        <>
          <Card title={`Active (${active.length})`}>
            {active.length === 0 && <p className="text-sm text-ink-muted">Nobody yet.</p>}
            {active.map((m, i) => (
              <div key={m.id}>
                {i > 0 && <Divider />}
                <Row onClick={() => setEditing(m)} right={m.id === me.member_id ? 'you' : undefined}>
                  {m.name}
                </Row>
              </div>
            ))}
          </Card>

          {inactive.length > 0 && (
            <Card title={`Turned off (${inactive.length})`} className="mt-4">
              {!showInactive ? (
                <Button variant="ghost" onClick={() => setShowInactive(true)}>Show</Button>
              ) : (
                inactive.map((m, i) => (
                  <div key={m.id}>
                    {i > 0 && <Divider />}
                    <Row onClick={() => setEditing(m)}>
                      <span className="text-ink-muted">{m.name}</span>
                    </Row>
                  </div>
                ))
              )}
            </Card>
          )}
        </>
      )}

      <EditSheet
        member={editing}
        isSelf={editing?.id === me.member_id}
        onClose={() => setEditing(null)}
        onSaved={async () => { setEditing(null); await load() }}
      />
    </Screen>
  )
}

function EditSheet({ member, isSelf, onClose, onSaved }: { member: MemberRow | null; isSelf: boolean; onClose: () => void; onSaved: () => Promise<void> }) {
  return (
    <Sheet open={member !== null} onClose={onClose} title={member?.name}>
      {member && <EditForm key={member.id} member={member} isSelf={isSelf} onSaved={onSaved} />}
    </Sheet>
  )
}

function EditForm({ member, isSelf, onSaved }: { member: MemberRow; isSelf: boolean; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(member.name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(patch: { name?: string; is_active?: boolean }) {
    setBusy(true)
    setError(null)
    const { error } = await supabase.from('members').update(patch).eq('id', member.id)
    setBusy(false)
    if (error) return setError(friendlyError(error))
    await onSaved()
  }

  return (
    <div className="space-y-4">
      {error && <Note kind="error">{error}</Note>}
      <form
        onSubmit={(e) => { e.preventDefault(); void save({ name: name.trim() }) }}
        className="flex gap-2"
      >
        <div className="flex-1">
          <TextInput label="Name" name="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        </div>
        <div className="self-end">
          <Button type="submit" busy={busy} disabled={!name.trim() || name.trim() === member.name}>Rename</Button>
        </div>
      </form>

      {member.is_active ? (
        <div>
          <p className="mb-2 text-sm text-ink-muted">
            Turning someone off keeps all their posts but they can't sign in or be picked.
            {isSelf && ' You can’t turn yourself off.'}
          </p>
          <Button variant="danger" busy={busy} disabled={isSelf} onClick={() => void save({ is_active: false })}>
            Turn off access
          </Button>
        </div>
      ) : (
        <div>
          <p className="mb-2 text-sm text-ink-muted">Turned off. Turn access back on so they can sign in again.</p>
          <Button busy={busy} onClick={() => void save({ is_active: true })}>Turn access back on</Button>
        </div>
      )}
    </div>
  )
}
