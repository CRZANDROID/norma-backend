/**
 * Identidad de una medida para un cliente.
 *
 * 1. Misma URL sin el sufijo del archivo (.html, .pdf, .docx, …).
 * 2. Si la URL no alcanza para emparejar (no hay, o es solo portada), el mismo
 *    título de gaceta. Un título genérico ("Sin relevancia operativa") no cuenta.
 */

const DOCUMENT_EXT =
  /\.(html?|xhtml|pdf|docx?|docm|xml|txt|rtf|odt|pptx?)$/i;

const WEAK_PATHS = new Set([
  '/',
  '/index',
  '/home',
  '/default',
  '/portada',
  '/inicio',
]);

const GENERIC_TITLES = new Set(['sin relevancia operativa', 'hallazgo']);

export type MedidaRef = {
  url: string | null;
  title: string | null;
};

export function medidaUrlKey(url: string | null | undefined): string | null {
  const raw = url?.trim();
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  parsed.hash = '';
  const host = parsed.host.toLowerCase();
  let path = safeDecode(parsed.pathname).replace(/\/+$/, '') || '/';
  const segments = path.split('/');
  const last = segments[segments.length - 1] ?? '';
  const stripped = last.replace(DOCUMENT_EXT, '');
  if (stripped !== last) {
    segments[segments.length - 1] = stripped;
    path = segments.join('/') || '/';
  }
  path = path.toLowerCase();
  if (WEAK_PATHS.has(path)) return null;
  return `${parsed.protocol}//${host}${path}${parsed.search}`;
}

export function medidaTitleKey(title: string | null | undefined): string | null {
  if (!title) return null;
  const key = title.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!key || GENERIC_TITLES.has(key)) return null;
  return key;
}

export function sameMedida(a: MedidaRef, b: MedidaRef): boolean {
  const urlA = medidaUrlKey(a.url);
  const urlB = medidaUrlKey(b.url);
  if (urlA && urlB && urlA === urlB) return true;
  const titleA = medidaTitleKey(a.title);
  const titleB = medidaTitleKey(b.title);
  return Boolean(titleA && titleB && titleA === titleB);
}

export type MedidaRow = MedidaRef & {
  id: string;
  createdAt: Date;
  inReport: boolean;
};

/** Hallazgo que ya cubre esta medida, o null si hay que crear el de este documento. */
export function findMedidaDuplicate<T extends MedidaRow>(
  existing: T[],
  incoming: MedidaRef,
): T | null {
  const matches = existing.filter((row) => sameMedida(row, incoming));
  if (matches.length === 0) return null;
  return chooseMedidaKeeper(matches);
}

export function chooseMedidaKeeper<T extends MedidaRow>(rows: T[]): T {
  const inReport = rows.filter((row) => row.inReport);
  const pool = inReport.length > 0 ? inReport : rows;
  return [...pool].sort((a, b) => {
    const byTime = a.createdAt.getTime() - b.createdAt.getTime();
    if (byTime !== 0) return byTime;
    return a.id.localeCompare(b.id);
  })[0];
}

export function groupByMedida<T extends MedidaRow>(rows: T[]): T[][] {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let current = id;
    while (parent.get(current) !== current) {
      const next = parent.get(current);
      if (!next) break;
      parent.set(current, parent.get(next) ?? next);
      current = parent.get(current) ?? current;
    }
    return current;
  };
  const union = (left: string, right: string) => {
    const rootLeft = find(left);
    const rootRight = find(right);
    if (rootLeft !== rootRight) parent.set(rootLeft, rootRight);
  };

  for (const row of rows) parent.set(row.id, row.id);
  const byUrl = new Map<string, string>();
  const byTitle = new Map<string, string>();
  for (const row of rows) {
    const url = medidaUrlKey(row.url);
    if (url) {
      const previous = byUrl.get(url);
      if (previous) union(previous, row.id);
      else byUrl.set(url, row.id);
    }
    const title = medidaTitleKey(row.title);
    if (title) {
      const previous = byTitle.get(title);
      if (previous) union(previous, row.id);
      else byTitle.set(title, row.id);
    }
  }

  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const root = find(row.id);
    const list = groups.get(root);
    if (list) list.push(row);
    else groups.set(root, [row]);
  }
  return [...groups.values()];
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
