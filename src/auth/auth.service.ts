import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service.js';
import { AttemptLimiter } from './attempt-limiter.js';
import { hashPassword, verifyPassword } from './password.js';
import type { StaffSession } from './staff-session.js';

const DEFAULT_ACCESS_TTL_SECONDS = 15 * 60;
const DEFAULT_REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;
const MAX_PASSWORD_ATTEMPTS = 5;
const PASSWORD_WINDOW_MS = 15 * 60 * 1000;

type TokenType = 'access' | 'refresh';

export interface IssuedSession {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresIn: number;
  user: StaffSession;
}

@Injectable()
export class AuthService {
  private readonly accessTtl: number;
  private readonly refreshTtl: number;
  // Verified when the email is unknown, so both failures cost the same time.
  private readonly decoyHash = hashPassword(crypto.randomUUID());
  // Keyed by email, not IP: the panel reaches this API through its proxy, so
  // every login made from the panel arrives from the same few addresses.
  // In memory, so a restart forgets the counts.
  private readonly passwordAttempts = new AttemptLimiter(
    MAX_PASSWORD_ATTEMPTS,
    PASSWORD_WINDOW_MS,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {
    this.accessTtl = Number(
      config.get('JWT_ACCESS_TTL_SECONDS') ?? DEFAULT_ACCESS_TTL_SECONDS,
    );
    this.refreshTtl = Number(
      config.get('JWT_REFRESH_TTL_SECONDS') ?? DEFAULT_REFRESH_TTL_SECONDS,
    );
  }

  async login(email: string, password: string): Promise<IssuedSession> {
    const key = email.trim().toLowerCase();
    this.takePasswordAttempt(key);
    const staff = await this.prisma.staffUser.findUnique({
      where: { email: key },
      select: { id: true, passwordHash: true },
    });
    const matches = await verifyPassword(
      password,
      staff?.passwordHash ?? (await this.decoyHash),
    );
    const user = staff && matches ? await this.findActiveStaff(staff.id) : null;
    if (!user)
      throw new UnauthorizedException('Correo o contraseña incorrectos');
    this.passwordAttempts.clear(key);
    return this.issue(user);
  }

  async changePassword(
    staff: StaffSession,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    this.takePasswordAttempt(staff.email);
    const { passwordHash } = await this.prisma.staffUser.findUniqueOrThrow({
      where: { id: staff.id },
      select: { passwordHash: true },
    });
    if (!(await verifyPassword(currentPassword, passwordHash)))
      throw new BadRequestException('Tu contraseña actual no es correcta');
    this.passwordAttempts.clear(staff.email);
    await this.prisma.staffUser.update({
      where: { id: staff.id },
      data: { passwordHash: await hashPassword(newPassword) },
    });
  }

  async refresh(refreshToken: string | undefined): Promise<IssuedSession> {
    if (!refreshToken) throw this.expired();
    return this.issue(await this.resolve(refreshToken, 'refresh'));
  }

  resolveAccessToken(token: string): Promise<StaffSession> {
    return this.resolve(token, 'access');
  }

  private async resolve(token: string, type: TokenType): Promise<StaffSession> {
    let staffId: string;
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; typ: string }>(
        token,
        { secret: this.secret(type) },
      );
      if (payload.typ !== type) throw new Error('wrong token type');
      staffId = payload.sub;
    } catch {
      throw this.expired();
    }
    const user = await this.findActiveStaff(staffId);
    if (!user) throw this.expired();
    return user;
  }

  private takePasswordAttempt(key: string) {
    const wait = this.passwordAttempts.take(key);
    if (wait === 0) return;
    const minutes = Math.ceil(wait / 60);
    throw new HttpException(
      `Demasiados intentos. Vuelve a intentar en ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}.`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private async issue(user: StaffSession): Promise<IssuedSession> {
    const [accessToken, refreshToken] = await Promise.all([
      this.sign(user.id, 'access', this.accessTtl),
      this.sign(user.id, 'refresh', this.refreshTtl),
    ]);
    return {
      accessToken,
      expiresIn: this.accessTtl,
      refreshToken,
      refreshExpiresIn: this.refreshTtl,
      user,
    };
  }

  private async findActiveStaff(id: string): Promise<StaffSession | null> {
    return this.prisma.staffUser.findFirst({
      where: { id, active: true, business: { active: true } },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        branchId: true,
        business: { select: { id: true, name: true, slug: true } },
      },
    });
  }

  private sign(staffId: string, type: TokenType, expiresIn: number) {
    return this.jwt.signAsync(
      { sub: staffId, typ: type },
      { secret: this.secret(type), expiresIn },
    );
  }

  private secret(type: TokenType): string {
    return this.config.getOrThrow<string>(
      type === 'access' ? 'JWT_ACCESS_SECRET' : 'JWT_REFRESH_SECRET',
    );
  }

  private expired() {
    return new UnauthorizedException('Tu sesión venció. Vuelve a entrar.');
  }
}
