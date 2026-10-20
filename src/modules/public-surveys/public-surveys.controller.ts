import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../core/decorators/public.decorator';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  SubmitSurveyResponseSchema,
  type SubmitSurveyResponseDto,
} from './dto/public-survey.dto';
import {
  PublicSurveysService,
  type PublicSurveyView,
} from './public-surveys.service';
import { SurveyResponseThrottlerGuard } from './survey-response-throttler.guard';

/** Kimlik dogrulamasiz anket yanitlama ucu (Faz 4) - @ModulePage/@RequiresPermission
 * KULLANILMAZ (JwtAuthGuard @Public ile atlaniyor, PermissionGuard/ModuleGuard metadata
 * yoksa zaten no-op donuyor, bkz. core/guards). */
@Controller('public/surveys')
export class PublicSurveysController {
  constructor(private readonly publicSurveys: PublicSurveysService) {}

  @Public()
  @Get(':token')
  @UseGuards(SurveyResponseThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  getByToken(@Param('token') token: string): Promise<PublicSurveyView> {
    return this.publicSurveys.getByToken(token);
  }

  @Public()
  @Post(':token/submit')
  @UseGuards(SurveyResponseThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(204)
  submit(
    @Param('token') token: string,
    @Body(new ZodValidationPipe(SubmitSurveyResponseSchema))
    dto: SubmitSurveyResponseDto,
  ): Promise<void> {
    return this.publicSurveys.submit(token, dto);
  }
}
