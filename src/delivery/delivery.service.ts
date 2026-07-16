import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Order } from '../commerce/order.entity';
import { OrderStatus } from '../commerce/enums';
import { OrderResponseDto } from '../commerce/dto/order-response.dto';
import { Payment } from '../payments/payment.entity';
import { PaymentStatus } from '../payments/enums';
import { Customer } from '../users/customer.entity';
import { DeliveryFee } from './delivery-fee.entity';
import { DeliveryProvider } from './delivery-provider.entity';
import { Delivery } from './delivery.entity';
import { AttachDeliveryDto } from './dto/attach-delivery.dto';
import { DeliveryOptionDto } from './dto/delivery-option.dto';
import { DeliveryResponseDto } from './dto/delivery-response.dto';
import { DeliveryStatus } from './enums';

@Injectable()
export class DeliveryService {
  constructor(
    @InjectRepository(DeliveryFee)
    private readonly feeRepository: Repository<DeliveryFee>,
    @InjectRepository(DeliveryProvider)
    private readonly providerRepository: Repository<DeliveryProvider>,
    @InjectRepository(Delivery)
    private readonly deliveryRepository: Repository<Delivery>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    private readonly dataSource: DataSource,
  ) {}

  /** totalVnd = max(0, subtotal − discount + shipping) */
  static computeTotalVnd(
    subtotalVnd: number,
    discountVnd: number,
    shippingFeeVnd: number,
  ): number {
    return Math.max(0, subtotalVnd - discountVnd + shippingFeeVnd);
  }

  async listOptions(): Promise<DeliveryOptionDto[]> {
    const fees = await this.feeRepository.find({
      where: { isActive: true },
      relations: ['provider'],
      order: { feeVnd: 'ASC' },
    });

    return fees
      .filter((fee) => fee.provider?.isActive)
      .map((fee) => ({
        providerId: fee.providerId,
        providerCode: fee.provider.code,
        providerName: fee.provider.name,
        type: fee.type,
        feeVnd: fee.feeVnd,
      }));
  }

  async attachToOrder(
    userId: string,
    orderId: string,
    dto: AttachDeliveryDto,
  ): Promise<OrderResponseDto> {
    const customer = await this.requireCustomer(userId);
    const order = await this.orderRepository.findOne({
      where: { id: orderId, customerId: customer.id },
      relations: ['items'],
    });
    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }
    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException(
        `Shipping can only be set on PENDING orders (status: ${order.status})`,
      );
    }

    const inFlight = await this.paymentRepository.findOne({
      where: {
        orderId: order.id,
        status: In([PaymentStatus.PENDING, PaymentStatus.PROCESSING]),
      },
    });
    if (inFlight) {
      throw new BadRequestException(
        'Cannot change shipping after checkout has started',
      );
    }

    const provider = await this.providerRepository.findOne({
      where: { id: dto.providerId, isActive: true },
    });
    if (!provider) {
      throw new BadRequestException('Delivery provider is invalid or inactive');
    }

    const fee = await this.feeRepository.findOne({
      where: {
        providerId: dto.providerId,
        type: dto.type,
        isActive: true,
      },
    });
    if (!fee) {
      throw new BadRequestException(
        'No active fee for the selected provider and delivery type',
      );
    }

    await this.dataSource.transaction(async (manager) => {
      let delivery = await manager.findOne(Delivery, {
        where: { orderId: order.id },
      });
      if (delivery) {
        delivery.providerId = dto.providerId;
        delivery.type = dto.type;
        delivery.shippingAddress = dto.shippingAddress;
        delivery.feeVnd = fee.feeVnd;
        await manager.save(delivery);
      } else {
        delivery = await manager.save(
          manager.create(Delivery, {
            orderId: order.id,
            providerId: dto.providerId,
            type: dto.type,
            shippingAddress: dto.shippingAddress,
            feeVnd: fee.feeVnd,
            status: DeliveryStatus.PENDING,
          }),
        );
      }

      const shippingFeeVnd = fee.feeVnd;
      const totalVnd = DeliveryService.computeTotalVnd(
        order.subtotalVnd,
        order.discountVnd,
        shippingFeeVnd,
      );
      // Update scalar money fields only — avoid manager.save(order) which
      // nulls Delivery.orderId when order.delivery is still null in memory.
      await manager.update(Order, order.id, { shippingFeeVnd, totalVnd });
    });

    const refreshed = await this.orderRepository.findOne({
      where: { id: order.id },
      relations: ['items'],
    });
    if (!refreshed) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }
    return this.toOrderDto(refreshed);
  }

  async getForOrder(
    userId: string,
    orderId: string,
  ): Promise<DeliveryResponseDto> {
    const customer = await this.requireCustomer(userId);
    const order = await this.orderRepository.findOne({
      where: { id: orderId, customerId: customer.id },
    });
    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    const delivery = await this.deliveryRepository.findOne({
      where: { orderId },
      relations: ['provider'],
    });
    if (!delivery) {
      throw new NotFoundException(`Delivery for order ${orderId} not found`);
    }
    return this.toDeliveryDto(delivery);
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

  private toOrderDto(order: Order): OrderResponseDto {
    return {
      id: order.id,
      status: order.status,
      source: order.source,
      customerSurveyId: order.customerSurveyId,
      surveyRecommendationId: order.surveyRecommendationId,
      subtotalVnd: order.subtotalVnd,
      discountVnd: order.discountVnd,
      discountType: order.discountType,
      shippingFeeVnd: order.shippingFeeVnd,
      totalVnd: order.totalVnd,
      items: (order.items ?? []).map((item) => ({
        id: item.id,
        productVariantId: item.productVariantId,
        quantity: item.quantity,
        unitPriceVnd: item.unitPriceVnd,
        lineTotalVnd: item.lineTotalVnd,
        surveyRecommendationItemId: item.surveyRecommendationItemId,
      })),
      createdAt: order.createdAt,
    };
  }

  private toDeliveryDto(delivery: Delivery): DeliveryResponseDto {
    return {
      id: delivery.id,
      orderId: delivery.orderId,
      providerId: delivery.providerId,
      providerCode: delivery.provider?.code ?? null,
      providerName: delivery.provider?.name ?? null,
      type: delivery.type,
      shippingAddress: delivery.shippingAddress,
      feeVnd: delivery.feeVnd,
      status: delivery.status,
      trackingNumber: delivery.trackingNumber,
      shippedAt: delivery.shippedAt,
      deliveredAt: delivery.deliveredAt,
      createdAt: delivery.createdAt,
    };
  }
}
