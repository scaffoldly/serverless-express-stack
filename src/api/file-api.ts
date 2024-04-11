import {
  Controller,
  Route,
  Tags,
  Get,
  Post,
  UploadedFile,
  File,
  Security,
  Request,
  Path,
  Res,
  TsoaResponse,
} from 'tsoa';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { v4 as uuid } from 'uuid';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { EnrichedRequest } from './services/JwtService';
import { BaseSchema, BaseTable } from './db/base';
import { HttpError } from './internal/errors';

export type UserFileSchema = BaseSchema & {
  bucket: string;
  key: string;
  filename: string;
  contentType: string;
  contentLength: number;
  userId: string;
  etag?: string;
  version?: string;
  url?: string;
};

export class UserFileTable extends BaseTable<UserFileSchema, 'user', 'file'> {
  constructor() {
    super(process.env.TABLE_NAME!, 'user', 'file');
  }
}

@Route('/api/file')
@Tags('File Api')
export class FileApi extends Controller {
  s3: S3Client;

  userFileTable: UserFileTable;

  constructor() {
    super();
    this.s3 = new S3Client({ forcePathStyle: true });
    this.userFileTable = new UserFileTable();
  }

  @Post('')
  @Security('jwt')
  public async upload(
    @Request() httpRequest: EnrichedRequest,
    @UploadedFile() file: File,
  ): Promise<UserFileSchema> {
    const fileUuid = uuid();
    const userFile: UserFileSchema = {
      hashKey: this.userFileTable.hashKey(httpRequest.user!.uuid!),
      rangeKey: this.userFileTable.rangeKey(file.originalname),
      uuid: fileUuid,
      userId: httpRequest.user!.uuid!,
      bucket: process.env.BUCKET_NAME!,
      key: `uploads/${fileUuid}`,
      contentType: file.mimetype,
      contentLength: file.size,
      filename: file.originalname,
    };

    try {
      await this.userFileTable.put(userFile).exec();
    } catch (e) {
      throw new HttpError(400, {
        error: e,
        message: 'Unable to insert tracking record',
      });
    }

    const uploaded = await this.s3.send(
      new PutObjectCommand({
        Bucket: userFile.bucket,
        Key: userFile.key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ContentLength: file.size,
      }),
    );

    const updated = await this.userFileTable
      .update(userFile.hashKey, userFile.rangeKey)
      .set('etag', uploaded.ETag)
      .set('version', uploaded.VersionId)
      .return('ALL_NEW')
      .exec();

    if (!updated.Attributes) {
      throw new HttpError(500, { message: 'Unable to update tracking record' });
    }

    return updated.Attributes;
  }

  @Get('{uuid}')
  @Security('jwt')
  public async download(
    @Request() httpRequest: EnrichedRequest,
    @Path('uuid') fileUuid: string,
    @Res() res: TsoaResponse<302, UserFileSchema, { location: string }>,
  ): Promise<UserFileSchema> {
    const result = await this.userFileTable
      .query()
      .keyCondition((cn) => cn.eq('uuid', fileUuid))
      .filter((cn) =>
        cn.eq('hashKey', this.userFileTable.hashKey(httpRequest.user!.uuid!)),
      )
      .exec({ IndexName: 'uuid-index' });

    if (!result.Count || !result.Items || result.Items.length !== 1) {
      throw new HttpError(404);
    }

    const [userFile] = result.Items;

    userFile.url = await getSignedUrl(
      this.s3,
      new GetObjectCommand({
        Bucket: userFile.bucket,
        Key: userFile.key,
        ResponseContentDisposition: `attachment; filename="${userFile.filename}"`,
        ResponseContentType: userFile.contentType,
      }),
      { expiresIn: 3600 },
    );

    return res(302, userFile, {
      location: userFile.url,
    });
  }
}
