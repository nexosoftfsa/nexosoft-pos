import { Module } from '@nestjs/common';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RegistroGuard } from './registro.guard';
import { LoginLockoutService } from './login-lockout.service';
import { RevisionClavesService } from './revision-claves.service';
import { CredencialesModule } from '../credenciales/credenciales.module';

@Module({
  imports: [
    PassportModule,
    CredencialesModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: (config.get<string>('JWT_ACCESS_EXPIRY') ??
            '15m') as NonNullable<JwtSignOptions['expiresIn']>,
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
    RegistroGuard,
    LoginLockoutService,
    RevisionClavesService,
  ],
  controllers: [AuthController],
  // Lo usa el módulo de acceso remoto para avisar antes de publicar el panel.
  exports: [RevisionClavesService],
})
export class AuthModule {}
