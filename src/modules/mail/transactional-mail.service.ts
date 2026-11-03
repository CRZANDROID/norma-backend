import { Injectable, Logger } from '@nestjs/common';
import type { EmailDelivery } from './email-delivery';

const RESEND_URL = 'https://api.resend.com/emails';

export type ReportMailInput = {
  recipients: string[];
  subject: string;
  html: string;
  text: string;
  filename: string;
  pdf: Buffer;
};

@Injectable()
export class TransactionalMailService {
  private readonly logger = new Logger(TransactionalMailService.name);

  /**
   * Si falta la llave o el remitente, no llama al proveedor.
   * Devuelve null solo cuando el envío se puede intentar.
   */
  blocked(recipients: string[]): EmailDelivery | null {
    const key = process.env.RESEND_API_KEY?.trim() ?? '';
    const from = process.env.RESEND_FROM?.trim() ?? '';
    const to = uniqueEmails(recipients);
    if (!key) {
      return {
        sent: false,
        reason: 'missing_api_key',
        message:
          'Falta RESEND_API_KEY. No se envió el correo. El informe sigue en borrador.',
        recipients: to,
      };
    }
    if (!from) {
      return {
        sent: false,
        reason: 'missing_from',
        message:
          'Falta RESEND_FROM. No se envió el correo. El informe sigue en borrador.',
        recipients: to,
      };
    }
    if (to.length === 0) {
      return {
        sent: false,
        reason: 'no_recipients',
        message:
          'Este cliente no tiene contactos activos con correo. No se envió el correo. El informe sigue en borrador.',
        recipients: [],
      };
    }
    return null;
  }

  async sendReport(input: ReportMailInput): Promise<EmailDelivery> {
    const blocked = this.blocked(input.recipients);
    if (blocked) {
      return blocked;
    }
    const key = process.env.RESEND_API_KEY!.trim();
    const from = process.env.RESEND_FROM!.trim();
    const to = uniqueEmails(input.recipients);
    try {
      const response = await fetch(RESEND_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to,
          subject: input.subject,
          html: input.html,
          text: input.text,
          attachments: [
            {
              filename: input.filename,
              content: input.pdf.toString('base64'),
            },
          ],
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        const detail = await response.text();
        this.logger.warn(
          `Resend rechazó el correo status=${response.status} body=${detail.slice(0, 240)}`,
        );
        return {
          sent: false,
          reason: 'provider_error',
          message: `Resend no aceptó el correo (${response.status}). No se envió el correo. El informe sigue en borrador.`,
          recipients: to,
        };
      }
      return {
        sent: true,
        reason: 'sent',
        message:
          to.length === 1
            ? `Correo enviado a ${to[0]}.`
            : `Correo enviado a ${to.length} contactos.`,
        recipients: to,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Resend no disponible: ${message.slice(0, 240)}`);
      return {
        sent: false,
        reason: 'provider_error',
        message:
          'No se pudo contactar a Resend. No se envió el correo. El informe sigue en borrador.',
        recipients: to,
      };
    }
  }
}

function uniqueEmails(recipients: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of recipients) {
    const email = raw.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || seen.has(email)) {
      continue;
    }
    seen.add(email);
    out.push(email);
  }
  return out;
}
