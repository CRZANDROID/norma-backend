import { ImpactLevel } from '../../database/prisma-client';
import { markdownToPdfText, renderReportPdf } from './report-pdf';

describe('report-pdf', () => {
  it('strips markdown markers for the PDF body', () => {
    expect(markdownToPdfText('## Hecho\n\n**Vigencia** el 1 de octubre')).toBe(
      'Hecho\n\nVigencia el 1 de octubre',
    );
    expect(markdownToPdfText('- Uno\n- Dos')).toContain('• Uno');
  });

  it('renders a single-page briefing with linked finding, no cover', async () => {
    const buffer = await renderReportPdf({
      clientName: 'Arca Continental',
      legalName: 'Embotelladoras Arca Continental S.A.B. de C.V.',
      dateFrom: '2026-09-14',
      dateTo: '2026-09-14',
      generatedAt: new Date('2026-09-14T22:00:00.000Z'),
      generatedByName: 'Admin NORMA',
      findings: [
        {
          title: 'Etiquetado de bebidas azucaradas',
          impact: ImpactLevel.RED,
          suggestedAction: 'Escalar a direccion regulatoria',
          justification:
            '## Hecho\n\nEl decreto toca etiquetado de bebidas, alineado al perfil de Arca.',
          sourceName: 'Diario Oficial de la Federacion',
          documentUrl: 'https://www.dof.gob.mx/nota_detalle.php?codigo=e2e',
          createdAt: new Date('2026-09-14T18:00:00.000Z'),
        },
      ],
    });

    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const asText = buffer.toString('latin1');
    expect(asText).toContain('/URI (https://www.dof.gob.mx/nota_detalle.php?codigo=e2e)');
    expect(asText).toContain('/BaseFont /Helvetica');
    expect(asText).toMatch(/\/Count 1/);
    expect(asText).toMatch(/A\x00r\x00c\x00a\x00 \x00C\x00o\x00n\x00t\x00i\x00n\x00e\x00n\x00t\x00a\x00l/);
  });
});
