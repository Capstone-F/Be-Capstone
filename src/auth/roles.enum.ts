export enum Role {
  AppAdmin = 'app_admin',
  Staff = 'staff',
  Customer = 'customer',
  Expert = 'expert',
  ClinicManager = 'clinic_manager',
}

/** Application realm roles (excludes Keycloak built-in roles). */
export const APP_ROLES: readonly Role[] = [
  Role.AppAdmin,
  Role.Staff,
  Role.Customer,
  Role.Expert,
  Role.ClinicManager,
];

/** Roles that can be assigned when creating managed accounts. */
export const MANAGED_ROLES: readonly Role[] = [
  Role.Staff,
  Role.Expert,
  Role.ClinicManager,
];

export function isAppRole(value: string): value is Role {
  return (APP_ROLES as readonly string[]).includes(value);
}

export function filterAppRoles(roles: string[] | undefined): Role[] {
  if (!roles?.length) {
    return [Role.Customer];
  }
  const filtered = roles.filter(isAppRole);
  return filtered.length > 0 ? filtered : [Role.Customer];
}

export function hasAnyRole(
  userRoles: string[] | undefined,
  required: Role[],
): boolean {
  if (!required.length) {
    return true;
  }
  const set = new Set(userRoles ?? []);
  return required.some((role) => set.has(role));
}
