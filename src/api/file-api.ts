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
import { createHash } from 'crypto';
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

function hexdump(buffer: Buffer): string {
  const lines = [];

  for (let i = 0; i < buffer.length; i += 16) {
    const address = i.toString(16).padStart(8, '0'); // address
    const block = buffer.slice(i, i + 16); // cut buffer into blocks of 16
    const hexArray = [];
    const asciiArray = [];
    let padding = '';

    // eslint-disable-next-line no-restricted-syntax
    for (const value of block) {
      hexArray.push(value.toString(16).padStart(2, '0'));
      asciiArray.push(
        value >= 0x20 && value < 0x7f ? String.fromCharCode(value) : '.',
      );
    }

    // if block is less than 16 bytes, calculate remaining space
    if (hexArray.length < 16) {
      const space = 16 - hexArray.length;
      padding = ' '.repeat(space * 2 + space + (hexArray.length < 9 ? 1 : 0)); // calculate extra space if 8 or less
    }

    const hexString =
      hexArray.length > 8
        ? `${hexArray.slice(0, 8).join(' ')}  ${hexArray.slice(8).join(' ')}`
        : hexArray.join(' ');

    const asciiString = asciiArray.join('');
    const line = `${address}  ${hexString}  ${padding}|${asciiString}|`;

    lines.push(line);

    if (lines.length > 5) {
      lines.push('....TRUNCATED....');
      break;
    }
  }

  return lines.join('\n');
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
  // @Security('jwt')
  public async upload(
    @Request() httpRequest: EnrichedRequest,
    @UploadedFile() file: File,
  ): Promise<UserFileSchema> {
    console.log('!!!! currentInvoke', getCurrentInvoke());
    console.log('!!! uploading file', file);
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

    console.log('!!! hexdump', hexdump(file.buffer));

    const shasum = createHash('sha256').update(file.buffer).digest('hex');
    console.log('!!! shasum', shasum);

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

    if (!updated.Attributes) {
      throw new HttpError(500, { message: 'Unable to update tracking record' });
    }

    return updated.Attributes;
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
        // ResponseContentDisposition: `attachment; filename="${userFile.filename}"`,
        ResponseContentType: userFile.contentType,
      }),
      { expiresIn: 3600 },
    );

    // TODO: Update localhost url to codespaces URL

    if (redirect) {
      return res(302, userFile, {
        location: userFile.url,
      });
    }

    return res(200, userFile);
  }
}
