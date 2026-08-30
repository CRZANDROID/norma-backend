import { HttpPageConnector } from './http.connector';
import type { SourceConnector } from './types';

export const PILOT_CONNECTOR_CODES = [
  'dof',
  'diputados-gaceta',
  'jalisco-congreso',
  'congreso-agu',
  'congreso-bcn',
  'congreso-bcs',
  'congreso-cam',
  'congreso-chh',
] as const;

const byCode: Record<string, SourceConnector> = {
  dof: new HttpPageConnector('dof', 'DOF'),
  'diputados-gaceta': new HttpPageConnector(
    'diputados-gaceta',
    'Gaceta Diputados',
  ),
  'jalisco-congreso': new HttpPageConnector(
    'jalisco-congreso',
    'Congreso de Jalisco',
  ),
  'congreso-agu': new HttpPageConnector(
    'congreso-agu',
    'Congreso de Aguascalientes',
  ),
  'congreso-bcn': new HttpPageConnector(
    'congreso-bcn',
    'Congreso de Baja California',
  ),
  'congreso-bcs': new HttpPageConnector(
    'congreso-bcs',
    'Congreso de Baja California Sur',
  ),
  'congreso-cam': new HttpPageConnector(
    'congreso-cam',
    'Congreso de Campeche',
  ),
  'congreso-chh': new HttpPageConnector(
    'congreso-chh',
    'Congreso de Chihuahua',
  ),
};

const generic = new HttpPageConnector('generic', 'HTTP genérico');

export function getConnector(sourceCode: string): SourceConnector {
  return byCode[sourceCode] ?? generic;
}

export function listPilotConnectors() {
  return PILOT_CONNECTOR_CODES.map((code) => ({
    code,
    label: byCode[code].label,
  }));
}
