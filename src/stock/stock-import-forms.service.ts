import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductVariant } from '../products/product-variant.entity';
import {
  CreateStockImportFormDto,
  UpdateStockImportFormDto,
} from './dto/create-stock-import-form.dto';
import { ListStockImportFormsQueryDto } from './dto/list-stock-import-forms-query.dto';
import {
  PaginatedStockImportFormsDto,
  StockImportFormResponseDto,
} from './dto/stock-import-form-response.dto';
import { StockImportFormStatus } from './enums';
import { StockImportForm } from './stock-import-form.entity';
import { StockService } from './stock.service';

const EDITABLE_STATUSES = new Set([
  StockImportFormStatus.DRAFT,
  StockImportFormStatus.SUBMITTED,
]);

const CANCELABLE_STATUSES = new Set([
  StockImportFormStatus.DRAFT,
  StockImportFormStatus.SUBMITTED,
]);

@Injectable()
export class StockImportFormsService {
  constructor(
    @InjectRepository(StockImportForm)
    private readonly formRepository: Repository<StockImportForm>,
    @InjectRepository(ProductVariant)
    private readonly variantRepository: Repository<ProductVariant>,
    private readonly stockService: StockService,
  ) {}

  async create(
    userId: string,
    dto: CreateStockImportFormDto,
  ): Promise<StockImportFormResponseDto> {
    await this.requireVariant(dto.productVariantId);

    const form = this.formRepository.create({
      productVariantId: dto.productVariantId,
      quantity: dto.quantity,
      manufacturingDate: this.toDateOnly(dto.manufacturingDate),
      batchCode: dto.batchCode ?? null,
      status: StockImportFormStatus.DRAFT,
      createdByUserId: userId,
      submittedByUserId: null,
      submittedAt: null,
      confirmedByUserId: null,
      confirmedAt: null,
      cancelledByUserId: null,
      cancelledAt: null,
      rejectedByUserId: null,
      rejectedAt: null,
      rejectionReason: null,
      stockBatchId: null,
    });

    const saved = await this.formRepository.save(form);
    return this.toResponse(saved);
  }

  async list(
    query: ListStockImportFormsQueryDto,
  ): Promise<PaginatedStockImportFormsDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.formRepository
      .createQueryBuilder('form')
      .orderBy('form.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.status) {
      qb.andWhere('form.status = :status', { status: query.status });
    }
    if (query.productVariantId) {
      qb.andWhere('form.productVariantId = :productVariantId', {
        productVariantId: query.productVariantId,
      });
    }
    if (query.createdByUserId) {
      qb.andWhere('form.createdByUserId = :createdByUserId', {
        createdByUserId: query.createdByUserId,
      });
    }

