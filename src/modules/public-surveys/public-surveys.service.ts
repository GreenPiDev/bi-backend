import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../core/errors/app.exception';
import { PrismaService } from '../../core/prisma/prisma.service';
import { R2StorageService } from '../../core/storage/r2-storage.service';
import type { SubmitSurveyResponseDto } from './dto/public-survey.dto';

const FEEDBACK_SURVEY_INCLUDE = {
  tenant: true,
  survey: {
    include: {
      questions: {
        orderBy: { ordinal: 'asc' as const },
        include: { options: { orderBy: { ordinal: 'asc' as const } } },
      },
    },
  },
} as const;

export interface PublicSurveyQuestionView {
  id: string;
  type: 'MULTIPLE_CHOICE' | 'OPEN_ENDED' | 'LIKERT';
  text: string;
  required: boolean;
  options: { id: string; label: string }[];
}

export interface PublicSurveyView {
  surveyName: string;
  surveyDescription: string | null;
  alreadyResponded: boolean;
  tenantName: string;
  /** `data:` URI - public sayfa kimlik dogrulamasiz oldugu icin FileUrlService'in
   * uretecegi (auth gerektiren) /files proxy URL'i kullanilamaz, bkz. mail
   * gonderimindeki ayni gerekce (send-post-sale-survey.processor.ts). */
  tenantLogoDataUrl: string | null;
  questions: PublicSurveyQuestionView[];
}

/**
 * Kimlik dogrulamasiz public anket yanitlama akisi (Faz 4, bkz. docs/VARSAYIMLAR.md).
 * JwtAuthGuard @Public() ile atlandigindan TenantContext hic kurulmaz - bu yuzden
 * burada ham (extension'siz) PrismaService kullanilir, PlatformAdminService/
 * TenantsService ile ayni bypass deseni (bkz. core/prisma/prisma.module.ts). Token
 * zaten globally unique oldugundan tenant filtresine ihtiyac yok.
 */
@Injectable()
export class PublicSurveysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: R2StorageService,
  ) {}

  async getByToken(token: string): Promise<PublicSurveyView> {
    const feedbackSurvey = await this.prisma.feedbackSurvey.findUnique({
      where: { responseToken: token },
      include: FEEDBACK_SURVEY_INCLUDE,
    });
    if (!feedbackSurvey) {
      throw new AppException(
        'TOKEN_NOT_FOUND',
        'Bu anket linki gecersiz.',
        HttpStatus.NOT_FOUND,
      );
    }

    return {
      surveyName: feedbackSurvey.survey.name,
      surveyDescription: feedbackSurvey.survey.description,
      alreadyResponded: Boolean(feedbackSurvey.respondedAt),
      tenantName: feedbackSurvey.tenant.name,
      tenantLogoDataUrl: await this.loadLogoDataUrl(
        feedbackSurvey.tenant.logoKey,
      ),
      questions: feedbackSurvey.survey.questions.map((question) => ({
        id: question.id,
        type: question.type,
        text: question.text,
        required: question.required,
        options: question.options.map((option) => ({
          id: option.id,
          label: option.label,
        })),
      })),
    };
  }

  /** Sirket logosunu R2'den okuyup base64 `data:` URI'ye cevirir - public sayfa hicbir
   * kimlik dogrulamasi olmadan tarayicidan dogrudan yuklendigi icin (auth cookie yok),
   * backend'in /files ucuna isaret eden bir URL kullanilamaz. Logo yoksa/okunamazsa
   * sessizce null doner, sayfa logosuz da calisabilmeli. */
  private async loadLogoDataUrl(
    logoKey: string | null,
  ): Promise<string | null> {
    if (!logoKey) return null;
    try {
      const file = await this.storage.download(logoKey);
      const chunks: Buffer[] = [];
      for await (const chunk of file.body) {
        chunks.push(chunk as Buffer);
      }
      const base64 = Buffer.concat(chunks).toString('base64');
      return `data:${file.contentType ?? 'image/png'};base64,${base64}`;
    } catch {
      return null;
    }
  }

  async submit(token: string, dto: SubmitSurveyResponseDto): Promise<void> {
    const feedbackSurvey = await this.prisma.feedbackSurvey.findUnique({
      where: { responseToken: token },
      include: FEEDBACK_SURVEY_INCLUDE,
    });
    if (!feedbackSurvey) {
      throw new AppException(
        'TOKEN_NOT_FOUND',
        'Bu anket linki gecersiz.',
        HttpStatus.NOT_FOUND,
      );
    }
    if (feedbackSurvey.respondedAt) {
      throw new AppException(
        'ALREADY_RESPONDED',
        'Bu anket zaten yanitlanmis.',
        HttpStatus.CONFLICT,
      );
    }

    const answersByQuestionId = new Map(
      dto.answers.map((answer) => [answer.questionId, answer]),
    );

    for (const question of feedbackSurvey.survey.questions) {
      const answer = answersByQuestionId.get(question.id);
      if (!question.required) continue;

      const hasValidAnswer =
        (question.type === 'OPEN_ENDED' && Boolean(answer?.answerText)) ||
        (question.type === 'LIKERT' && answer?.answerLikertValue != null) ||
        (question.type === 'MULTIPLE_CHOICE' &&
          Boolean(answer?.answerOptionId) &&
          question.options.some(
            (option) => option.id === answer?.answerOptionId,
          ));

      if (!hasValidAnswer) {
        throw new AppException(
          'VALIDATION_ERROR',
          `"${question.text}" sorusu zorunludur.`,
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    const respondedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      for (const question of feedbackSurvey.survey.questions) {
        const answer = answersByQuestionId.get(question.id);
        if (!answer) continue;
        const hasAnyValue =
          answer.answerText ||
          answer.answerOptionId ||
          answer.answerLikertValue != null;
        if (!hasAnyValue) continue;

        await tx.surveyResponse.create({
          data: {
            tenantId: feedbackSurvey.tenantId,
            feedbackSurveyId: feedbackSurvey.id,
            questionId: question.id,
            answerText:
              question.type === 'OPEN_ENDED' ? answer.answerText : undefined,
            answerOptionId:
              question.type === 'MULTIPLE_CHOICE'
                ? answer.answerOptionId
                : undefined,
            answerLikertValue:
              question.type === 'LIKERT' ? answer.answerLikertValue : undefined,
          },
        });
      }

      await tx.feedbackSurvey.update({
        where: { id: feedbackSurvey.id },
        data: { respondedAt },
      });
      await tx.postSaleCase.update({
        where: { id: feedbackSurvey.postSaleCaseId },
        data: { feedbackReceivedAt: respondedAt },
      });
    });
  }
}
