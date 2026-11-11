import type { ComponentProps } from 'react';
import { CarrierIntegrationsManager } from '../CarrierIntegrationsManager';

type IntegrationsTabProps = ComponentProps<typeof CarrierIntegrationsManager>;

export function IntegrationsTab(props: IntegrationsTabProps) {
  return <CarrierIntegrationsManager {...props} />;
}
