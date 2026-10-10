import {
  Body,
  Controller,
  Cookies,
  Get,
  HttpCode,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import { AuthService, type IssuedSession } from './auth.service.js';
import { CurrentStaff } from './current-staff.decorator.js';
import { LoginDto } from './dto/login.dto.js';
import { StaffAuthGuard } from './staff-auth.guard.js';
import type { StaffSession } from './staff-session.js';

const REFRESH_COOKIE = 'fidelify_refresh';
// Scoped to the auth routes so the refresh token is not sent with every call.
const REFRESH_COOKIE_PATH = '/api/auth';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly adapterHost: HttpAdapterHost,
    private readonly config: ConfigService,
  ) {}

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: unknown) {
    return this.open(res, await this.auth.login(dto.email, dto.password));
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Cookies(REFRESH_COOKIE) refreshToken: string | undefined,
    @Res({ passthrough: true }) res: unknown,
  ) {
    return this.open(res, await this.auth.refresh(refreshToken));
  }

  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: unknown) {
    this.adapterHost.httpAdapter.clearCookie(
      res,
      REFRESH_COOKIE,
      this.cookieOptions(),
    );
  }

  @Get('me')
  @UseGuards(StaffAuthGuard)
  me(@CurrentStaff() staff: StaffSession) {
    return staff;
  }

  private open(res: unknown, session: IssuedSession) {
    this.adapterHost.httpAdapter.setCookie(
      res,
      REFRESH_COOKIE,
      session.refreshToken,
      { ...this.cookieOptions(), maxAge: session.refreshExpiresIn },
    );
    return {
      accessToken: session.accessToken,
      expiresIn: session.expiresIn,
      user: session.user,
    };
  }

  private cookieOptions() {
    return {
      httpOnly: true,
      secure: this.config.get('NODE_ENV') === 'production',
      sameSite: 'lax' as const,
      path: REFRESH_COOKIE_PATH,
    };
  }
}
