import { useState, type FormEvent } from 'react'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { TextInput } from '../../components/Input'
import { Note } from '../../components/Note'
import { Screen } from '../../components/Screen'
import { friendlyError } from '../../lib/errors'
import { supabase } from '../../lib/supabase'

/** Admin: change the family code and the admin PIN. Both are stored hashed in Postgres. */
export function Security() {
  return (
    <Screen title="Code & PIN" back="/more">
      <div className="space-y-4">
        <SecretForm
          title="Family code"
          blurb="New people type this once to get in. Phones that already joined stay joined. Send the new code by group text."
          label="New family code"
          confirmLabel="Type it again"
          inputMode="text"
          type="text"
          autoCapitalize="none"
          rpc="set_family_code"
          argName="new_code"
          doneText="Family code changed. Tell the family."
        />
        <SecretForm
          title="Admin PIN"
          blurb="Unlocks admin mode on a phone. Keep it to yourself."
          label="New PIN"
          confirmLabel="Type it again"
          inputMode="numeric"
          type="password"
          rpc="set_admin_pin"
          argName="new_pin"
          doneText="Admin PIN changed."
        />
      </div>
    </Screen>
  )
}

type FormProps = {
  title: string
  blurb: string
  label: string
  confirmLabel: string
  inputMode: 'text' | 'numeric'
  type: 'text' | 'password'
  autoCapitalize?: string
  rpc: 'set_family_code' | 'set_admin_pin'
  argName: 'new_code' | 'new_pin'
  doneText: string
}

function SecretForm(p: FormProps) {
  const [value, setValue] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const tooShort = value.trim().length > 0 && value.trim().length < 4
  const mismatch = confirm.length > 0 && confirm !== value

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setDone(false)
    const { error } =
      p.rpc === 'set_family_code'
        ? await supabase.rpc('set_family_code', { new_code: value.trim() })
        : await supabase.rpc('set_admin_pin', { new_pin: value.trim() })
    setBusy(false)
    if (error) return setError(friendlyError(error))
    setValue('')
    setConfirm('')
    setDone(true)
  }

  return (
    <Card title={p.title}>
      <p className="mb-3 text-sm text-ink-muted">{p.blurb}</p>
      <form onSubmit={submit} className="space-y-3">
        <TextInput
          label={p.label}
          name={p.argName}
          type={p.type}
          inputMode={p.inputMode}
          autoCapitalize={p.autoCapitalize}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          error={tooShort ? 'At least 4 characters.' : null}
        />
        <TextInput
          label={p.confirmLabel}
          name={`${p.argName}_confirm`}
          type={p.type}
          inputMode={p.inputMode}
          autoCapitalize={p.autoCapitalize}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={mismatch ? "Doesn't match." : null}
        />
        {error && <Note kind="error">{error}</Note>}
        {done && <Note kind="ok">{p.doneText}</Note>}
        <Button type="submit" busy={busy} disabled={value.trim().length < 4 || confirm !== value}>
          Save
        </Button>
      </form>
    </Card>
  )
}
