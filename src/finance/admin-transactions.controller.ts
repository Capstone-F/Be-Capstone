import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionGuard } from '../auth/guards/session.guard';
import { Role } from '../auth/roles.enum';
import { AdminTransactionsService } from './admin-transactions.service';
import { PaginatedAdminTransactionsDto } from './dto/admin-transaction-response.dto';
import { ListAdminTransactionsQueryDto } from './dto/list-finance-query.dto';

@ApiTags('Admin Finance')
@Controller('admin/transactions')
@UseGuards(SessionGuard, RolesGuard)
@Roles(Role.AppAdmin)
@ApiCookieAuth()
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Not authenticated' })
export class AdminTransactionsController {
  constructor(
    private readonly adminTransactionsService: AdminTransactionsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Platform-wide transaction ledger (all clinics, all types)',
    description:
      'Default sort is createdAt DESC (newest first). Date filters from/to ' +
      'are YYYY-MM-DD calendar days in Asia/Ho_Chi_Minh.',
  })
  @ApiOkResponse({ type: PaginatedAdminTransactionsDto })
  list(
    @Query() query: ListAdminTransactionsQueryDto,
  ): Promise<PaginatedAdminTransactionsDto> {
    return this.adminTransactionsService.list(query);
  }

  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header(
    'Content-Disposition',
    'attachment; filename="admin-transactions.csv"',
  )
  @ApiOperation({
    summary: 'Export the platform ledger as CSV',
    description:
      'Same filters as GET /admin/transactions; pagination is ignored and ' +
      'up to 10,000 rows are returned oldest-first.',
  })
  @ApiOkResponse({
    description: 'CSV file (text/csv)',
    schema: { type: 'string' },
  })
  export(@Query() query: ListAdminTransactionsQueryDto): Promise<string> {
    return this.adminTransactionsService.exportCsv(query);
  }
}
