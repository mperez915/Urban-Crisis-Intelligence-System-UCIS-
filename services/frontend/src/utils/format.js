export const getSeverityColor = (s) =>
  ({ critical: '#ff4444', high: '#ff9800', medium: '#ffc107', low: '#4caf50' }[s] || '#999');

export const fmtTime = (iso) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
};
