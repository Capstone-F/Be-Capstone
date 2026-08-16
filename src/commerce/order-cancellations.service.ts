import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { DeliveryService } from '../delivery/delivery.service';
import { ProductInstanceStatus } from '../stock/enums';
import { ProductInstance } from '../stock/product-instance.entity';
import { StockService } from '../stock/stock.service';
import { Customer } from '../users/customer.entity';
import { WalletService } from '../wallet/wallet.service';
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
  TransactionType,
} from './enums';
import { OrderCancellationItem } from './order-cancellation-item.entity';
import { OrderCancellation } from './order-cancellation.entity';
import { OrderItem } from './order-item.entity';
import { Order } from './order.entity';

// PROCESSING is included because GHN flips PAID -> PROCESSING the instant the
// shipping order is created, before the courier picks up the parcel. Excluding
// it would erase the customer's cancel window the moment they pay. SHIPPED (the
// parcel is picked up and in transit) stays staff-only.
const CUSTOMER_CANCELLABLE_STATUSES = new Set([
  OrderStatus.PENDING,
  OrderStatus.PAID,
  OrderStatus.PROCESSING,
]);

const STAFF_BLOCKED_STATUSES = new Set([
  OrderStatus.DELIVERED,
  OrderStatus.CANCELLED,
  OrderStatus.REFUNDED,
]);

const CANCELLATION_RELATIONS = ['items'] as const;

@Injectable()
export class OrderCancellationsService {
  private readonly logger = new Logger(OrderCancellationsService.name);

