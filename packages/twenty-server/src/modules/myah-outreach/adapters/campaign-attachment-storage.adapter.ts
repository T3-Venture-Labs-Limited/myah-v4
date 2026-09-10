import { type Readable } from 'stream';

import { Injectable } from '@nestjs/common';
import bytes from 'bytes';
import { FileFolder } from 'twenty-shared/types';

import { settings } from 'src/engine/constants/settings';
import { FileService } from 'src/engine/core-modules/file/services/file.service';
import {
  type CampaignAttachmentLoadResult,
  type CampaignAttachmentStoragePort,
} from 'src/modules/myah-outreach/types/campaign-message-render.type';
import { streamToBuffer } from 'src/utils/stream-to-buffer';

const isValidAuthoredFile = (
  file: Parameters<CampaignAttachmentStoragePort['load']>[0]['file'],
): boolean =>
  typeof file.id === 'string' &&
  file.id.trim().length > 0 &&
  typeof file.name === 'string' &&
  file.name.trim().length > 0 &&
  typeof file.type === 'string' &&
  file.type.trim().length > 0 &&
  typeof file.size === 'number' &&
  Number.isSafeInteger(file.size) &&
  file.size >= 0;

const protectStreamErrors = (stream: Readable): void => {
  const onError = () => undefined;
  const onClose = () => {
    queueMicrotask(() => {
      stream.removeListener('error', onError);
    });
  };

  stream.on('error', onError);
  stream.once('close', onClose);
};

const destroyStreamBestEffort = (stream: Readable): void => {
  try {
    if (!stream.destroyed) {
      stream.destroy();
    }
  } catch {
    // A rejected stream must not expose storage-specific destruction errors.
  }
};

@Injectable()
export class CampaignAttachmentStorageAdapter implements CampaignAttachmentStoragePort {
  constructor(private readonly fileService: FileService) {}

  async load(
    input: Parameters<CampaignAttachmentStoragePort['load']>[0],
  ): Promise<CampaignAttachmentLoadResult> {
    const { authContext, file, workspaceId } = input;
    const maxFileSizeBytes = bytes(settings.storage.maxFileSize);

    if (
      authContext.workspace.id !== workspaceId ||
      !isValidAuthoredFile(file) ||
      typeof maxFileSizeBytes !== 'number' ||
      !Number.isSafeInteger(maxFileSizeBytes) ||
      maxFileSizeBytes <= 0 ||
      file.size > maxFileSizeBytes
    ) {
      return { kind: 'FORBIDDEN' };
    }

    let storedFile:
      | Awaited<ReturnType<FileService['getFileStreamById']>>
      | undefined;

    try {
      storedFile = await this.fileService.getFileStreamById({
        fileId: file.id,
        workspaceId,
        allowedFileFolders: [FileFolder.Workflow],
      });
    } catch {
      return { kind: 'FORBIDDEN' };
    }

    if (storedFile === null) {
      return { kind: 'NOT_FOUND' };
    }

    const { mimeType, stream } = storedFile;

    if (mimeType !== file.type) {
      protectStreamErrors(stream);
      destroyStreamBestEffort(stream);

      return { kind: 'CHANGED' };
    }

    let fileBytes: Buffer;

    try {
      fileBytes = await streamToBuffer(
        stream,
        Math.min(file.size, maxFileSizeBytes),
      );
    } catch {
      destroyStreamBestEffort(stream);

      return { kind: 'CHANGED' };
    }

    if (fileBytes.length !== file.size) {
      destroyStreamBestEffort(stream);

      return { kind: 'CHANGED' };
    }

    return {
      kind: 'READY',
      value: {
        filename: file.name,
        contentType: mimeType,
        bytes: fileBytes,
      },
    };
  }
}
