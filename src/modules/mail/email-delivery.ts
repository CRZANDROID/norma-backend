export const EMAIL_DELIVERY_REASONS = [
  'sent',
  'missing_api_key',
  'missing_from',
  'no_recipients',
  'provider_error',
] as const;

export type EmailDeliveryReason = (typeof EMAIL_DELIVERY_REASONS)[number];

/** Resultado visible del correo. `sent: false` nunca se presenta como enviado. */
export type EmailDelivery = {
  sent: boolean;
  reason: EmailDeliveryReason;
  message: string;
  recipients: string[];
};

export function reportFooterNote(email: EmailDelivery | null): string {
  if (!email) {
    return 'No enviado al cliente';
  }
  if (email.sent) {
    return 'Enviado al cliente';
  }
  return 'Registrado como enviado. Correo no entregado.';
}
