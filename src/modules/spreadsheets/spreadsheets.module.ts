import { Module } from '@nestjs/common';
import { SpreadsheetChangesService } from './spreadsheet-changes.service';
import { SpreadsheetLayoutService } from './spreadsheet-layout.service';
import { SpreadsheetsController } from './spreadsheets.controller';
import { SpreadsheetsService } from './spreadsheets.service';

@Module({
  controllers: [SpreadsheetsController],
  providers: [
    SpreadsheetsService,
    SpreadsheetChangesService,
    SpreadsheetLayoutService,
  ],
})
export class SpreadsheetsModule {}
