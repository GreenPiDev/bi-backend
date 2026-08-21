import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InvitationsController } from './invitations.controller';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AuthModule],
  controllers: [UsersController, InvitationsController],
  providers: [UsersService],
})
export class UsersModule {}
