import { type ExecutionContext, SetMetadata, UnauthorizedException, createParamDecorator } from "@nestjs/common";
import type { Principal } from "./principal.js";

export const IS_PUBLIC = "velaq:isPublic";

/** Marks a route that needs no session, such as /health or sign-in. Everything else requires one. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Injects the signed-in caller into a route handler. */
export const CurrentPrincipal = createParamDecorator((_: unknown, ctx: ExecutionContext): Principal => {
  const req = ctx.switchToHttp().getRequest<{ principal?: Principal }>();
  if (!req.principal) throw new UnauthorizedException();
  return req.principal;
});
