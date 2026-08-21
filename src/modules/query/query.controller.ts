import { Body, Controller, Post } from '@nestjs/common';
import {
  CurrentUser,
  type RequestUser,
} from '../../core/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import { QuerySpec, type QueryResult } from './dto/query-spec.dto';
import { QueryService } from './query.service';

@Controller()
export class QueryController {
  constructor(private readonly queryService: QueryService) {}

  @Post('query')
  runQuery(
    @Body(new ZodValidationPipe(QuerySpec)) dto: QuerySpec,
    @CurrentUser() user: RequestUser,
  ): Promise<QueryResult> {
    return this.queryService.runQuery(dto, user.tenantId);
  }

  @Post('query/rows')
  runRows(
    @Body(new ZodValidationPipe(QuerySpec)) dto: QuerySpec,
    @CurrentUser() user: RequestUser,
  ): Promise<QueryResult> {
    return this.queryService.runRowsQuery(dto, user.tenantId);
  }
}
