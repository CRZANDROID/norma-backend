import { HttpPageConnector } from './http.connector';
import type { SourceConnector } from './types';

export const PILOT_CONNECTOR_CODES = [
  'dof',
  'diputados-gaceta',
  'jalisco-congreso',
] as const;

const dof = new HttpPageConnector('dof', 'DOF');
const diputados = new HttpPageConnector(
  'diputados-gaceta',
  'Gaceta Diputados',
);
const jalisco = new HttpPageConnector(
  'jalisco-congreso',
  'Congreso de Jalisco',
);

const generic = new HttpPageConnector('generic', 'HTTP genérico');

const byCode: Record<string, SourceConnector> = {
  dof,
  'diputados-gaceta': diputados,
  'jalisco-congreso': jalisco,
};

export function getConnector(sourceCode: string): SourceConnector {
  return byCode[sourceCode] ?? generic;
}

export function listPilotConnectors() {
  return PILOT_CONNECTOR_CODES.map((code) => ({
    code,
    label: byCode[code].label,
  }));
}
