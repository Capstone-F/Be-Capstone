import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { ProductVariant } from '../products/product-variant.entity';
import { User } from '../users/user.entity';
import { AdminDemoController } from './admin-demo.controller';
import { DemoSeedService } from './demo-seed.service';

@Module({
  imports: [TypeOrmModule.forFeature([ProductVariant, User]), AuthModule],
  controllers: [AdminDemoController],
  providers: [DemoSeedService],
})
export class DemoModule {}
