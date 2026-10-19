export interface SegmentedOption<T extends string> {
  value: T
  label: string
  title?: string
}

interface Props<T extends string> {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
  size?: 'normal' | 'small'
}

/** Umschalter mit wenigen Optionen (z.B. Büro | Meeting). */
export function Segmented<T extends string>({ options, value, onChange, ariaLabel, size = 'normal' }: Props<T>) {
  return (
    <div className={`segmented segmented--${size}`} role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'is-active' : undefined}
          title={o.title}
          onClick={() => o.value !== value && onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
