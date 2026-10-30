import { IsBoolean, IsOptional } from 'class-validator';
import { IsNewPassword } from '../../auth/dto/is-new-password.js';

export class UpdateStaffDto {
  @IsOptional()
  @IsBoolean({ message: 'active debe ser verdadero o falso' })
  active?: boolean;

  @IsOptional()
  @IsNewPassword()
  password?: string;
}
