import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('health')
  @HttpCode(HttpStatus.OK)
  async getHealth() {
    return this.healthService.getHealthStatus();
  }
}
