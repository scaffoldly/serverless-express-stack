import {
  Controller,
  Route,
  Tags,
  Post,
  UploadedFile,
  File,
  Security,
  Request,
} from 'tsoa';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { EnrichedRequest } from './services/JwtService';

@Route('/api/file')
@Tags('File Api')
export class FileApi extends Controller {
  @Post('')
  @Security('jwt')
  public async upload(
    @Request() httpRequest: EnrichedRequest,
    @UploadedFile() file: File,
  ): Promise<string | undefined> {
    const s3 = new S3Client();
    const uploaded = await s3.send(
      new PutObjectCommand({
        Bucket: process.env.BUCKET?.replace(':4566', ''),
        Key: `uploads/${httpRequest.user!.uuid}/${file.filename}`,
        Body: file.buffer,
        ContentType: file.mimetype,
        ContentLength: file.size,
      }),
    );

    console.log('!!!! uploaded', uploaded);

    return uploaded.ETag;
  }
}
