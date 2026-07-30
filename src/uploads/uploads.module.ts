import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ConfigModule } from '../config/config.module';
import { StorageService } from './storage.service';
import { UploadsController } from './uploads.controller';

@Module({
  imports: [ConfigModule, AuthModule],
  controllers: [UploadsController],
  providers: [StorageService],
  exports: [StorageService],
})
export class UploadsModule {}
