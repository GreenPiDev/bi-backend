import { SetMetadata } from '@nestjs/common';

export const MODULE_KEY = 'requiresModule';
export const RequiresModule = (...moduleKeys: string[]) =>
  SetMetadata(MODULE_KEY, moduleKeys);
