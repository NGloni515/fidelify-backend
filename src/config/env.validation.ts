import { plainToInstance } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

class EnvironmentVariables {
  @IsString()
  DATABASE_URL: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(65535)
  PORT?: number;

  // Orígenes permitidos separados por coma (backoffice y web pública).
  @IsOptional()
  @IsString()
  CORS_ORIGINS?: string;

  // URL pública de la web (para armar links de inscripción).
  @IsOptional()
  @IsString()
  PUBLIC_WEB_URL?: string;

  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET: string;

  @IsString()
  @MinLength(32)
  JWT_REFRESH_SECRET: string;

  @IsOptional()
  @IsInt()
  @Min(60)
  JWT_ACCESS_TTL_SECONDS?: number;

  @IsOptional()
  @IsInt()
  @Min(60)
  JWT_REFRESH_TTL_SECONDS?: number;

  // Public HTTPS URL of this API. Apple Wallet calls it to refresh the cards.
  @IsOptional()
  @IsString()
  PUBLIC_API_URL?: string;

  @IsOptional()
  @IsString()
  GOOGLE_WALLET_ISSUER_ID?: string;

  @IsOptional()
  @IsString()
  GOOGLE_WALLET_SERVICE_ACCOUNT?: string;

  @IsOptional()
  @IsString()
  APPLE_PASS_TYPE_ID?: string;

  @IsOptional()
  @IsString()
  APPLE_TEAM_ID?: string;

  @IsOptional()
  @IsString()
  APPLE_PASS_CERT?: string;

  @IsOptional()
  @IsString()
  APPLE_PASS_KEY?: string;

  @IsOptional()
  @IsString()
  APPLE_PASS_KEY_PASSPHRASE?: string;

  @IsOptional()
  @IsString()
  APPLE_WWDR_CERT?: string;
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(`Variables de entorno inválidas:\n${errors.toString()}`);
  }
  return validated;
}
