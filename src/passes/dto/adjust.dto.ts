import { Transform } from 'class-transformer';
import { IsInt, IsString, Length, Max, Min, NotEquals } from 'class-validator';

export class AdjustDto {
  @IsInt({ message: 'La cantidad de sellos debe ser un número entero' })
  @NotEquals(0, { message: 'Suma o quita al menos 1 sello' })
  @Min(-20, { message: 'No puedes quitar más de 20 sellos a la vez' })
  @Max(20, { message: 'No puedes sumar más de 20 sellos a la vez' })
  stamps: number;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'Escribe el motivo del ajuste' })
  @Length(3, 200, {
    message: 'El motivo del ajuste debe tener entre 3 y 200 caracteres',
  })
  note: string;
}
