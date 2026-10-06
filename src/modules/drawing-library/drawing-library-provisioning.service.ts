import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';

interface BuiltinDrawingLibraryComponentSeed {
  key: string;
  name: string;
  category: string;
  defaultWidthMm: number;
  defaultHeightMm: number;
}

/**
 * AG pano cizim kutuphanesi icin makul bir baslangic seti (bkz. docs/VARSAYIMLAR.md V52
 * "Built-in sablon icerigi") - uydurma geometri degil, duzenlenebilir bir baslangic
 * noktasi. Her tenant `drawings` modulunu actiginda bu satirlar KOPYALANIR
 * (provisionForTenant), tenant kendi kopyasini serbestce duzenleyebilir/silebilir -
 * bu liste daha sonra degismesi global olarak zaten provizyon edilmis tenant'lari
 * ETKILEMEZ.
 */
const BUILTIN_DRAWING_LIBRARY_COMPONENTS: readonly BuiltinDrawingLibraryComponentSeed[] =
  [
    {
      key: 'switch-compact',
      name: 'Kompakt Şalter',
      category: 'SWITCH',
      defaultWidthMm: 150,
      defaultHeightMm: 200,
    },
    {
      key: 'contactor',
      name: 'Kontaktör',
      category: 'CONTACTOR',
      defaultWidthMm: 100,
      defaultHeightMm: 120,
    },
    {
      key: 'relay',
      name: 'Röle',
      category: 'RELAY',
      defaultWidthMm: 50,
      defaultHeightMm: 80,
    },
    {
      key: 'current-transformer',
      name: 'Akım Trafosu (CT)',
      category: 'CT',
      defaultWidthMm: 80,
      defaultHeightMm: 80,
    },
    {
      key: 'capacitor',
      name: 'Kondansatör',
      category: 'CAPACITOR',
      defaultWidthMm: 100,
      defaultHeightMm: 250,
    },
    {
      key: 'terminal-block',
      name: 'Klemens Seti',
      category: 'TERMINAL',
      defaultWidthMm: 300,
      defaultHeightMm: 60,
    },
    {
      key: 'cable-duct',
      name: 'Kablo Kanalı',
      category: 'DUCT',
      defaultWidthMm: 60,
      defaultHeightMm: 100,
    },
    /**
     * OG hucre destegi (Faz D8, bkz. docs/VARSAYIMLAR.md V56) - orta gerilim
     * hucrelerinde yaygin komponentler. Render motoru kategoriden habersiz (sadece
     * dikdortgen + etiket cizer), bu yuzden yeni kategori eklemek motor kodunu
     * degistirmiyor, sadece secilebilir kutuphane secenegi ekliyor.
     */
    {
      key: 'disconnector',
      name: 'Ayırıcı',
      category: 'DISCONNECTOR',
      defaultWidthMm: 200,
      defaultHeightMm: 300,
    },
    {
      key: 'earthing-switch',
      name: 'Topraklama Şalteri',
      category: 'EARTHING_SWITCH',
      defaultWidthMm: 150,
      defaultHeightMm: 200,
    },
    {
      key: 'voltage-transformer',
      name: 'Gerilim Trafosu (VT)',
      category: 'VT',
      defaultWidthMm: 120,
      defaultHeightMm: 150,
    },
  ];

@Injectable()
export class DrawingLibraryProvisioningService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotent: zaten kopyalanmis (ayni key'e sahip) satirlar tekrar yaratilmaz.
   */
  async provisionForTenant(tenantId: string): Promise<void> {
    for (const seed of BUILTIN_DRAWING_LIBRARY_COMPONENTS) {
      const existing = await this.prisma.drawingLibraryComponent.findFirst({
        where: { tenantId, key: seed.key },
      });
      if (existing) {
        continue;
      }
      await this.prisma.drawingLibraryComponent.create({
        data: { tenantId, ...seed, isBuiltIn: true },
      });
    }
  }
}
