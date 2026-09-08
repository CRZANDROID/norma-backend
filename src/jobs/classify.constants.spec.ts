import {
  CLASSIFY_PROMPT_VERSION,
  CLASSIFY_SYSTEM_PROMPT,
} from './classify.constants';

describe('classify prompt v2', () => {
  it('asks for a factual briefing, not a relevance blurb', () => {
    expect(CLASSIFY_PROMPT_VERSION).toBe('classify-v2');
    expect(CLASSIFY_SYSTEM_PROMPT).toMatch(/El documento menciona/);
    expect(CLASSIFY_SYSTEM_PROMPT).toMatch(/Nombra LA MEDIDA/);
    expect(CLASSIFY_SYSTEM_PROMPT).not.toMatch(/2–6 frases/);
    expect(CLASSIFY_SYSTEM_PROMPT).not.toMatch(/### Qué sigue/);
  });
});
