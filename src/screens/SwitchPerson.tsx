import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '../components/Button'
import { Note } from '../components/Note'
import { Screen } from '../components/Screen'
import { Spinner } from '../components/Button'
import { friendlyError } from '../lib/errors'
import { useMe, useSession } from '../lib/session'
import { supabase } from '../lib/supabase'

type Member = { id: string; name: string }

/** For shared phones: pick a different name. Admin mode turns off when you switch. */
export function SwitchPerson() {
  const me = useMe()
  const { switchMember } = useSession()
  const navigate = useNavigate()
  const [members, setMembers] = useState<Member[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [picking, setPicking] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('members')
      .select('id, name')
      .eq('is_active', true)
      .order('name')
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setError(friendlyError(error))
        else setMembers(data ?? [])
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function pick(m: Member) {
    setPicking(m.id)
    setError(null)
    try {
      await switchMember(m.id)
      navigate('/', { replace: true })
    } catch (err) {
      setError(friendlyError(err))
      setPicking(null)
    }
  }

  return (
    <Screen title="Switch person" back="/more">
      <p className="mb-4 text-ink-muted">
        You're <strong className="text-pine-950">{me.name}</strong>. Pick who's using this phone now.
        {me.is_admin && ' Admin mode will turn off.'}
      </p>
      {error && <Note kind="error" className="mb-3">{error}</Note>}
      {!members ? (
        <div className="flex justify-center py-8 text-pine-900"><Spinner /></div>
      ) : (
        <ul className="space-y-2">
          {members
            .filter((m) => m.id !== me.member_id)
            .map((m) => (
              <li key={m.id}>
                <Button
                  variant="secondary"
                  full
                  className="justify-start text-lg"
                  busy={picking === m.id}
                  disabled={picking !== null}
                  onClick={() => pick(m)}
                >
                  {m.name}
                </Button>
              </li>
            ))}
        </ul>
      )}
    </Screen>
  )
}
