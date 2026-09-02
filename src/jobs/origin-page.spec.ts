import { storedCrawlFailureMessage } from './origin-page';
import { ORIGIN_PAGE_UNAVAILABLE } from './origin-page';

describe('storedCrawlFailureMessage', () => {
  it('stores TLS and network errors as origin-page copy', () => {
    expect(
      storedCrawlFailureMessage({
        message:
          'fetch failed unable to verify the first certificate UNABLE_TO_VERIFY_LEAF_SIGNATURE',
        errorCode: 'NETWORK',
      }),
    ).toBe(ORIGIN_PAGE_UNAVAILABLE);
    expect(
      storedCrawlFailureMessage({
        message: 'HTTP 401 (auth)',
        errorCode: 'AUTH',
      }),
    ).toBe('HTTP 401 (auth)');
  });
});
