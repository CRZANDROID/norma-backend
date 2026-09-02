import { JobErrorCode, JobRunStatus } from '../database/prisma-client';
import {
  ORIGIN_PAGE_PARTIAL,
  ORIGIN_PAGE_UNAVAILABLE,
} from './origin-page';
import {
  crawlFailNote,
  crawlProgressFromRunStatus,
  crawlProgressLabel,
  crawlProgressNote,
} from './progress.labels';

describe('crawl progress labels', () => {
  it('maps job run status to executive status + Spanish label', () => {
    expect(crawlProgressFromRunStatus(JobRunStatus.QUEUED)).toBe('queued');
    expect(crawlProgressLabel('queued')).toBe('Rastreando');
    expect(crawlProgressFromRunStatus(JobRunStatus.RUNNING)).toBe('running');
    expect(crawlProgressLabel('running')).toBe('Rastreando');
    expect(crawlProgressFromRunStatus(JobRunStatus.SUCCESS)).toBe('crawled');
    expect(crawlProgressLabel('crawled')).toBe('Rastreada');
    expect(crawlProgressFromRunStatus(JobRunStatus.FAILED)).toBe('failed');
    expect(crawlProgressLabel('failed')).toBe('No se pudo rastrear');
    expect(crawlProgressFromRunStatus(JobRunStatus.SKIPPED)).toBe('skipped');
    expect(crawlProgressLabel('skipped')).toBe('Omitida');
    expect(crawlProgressLabel('pending')).toBe('Pendiente hoy');
  });

  it('attributes network and TLS failures to the origin page, not the agent', () => {
    expect(crawlFailNote('La fuente no respondió.', JobErrorCode.NETWORK)).toBe(
      ORIGIN_PAGE_UNAVAILABLE,
    );
    expect(
      crawlFailNote(
        'Error: connect ECONNREFUSED 127.0.0.1:443',
        JobErrorCode.NETWORK,
      ),
    ).toBe(ORIGIN_PAGE_UNAVAILABLE);
    expect(
      crawlFailNote(
        'fetch failed unable to verify the first certificate UNABLE_TO_VERIFY_LEAF_SIGNATURE',
        JobErrorCode.NETWORK,
      ),
    ).toBe(ORIGIN_PAGE_UNAVAILABLE);
    expect(crawlFailNote(null, JobErrorCode.PARSE)).toBe(
      'No se pudo leer la página de la fuente.',
    );
    expect(crawlFailNote('at Worker.run (index.js:1:1)', null)).toBe(
      'No se pudo completar el rastreo.',
    );
    expect(
      crawlFailNote('Respuesta demasiado grande (7197916 bytes)', JobErrorCode.PARSE),
    ).toBe(
      'La página de la fuente es demasiado pesada para el rastreo actual.',
    );
  });

  it('explains skipped, later success, and partial origin-page failures', () => {
    expect(crawlProgressNote('skipped', 'Fuente INACTIVE', null)).toBe(
      'La fuente está inactiva; no se rastreó.',
    );
    expect(
      crawlProgressNote('crawled', null, null, { hadFailedAttempt: true }),
    ).toBe(
      'Un intento de hoy no se pudo completar. El último rastreo sí terminó.',
    );
    expect(crawlProgressNote('crawled', null, null)).toBeNull();
    expect(crawlProgressNote('crawled', ORIGIN_PAGE_PARTIAL, null)).toBe(
      ORIGIN_PAGE_PARTIAL,
    );
    expect(
      crawlProgressNote('failed', ORIGIN_PAGE_UNAVAILABLE, JobErrorCode.NETWORK),
    ).toBe(ORIGIN_PAGE_UNAVAILABLE);
  });
});
