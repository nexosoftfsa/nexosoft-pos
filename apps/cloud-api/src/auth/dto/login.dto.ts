import { IsString, IsNotEmpty } from 'class-validator';

export class LoginDto {
  // Nombre de usuario (ver comentario en RegistroDto: no exige formato email).
  @IsString()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}
