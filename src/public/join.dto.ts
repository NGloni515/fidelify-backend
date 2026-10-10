import {
  Equals,
  IsBoolean,
  IsEmail,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class JoinDto {
  @IsString()
  @Length(2, 80)
  name: string;

  // Celular ecuatoriano o internacional, solo dígitos y un + opcional.
  @Matches(/^\+?\d{9,15}$/, {
    message: 'phone debe tener entre 9 y 15 dígitos',
  })
  phone: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  birthDate?: string;

  // El cliente debe aceptar el tratamiento de sus datos (LOPDP).
  @IsBoolean()
  @Equals(true, {
    message: 'Debes aceptar el uso de tus datos para inscribirte',
  })
  consent: boolean;
}
