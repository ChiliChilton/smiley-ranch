import { useState, type FormEvent } from 'react'
import { Button } from '../../components/Button'
import { TextInput } from '../../components/Input'
import { Note } from '../../components/Note'
import { Centered } from '../../components/Screen'
import { friendlyError } from '../../lib/errors'
import { useSession } from '../../lib/session'
import { DEMO, DEMO_CODE } from '../../lib/demo'

type Member = { id: string; name: string }

/** Family code -> pick your name. Two steps, one screen. */
export function JoinScreen() {
  const { listMembersWithCode, join } = useSession()
  const [code, setCode] = useState('')
  const [members, setMembers] = useState<Member[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [picking, setPicking] = useState<string | null>(null)

  async function submitCode(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const list = await listMembersWithCode(code.trim())
      setMembers(list)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  async function pick(member: Member) {
    setError(null)
    setPicking(member.id)
    try {
      await join(code.trim(), member.id)
    } catch (err) {
      setError(friendlyError(err))
      setPicking(null)
    }
  }

  if (members) {
    return (
      <Centered>
        <h1 className="text-2xl font-bold text-clay-950">Who are you?</h1>
        <p className="mb-4 text-ink-muted">Everything you post will show your name.</p>
        {error && <Note kind="error" className="mb-3">{error}</Note>}
        {members.length === 0 ? (
          <Note kind="warn">No names on the list yet. Ask the admin to add you.</Note>
        ) : (
          <ul className="space-y-2">
            {members.map((m) => (
              <li key={m.id}>
                <Button
                  variant="secondary"
                  full
                  busy={picking === m.id}
                  disabled={picking !== null}
                  onClick={() => pick(m)}
                  className="justify-start text-lg"
                >
                  {m.name}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-6 text-center text-sm text-ink-muted">
          Not on the list? Ask whoever sent you the link to add your name.
        </p>
        <div className="mt-auto pt-6">
          <Button variant="ghost" full onClick={() => { setMembers(null); setError(null) }}>
            Back
          </Button>
        </div>
      </Centered>
    )
  }

  return (
    <Centered>
      <div className="mb-8 flex items-center gap-3">
        <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" width={56} height={56} className="rounded-xl" />
        <div>
          <h1 className="text-2xl font-bold text-clay-950">Smiley Ranch</h1>
          <p className="text-ink-muted">The family place near Smiley</p>
        </div>
      </div>
      <form onSubmit={submitCode} className="space-y-4">
        <TextInput
          label="Family code"
          name="code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={DEMO ? `Demo: type ${DEMO_CODE}` : 'From the group text'}
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="go"
          inputMode="text"
          autoFocus
          error={error}
        />
        <Button type="submit" full busy={busy} disabled={code.trim().length < 4}>
          Next
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-muted">
        No passwords. The code just keeps strangers out.
      </p>
      {DEMO && (
        <Note className="mt-4">
          This is a demo with sample data. Family code <strong>{DEMO_CODE}</strong>. Pick any name; Dad is the admin in the samples.
        </Note>
      )}
    </Centered>
  )
}
