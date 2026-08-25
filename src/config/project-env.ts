import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { parse } from 'dotenv';

function envFileCandidates(): string[] {
  return [
    resolve(process.cwd(), '.env'),
    resolve(__dirname, '../../.env'),
    resolve(__dirname, '../../../.env'),
  ];
}

/**
 * Valores no vacíos del `.env` del proyecto.
 * Nest/dotenv no pisan variables ya definidas (aunque estén en blanco);
 * Cursor suele inyectar `OPENAI_API_KEY=""`, y entonces `/ai/status`
 * queda `configured: false` pese a la key en el archivo.
 */
export function readProjectEnvFile(): Record<string, string> {
  const envPath = envFileCandidates().find((candidate) => existsSync(candidate));
  if (!envPath) {
    return {};
  }

  const parsed = parse(readFileSync(envPath));
  const filled: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (value?.trim()) {
      filled[key] = value;
    }
  }
  return filled;
}

export function applyProjectEnvToProcess(): void {
  for (const [key, value] of Object.entries(readProjectEnvFile())) {
    if (!process.env[key]?.trim()) {
      process.env[key] = value;
    }
  }
}
