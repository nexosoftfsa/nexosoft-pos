import { IsString, IsNotEmpty, IsNumberString } from 'class-validator';

/** Un componente de un combo: producto que entra y en qué cantidad. */
export class ComboComponenteDto {
  @IsString()
  @IsNotEmpty()
  componenteId!: string;

  @IsNumberString()
  cantidad!: string;
}
