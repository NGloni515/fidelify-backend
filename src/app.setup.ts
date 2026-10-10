import { INestApplication, ValidationPipe } from '@nestjs/common';

const DEFAULT_CORS_ORIGINS = 'http://localhost:5173,http://localhost:5174';

// Shared by main.ts and the e2e tests so both run the same prefix and pipes.
export function configureApp(app: INestApplication) {
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const origins = (process.env.CORS_ORIGINS ?? DEFAULT_CORS_ORIGINS)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins, credentials: true });
}
