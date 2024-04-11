import express from 'express';
import morganBody from 'morgan-body';
import { configure } from '@codegenie/serverless-express';
import { RegisterRoutes } from './api/express/routes';
import errorHandler from './api/express/errors';
import { corsHandler } from './api/express/cors';
import {
  requestEnricher,
  refreshHandler,
  cookieHandler,
} from './api/express/auth';
import { docsHandler } from './api/express/docs';
import { webHandler } from './web/express';

const app = express();

morganBody(app, {
  noColors: true,
  immediateReqLog: true,
  prettify: true,
  logAllReqHeader: false,
  logRequestBody: false,
});

app.disable('x-powered-by');
app.set('json spaces', 2);

app.use(express.json({ limit: 5242880 }));
app.use(corsHandler({ withCredentials: true }));
app.use(cookieHandler());
app.use(requestEnricher());
app.use(refreshHandler());
app.use(docsHandler());
app.use(webHandler());

RegisterRoutes(app);
app.use(errorHandler());

export const handler = configure({
  app,
  eventSourceRoutes: {
    AWS_DYNAMODB: '/api/event/dynamodb',
    AWS_SQS: '/api/event/sqs',
    AWS_SNS: '/api/event/sns',
    AWS_EVENTBRIDGE: '/api/event/eventbridge',
    AWS_S3: '/api/event/s3',
  },
});
