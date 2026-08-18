import { ImpactLevel } from '../../database/prisma-client';
import { DEFAULT_SCHEDULE } from '../../common/dto/schedule.dto';
import type { ImpactActionDto } from './dto/impact-action.dto';

export const DEFAULT_IMPACT_ACTIONS: ImpactActionDto[] = [
  {
    impact: ImpactLevel.GREEN,
    notifyInbox: true,
    sendEmail: false,
    sendWhatsapp: false,
    requireHumanApproval: false,
    suggestedAction: 'Registrar como contexto',
  },
  {
    impact: ImpactLevel.YELLOW,
    notifyInbox: true,
    sendEmail: true,
    sendWhatsapp: false,
    requireHumanApproval: true,
    suggestedAction: 'Dar seguimiento',
  },
  {
    impact: ImpactLevel.ORANGE,
    notifyInbox: true,
    sendEmail: true,
    sendWhatsapp: false,
    requireHumanApproval: true,
    suggestedAction: 'Elaborar nota y monitorear avance',
  },
  {
    impact: ImpactLevel.RED,
    notifyInbox: true,
    sendEmail: true,
    sendWhatsapp: true,
    requireHumanApproval: true,
    suggestedAction: 'Alertar de inmediato y preparar nota ejecutiva',
  },
];

export { DEFAULT_SCHEDULE };
