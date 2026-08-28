import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { z } from 'zod';
import type { RequestUser } from '../../core/decorators/current-user.decorator';
import { AppException } from '../../core/errors/app.exception';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { hasPermission } from '../../core/permissions/permission.types';
import { PermissionsService } from '../../core/permissions/permissions.service';
import { QuerySpec } from '../query/dto/query-spec.dto';
import { QueryService } from '../query/query.service';
import {
  buildDatasetSummaries,
  buildSystemPrompt,
  type DatasetSummaryForChat,
} from './chatbot-context';
import {
  NAVIGATION_INTENTS,
  resolveNavigation,
  type NamedEntity,
} from './chatbot-navigation';
import { CHATBOT_TOOLS } from './chatbot-tools';
import type { ChatRequest, ChatResponse } from './dto/chat-message.dto';
import { OPENAI_CLIENT, type OpenAiClient } from './openai-client.token';

const MAX_TOOL_ROUNDS = 5;
const DEFAULT_MODEL = 'gpt-4o-mini';
const FALLBACK_REPLY =
  'Şu an bu soruya yardımcı olamıyorum. Lütfen sorunuzu daha basit şekilde tekrar sorun.';

const NavigateArgs = z.object({
  intent: z.enum(NAVIGATION_INTENTS),
  targetName: z.string().optional(),
});

const DescribeDatasetArgs = z.object({
  datasetId: z.string(),
});

interface ToolExecutionResult {
  content: string;
  navigateTo?: string | null;
}

@Injectable()
export class ChatbotService {
  constructor(
    @Inject(OPENAI_CLIENT) private readonly openai: OpenAiClient,
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly queryService: QueryService,
    private readonly configService: ConfigService,
    private readonly permissions: PermissionsService,
  ) {}

  async chat(request: ChatRequest, user: RequestUser): Promise<ChatResponse> {
    const [datasets, dashboards] = await Promise.all([
      this.prisma.dataset.findMany({ include: { fields: true } }),
      this.prisma.dashboard.findMany({ select: { id: true, name: true } }),
    ]);
    const datasetSummaries = buildDatasetSummaries(datasets);

    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: buildSystemPrompt(datasetSummaries, dashboards),
      },
      ...request.history.map((item): ChatCompletionMessageParam => ({
        role: item.role,
        content: item.content,
      })),
      { role: 'user', content: request.message },
    ];

    const model =
      this.configService.get<string>('OPENAI_MODEL') ?? DEFAULT_MODEL;
    let navigateTo: string | null = null;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const completion = await this.openai.chat.completions.create({
        model,
        messages,
        tools: CHATBOT_TOOLS,
      });
      const responseMessage = completion.choices[0].message;
      messages.push(responseMessage as ChatCompletionMessageParam);

      const toolCalls = responseMessage.tool_calls ?? [];
      if (toolCalls.length === 0) {
        return { reply: responseMessage.content ?? '', navigateTo };
      }

      for (const toolCall of toolCalls) {
        if (toolCall.type !== 'function') continue;
        const result = await this.executeTool(
          toolCall.function.name,
          toolCall.function.arguments,
          user,
          datasetSummaries,
          dashboards,
        );
        if (result.navigateTo !== undefined) {
          navigateTo = result.navigateTo;
        }
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result.content,
        });
      }
    }

    return { reply: FALLBACK_REPLY, navigateTo: null };
  }

  private async executeTool(
    name: string,
    rawArguments: string,
    user: RequestUser,
    datasets: DatasetSummaryForChat[],
    dashboards: NamedEntity[],
  ): Promise<ToolExecutionResult> {
    if (name === 'describe_dataset') {
      return this.executeDescribeDataset(rawArguments, datasets);
    }
    if (name === 'run_query') {
      return this.executeRunQuery(rawArguments, user.tenantId);
    }
    if (name === 'navigate') {
      const datasetEntities: NamedEntity[] = datasets.map((d) => ({
        id: d.id,
        name: d.name,
      }));
      return this.executeNavigate(
        rawArguments,
        user,
        datasetEntities,
        dashboards,
      );
    }
    return { content: JSON.stringify({ error: 'Bilinmeyen arac.' }) };
  }

  private executeDescribeDataset(
    rawArguments: string,
    datasets: DatasetSummaryForChat[],
  ): ToolExecutionResult {
    try {
      const parsed = DescribeDatasetArgs.parse(JSON.parse(rawArguments));
      const dataset = datasets.find((d) => d.id === parsed.datasetId);
      if (!dataset) {
        return {
          content: JSON.stringify({
            error: 'Boyle bir veri kumesi bulunamadi.',
          }),
        };
      }
      return {
        content: JSON.stringify({
          datasetId: dataset.id,
          fields: dataset.fields.map((f) => ({
            field: f.name,
            gorunenAdi: f.label,
            tur: f.type.toLowerCase(),
            rol: f.role.toLowerCase(),
          })),
        }),
      };
    } catch {
      return { content: JSON.stringify({ error: 'Gecersiz istek.' }) };
    }
  }

  private async executeRunQuery(
    rawArguments: string,
    tenantId: string,
  ): Promise<ToolExecutionResult> {
    try {
      const parsed = QuerySpec.parse(JSON.parse(rawArguments));
      const result = await this.queryService.runQuery(parsed, tenantId);
      return {
        content: JSON.stringify({
          columns: result.columns,
          rows: result.rows.slice(0, 50),
          rowCount: result.rowCount,
          truncated: result.truncated,
        }),
      };
    } catch (error) {
      if (error instanceof AppException) {
        return { content: JSON.stringify({ error: error.message }) };
      }
      if (error instanceof z.ZodError) {
        const details = error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; ');
        return {
          content: JSON.stringify({
            error: `Sorgu parametreleri gecersiz: ${details}`,
          }),
        };
      }
      return { content: JSON.stringify({ error: 'Sorgu calistirilamadi.' }) };
    }
  }

  private async executeNavigate(
    rawArguments: string,
    user: RequestUser,
    datasets: NamedEntity[],
    dashboards: NamedEntity[],
  ): Promise<ToolExecutionResult> {
    try {
      const parsed = NavigateArgs.parse(JSON.parse(rawArguments));
      const effective = await this.permissions.getEffectivePermissions(
        user.tenantId,
        user.roleIds,
      );
      const result = resolveNavigation(
        parsed.intent,
        parsed.targetName,
        hasPermission(effective, 'settings', 'VIEW'),
        dashboards,
        datasets,
      );
      return {
        content: JSON.stringify({
          allowed: result.path !== null,
          reason: result.reason,
        }),
        navigateTo: result.path,
      };
    } catch {
      return {
        content: JSON.stringify({ error: 'Gecersiz yonlendirme istegi.' }),
      };
    }
  }
}
