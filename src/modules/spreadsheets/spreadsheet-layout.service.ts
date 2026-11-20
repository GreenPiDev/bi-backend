import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { TenantContext } from '../../core/tenant/tenant-context';
import type { UpdateColumnWidthsDto } from './dto/spreadsheet.dto';
import { parseColWidths } from './spreadsheet-col-widths';
import { SPREADSHEET_COLUMNS_UPDATED_EVENT } from './spreadsheets.constants';
import type { UpdateColumnWidthsResult } from './spreadsheet.types';
import { SpreadsheetsService } from './spreadsheets.service';

/**
 * Sutun genislikleri gibi gorunum ayarlari. Hucre degisikliklerinden farkli olarak
 * taslak/Kaydet akisina girmez ve denetim kaydina yazilmaz (veri degil, gorunum) -
 * aninda kaydedilir ve websocket ile tablo acik olan herkese yansir. Ayni sutunu iki
 * kisi ayni anda degistirirse son yazan kazanir (bkz. docs/VARSAYIMLAR.md V88 eki).
 */
@Injectable()
export class SpreadsheetLayoutService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly spreadsheets: SpreadsheetsService,
    private readonly realtime: RealtimeService,
  ) {}

  async updateColumnWidths(
    id: string,
    sheetId: string,
    dto: UpdateColumnWidthsDto,
  ): Promise<UpdateColumnWidthsResult> {
    await this.spreadsheets.assertSheet(id, sheetId);
    const { tenantId, userId } = TenantContext.getOrThrow();

    const colWidths = await this.prisma.$transaction(async (tx) => {
      const sheet = await tx.spreadsheetSheet.findFirst({
        where: { id: sheetId },
        select: { colWidths: true },
      });
      const next = parseColWidths(sheet?.colWidths);
      for (const { col, width } of dto.widths) {
        if (width === null) delete next[String(col)];
        else next[String(col)] = width;
      }
      await tx.spreadsheetSheet.update({
        where: { id: sheetId },
        data: { colWidths: next as Prisma.InputJsonValue },
      });
      return next;
    });

    this.realtime.emitToTenant(tenantId, SPREADSHEET_COLUMNS_UPDATED_EVENT, {
      spreadsheetId: id,
      sheetId,
      colWidths,
      updatedById: userId,
    });
    return { colWidths };
  }
}
