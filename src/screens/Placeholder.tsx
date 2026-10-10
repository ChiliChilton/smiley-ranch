import { Note } from '../components/Note'
import { Screen } from '../components/Screen'

export function Placeholder({ title, phase, what }: { title: string; phase: number; what: string }) {
  return (
    <Screen title={title}>
      <Note>
        {what} This is built in phase {phase}.
      </Note>
    </Screen>
  )
}
