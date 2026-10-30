import { IsString, Length } from 'class-validator';
import { IsNewPassword } from './is-new-password.js';

export class ChangePasswordDto {
  @IsString({ message: 'Escribe tu contraseña actual' })
  @Length(1, 200, { message: 'Escribe tu contraseña actual' })
  currentPassword: string;

  @IsNewPassword()
  newPassword: string;
}
