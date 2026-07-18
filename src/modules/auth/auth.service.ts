import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuthUser, JwtPayloadUser } from './auth.types';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async syncUserFromSupabase(payload: JwtPayloadUser): Promise<AuthUser> {
    if (!payload.email || !payload.authUserId) {
      throw new UnauthorizedException('Token missing required identity claims');
    }

    const user = await this.prisma.user.upsert({
      where: { authUserId: payload.authUserId },
      create: {
        authUserId: payload.authUserId,
        email: payload.email.toLowerCase(),
        name: payload.name || payload.email.split('@')[0],
        role: UserRole.ANALYST,
      },
      update: {
        email: payload.email.toLowerCase(),
        name: payload.name || undefined,
      },
      include: {
        memberships: {
          where: { status: 'ACTIVE' },
          include: { client: true },
        },
      },
    });

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User account is inactive');
    }

    return {
      id: user.id,
      authUserId: user.authUserId,
      email: user.email,
      name: user.name,
      role: user.role,
      memberships: user.memberships.map((m) => ({
        clientId: m.clientId,
        clientName: m.client.name,
        clientSlug: m.client.slug,
        role: m.role,
      })),
    };
  }

  async getMe(userId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          where: { status: 'ACTIVE' },
          include: { client: true },
        },
      },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User not found or inactive');
    }

    return {
      id: user.id,
      authUserId: user.authUserId,
      email: user.email,
      name: user.name,
      role: user.role,
      memberships: user.memberships.map((m) => ({
        clientId: m.clientId,
        clientName: m.client.name,
        clientSlug: m.client.slug,
        role: m.role,
      })),
    };
  }
}
