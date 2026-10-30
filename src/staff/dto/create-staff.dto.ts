import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length } from 'class-validator';
import { IsNewPassword } from '../../auth/dto/is-new-password.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateStaffDto {
  @Transform(trim)
  @IsString({ message: 'Escribe el nombre' })
  @Length(2, 80, { message: 'El nombre debe tener entre 2 y 80 caracteres' })
  name: string;

  @Transform(trim)
  @IsEmail({}, { message: 'Escribe un correo válido' })
  email: string;

  @IsNewPassword()
  password: string;
}
