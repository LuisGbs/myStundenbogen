export function ActiveSwitch({ active, onChange }: { active: boolean; onChange: (active: boolean) => void }) {
  return (
    <label className="switch" title={active ? 'Aktiv – wird beim Eintragen angeboten' : 'Inaktiv – ausgeblendet'}>
      <input type="checkbox" checked={active} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch__track" aria-hidden="true" />
      <span className="switch__label">{active ? 'aktiv' : 'inaktiv'}</span>
    </label>
  )
}