    const [items, total] = await qb.getManyAndCount();
    return {
      items: items.map((form) => this.toResponse(form)),
      total,
      page,
      limit,
    };
  }

  async getById(id: string): Promise<StockImportFormResponseDto> {
    const form = await this.requireForm(id);
    return this.toResponse(form);
  }

  async update(
    id: string,
    dto: UpdateStockImportFormDto,
  ): Promise<StockImportFormResponseDto> {
    const hasField =
      dto.productVariantId !== undefined ||
      dto.quantity !== undefined ||
      dto.manufacturingDate !== undefined ||
      dto.batchCode !== undefined;
    if (!hasField) {
      throw new BadRequestException('Cần ít nhất một trường để cập nhật');
    }

    const form = await this.requireForm(id);
    if (!EDITABLE_STATUSES.has(form.status)) {
      throw new BadRequestException(
        `Phiếu nhập kho chỉ có thể được cập nhật từ trạng thái DRAFT hoặc SUBMITTED (hiện tại: ${form.status})`,
      );
    }

    if (dto.productVariantId !== undefined) {
      await this.requireVariant(dto.productVariantId);
      form.productVariantId = dto.productVariantId;
    }
    if (dto.quantity !== undefined) {
      form.quantity = dto.quantity;
    }
    if (dto.manufacturingDate !== undefined) {
      form.manufacturingDate = this.toDateOnly(dto.manufacturingDate);
    }
    if (dto.batchCode !== undefined) {
      form.batchCode = dto.batchCode;
    }

    const saved = await this.formRepository.save(form);
    return this.toResponse(saved);
  }

  async submit(
    userId: string,
    id: string,
  ): Promise<StockImportFormResponseDto> {
    const form = await this.requireForm(id);
    if (form.status !== StockImportFormStatus.DRAFT) {
      throw new BadRequestException(
        `Phiếu nhập kho chỉ có thể được gửi từ trạng thái DRAFT (hiện tại: ${form.status})`,
      );
    }

    form.status = StockImportFormStatus.SUBMITTED;
    form.submittedByUserId = userId;
    form.submittedAt = new Date();

    const saved = await this.formRepository.save(form);
    return this.toResponse(saved);
  }

  async confirm(
    userId: string,
    id: string,
  ): Promise<StockImportFormResponseDto> {
    return this.formRepository.manager.transaction(async (manager) => {
      const form = await manager.findOne(StockImportForm, { where: { id } });
      if (!form) {
        throw new NotFoundException(`Không tìm thấy phiếu nhập kho ${id}`);
      }
      if (form.status !== StockImportFormStatus.SUBMITTED) {
        throw new BadRequestException(
          `Phiếu nhập kho chỉ có thể được xác nhận từ trạng thái SUBMITTED (hiện tại: ${form.status})`,
        );
      }

      const batch = await this.stockService.createBatchInTransaction(manager, {
        productVariantId: form.productVariantId,
        quantity: form.quantity,
        manufacturingDate: form.manufacturingDate,
        batchCode: form.batchCode ?? undefined,
      });

      form.status = StockImportFormStatus.CONFIRMED;
      form.confirmedByUserId = userId;
      form.confirmedAt = new Date();
      form.stockBatchId = batch.id;

      const saved = await manager.save(StockImportForm, form);
      return this.toResponse(saved);
    });
  }

  async cancel(
    userId: string,
    id: string,
  ): Promise<StockImportFormResponseDto> {
    const form = await this.requireForm(id);
    if (!CANCELABLE_STATUSES.has(form.status)) {
      throw new BadRequestException(
        `Phiếu nhập kho chỉ có thể được hủy từ trạng thái DRAFT hoặc SUBMITTED (hiện tại: ${form.status})`,
      );
    }

    form.status = StockImportFormStatus.CANCELLED;
    form.cancelledByUserId = userId;
    form.cancelledAt = new Date();

    const saved = await this.formRepository.save(form);
    return this.toResponse(saved);
  }

  async reject(
    userId: string,
    id: string,
    reason?: string,
  ): Promise<StockImportFormResponseDto> {
    const form = await this.requireForm(id);
    if (form.status !== StockImportFormStatus.SUBMITTED) {
      throw new BadRequestException(
        `Phiếu nhập kho chỉ có thể bị từ chối từ trạng thái SUBMITTED (hiện tại: ${form.status})`,
      );
    }

    form.status = StockImportFormStatus.REJECTED;
    form.rejectedByUserId = userId;
    form.rejectedAt = new Date();
    form.rejectionReason = reason ?? null;

    const saved = await this.formRepository.save(form);
    return this.toResponse(saved);
  }

  private async requireForm(id: string): Promise<StockImportForm> {
    const form = await this.formRepository.findOneBy({ id });
    if (!form) {
      throw new NotFoundException(`Không tìm thấy phiếu nhập kho ${id}`);
    }
    return form;
  }

  private async requireVariant(productVariantId: string): Promise<void> {
    const variant = await this.variantRepository.findOneBy({
      id: productVariantId,
    });
    if (!variant) {
      throw new NotFoundException(
        `Không tìm thấy phân loại sản phẩm ${productVariantId}`,
      );
    }
  }

  private toDateOnly(value: Date | string): Date {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException('manufacturingDate không hợp lệ');
    }
    return new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
    );
  }

  private toDateString(value: Date | string): string {
    if (typeof value === 'string') {
      return value.slice(0, 10);
    }
    return value.toISOString().slice(0, 10);
  }

  private toResponse(form: StockImportForm): StockImportFormResponseDto {
    return {
      id: form.id,
      productVariantId: form.productVariantId,
      quantity: form.quantity,
      manufacturingDate: this.toDateString(form.manufacturingDate),
      batchCode: form.batchCode,
      status: form.status,
      createdByUserId: form.createdByUserId,
      submittedByUserId: form.submittedByUserId,
      submittedAt: form.submittedAt,
      confirmedByUserId: form.confirmedByUserId,
      confirmedAt: form.confirmedAt,
      cancelledByUserId: form.cancelledByUserId,
      cancelledAt: form.cancelledAt,
      rejectedByUserId: form.rejectedByUserId,
      rejectedAt: form.rejectedAt,
      rejectionReason: form.rejectionReason,
      stockBatchId: form.stockBatchId,
      createdAt: form.createdAt,
      updatedAt: form.updatedAt,
    };
  }
}
