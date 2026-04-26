import { Braces, FileText, Info } from 'lucide-react';
import { ALL_DOMAINS, SEVERITIES } from '../../utils/constants';
import { DomainIcon } from '../../utils/icons';

const PatternModal = ({
  patternForm, jsonMode, jsonInput,
  formError, formLoading,
  onChangeField, onToggleDomain, onToggleJsonMode, onJsonInputChange,
  onSave, onClose,
}) => (
  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
    <div style={{ background: 'white', borderRadius: 8, padding: 24,
      width: '90%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>{patternForm._id ? 'Edit Pattern' : 'New Pattern'}</h3>
        <button
          className="btn-secondary"
          style={{ padding: '4px 12px', fontSize: 12 }}
          onClick={onToggleJsonMode}
          disabled={formLoading}>
          {jsonMode
            ? <><FileText size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />Form Mode</>
            : <><Braces   size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />JSON Mode</>}
        </button>
      </div>

      {formError && <div className="error" style={{ marginBottom: 12 }}>{formError}</div>}

      {jsonMode ? (
        <>
          <div style={{ marginBottom: 12, padding: 12, backgroundColor: '#e3f2fd',
            borderRadius: 4, fontSize: 13, color: '#1565c0' }}>
            <Info size={14} style={{ verticalAlign: '-3px', marginRight: 4 }} /><strong>JSON Mode:</strong> Paste your complete pattern JSON here.
            Ideal for complex enriched patterns with advanced EPL rules.
          </div>

          <label className="form-label">Pattern JSON *</label>
          <textarea
            className="form-input"
            rows={20}
            value={jsonInput}
            onChange={e => onJsonInputChange(e.target.value)}
            placeholder={`{\n  "pattern_id": "my_complex_pattern",\n  "name": "Complex Pattern Name",\n  "description": "Pattern description",\n  "epl_rule": "SELECT ... FROM ...",\n  "severity": "high",\n  "enabled": true,\n  "input_domains": ["traffic", "health"],\n  "uses_enrichment": true,\n  "enrichment_fields": ["zone_context.risk_level"]\n}`}
            style={{ fontFamily: 'monospace', fontSize: 11 }} />
        </>
      ) : (
        <>
          <label className="form-label">Pattern ID *</label>
          <input className="form-input" value={patternForm.pattern_id}
            onChange={e => onChangeField('pattern_id', e.target.value)}
            disabled={!!patternForm._id} placeholder="e.g. high_traffic_congestion" />

          <label className="form-label">Name</label>
          <input className="form-input" value={patternForm.name}
            onChange={e => onChangeField('name', e.target.value)} placeholder="Human-readable name" />

          <label className="form-label">Description</label>
          <textarea className="form-input" rows={2} value={patternForm.description}
            onChange={e => onChangeField('description', e.target.value)}
            placeholder="What does this pattern detect?" />

          <label className="form-label">EPL Rule *</label>
          <textarea className="form-input" rows={5} value={patternForm.epl_rule}
            onChange={e => onChangeField('epl_rule', e.target.value)}
            placeholder="SELECT ... FROM TrafficEvent(...).win:time(5 min) ..."
            style={{ fontFamily: 'monospace', fontSize: 12 }} />

          <label className="form-label">Severity</label>
          <select className="form-input" value={patternForm.severity}
            onChange={e => onChangeField('severity', e.target.value)}>
            {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <label className="form-label">Input Domains</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {ALL_DOMAINS.map(domain => (
              <label key={domain} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                <input type="checkbox"
                  checked={patternForm.input_domains.includes(domain)}
                  onChange={() => onToggleDomain(domain)} />
                <DomainIcon domain={domain} /> {domain}
              </label>
            ))}
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, cursor: 'pointer' }}>
            <input type="checkbox" checked={patternForm.enabled}
              onChange={e => onChangeField('enabled', e.target.checked)} />
            Enabled
          </label>
        </>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn-secondary" onClick={onClose} disabled={formLoading}>Cancel</button>
        <button className="btn-primary"   onClick={onSave}  disabled={formLoading}>
          {formLoading ? 'Saving…' : 'Save Pattern'}
        </button>
      </div>
    </div>
  </div>
);

export default PatternModal;
