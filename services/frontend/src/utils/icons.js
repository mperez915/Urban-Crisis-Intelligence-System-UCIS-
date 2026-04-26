import {
  Car, CloudSun, HeartPulse, Leaf, Users,
  MapPin,
} from 'lucide-react';

const DOMAIN_ICONS = {
  traffic:     Car,
  climate:     CloudSun,
  health:      HeartPulse,
  environment: Leaf,
  population:  Users,
};

/**
 * Renders the icon associated with an event domain.
 * Falls back to a generic location pin for unknown domains.
 */
export const DomainIcon = ({ domain, size = 14, className, style }) => {
  const Icon = DOMAIN_ICONS[domain] || MapPin;
  return <Icon size={size} className={className} style={{ verticalAlign: 'middle', ...style }} />;
};

export default DomainIcon;
