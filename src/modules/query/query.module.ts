import { Module } from '@nestjs/common';
import { QueryCacheService } from './query-cache.service';
import { QueryController } from './query.controller';
import { QuerySqlService } from './query-sql.service';
import { QueryService } from './query.service';

@Module({
  controllers: [QueryController],
  providers: [QueryService, QuerySqlService, QueryCacheService],
  exports: [QueryCacheService, QueryService],
})
export class QueryModule {}
