import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UserRole } from '../../database/prisma-client';
import { PrismaService } from '../../database/prisma.service';
import { AuthUser, JwtPayload } from './auth.types';

const BCRYPT_ROUNDS = 12;

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: string;
  memberships: Array<{
    clientId: string;
    role: UserRole;
    client: { name: string; slug: string };
  }>;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(
    email: string,
    password: string,
  ): Promise<{ accessToken: string; user: AuthUser }> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        memberships: {
          where: { status: 'ACTIVE' },
          include: { client: true },
        },
      },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Invalid email or password');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const authUser = this.toAuthUser(user);
    const payload: JwtPayload = { sub: user.id, email: user.email };
    const accessToken = await this.jwtService.signAsync(payload);

    return { accessToken, user: authUser };
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

    return this.toAuthUser(user);
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  async createUser(input: {
    email: string;
    name: string;
    password: string;
    role?: UserRole;
  }): Promise<AuthUser> {
    const email = input.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await this.hashPassword(input.password);
    const user = await this.prisma.user.create({
      data: {
        email,
        name: input.name,
        passwordHash,
        role: input.role ?? UserRole.ANALYST,
      },
      include: {
        memberships: {
          where: { status: 'ACTIVE' },
          include: { client: true },
        },
      },
    });

    return this.toAuthUser(user);
  }

  private toAuthUser(user: UserRow): AuthUser {
    return {
      id: user.id,
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
