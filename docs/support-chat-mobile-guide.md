# Support Chat Integration Guide — Mobile (React Native / Expo)

[English version](support-chat-mobile-guide.md) · [Vietnamese version](support-chat-mobile-guide.vi.md) · [Staff flow guide](staff-flow.md)

Tài liệu này hướng dẫn chi tiết cho **Mobile Developers (React Native / Expo / iOS / Android)** cách tích hợp tính năng **Customer Support Chat** (Chat hỗ trợ trực tuyến giữa Khách hàng và Nhân viên CSKH/Staff) với Backend API và đồng bộ logic với Frontend Web.

---

## Mục lục

1. [Tổng quan Kiến trúc & Luồng hoạt động](#1-tổng-quan-kiến-trúc--luồng-hoạt-động)
2. [Xác thực & Headers trên Mobile](#2-xác-thực--headers-trên-mobile)
3. [Vòng đời Phiên hỗ trợ (Support Session Lifecycle)](#3-vòng-đời-phiên-hỗ-trợ-support-session-lifecycle)
4. [Danh sách API & Endpoints Chi tiết](#4-danh-sách-api--endpoints-chi-tiết)
   - [4.1. Tạo hoặc lấy lại phiên chat sống](#41-tạo-hoặc-lấy-lại-phiên-chat-sống)
   - [4.2. Kiểm tra phiên chat đang active của tôi](#42-kiểm-tra-phiên-chat-đang-active-của-tôi)
   - [4.3. Lấy thông tin chi tiết phiên chat](#43-lấy-thông-tin-chi-tiết-phiên-chat)
   - [4.4. Lấy danh sách tin nhắn (Polling)](#44-lấy-danh-sách-tin-nhắn-polling)
   - [4.5. Gửi tin nhắn (Văn bản & Đính kèm sản phẩm)](#45-gửi-tin-nhắn-văn-bản--đính-kèm-sản-phẩm)
   - [4.6. Đánh dấu đã đọc](#46-đánh-dấu-đã-đọc)
   - [4.7. Đóng phiên chat](#47-đóng-phiên-chat)
5. [Cấu trúc Dữ liệu & Metadata Schemas](#5-cấu-trúc-dữ-liệu--metadata-schemas)
6. [Hướng dẫn Implement chi tiết trên Mobile (State & UI Flow)](#6-hướng-dẫn-implement-chi-tiết-trên-mobile-state--ui-flow)
7. [Mã nguồn Ví dụ cho Mobile (Expo / React Native Hook)](#7-mã-nguồn-ví-dụ-cho-mobile-expo--react-native-hook)
8. [Bảng kiểm tra (Checklist cho Mobile Dev)](#8-bảng-kiểm-tra-checklist-cho-mobile-dev)

---

## 1. Tổng quan Kiến trúc & Luồng hoạt động

```
┌────────────────────────┐                    ┌─────────────────────────┐                    ┌────────────────────────┐
│   Customer Mobile App  │                    │      GlowScan BE        │                    │    Staff Web Portal    │
└───────────┬────────────┘                    └────────────┬────────────┘                    └───────────┬────────────┘
            │                                              │                                             │
            │  1. POST /support/sessions (Option/Subject)  │                                             │
            ├─────────────────────────────────────────────►│                                             │
            │  2. POST /support/sessions/:id/messages      │                                             │
            │     (Tự động gửi tin nhắn vấn đề đầu tiên)   │                                             │
            ├─────────────────────────────────────────────►│  3. Xuất hiện ở Queue "Chờ tiếp nhận"       │
            │                                              ├────────────────────────────────────────────►│
            │                                              │  4. Staff bấm "Tiếp nhận"                   │
            │                                              │     POST /support/sessions/:id/claim      │
            │                                              │◄────────────────────────────────────────────┤
            │  5. Session status đổi từ OPEN -> ACTIVE     │                                             │
            │  6. Polling GET /support/sessions/:id        │                                             │
            │     nhận biết status = ACTIVE & Staff Name   │                                             │
            │◄─────────────────────────────────────────────┤                                             │
            │                                              │  7. Staff chat & Đính kèm sản phẩm           │
            │                                              │◄────────────────────────────────────────────┤
            │  8. Polling GET /support/sessions/:id/mgs    │                                             │
            │     nhận tin nhắn & Metadata Card sản phẩm   │                                             │
            │◄─────────────────────────────────────────────┤                                             │
            │                                              │                                             │
            │  9. Khách bấm "Đóng phiên"                   │                                             │
            │     POST /support/sessions/:id/close         │                                             │
            ├─────────────────────────────────────────────►│ 10. Status = CLOSED                         │
            │                                              │     Đồng bộ sang UI Staff khoá ô chat       │
            │                                              ├────────────────────────────────────────────►│
```

---

## 2. Xác thực & Headers trên Mobile

Khác với Web dùng Session Cookie (`sid`), ứng dụng **Mobile** giao tiếp với Backend qua chuẩn **Bearer Token**.

Header bắt buộc cho mọi request:

```http
Authorization: Bearer <accessToken>
Content-Type: application/json
```

- Trạng thái `401 Unauthorized`: Access token hết hạn hoặc chưa đăng nhập. Thực hiện refresh token bằng `POST /auth/mobile/refresh`.
- Trạng thái `403 Forbidden`: Người dùng không có quyền (ví dụ: Customer cố gọi API lấy danh sách queue của Staff).

---

## 3. Vòng đời Phiên hỗ trợ (Support Session Lifecycle)

Một phiên hỗ trợ có 3 trạng thái (`SupportSessionStatus`):

| Trạng thái   | Yêu nghĩa                                                            | Thao tác cho phép                                                                                    |
| :----------- | :------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------- |
| **`OPEN`**   | Phiên mới tạo bởi Customer, đang chờ trong hàng đợi chung của Staff. | Customer gửi/nhận tin nhắn. Staff xem danh sách queue & bấm "Tiếp nhận" (`claim`).                   |
| **`ACTIVE`** | Đã được 1 Staff tiếp nhận xử lý.                                     | Customer & Staff phụ trách chat qua lại, đính kèm sản phẩm, đánh dấu đã đọc.                         |
| **`CLOSED`** | Phiên đã kết thúc (do Customer hoặc Staff bấm "Đóng phiên").         | Không thể gửi thêm tin nhắn (`409 Conflict`). Ô nhập chat bị ẩn/khóa. Customer có thể tạo phiên mới. |

> **Lưu ý quan trọng:** Mỗi Customer tại một thời điểm chỉ có **tối đa 1 phiên đang sống (`OPEN` hoặc `ACTIVE`)**. Khi gọi `POST /support/sessions`, nếu khách đang có phiên sống, Backend sẽ trả về ngay phiên đó chứ không tạo trùng.

---

## 4. Danh sách API & Endpoints Chi tiết

Base URL: `http://localhost:3001` (Dev) hoặc `https://api.glowscan.id.vn` (Prod)

### 4.1. Tạo hoặc lấy lại phiên chat sống

- **Endpoint:** `POST /support/sessions`
- **Role:** `customer`
- **Mô tả:** Mở phiên tư vấn mới. Nếu khách đã có phiên `OPEN`/`ACTIVE`, API trả về phiên hiện tại.

**Request Body:**

```json
{
  "subject": "Tư vấn chọn sản phẩm trị mụn"
}
```

_(Trường `subject` là tùy chọn, tối đa 255 ký tự)._

**Response `201 Created` / `200 OK`:**

```json
{
  "id": "c7b3a9e2-8f1d-4e5a-9b8c-1a2b3c4d5e6f",
  "customerUserId": "usr-123",
  "customerName": "Nguyễn Văn A",
  "status": "OPEN",
  "subject": "Tư vấn chọn sản phẩm trị mụn",
  "assignedStaffUserId": null,
  "assignedStaffName": null,
  "assignedAt": null,
  "messageCount": 0,
  "customerLastReadSeq": 0,
  "staffLastReadSeq": 0,
  "lastMessageAt": null,
  "lastMessagePreview": null,
  "closedByUserId": null,
  "closedAt": null,
  "closeReason": null,
  "createdAt": "2026-08-14T10:00:00.000Z"
}
```

---

### 4.2. Kiểm tra phiên chat đang active của tôi

- **Endpoint:** `GET /support/sessions/me`
- **Role:** `customer`
- **Mô tả:** Lấy thông tin phiên chat đang sống (`OPEN` hoặc `ACTIVE`) của Customer đăng nhập.

**Response `200 OK`:** _(Cấu trúc giống `SupportSessionResponseDto` ở trên)_

**Response `404 Not Found`:** Khách chưa có phiên chat nào đang mở. (Mobile dùng response 404 này để quyết định hiển thị nút "Bắt đầu trò chuyện" hoặc mở thẳng màn hình chat).

---

### 4.3. Lấy thông tin chi tiết phiên chat

- **Endpoint:** `GET /support/sessions/:id`
- **Role:** `customer`, `staff`, `app_admin`
- **Mô tả:** Lấy thông tin phiên chat theo UUID. Mobile gọi endpoint này định kỳ (ví dụ mỗi 3-5 giây) để phát hiện sự thay đổi trạng thái (`status` chuyển sang `ACTIVE` khi Staff nhận phiên, hoặc `CLOSED` khi bị đóng).

---

### 4.4. Lấy danh sách tin nhắn (Polling)

- **Endpoint:** `GET /support/sessions/:id/messages`
- **Role:** Participant của session
- **Query Parameters:**
  - `afterSeq` (number, optional, default: 0): Lấy các tin nhắn có `seq > afterSeq`.
  - `limit` (number, optional, default: 50, max: 100).

**Ví dụ Request:** `GET /support/sessions/c7b3a9e2-8f1d-4e5a-9b8c-1a2b3c4d5e6f/messages?afterSeq=5&limit=50`

**Response `200 OK`:**

```json
{
  "items": [
    {
      "id": "msg-001",
      "sessionId": "c7b3a9e2-8f1d-4e5a-9b8c-1a2b3c4d5e6f",
      "seq": 6,
      "senderUserId": "usr-staff-999",
      "senderRole": "STAFF",
      "content": "[Sản phẩm đính kèm] Serum B5 La Roche-Posay",
      "metadata": {
        "type": "product",
        "productId": "prd-888",
        "productVariantId": "var-777",
        "productName": "Serum B5 La Roche-Posay",
        "priceVnd": 450000,
        "imageUrl": "https://cdn.glowscan.id.vn/products/b5.png"
      },
      "createdAt": "2026-08-14T10:05:00.000Z"
    }
  ],
  "lastSeq": 6,
  "hasMore": false
}
```

---

### 4.5. Gửi tin nhắn (Văn bản & Đính kèm sản phẩm)

- **Endpoint:** `POST /support/sessions/:id/messages`
- **Role:** Customer (khi status = `OPEN` / `ACTIVE`), Staff (khi status = `ACTIVE`).

**Trường hợp 1: Tin nhắn văn bản thông thường**

```json
{
  "content": "Chào bạn, tôi cần tư vấn về da dầu mụn."
}
```

**Trường hợp 2: Tin nhắn đính kèm sản phẩm (Staff gửi cho Khách hoặc Khách hỏi về sản phẩm)**

```json
{
  "content": "[Sản phẩm đính kèm] Serum B5 Hydrating",
  "metadata": {
    "type": "product",
    "productId": "c3311651-7890-4a87-8d26-02d20b6e1471",
    "productVariantId": "8f2824da-39d2-4328-b0a3-f09c063cf264",
    "productName": "Serum B5 Hydrating",
    "priceVnd": 350000,
    "imageUrl": "https://cdn.glowscan.id.vn/products/b5-hydrating.png"
  }
}
```

**Response `201 Created`:** _(Trả về object tin nhắn vừa tạo bao gồm số `seq` tăng tự động)._

---

### 4.6. Đánh dấu đã đọc

- **Endpoint:** `POST /support/sessions/:id/read`
- **Role:** Participant
- **Mô tả:** Cập nhật số `seq` lớn nhất mà client đã xem. Giúp hiển thị badge thông báo tin nhắn chưa đọc.

**Request Body:**

```json
{
  "lastReadSeq": 6
}
```

---

### 4.7. Đóng phiên chat

- **Endpoint:** `POST /support/sessions/:id/close`
- **Role:** Participant (`customer` hoặc `staff` phụ trách)

**Request Body:**

```json
{
  "reason": "Đã tư vấn xong"
}
```

_(Trường `reason` là tùy chọn)._

**Response `200 OK`:** Trả về phiên chat với `status: "CLOSED"`.

---

## 5. Cấu trúc Dữ liệu & Metadata Schemas

### TypeScript / Dart Definitions cho Mobile Dev

```typescript
export enum SupportSessionStatus {
  OPEN = 'OPEN',
  ACTIVE = 'ACTIVE',
  CLOSED = 'CLOSED',
}

export enum SupportMessageSenderRole {
  CUSTOMER = 'CUSTOMER',
  STAFF = 'STAFF',
  SYSTEM = 'SYSTEM',
}

export interface ProductMessageMetadata {
  type: 'product';
  productId: string;
  productVariantId: string;
  productName: string;
  priceVnd: number;
  imageUrl: string | null;
}

export interface SupportMessage {
  id: string;
  sessionId: string;
  seq: number;
  senderUserId: string;
  senderRole: SupportMessageSenderRole;
  content: string;
  metadata?: ProductMessageMetadata | Record<string, unknown> | null;
  createdAt: string;
}

export interface SupportSession {
  id: string;
  customerUserId: string;
  customerName: string | null;
  status: SupportSessionStatus;
  subject: string | null;
  assignedStaffUserId: string | null;
  assignedStaffName: string | null;
  assignedAt: string | null;
  messageCount: number;
  customerLastReadSeq: number;
  staffLastReadSeq: number;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  closedByUserId: string | null;
  closedAt: string | null;
  closeReason: string | null;
  createdAt: string;
}
```

---

## 6. Hướng dẫn Implement chi tiết trên Mobile (State & UI Flow)

### 6.1. Flow khởi tạo cuộc trò chuyện của Khách hàng

1. Khách mở Widget/Màn hình Support Chat:
   - Gọi `GET /support/sessions/me`.
   - **Nếu thành công (`200 OK`)**: Đã có phiên sống -> Lưu `activeSession`, chuyển thẳng vào màn hình khung chat.
   - **Nếu bị `404 Not Found`**: Chưa có phiên -> Hiển thị form chọn vấn đề (Subject options: _"Tư vấn đơn hàng"_, _"Hỏi về sản phẩm"_, _"Vấn đề khác"_).
2. Khi khách chọn 1 Option và bấm **"Gửi yêu cầu"**:
   - Gọi `POST /support/sessions` với `{ subject: selectedOption }`.
   - Tự động gọi tiếp `POST /support/sessions/:id/messages` với nội dung là `selectedOption` để làm tin nhắn chào đầu tiên.

### 6.2. Luồng Polling tin nhắn (Delta Polling)

Tránh fetch lại toàn bộ lịch sử tin nhắn. Sử dụng `seq` để fetch delta:

1. Duy trì `lastSeqRef = 0`.
2. Định kỳ mỗi **2.5 ~ 3 giây** gọi: `GET /support/sessions/:id/messages?afterSeq=${lastSeqRef}`.
3. Nhận mảng `items`:
   - Append `items` mới vào danh sách hiển thị tin nhắn trên UI.
   - Cập nhật `lastSeqRef = res.data.lastSeq`.
   - Tự động cuộn danh sách tin nhắn xuống dưới cùng (`scrollToBottom`).
4. Nếu `customerLastReadSeq < lastSeqRef`, gọi `POST /support/sessions/:id/read` với `{ lastReadSeq: lastSeqRef }`.

### 6.3. Luồng kiểm tra Trạng thái phiên (Real-time Session Status)

Định kỳ mỗi **3 giây**, gọi `GET /support/sessions/:id`:

- **Chuyển từ `OPEN` sang `ACTIVE`**: Staff đã nhận phiên -> Cập nhật tên Nhân viên hỗ trợ trên Header (`assignedStaffName`).
- **Trạng thái đổi thành `CLOSED`**:
  - Đổi chấm trạng thái màu xanh sang **màu xám**.
  - Hiển thị badge báo `(Đã đóng phiên)`.
  - **Khóa / Ẩn ô nhập tin nhắn (Input Bar)**, thay bằng text: _"Phiên trò chuyện đã kết thúc."_.
  - Dừng vòng lặp Polling tin nhắn.

### 6.4. Render Thẻ sản phẩm đính kèm (Product Attachment Card)

Trong danh sách tin nhắn, kiểm tra `msg.metadata?.type === "product"`:

- Render một Card Sản phẩm riêng biệt bên trong Bong bóng chat:
  - Ảnh đại diện sản phẩm (`imageUrl`).
  - Tên sản phẩm (`productName`).
  - Giá bán (`priceVnd` - format `Intl.NumberFormat('vi-VN')`).
  - **Nút "Xem chi tiết"**: Navigate sang màn hình Product Detail trên Mobile (`/products/:productId`).
  - **Nút "Bỏ vào giỏ"**: Gọi API Thêm vào giỏ hàng (`POST /cart/items` với `productVariantId`).

---

## 7. Mã nguồn Ví dụ cho Mobile (Expo / React Native Hook)

```typescript
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  SupportSession,
  SupportMessage,
  SupportSessionStatus,
} from './support.types';

export function useMobileSupportChat(accessToken: string, baseUrl: string) {
  const [session, setSession] = useState<SupportSession | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const lastSeqRef = useRef<number>(0);

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  // 1. Fetch hoặc Start Session
  const startSession = async (subject: string) => {
    setLoading(true);
    try {
      // Create or get live session
      const res = await fetch(`${baseUrl}/support/sessions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ subject }),
      });
      const data: SupportSession = await res.json();
      setSession(data);

      // Auto send initial subject message
      await sendMessage(data.id, subject);
    } catch (err) {
      console.error('Failed to start session', err);
    } finally {
      setLoading(false);
    }
  };

  // 2. Gửi tin nhắn
  const sendMessage = async (
    sessionId: string,
    content: string,
    metadata?: any,
  ) => {
    try {
      const res = await fetch(
        `${baseUrl}/support/sessions/${sessionId}/messages`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ content, metadata }),
        },
      );
      const newMsg: SupportMessage = await res.json();
      setMessages((prev) => [...prev, newMsg]);
      if (newMsg.seq > lastSeqRef.current) {
        lastSeqRef.current = newMsg.seq;
      }
    } catch (err) {
      console.error('Failed to send message', err);
    }
  };

  // 3. Polling Messages & Status
  useEffect(() => {
    if (!session?.id || session.status === SupportSessionStatus.CLOSED) return;

    const interval = setInterval(async () => {
      try {
        // Poll new messages
        const msgRes = await fetch(
          `${baseUrl}/support/sessions/${session.id}/messages?afterSeq=${lastSeqRef.current}`,
          { headers },
        );
        const msgData = await msgRes.json();
        if (msgData.items?.length > 0) {
          setMessages((prev) => [...prev, ...msgData.items]);
          lastSeqRef.current = msgData.lastSeq;

          // Mark read
          fetch(`${baseUrl}/support/sessions/${session.id}/read`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ lastReadSeq: msgData.lastSeq }),
          });
        }

        // Poll session status
        const sessionRes = await fetch(
          `${baseUrl}/support/sessions/${session.id}`,
          { headers },
        );
        const updatedSession: SupportSession = await sessionRes.json();
        setSession(updatedSession);
      } catch (err) {
        console.error('Polling error', err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [session?.id, session?.status]);

  return {
    session,
    messages,
    loading,
    startSession,
    sendMessage,
  };
}
```

---

## 8. Bảng kiểm tra (Checklist cho Mobile Dev)

- [ ] Giới hạn Header `Authorization: Bearer <token>` chuẩn xác cho mọi request support chat.
- [ ] Xử lý `404 Not Found` từ `GET /support/sessions/me` để switch giữa Form chọn vấn đề và Khung chat.
- [ ] Gửi tự động Option đã chọn làm tin nhắn đầu tiên ngay sau khi `POST /support/sessions` thành công.
- [ ] Dùng `afterSeq` để delta-polling tin nhắn, không fetch trùng lặp.
- [ ] Tự động gọi `POST /support/sessions/:id/read` khi có tin nhắn mới tới.
- [ ] Polling trạng thái phiên `GET /support/sessions/:id` để nhận biết thời gian thực khi phiên bị `CLOSED`.
- [ ] Khóa ô nhập liệu khi `status === 'CLOSED'`.
- [ ] Render đúng giao diện Card Sản phẩm khi `metadata.type === 'product'`, gắn kèm nút Navigate Chi tiết & Thêm giỏ hàng.
