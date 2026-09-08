import { detectImageExtension } from '../../core/validators/image-upload-validation';

export const MAX_PRODUCT_IMAGE_SIZE_BYTES = 1.5 * 1024 * 1024;

export const detectProductImageExtension = detectImageExtension;
