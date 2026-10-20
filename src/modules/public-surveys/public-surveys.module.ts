import { Module } from '@nestjs/common';
import { PublicSurveysController } from './public-surveys.controller';
import { PublicSurveysService } from './public-surveys.service';
import { SurveyResponseThrottlerGuard } from './survey-response-throttler.guard';

@Module({
  controllers: [PublicSurveysController],
  providers: [PublicSurveysService, SurveyResponseThrottlerGuard],
})
export class PublicSurveysModule {}
