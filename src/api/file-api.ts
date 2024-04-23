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
  Query,
} from 'tsoa';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import mime from 'mime-types';
import { getCurrentInvoke } from '@codegenie/serverless-express';
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
    const invoke = getCurrentInvoke();
    console.log('!!! event', JSON.stringify(invoke.event, null, 2));
    console.log('!!! context', JSON.stringify(invoke.context, null, 2));

    const uuid = uuidv4();
    const userFile: UserFileSchema = {
      hashKey: this.userFileTable.hashKey(httpRequest.user?.uuid || 'foo'),
      rangeKey: this.userFileTable.rangeKey(uuid),
      uuid,
      userId: httpRequest.user?.uuid || 'foo',
      bucket: process.env.BUCKET_NAME!,
      key: `uploads/${uuid}`,
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
      .set('version', uploaded.VersionId)
      .return('ALL_NEW')
      .exec();

    return updated.Attributes!;
  }

  @Get('{uuid}')
  @Security('jwt')
  public async download(
    @Request() httpRequest: EnrichedRequest,
    @Path('uuid') uuid: string,
    @Res() res: TsoaResponse<200 | 302, UserFileSchema, { location?: string }>,
    @Query() redirect = true,
  ): Promise<UserFileSchema> {
    const result = await this.userFileTable
      .query()
      .keyCondition((cn) => cn.eq('uuid', uuid))
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
        ResponseContentDisposition: `attachment; filename="${userFile.uuid}.${mime.extension(userFile.contentType)}"`,
        ResponseContentType: userFile.contentType,
      }),
      { expiresIn: 3600 },
    );

    if (redirect) {
      return res(302, userFile, { location: userFile.url });
    }

    return res(200, userFile);
  }
}