  constructor(
    @InjectRepository(OrderCancellation)
    private readonly cancellationRepository: Repository<OrderCancellation>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    private readonly stockService: StockService,
    private readonly walletService: WalletService,
    private readonly deliveryService: DeliveryService,
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
      throw new NotFoundException(`Không tìm thấy đơn hàng ${orderId}`);
    }
    if (!CUSTOMER_CANCELLABLE_STATUSES.has(order.status)) {
      throw new BadRequestException(
        `Khách hàng chỉ có thể hủy đơn hàng ở trạng thái PENDING, PAID hoặc PROCESSING (hiện tại: ${order.status})`,
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
        `Không thể hủy đơn hàng (trạng thái: ${order.status})`,
      );
    }
    return this.createCancellation(
      order,
      userId,
      OrderCancellationActor.STAFF,
      reason,
    );
  }

  /**
   * Auto-cancel when a delivery reaches RETURNED (GHN return / simulator force).
   * requestedByUserId is null; actor is SYSTEM.
   */
  async requestBySystem(
    orderId: string,
    reason?: string,
  ): Promise<OrderCancellationResponseDto> {
    const order = await this.loadOrderForCancel(orderId);
    if (STAFF_BLOCKED_STATUSES.has(order.status)) {
      throw new BadRequestException(
        `Không thể hủy đơn hàng (trạng thái: ${order.status})`,
      );
    }
    return this.createCancellation(
      order,
      null,
      OrderCancellationActor.SYSTEM,
      reason ?? 'Auto-cancelled after delivery returned',
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
          `Không tìm thấy yêu cầu hủy đơn hàng ${cancellationId}`,
        );
      }
      if (cancellation.status !== OrderCancellationStatus.AWAITING_RETURN) {
        throw new BadRequestException(
          `Chỉ có thể xác nhận trả hàng từ trạng thái AWAITING_RETURN (hiện tại: ${cancellation.status})`,
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

      // Goods are back — refund the wallet in the same transaction, then close out.
      if (
        BigInt(cancellation.refundAmountVnd) > 0n &&
        !cancellation.refundTransactionId
      ) {
        await this.refundInTransaction(manager, cancellation);
      }

      cancellation.status = OrderCancellationStatus.COMPLETED;
      cancellation.restockConfirmedByUserId = staffUserId;
      cancellation.restockConfirmedAt = new Date();
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
      throw new NotFoundException(`Không tìm thấy yêu cầu hủy đơn hàng ${id}`);
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

  /**
   * The whole cancellation is applied synchronously in one transaction — no
   * cron pipeline. Orders whose stock was already deducted land directly in
   * AWAITING_RETURN (order CANCELLED, instances in return transit); the wallet
   * refund only happens at confirm-return, once the goods are physically back.
   * Orders with nothing to return are refunded inline (when paid) and COMPLETED.
   */
  private async createCancellation(
    order: Order,
    userId: string | null,
    actor: OrderCancellationActor,
    reason?: string,
  ): Promise<OrderCancellationResponseDto> {
    const refundAmountVnd = this.computeRefundAmount(order);

    let saved: OrderCancellation;
    try {
      saved = await this.dataSource.transaction(async (manager) => {
        const soldCounts = await this.countSoldInstancesByOrderItem(
          manager,
          order.items,
        );
        const requiresStockReturn = [...soldCounts.values()].some(
          (count) => count > 0,
        );

        const cancellation = manager.create(OrderCancellation, {
          orderId: order.id,
          status: requiresStockReturn
            ? OrderCancellationStatus.AWAITING_RETURN
            : OrderCancellationStatus.COMPLETED,
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

        await manager.update(
          Order,
          { id: order.id },
          { status: OrderStatus.CANCELLED, cancelledAt: new Date() },
        );

        if (requiresStockReturn) {
          for (const item of order.items) {
            await this.stockService.markInstancesInReturnTransit(
              manager,
              item.id,
            );
          }
        } else if (refundAmountVnd > 0) {
          await this.refundInTransaction(manager, persisted);
        }

        return persisted;
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(`Đơn hàng ${order.id} đã có yêu cầu hủy`);
      }
      throw error;
    }

    await this.stopDeliverySafely(order.id);
    return this.toDto(saved);
  }

  /** Credit the customer wallet and flip the order to REFUNDED, all inside the caller's transaction. */
  private async refundInTransaction(
    manager: EntityManager,
    cancellation: OrderCancellation,
  ): Promise<void> {
    const order = await manager.findOne(Order, {
      where: { id: cancellation.orderId },
      relations: ['customer'],
    });
    if (!order?.customer?.userId) {
      throw new BadRequestException(
        `Không thể hoàn tiền cho đơn hàng ${cancellation.orderId}: thiếu tài khoản khách hàng`,
      );
    }

    const tx = await this.walletService.creditWithManager(manager, {
      type: TransactionType.REFUND,
      amountVnd: cancellation.refundAmountVnd,
      userId: order.customer.userId,
      orderId: order.id,
      note: `Refund for cancelled order ${order.id}`,
      externalRef: `order-cancellation:${cancellation.id}`,
    });

    cancellation.refundTransactionId = tx.id;
    cancellation.refundedAt = new Date();
    await manager.update(
      OrderCancellation,
      { id: cancellation.id },
      {
        refundTransactionId: cancellation.refundTransactionId,
        refundedAt: cancellation.refundedAt,
      },
    );
    await manager.update(
      Order,
      { id: order.id },
      { status: OrderStatus.REFUNDED },
    );
  }

  /** Delivery stop is best-effort — a GHN outage must not undo the cancellation. */
  private async stopDeliverySafely(orderId: string): Promise<void> {
    try {
      await this.deliveryService.stopDeliveryForCancelledOrder(orderId);
    } catch (error) {
      this.logger.error(
        `Failed to stop delivery for cancelled order ${orderId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );
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
      `Không thể tính số tiền hoàn cho trạng thái đơn hàng ${order.status}`,
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
        'Mỗi orderItemId chỉ được xuất hiện một lần trong nội dung confirm-return',
      );
    }
    if (submitted.size !== lines.length) {
      throw new BadRequestException(
        `confirm-return phải bao gồm mỗi sản phẩm hủy đúng một lần ` +
          `(cần ${lines.length} sản phẩm, nhận được ${submitted.size})`,
      );
    }
    for (const line of lines) {
      const submittedLine = submitted.get(line.orderItemId);
      if (!submittedLine) {
        throw new BadRequestException(
          `Thiếu số lượng cho sản phẩm đơn hàng ${line.orderItemId}`,
        );
      }
      if (
        submittedLine.goodQuantity + submittedLine.damagedQuantity !==
        line.expectedQuantity
      ) {
        throw new BadRequestException(
          `goodQuantity + damagedQuantity phải bằng expectedQuantity ` +
            `(${line.expectedQuantity}) cho sản phẩm đơn hàng ${line.orderItemId}`,
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
      throw new NotFoundException(`Không tìm thấy đơn hàng ${orderId}`);
    }
    return order;
  }

  private async requireCustomer(userId: string): Promise<Customer> {
    const customer = await this.customerRepository.findOne({
      where: { userId },
    });
    if (!customer) {
      throw new ForbiddenException('Người dùng này không có hồ sơ khách hàng');
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
      // Only lock the root table — Postgres rejects FOR UPDATE on LEFT JOIN null side.
      const tableName =
        manager.getRepository(OrderCancellation).metadata.tableName;
      return {
        lock: {
          mode: 'pessimistic_write' as const,
          tables: [tableName],
        },
      };
    }
    return {};
  }
}
