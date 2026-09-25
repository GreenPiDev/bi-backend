import { Module } from '@nestjs/common';
import { ProjectsCacheService } from './projects-cache.service';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  controllers: [ProjectsController],
  providers: [ProjectsService, ProjectsCacheService],
  exports: [ProjectsService, ProjectsCacheService],
})
export class ProjectsModule {}
