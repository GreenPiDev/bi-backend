import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import type { UserRole } from '@prisma/client';
import type { Response } from 'express';
import { Public } from '../../core/decorators/public.decorator';
import { setAuthCookies } from '../../core/http/set-auth-cookies';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import type { SafeUser } from '../auth/auth.service';
import {
  AcceptInvitationDto,
  AcceptInvitationSchema,
} from './dto/accept-invitation.dto';
import { UsersService } from './users.service';

@Controller('invitations')
export class InvitationsController {
  constructor(private readonly users: UsersService) {}

  @Public()
  @Get(':token')
  getInvitation(@Param('token') token: string): Promise<{
    tenantName: string;
    email: string;
    role: UserRole;
    expired: boolean;
  }> {
    return this.users.getInvitationInfo(token);
  }

  @Public()
  @Post(':token/accept')
  async accept(
    @Param('token') token: string,
    @Body(new ZodValidationPipe(AcceptInvitationSchema))
    dto: AcceptInvitationDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: SafeUser }> {
    const result = await this.users.acceptInvitation(token, dto);
    setAuthCookies(res, result.accessToken, result.refreshToken);
    return { user: result.user };
  }
}
