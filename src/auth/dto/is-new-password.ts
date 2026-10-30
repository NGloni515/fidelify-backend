import { applyDecorators } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';

const TOO_SHORT = 'La contraseña debe tener al menos 8 caracteres';

export function IsNewPassword() {
  return applyDecorators(
    IsString({ message: TOO_SHORT }),
    MinLength(8, { message: TOO_SHORT }),
    MaxLength(200, {
      message: 'La contraseña no puede tener más de 200 caracteres',
    }),
  );
}
