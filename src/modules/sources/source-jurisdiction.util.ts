import { BadRequestException } from '@nestjs/common';
import {
  MexicanState,
  SourceJurisdiction,
} from '../../database/prisma-client';

export function resolveSourceJurisdiction(input: {
  jurisdiction?: SourceJurisdiction;
  stateCode?: MexicanState | null;
  hasStateCode: boolean;
  existing?: {
    jurisdiction: SourceJurisdiction;
    stateCode: MexicanState | null;
  };
}): { jurisdiction: SourceJurisdiction; stateCode: MexicanState | null } {
  const jurisdiction =
    input.jurisdiction ??
    input.existing?.jurisdiction ??
    SourceJurisdiction.FEDERAL;

  const stateCode = input.hasStateCode
    ? (input.stateCode ?? null)
    : (input.existing?.stateCode ?? null);

  if (jurisdiction === SourceJurisdiction.FEDERAL) {
    if (input.hasStateCode && input.stateCode) {
      throw new BadRequestException(
        'stateCode must be empty when jurisdiction is FEDERAL',
      );
    }
    return { jurisdiction, stateCode: null };
  }

  if (!stateCode) {
    throw new BadRequestException(
      'stateCode is required when jurisdiction is STATE',
    );
  }

  return { jurisdiction, stateCode };
}
