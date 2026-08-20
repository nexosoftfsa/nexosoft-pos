import { Body, Controller, Post, UseGuards, Request } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegistroDto } from './dto/registro.dto';
import { LoginDto } from './dto/login.dto';
import { LoginCredencialDto } from './dto/login-credencial.dto';
import { RefreshDto } from './dto/refresh.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RegistroGuard } from './registro.guard';

// Límite más estricto que el global (ThrottlerModule en app.module.ts) para
// los endpoints de login: 5 intentos por minuto por IP (Fase 15.B,
// prerrequisito antes de exponer el login a internet -- ver ADR-0052).
// Complementa el lockout por cuenta (LoginLockoutService, dentro de
// AuthService.login) que actúa aunque el atacante rote de IP.
const LIMITE_LOGIN = { default: { limit: 5, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @UseGuards(RegistroGuard)
  @Post('register')
  registrar(@Body() dto: RegistroDto) {
    return this.authService.registrar(dto);
  }

  @Throttle(LIMITE_LOGIN)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  // Login alternativo por credencial física (escaneo de barcode). Público,
  // igual que /auth/login — es un mecanismo de login, no un endpoint protegido.
  @Throttle(LIMITE_LOGIN)
  @Post('login-credencial')
  loginConCredencial(@Body() dto: LoginCredencialDto) {
    return this.authService.loginConCredencial(dto.credencial);
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(@Request() req: { user: { id: string } }) {
    // Invalida todos los refresh tokens del usuario
    return { ok: true, usuarioId: req.user.id };
  }
}
