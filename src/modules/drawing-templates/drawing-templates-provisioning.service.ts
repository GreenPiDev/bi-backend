import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';

interface BuiltinDrawingPanelTemplateSeed {
  name: string;
  type: 'AG_BACKPLATE' | 'OG_CELL';
  widthMm: number;
  heightMm: number;
  layout: Record<string, unknown>;
}

/**
 * Genel AG pano tasarim konvansiyonuna dayanan, makul bir baslangic sablonu (bkz.
 * docs/VARSAYIMLAR.md V52 "Built-in sablon icerigi") - uydurma geometri DEGIL,
 * duzenlenebilir bir baslangic noktasi. Ust bantta bara, orta bantta sekiler/
 * kontaktor/role, altta klemens, kenarda kablo kanali/duct - render motoru (D4)
 * bu band tanimlarini auto-pack icin baslangic noktasi olarak kullanacak.
 * Ölcüler, kullanicinin paylastigi gercek AG pano ornegiyle (1000x2000mm) birebir
 * ayni - bkz. D2 sonrasi netlesen kapsam karari.
 */
const BUILTIN_DRAWING_PANEL_TEMPLATES: readonly BuiltinDrawingPanelTemplateSeed[] =
  [
    {
      name: 'AG Pano - Standart Arka Plaka',
      type: 'AG_BACKPLATE',
      widthMm: 1000,
      heightMm: 2000,
      layout: {
        clearanceMm: 20,
        bands: [
          { key: 'busbar', label: 'Bara Bandı', y: 0, heightMm: 300 },
          {
            key: 'main-breaker',
            label: 'Ana Kesici Bandı',
            y: 300,
            heightMm: 500,
          },
          {
            key: 'outgoing',
            label: 'Çıkış Kesicileri Bandı',
            y: 800,
            heightMm: 700,
          },
          { key: 'terminal', label: 'Klemens Bandı', y: 1500, heightMm: 300 },
        ],
      },
    },
    /**
     * OG hucre destegi (Faz D8, bkz. docs/VARSAYIMLAR.md V56) - genel orta gerilim
     * (OG) hucre tasarim konvansiyonuna dayanan baslangic sablonu: ust bantta bara
     * bolmesi, orta-ust kesici/ayirici bolmesi, orta-alt kablo/CT bolmesi, alt bantta
     * topraklama/klemens bolmesi. AG sablonuyla aynen, uydurma geometri degil
     * duzenlenebilir bir baslangic noktasi. Olculer tipik 36kV hava izoleli bir OG
     * hucresiyle ayni buyuklukte (800x2200mm).
     */
    {
      name: 'OG Hücre - Standart',
      type: 'OG_CELL',
      widthMm: 800,
      heightMm: 2200,
      layout: {
        clearanceMm: 20,
        bands: [
          { key: 'busbar', label: 'Bara Bölmesi', y: 0, heightMm: 400 },
          {
            key: 'breaker',
            label: 'Kesici/Ayırıcı Bölmesi',
            y: 400,
            heightMm: 800,
          },
          {
            key: 'cable',
            label: 'Kablo/CT Bölmesi',
            y: 1200,
            heightMm: 700,
          },
          {
            key: 'earthing-terminal',
            label: 'Topraklama/Klemens Bölmesi',
            y: 1900,
            heightMm: 300,
          },
        ],
      },
    },
  ];

@Injectable()
export class DrawingTemplatesProvisioningService {
  constructor(private readonly prisma: PrismaService) {}

  /** Idempotent: built-in satir (isBuiltIn=true, ayni ad) zaten kopyalanmissa tekrar
   * olusturulmaz - DrawingLibraryProvisioningService ile ayni desen. */
  async provisionForTenant(tenantId: string): Promise<void> {
    for (const seed of BUILTIN_DRAWING_PANEL_TEMPLATES) {
      const existing = await this.prisma.drawingPanelTemplate.findFirst({
        where: { tenantId, isBuiltIn: true, name: seed.name },
      });
      if (existing) {
        continue;
      }
      await this.prisma.drawingPanelTemplate.create({
        data: {
          tenantId,
          name: seed.name,
          type: seed.type,
          widthMm: seed.widthMm,
          heightMm: seed.heightMm,
          layout: seed.layout as unknown as Prisma.InputJsonValue,
          isBuiltIn: true,
        },
      });
    }
  }
}
