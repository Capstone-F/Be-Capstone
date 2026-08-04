import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Skip required authentication (SessionGuard). Credentials still populate auth when present. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
