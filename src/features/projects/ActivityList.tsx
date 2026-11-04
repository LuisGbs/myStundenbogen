import { useState, type FormEvent } from 'react'
import { effectiveDefault } from '../../domain/activities'
import type { ActivityType } from '../../domain/types'
import { Icon } from '../../components/Icon'
import { CommitInput } from '../../components/inputs'
import { SortGrip } from '../../components/SortGrip'
import { useSortDrag } from '../../components/useSortDrag'
import {
  createActivityType,
  deleteActivityType,
  reorderActivityType,
  toggleDefaultActivity,
  updateActivityType,
} from '../../storage/repo'
import { ActiveSwitch } from './ActiveSwitch'
import { OfficialFields } from './OfficialFields'

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
  const [official, setOfficial] = useState('')
  const sort = useSortDrag(
    `acts-${projectId ?? 'vorlage'}`,
    activities.map((a) => a.id),
    (id, beforeId) => void reorderActivityType(id, beforeId),
  )

  const add = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    await createActivityType(name, projectId, code, official)
    setName('')
    setCode('')
    setOfficial('')
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

  // wirksamer Standard: die markierte – sonst automatisch die erste aktive
  const standard = effectiveDefault(activities)

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
            <button
              type="button"
              className={`default-toggle${a.id === standard?.id ? ' is-on' : ''}${a.isDefault ? '' : ' is-auto'}`}
              aria-pressed={a.id === standard?.id}
              aria-label={`${a.name} als Standard`}
              title={
                a.isDefault
                  ? 'Standard – wird beim Buchen vorgewählt (nochmal antippen: wieder automatisch die erste aktive)'
                  : a.id === standard?.id
                    ? 'Standard automatisch (erste aktive) – antippen, um sie fest als Standard zu setzen'
                    : 'Als Standard setzen – wird beim Buchen vorgewählt'
              }
              onClick={() => void toggleDefaultActivity(a.id)}
            >
              Standard
            </button>
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
            <OfficialFields item={a} kind="Tätigkeit" onChange={(patch) => void updateActivityType(a.id, patch)} />
          </li>
        ))}
      </ul>
      <form className="add-form act-list__add" onSubmit={add}>
        <input
          className="input add-form__name"
          placeholder="Neue Tätigkeit – dein Name, z.B. Konzept"
          aria-label={`Neue Tätigkeit für ${owner}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="input add-form__official"
          placeholder="Offizieller Name (optional)"
          aria-label={`Offizieller Name der neuen Tätigkeit für ${owner}`}
          value={official}
          onChange={(e) => setOfficial(e.target.value)}
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
