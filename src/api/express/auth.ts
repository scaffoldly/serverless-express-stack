import { NextFunction, Request, Response, Handler } from 'express';
import Cookies from 'cookies';
import {
  ACCESS_COOKIE,
  EnrichedRequest,
  JwtPayload,
  JwtService,
  REFRESH_COOKIE,
  UserIdentity,
} from '../services/JwtService';
import { HttpError } from '../internal/errors';
import { UserIdentitySchema, UserIdentityTable } from '../db/user-identity';

// Cache in the global scope to speed up subsequent invocations
const userIdentityCache: {
  [sub: string]: { value: UserIdentitySchema; expires: number };
} = {};

export const generateJwt = async (
  request: EnrichedRequest,
  user: UserIdentitySchema,
  remember: boolean = false,
): Promise<{
  newToken: string;
  newPayload: JwtPayload;
  newRefreshToken: string;
  newSetCookies?: string[];
}> => {
  const jwtService = new JwtService();

  const { token, tokenPayload, tokenCookie, refreshToken, refreshCookie } =
    await jwtService.createJwt(request, user, remember);

  return {
    newToken: token,
    newPayload: tokenPayload,
    newRefreshToken: refreshToken,
    newSetCookies: [tokenCookie, refreshCookie],
  };
};

export async function expressAuthentication(
  req: Request,
  securityName: string,
  // eslint-disable-next-line no-unused-vars, @typescript-eslint/no-unused-vars
  _scopes?: string[],
): Promise<UserIdentity> {
  const request = req as unknown as EnrichedRequest;

  const jwtService = new JwtService();
  const userIdentityTable = new UserIdentityTable();

  if (securityName !== 'jwt') {
    throw new HttpError(403);
  }

  let token: string | undefined;

  if (req.headers.authorization) {
    const [scheme, auth] = req.headers.authorization.split(' ');

    if (scheme !== 'Bearer' || !auth) {
      throw new HttpError(403);
    }

    token = auth;
  }

  const cookies = req.cookies as Cookies;

  if (!token && cookies && cookies.get(ACCESS_COOKIE)) {
    token = cookies.get(ACCESS_COOKIE);
  }

  if (!token) {
    throw new HttpError(401);
  }

  const tokenPayload = await jwtService.verifyJwt(request, token);

  if (!tokenPayload) {
    throw new HttpError(401);
  }

  const sub = tokenPayload && tokenPayload.sub;

  if (!sub) {
    throw new HttpError(401);
  }

  let userIdentity: UserIdentitySchema | undefined;

  if (
    tokenPayload &&
    userIdentityCache[sub] &&
    userIdentityCache[sub].expires < tokenPayload.exp
  ) {
    userIdentity = userIdentityCache[sub].value;
  } else {
    delete userIdentityCache[sub];
  }

  if (!userIdentity) {
    const result = await userIdentityTable
      .query()
      .keyCondition((cn) => cn.eq('uuid', sub))
      .exec({ IndexName: 'uuid-index' });

    if (result.Count && result.Items && result.Items.length === 1) {
      [userIdentity] = result.Items;
    }
  }

  if (!userIdentity) {
    throw new HttpError(401);
  }

  userIdentityCache[sub] = {
    value: userIdentity,
    expires: tokenPayload.exp,
  };

  return {
    ...userIdentity,
    token,
  };
}

export function requestEnricher() {
  return (
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Response | void => {
    const serviceName = process.env.SERVICE_NAME!;
    const scheme =
      req.headers['x-forwarded-proto'] || req.headers['x-scheme'] || 'http';
    const host =
      req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
    const baseUrl = `${scheme}://${host}`;
    const apiUrl = `${baseUrl}/api`;

    (req as unknown as EnrichedRequest).serviceName = serviceName;
    (req as unknown as EnrichedRequest).baseUrl = baseUrl;
    (req as unknown as EnrichedRequest).apiUrl = apiUrl;
    (req as unknown as EnrichedRequest).authUrl = `${apiUrl}/auth`;
    (req as unknown as EnrichedRequest).openApiUrl = `${apiUrl}/openapi.json`;
    (req as unknown as EnrichedRequest).openApiDocsUrl =
      `${apiUrl}/swagger.html`;

    next();
  };
}

export function cookieHandler(): Handler {
  return Cookies.express([ACCESS_COOKIE, REFRESH_COOKIE]);
}

export function refreshHandler() {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<Response | void> => {
    const request = req as unknown as EnrichedRequest;

    const jwtService = new JwtService();
    const userIdentityTable = new UserIdentityTable();

    let token: string | undefined;
    let refreshToken: string | undefined;

    const cookies = req.cookies as Cookies;

    if (cookies && cookies.get(ACCESS_COOKIE)) {
      token = cookies.get(ACCESS_COOKIE);
    }

    if (cookies && cookies.get(REFRESH_COOKIE)) {
      refreshToken = cookies.get(REFRESH_COOKIE);
    }

    if (!refreshToken) {
      next();
      return;
    }

    if (await jwtService.verifyJwt(request, token)) {
      // Valid access token, no need to refresh
      next();
      return;
    }

    const refreshPayload = await jwtService.verifyJwt(request, refreshToken);

    if (!refreshPayload) {
      next();
      return;
    }

    const sub = refreshPayload && refreshPayload.sub;

    if (!sub) {
      next();
      return;
    }

    const result = await userIdentityTable
      .query()
      .keyCondition((cn) => cn.eq('uuid', sub))
      .exec({ IndexName: 'uuid-index' });

    if (!result.Count || !result.Items || result.Items.length !== 1) {
      next();
      return;
    }

    const [user] = result.Items;

    const { newToken, newRefreshToken, newSetCookies } = await generateJwt(
      request,
      user,
      true,
    );

    if (newSetCookies) {
      // Override the headers with the new tokens
      req.headers.cookie = `${ACCESS_COOKIE}=${newToken}; ${REFRESH_COOKIE}=${newRefreshToken}; ${
        req.headers.cookie || ''
      }`;
      res.setHeader('set-cookie', newSetCookies);
    }

    Cookies.express([ACCESS_COOKIE, REFRESH_COOKIE])(req, res, next);
  };
}
