import { JWK, JWKS, JWKECKey, JWT } from 'jose';
import Cookies from 'cookies';
import { v1 as uuid } from 'uuid';
import { UserIdentitySchema } from '../db/user-identity';
import SecretService from './aws/SecretService';

export const ACCESS_COOKIE = '__Secure-access';
export const REFRESH_COOKIE = '__Secure-refresh';

export type UserIdentity = UserIdentitySchema & {
  token?: string;
};

export type EnrichedRequest = Request & {
  baseUrl: string;
  authUrl: string;
  apiUrl: string;
  openApiUrl: string;
  openApiDocsUrl: string;
  user?: UserIdentity;
  setCookies?: string[];
};

export type JwkStore = 'current' | 'next';

export const JWKS_STORE_NAME = 'jwks';
export const JWKS_CURRENT: JwkStore = 'current';
export const JWKS_NEXT: JwkStore = 'next';

export type Jwk = {
  kty: 'EC';
  crv: 'P-256';
  y: string;
  d?: string;
};

export type PemJwk = {
  pem: string;
  jwk: Jwk;
};

export type GeneratedKeys = {
  // issuer: string;
  publicKey: PemJwk;
  privateKey: PemJwk;
};

export type JwtPayload = {
  aud: string;
  sub: string;
  iat: number;
  exp: number;
  iss: string;
  jti: string;
};

export type Jwt = {
  token: string;
  tokenPayload: JwtPayload;
  tokenCookie: string;
  refreshToken: string;
  refreshCookie: string;
};

export class JwtService {
  secretService: SecretService;

  constructor() {
    this.secretService = new SecretService();
  }

  getPublicKeys = async (): Promise<Jwk[]> => {
    const jwks = await this.getOrCreateKeys();
    return jwks.map((jwk) => jwk.publicKey.jwk);
  };

  public createJwt = async (
    request: EnrichedRequest,
    user: UserIdentitySchema,
    remember = false,
  ): Promise<Jwt> => {
    const iat = Math.floor(new Date().getTime() / 1000);

    const payload: JwtPayload = {
      aud: request.baseUrl,
      sub: user.uuid!,
      iat,
      exp: iat + 3600,
      iss: request.authUrl,
      jti: uuid(),
    };

    const { token, cookie: tokenCookie } = await this.createToken(
      payload,
      ACCESS_COOKIE,
      JWKS_CURRENT,
      remember,
    );

    // Same payload with a longer expiration and different scope
    const { token: refreshToken, cookie: refreshCookie } =
      await this.createToken(
        { ...payload, exp: payload.iat + 31536000 },
        REFRESH_COOKIE,
        JWKS_NEXT,
        remember,
      );

    return {
      token,
      tokenPayload: payload,
      tokenCookie,
      refreshToken,
      refreshCookie,
    };
  };

  createToken = async (
    payload: JwtPayload,
    cookieName: string,
    jwkStore: JwkStore = 'current',
    remember = false,
  ): Promise<{ token: string; cookie: string }> => {
    const keys = await this.getOrCreateKeys();

    // Use the second key to sign in case the keys to be rotated
    const key = JWK.asKey(
      keys[jwkStore === 'next' ? 1 : 0].privateKey.jwk as JWKECKey,
    );

    const token = JWT.sign(payload, key, {
      header: {
        typ: 'JWT',
      },
    });

    const domain = new URL(payload.iss).hostname;

    const cookie = new Cookies.Cookie(encodeURIComponent(cookieName), token, {
      domain,
      expires: remember ? new Date(payload.exp * 1000) : new Date(0),
      overwrite: true,
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      secure: true,
    });

    return { token, cookie: cookie.toHeader() };
  };

  public verifyJwt = async (
    request: EnrichedRequest,
    token?: string,
  ): Promise<JwtPayload | undefined> => {
    if (!token) {
      return undefined;
    }

    try {
      JWT.decode(token) as JwtPayload;
    } catch (e) {
      return undefined;
    }

    const keys = await this.getOrCreateKeys();
    const jwks = new JWKS.KeyStore(
      keys.map((key) => JWK.asKey(key.privateKey.jwk as JWKECKey)),
    );

    let verified: JwtPayload | undefined;
    try {
      verified = JWT.verify(token, jwks, {
        audience: request.baseUrl,
        issuer: request.authUrl,
      }) as JwtPayload;
    } catch (e) {
      return undefined;
    }

    return verified;
  };

  private getOrCreateKeys = async (): Promise<GeneratedKeys[]> => {
    let current = await this.secretService.getSecret(
      JWKS_STORE_NAME,
      JWKS_CURRENT,
    );
    let next = await this.secretService.getSecret(JWKS_STORE_NAME, JWKS_NEXT);

    if (!current) {
      const generatedKeys = this.generateKeys();

      current = await this.secretService.setSecret(
        JWKS_STORE_NAME,
        JWKS_CURRENT,
        Buffer.from(JSON.stringify(generatedKeys), 'utf8').toString('base64'),
      );

      if (!current) {
        throw new Error('Unable to create current JWKS');
      }
    }

    if (!next) {
      const generatedKeys = this.generateKeys();

      next = await this.secretService.setSecret(
        JWKS_STORE_NAME,
        JWKS_NEXT,
        Buffer.from(JSON.stringify(generatedKeys), 'utf8').toString('base64'),
      );

      if (!next) {
        throw new Error('Unable to create next JWKS');
      }
    }

    const currentKey = JSON.parse(
      Buffer.from(current, 'base64').toString('utf8'),
    );
    const nextKey = JSON.parse(Buffer.from(next, 'base64').toString('utf8'));

    return [currentKey, nextKey];
  };

  private generateKeys = (): // issuer: string
  GeneratedKeys => {
    const kid = uuid();
    const key = JWK.generateSync('EC', 'P-256', { use: 'sig', kid }, true);

    return {
      // issuer,
      publicKey: {
        pem: key.toPEM(false),
        jwk: key.toJWK(false) as Jwk,
      },
      privateKey: {
        pem: key.toPEM(true),
        jwk: key.toJWK(true) as Jwk,
      },
    };
  };
}
