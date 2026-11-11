import type { ComponentProps } from 'react';
import { ShipmentExceptionsPanel } from '../ShipmentExceptionsPanel';

type ExceptionsTabProps = ComponentProps<typeof ShipmentExceptionsPanel>;

export function ExceptionsTab(props: ExceptionsTabProps) {
  return <ShipmentExceptionsPanel {...props} />;
}
