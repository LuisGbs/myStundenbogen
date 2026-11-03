import { useState, type FormEvent } from 'react'
import type { ActivityType } from '../../domain/types'
import { Icon } from '../../components/Icon'
import { CommitInput } from '../../components/inputs'
import { SortGrip } from '../../components/SortGrip'
import { useSortDrag } from '../../components/useSortDrag'
import { createActivityType, deleteActivityType, reorderActivityType, updateActivityType } from '../../storage/repo'
import { ActiveSwitch } from './ActiveSwitch'

/**
 * Tätigkeiten eines Projekts (bzw. der Standardliste bei projectId null):
 * Name, Nummer, aktiv, sortieren, löschen, hinzufügen.
 */
export function ActivityList({
  projectId,
  activities,
  owner,
}: {
  projectId: string | null
  /** schon gefiltert und sortiert */
  activities: ActivityType[]
  /** für Beschriftungen, z.B. „Epis“ oder „Standardliste“ */
  owner: string
}) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const sort = useSortDrag(
    `acts-${projectId ?? 'vorlage'}`,
    activities.map((a) => a.id),
    (id, beforeId) => void reorderActivityType(id, beforeId),
  )

  const add = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    await createActivityType(name, projectId, code)
    setName('')
    setCode('')
  }

  const remove = async (a: ActivityType) => {
    if (!confirm(`Tätigkeit „${a.name}“ wirklich löschen?`)) return
    if (!(await deleteActivityType(a.id))) {
      alert(
        `„${a.name}“ kann nicht gelöscht werden: sie ist schon gebucht oder die letzte aktive Tätigkeit des Projekts.\nDeaktiviere sie stattdessen bzw. leg zuerst eine andere an.`,
      )
    }
  }

  const setActive = async (a: ActivityType, active: boolean) => {
    if (!(await updateActivityType(a.id, { active }))) {
      alert(`„${a.name}“ ist die letzte aktive Tätigkeit von ${owner} – ohne sie könnte man das Projekt nicht mehr buchen.`)
    }
  }

  return (
    <div className="act-list" data-testid={`activities-${owner}`}>
      <ul
        className={`act-list__items${sort.dragging ? ' is-dragging' : ''}${sort.dropAtEnd ? ' is-drop-end' : ''}`}
        data-sort-list={`acts-${projectId ?? 'vorlage'}`}
      >
        {activities.map((a) => (
          <li key={a.id} className={`act-row${a.active ? '' : ' is-inactive'} ${sort.rowClass(a.id)}`} data-sort-id={a.id}>
            <SortGrip label={`${a.name} verschieben`} {...sort.gripProps(a.id)} />
            <CommitInput
              className="input act-row__name"
              aria-label="Name der Tätigkeit"
              value={a.name}
              onCommit={(text) => {
                const trimmed = text.trim()
                if (!trimmed) return null
                void updateActivityType(a.id, { name: trimmed })
                return trimmed
              }}
            />
            <CommitInput
              className="input act-row__code"
              aria-label="Nummer der Tätigkeit"
              placeholder="Nr."
              value={a.code}
              onCommit={(text) => {
                void updateActivityType(a.id, { code: text.trim() })
                return text.trim()
              }}
            />
            <ActiveSwitch active={a.active} onChange={(active) => void setActive(a, active)} />
            <button
              type="button"
              className="icon-btn icon-btn--subtle"
              aria-label={`${a.name} löschen`}
              title="Löschen (nur wenn unbenutzt)"
              onClick={() => void remove(a)}
            >
              <Icon name="trash" />
            </button>
          </li>
        ))}
      </ul>
      <form className="add-form act-list__add" onSubmit={add}>
        <input
          className="input add-form__name"
          placeholder="Neue Tätigkeit, z.B. Engineering"
          aria-label={`Neue Tätigkeit für ${owner}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="input add-form__code"
          placeholder="Nr. (optional)"
          aria-label={`Nummer der neuen Tätigkeit für ${owner}`}
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <button type="submit" className="btn" disabled={!name.trim()}>
          <Icon name="plus" /> Hinzufügen
        </button>
      </form>
    </div>
  )
}
