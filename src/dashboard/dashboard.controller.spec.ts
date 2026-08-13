import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/roles.enum';
import {
  AdminDashboardController,
  ExpertDashboardController,
  StaffDashboardController,
} from './dashboard.controller';

describe('dashboard role contracts', () => {
  it('restricts the admin dashboard to app_admin', () => {
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        AdminDashboardController.prototype.getDashboard,
      ),
    ).toEqual([Role.AppAdmin]);
  });

  it('restricts the expert dashboard to expert', () => {
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        ExpertDashboardController.prototype.getDashboard,
      ),
    ).toEqual([Role.Expert]);
  });

  it('allows staff and app_admin to view staff operations', () => {
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        StaffDashboardController.prototype.getDashboard,
      ),
    ).toEqual([Role.Staff, Role.AppAdmin]);
  });
});
