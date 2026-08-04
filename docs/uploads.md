# Image Uploads (Cloudflare R2)

Upload binary images to Cloudflare R2, then store the returned public URL on domain entities (product variants, expert avatars, treatment progress photos).

**Survey facial scans** use a dedicated endpoint that uploads via the same `StorageService` and persists the URL on the survey — see `POST /surveys/:id/face-scan` in [Survey flow](survey-flow.md). You do **not** need a separate `POST /uploads/images` call for survey faces.

**Auth:** any authenticated user (session cookie or Bearer). See [Web Authentication](auth-web.md) / [Mobile Authentication](auth-mobile.md).

---

## Environment

| Variable               | Required for upload | Description                                                    |
| ---------------------- | ------------------- | -------------------------------------------------------------- |
| `R2_ACCOUNT_ID`        | Yes                 | Cloudflare account id (S3 endpoint host)                       |
| `R2_ACCESS_KEY_ID`     | Yes                 | R2 API token access key                                        |
| `R2_SECRET_ACCESS_KEY` | Yes                 | R2 API token secret                                            |
| `R2_BUCKET`            | Yes                 | Bucket name                                                    |
| `R2_PUBLIC_BASE_URL`   | Yes                 | Public URL prefix (r2.dev or custom domain), no trailing slash |

The API boots without these set (same pattern as Zego). `POST /uploads/images` returns **503** when R2 is not configured.

Object key pattern: `images/{yyyy}/{mm}/{uuid}.{ext}`.

---

## Endpoint

### `POST /uploads/images`

Multipart form field: **`file`**.

| Constraint | Value                                                                            |
| ---------- | -------------------------------------------------------------------------------- |
| MIME       | `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `image/heic`, `image/heif` |
| Max size   | 5 MB                                                                             |

**Response**

```json
{
  "url": "https://pub-xxxxxxxx.r2.dev/images/2026/07/uuid.jpg",
  "key": "images/2026/07/uuid.jpg"
}
```

Use `url` when calling domain update APIs below.

---

## Where to attach the URL

| Target                       | Endpoint                                                               | Roles                         |
| ---------------------------- | ---------------------------------------------------------------------- | ----------------------------- |
| Product variant              | `PATCH /products/variants/:variantId` `{ "imageUrl" }`                 | `app_admin`, `staff`          |
| Product onboard (optional)   | `POST /products` `{ "imageUrl" }` on create                            | `app_admin`, `staff`          |
| Expert avatar (admin/clinic) | `PATCH /experts/:id` `{ "avatarUrl" }`                                 | `app_admin`, `clinic_manager` |
| Expert avatar (self)         | `PATCH /experts/me` `{ "avatarUrl" }`                                  | `expert`                      |
| Progress photo (create)      | `POST /treatments/:id/events` with `type: PROGRESS_PHOTO` + `photoUrl` | `customer`, `expert`          |
| Progress photo (update)      | `PATCH /treatments/:id/events/:eventId` `{ "photoUrl" }`               | `customer`, `expert`          |
| Survey face scan             | `POST /surveys/:id/face-scan` multipart `file` (uploads + persists)    | `customer`                    |

Customer profile avatars continue to use `PATCH /customers/me` `{ "avatarUrl" }` with the same upload-then-URL flow.

---

## Typical FE flow

1. `POST /uploads/images` with the file → receive `url`.
2. Call the domain PATCH/POST with that `url`.
3. List/detail/chart responses include the stored URL.

Local/dev without R2: skip step 1 and send a placeholder such as `https://placehold.co/400`.
