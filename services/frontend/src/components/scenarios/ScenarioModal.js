import { ALL_DOMAINS, ALL_ZONES, SEVERITIES } from '../../utils/constants';
import { DomainIcon } from '../../utils/icons';
import Sel from '../common/Sel';

const ScenarioModal = ({
  scenarioForm, setScenarioForm,
  scenarioFormErr, scenarioLoading,
  onSave, onClose,
}) => (
  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
    <div style={{ background: 'white', borderRadius: 8, padding: 24,
      width: '90%', maxWidth: 680, maxHeight: '90vh', overflowY: 'auto' }}>
      <h3 style={{ marginTop: 0 }}>{scenarioForm._id ? 'Edit Scenario' : 'New Scenario'}</h3>
      {scenarioFormErr && <div className="error" style={{ marginBottom: 12 }}>{scenarioFormErr}</div>}

      <label className="form-label">Scenario ID * <small style={{ fontWeight: 'normal', color: '#888' }}>(slug, no spaces)</small></label>
      <input className="form-input" value={scenarioForm.scenario_id}
        disabled={!!scenarioForm._id}
        onChange={e => setScenarioForm(s => ({ ...s, scenario_id: e.target.value.replace(/\s+/g, '_') }))}
        placeholder="e.g. airport_flood" />

      <label className="form-label">Name *</label>
      <input className="form-input" value={scenarioForm.name}
        onChange={e => setScenarioForm(s => ({ ...s, name: e.target.value }))}
        placeholder="Short display name" />

      <label className="form-label">Description</label>
      <textarea className="form-input" rows={2} value={scenarioForm.description}
        onChange={e => setScenarioForm(s => ({ ...s, description: e.target.value }))}
        placeholder="What situation does this scenario simulate?" />

      <label className="form-label">Event Rate (evt/s) — 1 to 20</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <input type="range" min={1} max={20} step={1}
          value={scenarioForm.event_rate}
          onChange={e => setScenarioForm(s => ({ ...s, event_rate: +e.target.value }))}
          style={{ flex: 1 }} />
        <strong style={{ minWidth: 40 }}>{scenarioForm.event_rate}</strong>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label className="form-label">Force Zone <small style={{ fontWeight: 'normal', color: '#888' }}>(optional)</small></label>
          <Sel value={scenarioForm.force_zone || ''}
            onChange={v => setScenarioForm(s => ({ ...s, force_zone: v || '' }))}
            placeholder="Any zone" options={ALL_ZONES} />
        </div>
        <div>
          <label className="form-label">Min Severity <small style={{ fontWeight: 'normal', color: '#888' }}>(optional)</small></label>
          <Sel value={scenarioForm.force_severity || ''}
            onChange={v => setScenarioForm(s => ({ ...s, force_severity: v || '' }))}
            placeholder="Any severity" options={SEVERITIES} />
        </div>
      </div>

      <label className="form-label" style={{ marginTop: 16 }}>
        Domain Weights <small style={{ fontWeight: 'normal', color: '#888' }}>1 (rare) → 10 (dominant)</small>
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 16 }}>
        {ALL_DOMAINS.map(d => (
          <div key={d} style={{ padding: '10px 12px', border: '1px solid #e0e0e0',
            borderRadius: 6, backgroundColor: '#fafafa' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}><DomainIcon domain={d} /> {d}</label>
              <strong style={{ fontSize: 13 }}>{scenarioForm.domain_weights[d] ?? 1}</strong>
            </div>
            <input type="range" min={1} max={10} step={1}
              value={scenarioForm.domain_weights[d] ?? 1}
              onChange={e => setScenarioForm(s => ({
                ...s,
                domain_weights: { ...s.domain_weights, [d]: +e.target.value },
              }))}
              style={{ width: '100%' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#aaa' }}>
              <span>Rare</span><span>Dominant</span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn-secondary" onClick={onClose} disabled={scenarioLoading}>Cancel</button>
        <button className="btn-primary"   onClick={onSave}  disabled={scenarioLoading}>
          {scenarioLoading ? 'Saving…' : 'Save Scenario'}
        </button>
      </div>
    </div>
  </div>
);

export default ScenarioModal;
