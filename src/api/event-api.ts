import {
  DynamoDBStreamEvent,
  EventBridgeEvent,
  S3Event,
  SNSEvent,
  SQSEvent,
} from 'aws-lambda';
import { Body, Controller, Header, Hidden, Post, Route, Tags } from 'tsoa';
import { UserIdentityTable } from './db/user-identity';
import { HttpError } from './internal/errors';

@Route('/api/event')
@Tags('Events')
@Hidden()
export class EventApi extends Controller {
  userIdentityTable: UserIdentityTable;

  constructor() {
    super();
    this.userIdentityTable = new UserIdentityTable();
  }

  @Post('/dynamodb')
  public async dynamoDbEvent(
    @Header('Host') host: string,
    @Body() body: unknown,
  ): Promise<void> {
    if (host !== 'dynamodb.amazonaws.com') {
      throw new HttpError(403);
    }

    const event = body as DynamoDBStreamEvent;

    // There could be any types of updates from the stream
    // Iterate over each record and handle it appropriately
    await event.Records.reduce(async (accP, record) => {
      const acc = await accP;

      const { eventName } = record!;
      const { NewImage } = record.dynamodb!;

      const userIdentity = this.userIdentityTable.isRecord(NewImage);
      if (eventName === 'INSERT' && userIdentity && userIdentity.email) {
        console.log(`A new user signed up! ${userIdentity.email}`);
      }

      return acc;
    }, Promise.resolve());
  }

  @Post('/sqs')
  public async sqsEvent(
    @Header('Host') host: string,
    @Body() body: unknown,
  ): Promise<void> {
    if (host !== 'sqs.amazonaws.com') {
      throw new HttpError(403);
    }

    const event = body as SQSEvent;

    console.log('SQS Records: ', event.Records);
  }

  @Post('/sns')
  public async snsEvent(
    @Header('Host') host: string,
    @Body() body: unknown,
  ): Promise<void> {
    if (host !== 'sns.amazonaws.com') {
      throw new HttpError(403);
    }

    const event = body as SNSEvent;

    console.log('SNS Records: ', event.Records);
  }

  @Post('/eventbridge')
  public async eventbridgeEvent(
    @Header('Host') host: string,
    @Body() body: unknown,
  ): Promise<void> {
    if (host !== 'events.amazonaws.com') {
      throw new HttpError(403);
    }

    const event = body as EventBridgeEvent<'Scheduled Event', unknown>;

    console.log('Received Scheduled Event: ', event);
  }

  @Post('/s3')
  public async s3Event(
    @Header('Host') host: string,
    @Body() body: unknown,
  ): Promise<void> {
    if (host !== 's3.amazonaws.com') {
      throw new HttpError(403);
    }

    const event = body as S3Event;

    console.log('Received S3 Event: ', event.Records);
  }
}
