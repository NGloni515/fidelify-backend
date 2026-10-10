import {
  Controller,
  Get,
  NotImplementedException,
  Param,
} from '@nestjs/common';

/**
 * Generación de pases para Apple Wallet y Google Wallet.
 *
 * Pendiente (siguiente etapa):
 * - Apple: firmar el .pkpass con passkit-generator usando el certificado del
 *   Pass Type ID (requiere cuenta de Apple Developer) e implementar el web
 *   service de Apple (/v1/devices/..., /v1/passes/...) para actualizaciones.
 * - Google: crear la clase y el objeto con la API de Google Wallet y devolver
 *   el link "Guardar en Google Wallet" (JWT firmado con la cuenta de servicio).
 */
@Controller('wallet')
export class WalletController {
  @Get('apple/:serial')
  applePass(@Param('serial') _serial: string) {
    throw new NotImplementedException(
      'Apple Wallet todavía no está configurado',
    );
  }

  @Get('google/:serial')
  googlePass(@Param('serial') _serial: string) {
    throw new NotImplementedException(
      'Google Wallet todavía no está configurado',
    );
  }
}
