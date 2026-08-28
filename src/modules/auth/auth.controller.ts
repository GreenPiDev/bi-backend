import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  CurrentUser,
  type RequestUser,
} from '../../core/decorators/current-user.decorator';
import { Public } from '../../core/decorators/public.decorator';
import { AppException } from '../../core/errors/app.exception';
import { setAuthCookies } from '../../core/http/set-auth-cookies';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import { AuthService, type AuthenticatedUser } from './auth.service';
import { LoginDto, LoginSchema } from './dto/login.dto';
import { RegisterDto, RegisterSchema } from './dto/register.dto';
import { LoginThrottlerGuard } from './login-throttler.guard';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from './token.types';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  async register(
    @Body(new ZodValidationPipe(RegisterSchema)) dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: AuthenticatedUser }> {
    const result = await this.auth.register(dto);
    setAuthCookies(res, result.accessToken, result.refreshToken);
    return { user: result.user };
  }

  @Public()
  @UseGuards(LoginThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  async login(
    @Body(new ZodValidationPipe(LoginSchema)) dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: AuthenticatedUser }> {
    const result = await this.auth.login(dto);
    setAuthCookies(res, result.accessToken, result.refreshToken);
    return { user: result.user };
  }

  @Public()
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: AuthenticatedUser }> {
    const refreshToken = (req.cookies as Record<string, string> | undefined)?.[
      REFRESH_TOKEN_COOKIE
    ];
    if (!refreshToken) {
      throw new AppException(
        'UNAUTHORIZED',
        'Refresh token bulunamadi.',
        HttpStatus.UNAUTHORIZED,
      );
    }
    const result = await this.auth.refresh(refreshToken);
    setAuthCookies(res, result.accessToken, result.refreshToken);
    return { user: result.user };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response): { ok: true } {
    res.clearCookie(ACCESS_TOKEN_COOKIE);
    res.clearCookie(REFRESH_TOKEN_COOKIE);
    return { ok: true };
  }

  @Get('me')
  async me(@CurrentUser() user: RequestUser): Promise<AuthenticatedUser> {
    return this.auth.me(user.id);
  }
}
