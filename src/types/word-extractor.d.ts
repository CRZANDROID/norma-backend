declare module 'word-extractor' {
  export default class WordExtractor {
    extract(documentPath: string | Buffer): Promise<{
      getBody(): string;
      getHeaders(): string;
      getFooters(): string;
    }>;
  }
}
