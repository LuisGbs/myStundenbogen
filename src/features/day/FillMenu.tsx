import { useEffect, useRef, useState } from 'react'
import { applyDefaultFill } from '../../domain/allocation'
import { newId } from '../../domain/id'
import type { ActivityType, Day, Project, Settings } from '../../domain/types'
import { Icon } from '../../components/Icon'
import { updateSettings } from '../../storage/repo'

interface Props {
  day: Day
  projects: Project[]
  activityTypes: ActivityType[]
  settings: Settings
  onChange: (fn: (day: Day) => Day) => void
}

type FillTarget = { projectId: string; activityTypeId: string }

/**
 * „Auffüllen“: offene Zeit des Tages verteilen.
 * (Die dritte Variante – „Rest“ in einer Zeile – sitzt direkt in jeder Zeile.)
 */
export function FillMenu({ day, projects, activityTypes, settings, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const hasRest = day.allocations.some((a) => a.mode === 'rest')
  const proportional = day.fillStrategy === 'proportional'
  const target = settings.defaultFill
  const targetProject = target && projects.find((p) => p.id === target.projectId)
  const targetType = target && activityTypes.find((a) => a.id === target.activityTypeId)

  const combos = projects
    .filter((p) => p.active)
    .flatMap((p) => activityTypes.filter((a) => a.active).map((a) => ({ p, a })))

  const fillDefault = (t: FillTarget) => {
    onChange((d) => ({ ...d, allocations: applyDefaultFill(d.allocations, t, newId()) }))
    setOpen(false)
  }

  const toggleProportional = () => {
    onChange((d) => ({ ...d, fillStrategy: d.fillStrategy === 'proportional' ? 'none' : 'proportional' }))
    setOpen(false)
  }

  return (
    <div className="menu" ref={ref}>
      <button type="button" className="btn" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)}>
        <Icon name="fill" /> Auffüllen <Icon name="chevron-down" />
      </button>
      {open && (
        <div className="menu__popover" role="menu">
          <div className="menu__section">
            <div className="menu__title">Rest auf Standardprojekt</div>
            {target && targetProject && targetType && (
              <button type="button" role="menuitem" className="menu__item" onClick={() => fillDefault(target)}>
                <span className="dot" style={{ background: targetProject.color }} />
                {targetProject.name} · {targetType.name}
              </button>
            )}
            <select
              className="input"
              value=""
              aria-label="Standardprojekt wählen"
              onChange={(e) => {
                const [projectId, activityTypeId] = e.target.value.split('|')
                if (!projectId) return
                void updateSettings({ defaultFill: { projectId, activityTypeId } })
                fillDefault({ projectId, activityTypeId })
              }}
            >
              <option value="">{target ? 'Anderes Standardprojekt …' : 'Standardprojekt wählen …'}</option>
              {combos.map(({ p, a }) => (
                <option key={`${p.id}|${a.id}`} value={`${p.id}|${a.id}`}>
                  {p.name} · {a.name}
                </option>
              ))}
            </select>
          </div>

          <div className="menu__section">
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={proportional}
              className="menu__item"
              disabled={hasRest && !proportional}
              onClick={toggleProportional}
            >
              <span className="menu__check">{proportional && <Icon name="check" />}</span>
              <span>
                Proportional auf alle Zeilen verteilen
                <span className="menu__hint">
                  {hasRest
                    ? 'Wirkt nur, solange es keine Rest-Zeile gibt.'
                    : 'Offene Zeit wird anteilig auf alle Zeilen aufgeschlagen.'}
                </span>
              </span>
            </button>
          </div>

          <p className="menu__tip">
            Tipp: Wähle in einer Zeile <strong>Rest</strong>, um die offene Zeit genau dorthin zu buchen.
          </p>
        </div>
      )}
    </div>
  )
}
