import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { AppConfigService } from '../config/config.service';
import { ProductInstanceStatus } from '../stock/enums';
import { ProductInstance } from '../stock/product-instance.entity';
import { StockService } from '../stock/stock.service';
import { Customer } from '../users/customer.entity';
import { ConfirmOrderReturnDto } from './dto/confirm-order-return.dto';
import { ListOrderCancellationsQueryDto } from './dto/list-order-cancellations-query.dto';
import {
  OrderCancellationResponseDto,
  PaginatedOrderCancellationsDto,
} from './dto/order-cancellation-response.dto';
import {
  OrderCancellationActor,
  OrderCancellationStatus,
  OrderStatus,
} from './enums';
import { OrderCancellationItem } from './order-cancellation-item.entity';
import { OrderCancellation } from './order-cancellation.entity';
import { OrderItem } from './order-item.entity';
import { Order } from './order.entity';

const CUSTOMER_CANCELLABLE_STATUSES = new Set([
  OrderStatus.PENDING,
  OrderStatus.PAID,
]);

const STAFF_BLOCKED_STATUSES = new Set([
  OrderStatus.DELIVERED,
  OrderStatus.CANCELLED,
  OrderStatus.REFUNDED,
]);

const CANCELLATION_RELATIONS = ['items'] as const;

@Injectable()
export class OrderCancellationsService {
  constructor(
    @InjectRepository(OrderCancellation)
    private readonly cancellationRepository: Repository<OrderCancellation>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    private readonly stockService: StockService,
    private readonly config: AppConfigService,
    private readonly dataSource: DataSource,
  ) {}

