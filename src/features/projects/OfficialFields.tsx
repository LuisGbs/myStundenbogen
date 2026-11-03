import { CommitInput } from '../../components/inputs'

/**
 * Kleine zweite Zeile unter dem eigenen Namen: offizieller Name und Nummer
 * aus der Firmensoftware (leerer offizieller Name = wie der eigene).
 */
export function OfficialFields({
  item,
  kind,
  onChange,
}: {
  item: { name: string; officialName: string; code: string }
  /** „Projekt“ bzw. „Tätigkeit“ – für Beschriftungen */
  kind: 'Projekt' | 'Tätigkeit'
  onChange: (patch: { officialName?: string; code?: string }) => void
}) {
  return (
    <div className="official-fields" title="So heißt es in der Firmensoftware (Monatstabelle und Excel)">
      <span className="official-fields__label">Firmensoftware</span>
      <CommitInput
        className="input input--small official-fields__name"
        aria-label={kind === 'Projekt' ? 'Offizieller Projektname' : 'Offizieller Name der Tätigkeit'}
        placeholder={`offizieller Name (sonst „${item.name}“)`}
        value={item.officialName}
        onCommit={(text) => {
          onChange({ officialName: text.trim() })
          return text.trim()
        }}
      />
      <CommitInput
        className="input input--small official-fields__code"
        aria-label={kind === 'Projekt' ? 'Projektnummer' : 'Nummer der Tätigkeit'}
        placeholder="Nr."
        value={item.code}
        onCommit={(text) => {
          onChange({ code: text.trim() })
          return text.trim()
        }}
      />
    </div>
  )
}
