import { Body, Controller, Post } from '@nestjs/common';
import type { Dashboard } from '@prisma/client';
import {
  CurrentUser,
  type RequestUser,
} from '../../core/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  CreateStarterDashboardSchema,
  type CreateStarterDashboardDto,
} from './dto/create-starter-dashboard.dto';
import { OnboardingService } from './onboarding.service';

@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Post('demo-dataset')
  seedDemoDataset(@CurrentUser() user: RequestUser): Promise<{ id: string }> {
    return this.onboarding.seedDemoDataset(user.tenantId, user.id);
  }

  @Post('dashboard')
  createStarterDashboard(
    @Body(new ZodValidationPipe(CreateStarterDashboardSchema))
    dto: CreateStarterDashboardDto,
    @CurrentUser() user: RequestUser,
  ): Promise<Dashboard> {
    return this.onboarding.createStarterDashboard(
      dto.datasetId,
      user.tenantId,
      user.id,
    );
  }
}
