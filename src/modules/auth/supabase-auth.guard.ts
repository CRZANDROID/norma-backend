import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      user?: unknown;
    }>();

    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing Bearer token');
    }

    const token = header.slice(7).trim();
    if (!token) {
      throw new UnauthorizedException('Missing Bearer token');
    }

    const supabaseUser = await this.supabase.getUserFromAccessToken(token);
    request.user = await this.authService.syncUserFromSupabase({
      authUserId: supabaseUser.id,
      email: supabaseUser.email ?? '',
      name:
        (supabaseUser.user_metadata?.full_name as string | undefined) ||
        (supabaseUser.user_metadata?.name as string | undefined) ||
        supabaseUser.email?.split('@')[0] ||
        'Usuario',
    });

    return true;
  }
}
