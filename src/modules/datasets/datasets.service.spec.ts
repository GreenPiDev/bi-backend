import { AppException } from '../../core/errors/app.exception';
import { DatasetsService } from './datasets.service';

const DATASET_ID = '11111111-1111-1111-1111-111111111111';
const FIELD_ID = '22222222-2222-2222-2222-222222222222';
const TENANT_ID = 't1';

function createDatasetRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: DATASET_ID,
    tenantId: TENANT_ID,
    name: 'Test Dataset',
    physicalTable: 'ds_x',
    fields: [
      {
        id: FIELD_ID,
        datasetId: DATASET_ID,
        sourceName: 'Tutar',
        name: 'tutar',
        label: 'Tutar',
        type: 'NUMBER',
        role: 'MEASURE',
        format: null,
        isVisible: true,
        ordinal: 0,
      },
    ],
    ...overrides,
  };
}

function createPrisma(datasetRow: unknown = createDatasetRow()) {
  return {
    dataset: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(datasetRow),
    },
    datasetField: {
      update: vi.fn().mockResolvedValue({}),
    },
  };
}

function createRawSql() {
  return {
    renameColumn: vi.fn().mockResolvedValue(undefined),
    alterColumnType: vi.fn().mockResolvedValue(undefined),
    previewRows: vi.fn().mockResolvedValue({ columns: [], rows: [] }),
  };
}

function createQueryCache() {
  return {
    invalidateDataset: vi.fn().mockResolvedValue(undefined),
  };
}

describe('DatasetsService', () => {
  it('getById: bulunamayan dataset icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma(null);
    const service = new DatasetsService(
      prisma as never,
      createRawSql() as never,
      createQueryCache() as never,
    );
    await expect(service.getById('yok')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('updateFields: bilinmeyen kolon id icin FIELD_NOT_FOUND firlatir', async () => {
    const prisma = createPrisma();
    const rawSql = createRawSql();
    const service = new DatasetsService(
      prisma as never,
      rawSql as never,
      createQueryCache() as never,
    );
    await expect(
      service.updateFields(DATASET_ID, TENANT_ID, [
        { id: 'baska-bir-id' } as never,
      ]),
    ).rejects.toMatchObject({
      code: 'FIELD_NOT_FOUND',
    } satisfies Partial<AppException>);
    expect(rawSql.renameColumn).not.toHaveBeenCalled();
  });

  it('updateFields: kolon adi degisince fiziksel tabloda RENAME COLUMN calisir', async () => {
    const prisma = createPrisma();
    const rawSql = createRawSql();
    const queryCache = createQueryCache();
    const service = new DatasetsService(
      prisma as never,
      rawSql as never,
      queryCache as never,
    );
    await service.updateFields(DATASET_ID, TENANT_ID, [
      { id: FIELD_ID, name: 'yeni_ad' },
    ]);
    expect(rawSql.renameColumn).toHaveBeenCalledWith(
      TENANT_ID,
      DATASET_ID,
      'tutar',
      'yeni_ad',
    );
    expect(prisma.datasetField.update).toHaveBeenCalledWith({
      where: { id: FIELD_ID },
      data: expect.objectContaining({ name: 'yeni_ad' }),
    });
    expect(queryCache.invalidateDataset).toHaveBeenCalledWith(
      TENANT_ID,
      DATASET_ID,
    );
  });

  it('updateFields: tip degisince ALTER COLUMN TYPE calisir', async () => {
    const prisma = createPrisma();
    const rawSql = createRawSql();
    const service = new DatasetsService(
      prisma as never,
      rawSql as never,
      createQueryCache() as never,
    );
    await service.updateFields(DATASET_ID, TENANT_ID, [
      { id: FIELD_ID, type: 'STRING' },
    ]);
    expect(rawSql.alterColumnType).toHaveBeenCalledWith(
      TENANT_ID,
      DATASET_ID,
      'tutar',
      'STRING',
    );
  });

  it('updateFields: raw SQL basarisiz olursa SCHEMA_UPDATE_FAILED firlatir', async () => {
    const prisma = createPrisma();
    const rawSql = createRawSql();
    rawSql.renameColumn.mockRejectedValue(new Error('duplicate column'));
    const service = new DatasetsService(
      prisma as never,
      rawSql as never,
      createQueryCache() as never,
    );
    await expect(
      service.updateFields(DATASET_ID, TENANT_ID, [
        { id: FIELD_ID, name: 'cakisan_ad' },
      ]),
    ).rejects.toMatchObject({
      code: 'SCHEMA_UPDATE_FAILED',
    } satisfies Partial<AppException>);
  });

  it('preview: dataset sahiplik kontrolunden sonra rawSql.previewRows cagirir', async () => {
    const prisma = createPrisma();
    const rawSql = createRawSql();
    const service = new DatasetsService(
      prisma as never,
      rawSql as never,
      createQueryCache() as never,
    );
    await service.preview(DATASET_ID, TENANT_ID);
    expect(rawSql.previewRows).toHaveBeenCalledWith(TENANT_ID, DATASET_ID, 50);
  });
});
