import { Jwk } from '../api/services/JwtService';

export type EmptyResponse = void;

export type JwksResponse = {
  keys: Jwk[];
};

export type HealthResponse = {
  name: string;
  version: string;
  now: Date;
  hrefs: {
    api: string;
    openApi: string;
    openApiDocs: string;
  };
  env: { [key: string]: string | undefined };
};

export type LoginResponse = {
  uuid: string;
  email: string;
  token?: string;
};
