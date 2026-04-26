const Sel = ({ value, onChange, placeholder, options }) => (
  <select className="form-input" style={{ width: 'auto', minWidth: 130 }}
    value={value} onChange={e => onChange(e.target.value)}>
    <option value="">{placeholder}</option>
    {options.map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
  </select>
);

export default Sel;
