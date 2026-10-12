import {
  isPublicWebSearchConfigured,
  parseDuckDuckGoResults,
  searchPublicWeb,
} from './public-web-search';

const FIXTURE = `
<div class="result">
  <a rel="nofollow" class="result__a" href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.acme.example%2Fempresa&amp;rut=abc">Acme Bebidas</a>
  <a class="result__snippet">Embotelladora de refrescos y botanas.</a>
</div>
<a class="result__a" href="https://duckduckgo.com/">DuckDuckGo</a>
`;

describe('public web search', () => {
  it('is off only when the flag disables it', () => {
    expect(isPublicWebSearchConfigured({ WEB_SEARCH_ENABLED: 'off' })).toBe(
      false,
    );
    expect(isPublicWebSearchConfigured({})).toBe(true);
  });

  it('keeps title, url and snippet from the public results', () => {
    expect(parseDuckDuckGoResults(FIXTURE)).toEqual([
      {
        title: 'Acme Bebidas',
        url: 'https://www.acme.example/empresa',
        snippet: 'Embotelladora de refrescos y botanas.',
      },
    ]);
  });

  it('does not fetch when the step is not configured', async () => {
    const fetchImpl = jest.fn();
    const outcome = await searchPublicWeb('Acme', undefined, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      env: { WEB_SEARCH_ENABLED: 'false' },
    });
    expect(outcome).toEqual({ configured: false, results: [] });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
