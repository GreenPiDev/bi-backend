import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TenantsModule } from '../tenants/tenants.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordResetService } from './password-reset.service';
import { TokenService } from './token.service';

@Module({
  imports: [JwtModule.register({}), TenantsModule],
  controllers: [AuthController],
  providers: [AuthService, TokenService, PasswordResetService],
  exports: [TokenService, AuthService],
})
export class AuthModule {}
