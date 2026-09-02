/**
 * Copy ejecutivo: fallos de red/TLS/origen se atribuyen a la página de la fuente,
 * no al rastreo de NORMA.
 */
export const ORIGIN_PAGE_UNAVAILABLE =
  'La página de la fuente no está disponible.';

export const ORIGIN_PAGE_PARTIAL =
  'Algunas páginas del sitio no respondieron; se guardó lo que sí estaba disponible.';

const ORIGIN_PAGE_FAIL_RE =
  /certificate|unable to verify|UNABLE_TO_VERIFY|CERT_|ERR_TLS|self.?signed|\bssl\b|\btls\b|fetch failed|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|ECONNRESET|EAI_AGAIN|AbortError|aborted|UND_ERR|timeout|Fallo de red|HTTP 5\d\d|socket hang up/i;

export function isOriginPageFailure(message: string | null | undefined): boolean {
  return Boolean(message && ORIGIN_PAGE_FAIL_RE.test(message));
}

export function storedCrawlFailureMessage(err: {
  message: string;
  errorCode: string;
}): string {
  if (err.errorCode === 'NETWORK' || isOriginPageFailure(err.message)) {
    return ORIGIN_PAGE_UNAVAILABLE;
  }
  return err.message.slice(0, 1000);
}
