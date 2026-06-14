import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Clinic } from './clinic.entity';

@Injectable()
export class ClinicsService {
  constructor(
    @InjectRepository(Clinic)
    private readonly clinicRepository: Repository<Clinic>,
  ) {}

  async findById(id: string): Promise<Clinic | null> {
    return this.clinicRepository.findOneBy({ id });
  }

  async requireById(id: string): Promise<Clinic> {
    const clinic = await this.findById(id);
    if (!clinic) {
      throw new NotFoundException(`Clinic ${id} not found`);
    }
    return clinic;
  }
}
