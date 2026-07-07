import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey, type JWTPayload } from "jose";
import type { AuthUser } from "@auracle/shared";

const DEFAULT_SUPABASE_AUDIENCE = "authenticated";

export interface SupabaseAuthStoreOptions {
  supabaseUrl?: string;
  jwtSecret?: string;
  jwksUrl?: string;
  issuer?: string;
  audience?: string;
}

export class AuthConfigurationError extends Error {
  constructor() {
    super("Supabase auth is not configured");
  }
}

interface SupabaseClaims extends JWTPayload {
  sub: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function defaultIssuer(supabaseUrl: string | undefined): string | undefined {
  return supabaseUrl ? `${trimTrailingSlash(supabaseUrl)}/auth/v1` : undefined;
}

function defaultJwksUrl(supabaseUrl: string | undefined): string | undefined {
  return supabaseUrl ? `${trimTrailingSlash(supabaseUrl)}/auth/v1/.well-known/jwks.json` : undefined;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function profileName(claims: SupabaseClaims): string {
  const metadata = claims.user_metadata ?? {};
  const name =
    (isString(metadata.name) && metadata.name) ||
    (isString(metadata.full_name) && metadata.full_name) ||
    (isString(metadata.user_name) && metadata.user_name) ||
    (isString(metadata.preferred_username) && metadata.preferred_username);
  if (name) return name.trim();

  const email = claims.email?.trim();
  return email?.split("@")[0] || "Listener";
}

function providerName(claims: SupabaseClaims): string | undefined {
  const provider = claims.app_metadata?.provider;
  return isString(provider) ? provider : undefined;
}

function hasSubject(payload: JWTPayload): payload is SupabaseClaims {
  return isString(payload.sub);
}

/**
 * Supabase Auth owns credentials, OAuth, token lifecycle, and the user profile
 * itself. This store only verifies Supabase access tokens — it keeps no local
 * copy of the profile.
 */
export class AuthStore {
  private readonly verificationKey: Uint8Array | JWTVerifyGetKey | undefined;
  private readonly issuer: string | undefined;
  private readonly audience: string | undefined;

  constructor(options: SupabaseAuthStoreOptions = {}) {
    this.issuer = options.issuer ?? defaultIssuer(options.supabaseUrl);
    this.audience = options.audience ?? DEFAULT_SUPABASE_AUDIENCE;
    const secret = options.jwtSecret?.trim();
    const jwksUrl = options.jwksUrl ?? defaultJwksUrl(options.supabaseUrl);
    if (secret) {
      this.verificationKey = new TextEncoder().encode(secret);
    } else if (jwksUrl) {
      this.verificationKey = createRemoteJWKSet(new URL(jwksUrl));
    }
  }

  async getUserByToken(token: string | undefined): Promise<AuthUser | undefined> {
    if (!token) return undefined;
    if (!this.verificationKey) throw new AuthConfigurationError();

    try {
      const verifyOptions = {
        ...(this.issuer ? { issuer: this.issuer } : {}),
        ...(this.audience ? { audience: this.audience } : {}),
      };
      const { payload } =
        typeof this.verificationKey === "function"
          ? await jwtVerify(token, this.verificationKey, verifyOptions)
          : await jwtVerify(token, this.verificationKey, verifyOptions);
      if (!hasSubject(payload)) return undefined;
      return {
        id: payload.sub,
        email: payload.email?.trim().toLowerCase() || `${payload.sub}@supabase.local`,
        name: profileName(payload),
        provider: providerName(payload),
      };
    } catch {
      return undefined;
    }
  }
}
