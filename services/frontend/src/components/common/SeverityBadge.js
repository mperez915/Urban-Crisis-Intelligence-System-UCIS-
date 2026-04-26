import { getSeverityColor } from '../../utils/format';

const SeverityBadge = ({ level, children, style = {} }) => (
  <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11,
    backgroundColor: getSeverityColor(level), color: 'white', ...style }}>
    {children ?? level}
  </span>
);

export default SeverityBadge;
