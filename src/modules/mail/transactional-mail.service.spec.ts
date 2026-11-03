import { TransactionalMailService } from './transactional-mail.service';

describe('TransactionalMailService', () => {
  const mail = new TransactionalMailService();
  const previousKey = process.env.RESEND_API_KEY;
  const previousFrom = process.env.RESEND_FROM;

  afterEach(() => {
    restore('RESEND_API_KEY', previousKey);
    restore('RESEND_FROM', previousFrom);
    jest.restoreAllMocks();
  });

  it('does not call Resend and does not claim the mail was sent when the key is missing', async () => {
    delete process.env.RESEND_API_KEY;
    process.env.RESEND_FROM = 'NORMA <informes@example.com>';
    const fetchMock = jest.spyOn(global, 'fetch');

    const result = await mail.sendReport({
      recipients: ['ana@arca.example'],
      subject: 'Informe',
      html: '<p>Hola</p>',
      text: 'Hola',
      filename: 'informe.pdf',
      pdf: Buffer.from('%PDF'),
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.sent).toBe(false);
    expect(result.reason).toBe('missing_api_key');
    expect(result.message).toContain('RESEND_API_KEY');
    expect(result.message).toContain('borrador');
  });

  it('does not call Resend when the from address is missing', async () => {
    process.env.RESEND_API_KEY = 're_test';
    delete process.env.RESEND_FROM;
    const fetchMock = jest.spyOn(global, 'fetch');
    const result = await mail.sendReport({
      recipients: ['ana@arca.example'],
      subject: 'Informe',
      html: '<p>Hola</p>',
      text: 'Hola',
      filename: 'informe.pdf',
      pdf: Buffer.from('%PDF'),
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.reason).toBe('missing_from');
    expect(result.message).toContain('RESEND_FROM');
  });
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