  async requestByCustomer(
    userId: string,
    orderId: string,
    reason?: string,
  ): Promise<OrderCancellationResponseDto> {
    const customer = await this.requireCustomer(userId);
    const order = await this.loadOrderForCancel(orderId);
    if (order.customerId !== customer.id) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }
    if (!CUSTOMER_CANCELLABLE_STATUSES.has(order.status)) {
      throw new BadRequestException(
        `Customers can only cancel PENDING or PAID orders (current: ${order.status})`,
      );
    }
    return this.createCancellation(
      order,
      userId,
      OrderCancellationActor.CUSTOMER,
      reason,
    );
  }

  async requestByStaff(
    userId: string,
    orderId: string,
    reason?: string,
  ): Promise<OrderCancellationResponseDto> {
    const order = await this.loadOrderForCancel(orderId);
    if (STAFF_BLOCKED_STATUSES.has(order.status)) {
      throw new BadRequestException(
        `Order cannot be cancelled (status: ${order.status})`,
      );
    }
    return this.createCancellation(
      order,
      userId,
      OrderCancellationActor.STAFF,
      reason,
    );
  }

  async confirmReturn(
    staffUserId: string,
    cancellationId: string,
    dto: ConfirmOrderReturnDto,
  ): Promise<OrderCancellationResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const cancellation = await manager.findOne(OrderCancellation, {
        where: { id: cancellationId },
        relations: ['items'],
        ...this.pessimisticWriteLock(manager),
      });
      if (!cancellation) {
        throw new NotFoundException(
          `Order cancellation ${cancellationId} not found`,
        );
      }
      if (cancellation.status !== OrderCancellationStatus.AWAITING_RETURN) {
        throw new BadRequestException(
          `Return can only be confirmed from AWAITING_RETURN (current: ${cancellation.status})`,
        );
      }

      this.assertReturnQuantities(cancellation.items, dto);

      const submitted = new Map(
        dto.items.map((item) => [item.orderItemId, item]),
      );
      for (const line of cancellation.items) {
        const submittedLine = submitted.get(line.orderItemId)!;
        await this.stockService.restockReturnedInstances(manager, {
          orderItemId: line.orderItemId,
          goodQuantity: submittedLine.goodQuantity,
          damagedQuantity: submittedLine.damagedQuantity,
          note: dto.note,
        });
        line.goodQuantity = submittedLine.goodQuantity;
        line.damagedQuantity = submittedLine.damagedQuantity;
      }
      await manager.save(OrderCancellationItem, cancellation.items);

      cancellation.status = OrderCancellationStatus.RESTOCKED;
      cancellation.restockConfirmedByUserId = staffUserId;
      cancellation.restockConfirmedAt = new Date();
      cancellation.nextRunAt = this.stepDelayFromNow();
      cancellation.lastError = null;
      await manager.save(OrderCancellation, cancellation);

      return this.toDto(cancellation);
    });
  }

  async list(
    query: ListOrderCancellationsQueryDto,
  ): Promise<PaginatedOrderCancellationsDto> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.cancellationRepository
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.items', 'items')
      .orderBy('c.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (query.status) {
      qb.andWhere('c.status = :status', { status: query.status });
    }

    const [rows, total] = await qb.getManyAndCount();
    return {
      items: rows.map((row) => this.toDto(row)),
      total,
      page,
      limit,
    };
  }

  async getById(id: string): Promise<OrderCancellationResponseDto> {
    const cancellation = await this.cancellationRepository.findOne({
      where: { id },
      relations: [...CANCELLATION_RELATIONS],
    });
    if (!cancellation) {
      throw new NotFoundException(`Order cancellation ${id} not found`);
    }
    return this.toDto(cancellation);
  }

  toDto(cancellation: OrderCancellation): OrderCancellationResponseDto {
    return {
      id: cancellation.id,
      orderId: cancellation.orderId,
      status: cancellation.status,
      requestedByUserId: cancellation.requestedByUserId,
      requestedByActor: cancellation.requestedByActor,
      reason: cancellation.reason,
      orderStatusAtRequest: cancellation.orderStatusAtRequest,
      refundAmountVnd: String(cancellation.refundAmountVnd),
      refundTransactionId: cancellation.refundTransactionId,
      refundedAt: cancellation.refundedAt,
      requiresStockReturn: cancellation.requiresStockReturn,
      restockConfirmedByUserId: cancellation.restockConfirmedByUserId,
      restockConfirmedAt: cancellation.restockConfirmedAt,
      nextRunAt: cancellation.nextRunAt,
      attempts: cancellation.attempts,
      lastError: cancellation.lastError,
      items: (cancellation.items ?? []).map((item) => ({
        id: item.id,
        orderItemId: item.orderItemId,
        expectedQuantity: item.expectedQuantity,
        goodQuantity: item.goodQuantity,
        damagedQuantity: item.damagedQuantity,
      })),
      createdAt: cancellation.createdAt,
      updatedAt: cancellation.updatedAt,
    };
  }

  stepDelayFromNow(): Date {
    const delaySec = this.config.orderCancellationConfig.stepDelaySec;
    return new Date(Date.now() + delaySec * 1000);
  }

  private async createCancellation(
    order: Order,
    userId: string,
    actor: OrderCancellationActor,
    reason?: string,
  ): Promise<OrderCancellationResponseDto> {
    const refundAmountVnd = this.computeRefundAmount(order);

    try {
      const saved = await this.dataSource.transaction(async (manager) => {
        const soldCounts = await this.countSoldInstancesByOrderItem(
          manager,
          order.items,
        );
        const requiresStockReturn = [...soldCounts.values()].some(
          (count) => count > 0,
        );

        const cancellation = manager.create(OrderCancellation, {
          orderId: order.id,
          status: OrderCancellationStatus.REQUESTED,
          requestedByUserId: userId,
          requestedByActor: actor,
          reason: reason?.trim() || null,
          orderStatusAtRequest: order.status,
          refundAmountVnd: String(refundAmountVnd),
          refundTransactionId: null,
          refundedAt: null,
          requiresStockReturn,
          restockConfirmedByUserId: null,
          restockConfirmedAt: null,
          nextRunAt: new Date(),
          attempts: 0,
          lastError: null,
        });
        const persisted = await manager.save(OrderCancellation, cancellation);

        const lines = order.items.map((item) =>
          manager.create(OrderCancellationItem, {
            orderCancellationId: persisted.id,
            orderItemId: item.id,
            expectedQuantity: soldCounts.get(item.id) ?? 0,
            goodQuantity: null,
            damagedQuantity: null,
          }),
        );
        persisted.items = await manager.save(OrderCancellationItem, lines);
        return persisted;
      });
      return this.toDto(saved);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          `Order ${order.id} already has a cancellation`,
        );
      }
      throw error;
    }
  }

  private computeRefundAmount(order: Order): number {
    if (order.status === OrderStatus.PENDING) {
      return 0;
    }
    if (order.status === OrderStatus.PAID) {
      return order.totalVnd;
    }
    if (
      order.status === OrderStatus.PROCESSING ||
      order.status === OrderStatus.SHIPPED
    ) {
      return Math.max(0, order.subtotalVnd - order.discountVnd);
    }
    throw new BadRequestException(
      `Cannot compute refund for order status ${order.status}`,
    );
  }

  private async countSoldInstancesByOrderItem(
    manager: EntityManager,
    items: OrderItem[],
  ): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    for (const item of items) {
      const count = await manager.count(ProductInstance, {
        where: {
          orderItemId: item.id,
          status: ProductInstanceStatus.SOLD,
        },
      });
      counts.set(item.id, count);
    }
    return counts;
  }

  private assertReturnQuantities(
    lines: OrderCancellationItem[],
    dto: ConfirmOrderReturnDto,
  ): void {
    const submitted = new Map(
      dto.items.map((item) => [item.orderItemId, item]),
    );
    if (submitted.size !== dto.items.length) {
      throw new BadRequestException(
        'Each orderItemId may appear only once in the confirm-return body',
      );
    }
    if (submitted.size !== lines.length) {
      throw new BadRequestException(
        `confirm-return must include every cancellation item exactly once ` +
          `(expected ${lines.length} items, got ${submitted.size})`,
      );
    }
    for (const line of lines) {
      const submittedLine = submitted.get(line.orderItemId);
      if (!submittedLine) {
        throw new BadRequestException(
          `Missing quantities for order item ${line.orderItemId}`,
        );
      }
      if (
        submittedLine.goodQuantity + submittedLine.damagedQuantity !==
        line.expectedQuantity
      ) {
        throw new BadRequestException(
          `goodQuantity + damagedQuantity must equal expectedQuantity ` +
            `(${line.expectedQuantity}) for order item ${line.orderItemId}`,
        );
      }
    }
  }

  private async loadOrderForCancel(orderId: string): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['items'],
    });
    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }
    return order;
  }

  private async requireCustomer(userId: string): Promise<Customer> {
    const customer = await this.customerRepository.findOne({
      where: { userId },
    });
    if (!customer) {
      throw new ForbiddenException('No customer profile for this user');
    }
    return customer;
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }
    const driverError = error.driverError as { code?: string } | undefined;
    return (
      driverError?.code === '23505' ||
      String(error.message).toLowerCase().includes('unique')
    );
  }

  private pessimisticWriteLock(manager: EntityManager) {
    const driverType =
      manager.connection?.driver?.options?.type ??
      this.cancellationRepository.manager.connection?.driver?.options?.type;
    if (driverType === 'postgres') {
      return { lock: { mode: 'pessimistic_write' as const } };
    }
    return {};
  }
}
