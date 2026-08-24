/**
 * Cross-key consistency for the admin-configurable booking policies stored in
 * commerce_settings. The two settings groups (booking deadlines, expert
 * cancellation policy) live behind separate endpoints but share one timing
 * model, so the shared defaults and the cross-key warning live here rather
 * than in either service — that would create a circular import.
 */

/** Minutes before the slot start under which a booking may no longer be created (BR-32). */
export const DEFAULT_BOOKING_MIN_LEAD_TIME_MIN = 120;

/** Minutes before the slot inside which an expert cancel is stamped EXPERT_LATE_CANCEL. */
export const DEFAULT_EXPERT_LATE_CANCEL_THRESHOLD_MIN = 1440;

/**
 * A booking created inside the late-cancel window is "born late": the expert
 * has no way to cancel it without being stamped EXPERT_LATE_CANCEL. That zone
 * exists whenever the late-cancel threshold exceeds the minimum lead time, and
 * both values are legitimate on their own, so this is surfaced as a warning on
 * the settings endpoints rather than rejected.
 */
export function lateCancelLeadTimeWarning(
  lateCancelThresholdMin: number,
  minLeadTimeMin: number,
): string | null {
  if (lateCancelThresholdMin <= 0 || lateCancelThresholdMin <= minLeadTimeMin) {
    return null;
  }
  return (
    `EXPERT_LATE_CANCEL_THRESHOLD_MIN (${lateCancelThresholdMin} phút) lớn hơn ` +
    `BOOKING_MIN_LEAD_TIME_MIN (${minLeadTimeMin} phút): booking được tạo trong ` +
    `khoảng chênh lệch này nằm sẵn trong cửa sổ hủy sát giờ, nên chuyên gia hủy ` +
    `sẽ bị tính lỗi nặng kể cả khi hủy ngay sau khi nhận booking. Đây có thể là ` +
    `chủ đích (bảo vệ khách hàng), nhưng hãy cân nhắc khi đặt ngưỡng.`
  );
}
