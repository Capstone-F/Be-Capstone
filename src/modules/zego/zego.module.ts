import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '../../config/config.module';
import { ConsultationRequest } from '../../consultations/consultation-request.entity';
import { User } from '../../users/user.entity';
import { ZegoTokenService } from './zego-token.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ConsultationRequest, User]),
    ConfigModule,
  ],
  providers: [ZegoTokenService],
  exports: [ZegoTokenService],
})
export class ZegoModule {}
