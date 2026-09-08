import { detectImageExtension } from '../../core/validators/image-upload-validation';

export const MAX_AVATAR_IMAGE_SIZE_BYTES = 1.5 * 1024 * 1024;

export const detectAvatarImageExtension = detectImageExtension;
