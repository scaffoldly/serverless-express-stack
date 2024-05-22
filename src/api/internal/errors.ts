import packageJson from '../../../package.json';

export type ErrorContext = {
  traceId: string;
  version: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error?: any;
  message?: string;
};

export type StatusCode = 400 | 401 | 403 | 404 | 422 | 429 | 500 | 503 | 504;

export type ErrorResponse = {
  status: number;
  context: ErrorContext;
  name: string;
  message: string;
};

export class HttpError extends Error {
  public readonly context: ErrorContext;

  constructor(
    public readonly status: StatusCode | number,
    context: Partial<ErrorContext> = {},
  ) {
    super();
    this.name = 'HttpError';

    this.context = {
      traceId: process.env.XRAY_ENV_TRACE_ID || 'Unknown-Trace-Id',
      version: packageJson.version,
      ...context,
    };

    if (
      !this.context.message &&
      this.context.error &&
      this.context.error.message &&
      typeof this.context.error.message === 'string'
    ) {
      this.context.message = this.context.error.message;
    }

    switch (status) {
      case 400:
        this.message = 'Bad Request';
        break;
      case 401:
        this.message = 'Unauthorized';
        break;
      case 403:
        this.message = 'Forbidden';
        break;
      case 404:
        this.message = 'Not Found';
        break;
      case 422:
        this.message = 'Unprocessable Content';
        break;
      case 429:
        this.message = 'Too Many Requests';
        break;
      case 500:
        this.message = 'Internal Server Error';
        break;
      case 503:
        this.message = 'Service Unavailable';
        break;
      case 504:
        this.message = 'Gateway Timeout';
        break;
      default:
        this.message = context.message || 'Unknown';
    }
  }

  toResponse(): ErrorResponse {
    return {
      context: this.context,
      message: this.message,
      name: this.name,
      status: this.status,
    };
  }
}
