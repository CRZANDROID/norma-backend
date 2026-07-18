import { UserRole } from '@prisma/client';

export type AuthMembership = {
  clientId: string;
  clientName: string;
  clientSlug: string;
  role: UserRole;
};

export type AuthUser = {
  id: string;
  authUserId: string;
  email: string;
  name: string;
  role: UserRole;
  memberships: AuthMembership[];
};

export type JwtPayloadUser = {
  authUserId: string;
  email: string;
  name?: string;
};
