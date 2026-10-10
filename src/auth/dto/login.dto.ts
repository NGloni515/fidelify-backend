import { IsEmail, IsString, Length } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Escribe un correo válido' })
  email: string;

  @IsString({ message: 'Escribe tu contraseña' })
  @Length(1, 200, { message: 'Escribe tu contraseña' })
  password: string;
}
