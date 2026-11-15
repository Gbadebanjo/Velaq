import { type CanActivate, type ExecutionContext, Inject, Injectable, Optional, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { IdentityService } from "../identity/identity.service.js";
import { SpaceService } from "../space/space.service.js";
import { IS_PUBLIC } from "./decorators.js";
import type { Principal } from "./principal.js";

interface AuthRequest {
  headers: Record<string, string | string[] | undefined>;
  principal?: Principal;
  sessionToken?: string;
}

/**
 * Global guard: every route needs a valid session unless marked @Public(). Fails closed.
 * Sessions are checked against the database on every request, so signing out or blocking
 * someone takes effect immediately.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Optional() @Inject(SpaceService) private readonly spaces?: SpaceService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<AuthRequest>();
    const token = bearerToken(req.headers.authorization);
    if (!token) throw new UnauthorizedException();

    const principal = await this.identity.verifySession(token);
    if (!principal) throw new UnauthorizedException();
    // Personal requests always run inside the caller's own space, created on first use.
    if (this.spaces && principal.product === "personal") principal.scopeId = await this.spaces.ensure(principal.accountId);
    req.principal = principal;
    req.sessionToken = token;
    return true;
  }
}

export function bearerToken(header: string | string[] | undefined): string | null {
  if (typeof header !== "string") return null;
  const m = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return m?.[1] ?? null;
}
