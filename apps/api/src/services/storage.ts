import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface StorageService {
  upload(key: string, body: Buffer, contentType: string): Promise<void>;
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  getSignedUploadUrl(key: string, contentType: string, expiresIn?: number): Promise<string>;
  getSignedDownloadUrl(key: string, expiresIn?: number): Promise<string>;
}

export class BackblazeB2Adapter implements StorageService {
  private client: S3Client;
  private bucket: string;

  constructor(config: {
    endpoint: string;
    region: string;
    keyId: string;
    applicationKey: string;
    bucket: string;
  }) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.keyId,
        secretAccessKey: config.applicationKey,
      },
      forcePathStyle: true,
    });
  }

  async upload(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }));
  }

  async download(key: string): Promise<Buffer> {
    const response = await this.client.send(new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    }));

    const stream = response.Body;
    if (stream && 'transformToByteArray' in stream) {
      const bytes = await stream.transformToByteArray();
      return Buffer.from(bytes);
    }
    throw new Error('Failed to read response body');
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    }));
  }

  async getSignedUploadUrl(key: string, contentType: string, expiresIn = 3600): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });
    return getSignedUrl(this.client, command, { expiresIn });
  }

  async getSignedDownloadUrl(key: string, expiresIn = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.client, command, { expiresIn });
  }
}

// Future provider: Cloudflare R2
// To enable R2, uncomment below and add R2Adapter implementation
// that implements StorageService with R2-specific endpoint:
//   endpoint: `https://${accountId}.r2.cloudflarestorage.com`
//   region: 'auto'
//
// export class R2Adapter implements StorageService { ... }

export function createStorageService(): StorageService {
  const provider = process.env.STORAGE_PROVIDER || 'b2';

  if (provider === 'b2') {
    const endpoint = process.env.B2_ENDPOINT;
    const region = process.env.B2_REGION;
    const keyId = process.env.B2_KEY_ID;
    const applicationKey = process.env.B2_APPLICATION_KEY;
    const bucket = process.env.B2_BUCKET_NAME;

    if (!endpoint || !region || !keyId || !applicationKey || !bucket) {
      throw new Error('B2 credentials required: B2_ENDPOINT, B2_REGION, B2_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET_NAME');
    }

    return new BackblazeB2Adapter({ endpoint, region, keyId, applicationKey, bucket });
  }

  // Future: add 'r2' provider case here
  throw new Error(`Unknown storage provider: ${provider}. Supported: b2`);
}
