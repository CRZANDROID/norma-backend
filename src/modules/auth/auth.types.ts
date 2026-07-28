import { UserRole } from '../../database/prisma-client';

export type AuthMembership = {
  clientId: string;
  clientName: string;
  clientSlug: string;
  role: UserRole;
};

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  memberships: AuthMembership[];
};

export type JwtPayload = {
  sub: string;
  email: string;
};
