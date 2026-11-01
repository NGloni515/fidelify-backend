import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { NotificationAudience } from '../../generated/prisma/enums.js';
import { MAX_MESSAGE_LENGTH } from '../notification-rules.js';

export class SendNotificationDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'Escribe el mensaje' })
  @IsNotEmpty({ message: 'Escribe el mensaje' })
  @MaxLength(MAX_MESSAGE_LENGTH, {
    message: `El mensaje no puede pasar de ${MAX_MESSAGE_LENGTH} caracteres`,
  })
  message: string;

  @IsIn(Object.values(NotificationAudience), {
    message: 'Elige a quién le llega el mensaje',
  })
  audience: NotificationAudience;
}
