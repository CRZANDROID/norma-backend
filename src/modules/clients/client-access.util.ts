import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../../database/prisma-client';
import type { AuthUser } from '../auth/auth.types';

export function isAdmin(user: AuthUser): boolean {
  return user.role === UserRole.ADMIN;
}

export function hasClientMembership(user: AuthUser, clientId: string): boolean {
  return user.memberships.some((m) => m.clientId === clientId);
}

export function assertClientAccess(user: AuthUser, clientId: string): void {
  if (isAdmin(user) || hasClientMembership(user, clientId)) {
    return;
  }

  throw new ForbiddenException('No access to this client');
}
