import { OrderStatus } from '../commerce/enums';
import { DeliveryStatus } from './enums';

export type GhnStatusMapping = {
  delivery: DeliveryStatus;
  /**
   * Omitted where the shipping state does not justify moving the order.
   * Return/cancel/exception states leave OrderStatus alone here. A RETURNED
   * delivery is picked up by OrderCancellationProcessor.sweepReturnedDeliveries,
   * which creates a SYSTEM cancellation (wallet refund + restock). FAILED
   * states still need a staff decision via POST /admin/order-cancellations.
   */
  order?: OrderStatus;
};

/**
 * GHN's 22 shipping statuses mapped onto our internal statuses.
 * Source: https://api.ghn.vn/home/docs/detail?id=48
 */
export const GHN_STATUS_MAP: Record<string, GhnStatusMapping> = {
  ready_to_pick: {
    delivery: DeliveryStatus.PROCESSING,
    order: OrderStatus.PROCESSING,
  },
  picking: {
    delivery: DeliveryStatus.PROCESSING,
    order: OrderStatus.PROCESSING,
  },
  money_collect_picking: {
    delivery: DeliveryStatus.PROCESSING,
    order: OrderStatus.PROCESSING,
  },
  picked: { delivery: DeliveryStatus.SHIPPED, order: OrderStatus.SHIPPED },
  storing: { delivery: DeliveryStatus.IN_TRANSIT, order: OrderStatus.SHIPPED },
  transporting: {
    delivery: DeliveryStatus.IN_TRANSIT,
    order: OrderStatus.SHIPPED,
  },
  sorting: { delivery: DeliveryStatus.IN_TRANSIT, order: OrderStatus.SHIPPED },
  delivering: {
    delivery: DeliveryStatus.IN_TRANSIT,
    order: OrderStatus.SHIPPED,
  },
  money_collect_delivering: {
    delivery: DeliveryStatus.IN_TRANSIT,
    order: OrderStatus.SHIPPED,
  },
  delivered: {
    delivery: DeliveryStatus.DELIVERED,
    order: OrderStatus.DELIVERED,
  },
  delivery_fail: { delivery: DeliveryStatus.FAILED },
  waiting_to_return: { delivery: DeliveryStatus.FAILED },
  return: { delivery: DeliveryStatus.RETURNED },
  return_transporting: { delivery: DeliveryStatus.RETURNED },
  return_sorting: { delivery: DeliveryStatus.RETURNED },
  returning: { delivery: DeliveryStatus.RETURNED },
  return_fail: { delivery: DeliveryStatus.RETURNED },
  returned: { delivery: DeliveryStatus.RETURNED },
  cancel: { delivery: DeliveryStatus.FAILED },
  exception: { delivery: DeliveryStatus.FAILED },
  damage: { delivery: DeliveryStatus.FAILED },
  lost: { delivery: DeliveryStatus.FAILED },
};
