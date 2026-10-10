import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class StampDto {
  @IsOptional()
  @IsInt({ message: 'La cantidad de sellos debe ser un número entero' })
  @Min(1, { message: 'Da al menos 1 sello' })
  @Max(20, { message: 'No puedes dar más de 20 sellos a la vez' })
  count?: number;
}
