'use client'

import { startTransition, useState, type ChangeEvent, type FormEvent } from 'react'

export function preserveForm(action: (data: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    startTransition(() => action(data))
  }
}

// React resets uncontrolled fields after a server action, including actions
// returning validation errors. Keep drafts in memory, never browser storage.
export function useFormDraft<T extends Record<string, string>>(initial: T) {
  const [values, setValues] = useState(initial)
  return (name: keyof T) => ({
    value: values[name],
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const value = event.currentTarget.value
      setValues(previous => ({ ...previous, [name]: value }))
    },
  })
}
