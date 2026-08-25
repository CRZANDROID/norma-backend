import { DEFAULT_MAX_BYTES, resolveMaxBytes } from './fetch-page';

describe('fetch-page size limit', () => {
  const previous = process.env.CRAWL_MAX_BYTES;

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.CRAWL_MAX_BYTES;
    } else {
      process.env.CRAWL_MAX_BYTES = previous;
    }
  });

  it('defaults to 10 MB and accepts env override', () => {
    delete process.env.CRAWL_MAX_BYTES;
    expect(resolveMaxBytes()).toBe(DEFAULT_MAX_BYTES);
    expect(DEFAULT_MAX_BYTES).toBe(10_000_000);

    process.env.CRAWL_MAX_BYTES = '8000000';
    expect(resolveMaxBytes()).toBe(8_000_000);
    expect(resolveMaxBytes(12_000_000)).toBe(12_000_000);
  });
});
