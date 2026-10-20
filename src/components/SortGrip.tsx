import { Icon } from './Icon'
import type { useSortDrag } from './useSortDrag'

type GripProps = ReturnType<ReturnType<typeof useSortDrag>['gripProps']>

/** Der Griff ≡ selbst. */
export function SortGrip({ label, ...props }: { label: string } & GripProps) {
  return (
    <button type="button" className="sort-grip" aria-label={label} title="Ziehen zum Sortieren (oder Pfeiltasten ↑/↓)" {...props}>
      <Icon name="grip" />
    </button>
  )
}
