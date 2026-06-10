import {
  Injectable,
  Logger,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as https from 'https';
import * as http from 'http';
import { User, UserRole, AuthProvider, Tenant } from '../../database/entities';
import { JwtPayload } from '../../common/interfaces/jwt-payload.interface';
import { RegisterDto } from './dto/login.dto';
import { AuditService } from '../audit/audit.service';
import { SystemConfigService } from '../system-config/system-config.service';
import { encryptValue, decryptValue } from '../../common/utils/crypto.util';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  // In-memory state store for OIDC state param (single-process; sufficient for MVP)
  private readonly keycloakStates = new Map<string, number>(); // state â†’ expiry timestamp

  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Tenant) private tenantRepo: Repository<Tenant>,
    private jwtService: JwtService,
    private config: ConfigService,
    private readonly auditService: AuditService,
    private readonly sysConfig: SystemConfigService,
  ) {}

  // â”€â”€â”€ Local auth â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async validateLocalUser(email: string, password: string): Promise<User | null> {
    const user = await this.userRepo
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.email = :email AND u.isActive = true', { email })
      .getOne();

    if (!user || !user.passwordHash) return null;

    const valid = await bcrypt.compare(password, user.passwordHash);
    return valid ? user : null;
  }

  async login(user: User) {
    const tokens = await this.generateTokens(user);
    await this.saveRefreshTokenHash(user.id, tokens.refreshToken);
    await this.userRepo.update(user.id, { lastLoginAt: new Date() });
    void this.auditService.log({
      tenantId: user.tenantId,
      userId: user.id,
      userName: user.name,
      action: 'login',
      resource: 'user',
      resourceId: user.id,
      resourceName: user.name,
    });
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: this.sanitizeUser(user),
    };
  }

  async isRegistrationEnabled(): Promise<boolean> {
    // Always allow if no users exist yet (admin bootstrap)
    const totalUsers = await this.userRepo.count();
    if (totalUsers === 0) return true;
    const val = await this.sysConfig.get('auth.registration.enabled');
    return val !== 'false';
  }

  async register(dto: RegisterDto) {
    if (!(await this.isRegistrationEnabled())) {
      throw new ForbiddenException('New user registration is disabled');
    }

    const existing = await this.userRepo.findOne({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const tenant = await this.getOrCreateDefaultTenant();

    const userCount = await this.userRepo.count({ where: { tenantId: tenant.id } });
    const role = userCount === 0 ? UserRole.ADMIN : UserRole.VIEWER;

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = this.userRepo.create({
      name: dto.name,
      email: dto.email,
      passwordHash,
      role,
      provider: AuthProvider.LOCAL,
      tenantId: tenant.id,
    });
    await this.userRepo.save(user);

    const tokens = await this.generateTokens(user);
    await this.saveRefreshTokenHash(user.id, tokens.refreshToken);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: this.sanitizeUser(user),
    };
  }

  async refreshToken(rawRefreshToken: string) {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(rawRefreshToken, {
        secret: this.config.getOrThrow('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.userRepo
      .createQueryBuilder('u')
      .addSelect('u.refreshTokenHash')
      .where('u.id = :id AND u.isActive = true', { id: payload.sub })
      .getOne();

    if (!user || !user.refreshTokenHash) throw new UnauthorizedException('Session expired');

    const valid = await bcrypt.compare(rawRefreshToken, user.refreshTokenHash);
    if (!valid) throw new BadRequestException('Refresh token mismatch');

    const tokens = await this.generateTokens(user);
    await this.saveRefreshTokenHash(user.id, tokens.refreshToken);
    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  }

  async logout(userId: string) {
    await this.userRepo.update(userId, { refreshTokenHash: undefined });
  }

  // â”€â”€â”€ Keycloak OIDC â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private async resolveKeycloakSettings(): Promise<{
    url: string;
    realm: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    tlsSkipVerify: boolean;
  }> {
    const cfg = await this.sysConfig.getMany([
      'keycloak.url',
      'keycloak.realm',
      'keycloak.clientId',
      'keycloak.clientSecret',
      'keycloak.redirectUri',
      'keycloak.tlsSkipVerify',
    ]);
    return {
      url:           cfg['keycloak.url']          ?? this.config.get<string>('KEYCLOAK_URL', ''),
      realm:         cfg['keycloak.realm']         ?? this.config.get<string>('KEYCLOAK_REALM', 'prismalytics'),
      clientId:      cfg['keycloak.clientId']      ?? this.config.get<string>('KEYCLOAK_CLIENT_ID', 'prismalytics-app'),
      clientSecret:  cfg['keycloak.clientSecret']  ? decryptValue(cfg['keycloak.clientSecret'])
                                                   : this.config.get<string>('KEYCLOAK_CLIENT_SECRET', ''),
      redirectUri:   cfg['keycloak.redirectUri']   ?? this.config.get<string>('KEYCLOAK_REDIRECT_URI', 'http://localhost:5173/auth/callback'),
      tlsSkipVerify: cfg['keycloak.tlsSkipVerify'] === 'true'
                       || this.config.get<string>('KEYCLOAK_TLS_SKIP_VERIFY') === 'true',
    };
  }

  async getKeycloakAuthUrl(): Promise<string> {
    const { url, realm, clientId, redirectUri } = await this.resolveKeycloakSettings();
    if (!url) throw new ServiceUnavailableException('Keycloak not configured');

    // Purge expired states before adding new one
    const now = Date.now();
    for (const [s, exp] of this.keycloakStates) {
      if (exp < now) this.keycloakStates.delete(s);
    }

    const state = crypto.randomUUID();
    this.keycloakStates.set(state, now + 5 * 60 * 1000);

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid profile email',
      state,
    });

    return `${url}/realms/${realm}/protocol/openid-connect/auth?${params}`;
  }

  async getKeycloakLogoutUrl(postLogoutRedirectUri: string): Promise<string | null> {
    const { url, realm, clientId } = await this.resolveKeycloakSettings();
    if (!url) return null;
    const params = new URLSearchParams({
      client_id: clientId,
      post_logout_redirect_uri: postLogoutRedirectUri,
    });
    return `${url}/realms/${realm}/protocol/openid-connect/logout?${params}`;
  }

  async getKeycloakConfig(): Promise<{
    url: string;
    realm: string;
    clientId: string;
    clientSecretSet: boolean;
    redirectUri: string;
    tlsSkipVerify: boolean;
  }> {
    const { url, realm, clientId, clientSecret, redirectUri, tlsSkipVerify } = await this.resolveKeycloakSettings();
    return { url, realm, clientId, clientSecretSet: !!clientSecret, redirectUri, tlsSkipVerify };
  }

  async saveKeycloakConfig(dto: {
    url: string;
    realm: string;
    clientId: string;
    clientSecret?: string;
    redirectUri: string;
    tlsSkipVerify?: boolean;
  }): Promise<void> {
    const entries: Record<string, string> = {
      'keycloak.url':           dto.url,
      'keycloak.realm':         dto.realm,
      'keycloak.clientId':      dto.clientId,
      'keycloak.redirectUri':   dto.redirectUri,
      'keycloak.tlsSkipVerify': dto.tlsSkipVerify ? 'true' : 'false',
    };
    if (dto.clientSecret) {
      entries['keycloak.clientSecret'] = encryptValue(dto.clientSecret);
    }
    await this.sysConfig.setMany(entries);
  }

  async exchangeKeycloakCode(code: string, state: string) {
    const expiry = this.keycloakStates.get(state);
    if (!expiry || expiry < Date.now()) {
      throw new BadRequestException('Invalid or expired OIDC state');
    }
    this.keycloakStates.delete(state);

    const { url: baseUrl, realm, clientId, clientSecret, redirectUri, tlsSkipVerify } =
      await this.resolveKeycloakSettings();
    if (!baseUrl) throw new ServiceUnavailableException('Keycloak not configured');

    const tokenUrl = `${baseUrl}/realms/${realm}/protocol/openid-connect/token`;

    const body = new URLSearchParams({
      grant_type:    'authorization_code',
      client_id:     clientId,
      client_secret: clientSecret,
      code,
      redirect_uri:  redirectUri,
    });

    if (tlsSkipVerify) {
      this.logger.warn('Keycloak TLS verification disabled not recommended for production');
    }

    const resp = await this.kcHttpPost(tokenUrl, body.toString(), tlsSkipVerify).catch(
      (err: Error & { cause?: Error }) => {
        const cause = err.cause;
        this.logger.error(
          `Keycloak token exchange failed: ${err.message}` +
          (cause ? ` cause: ${cause.message}` : '') +
          `. Token URL: ${tokenUrl}. TLS skip: ${tlsSkipVerify}`,
        );
        throw new UnauthorizedException(
          `Keycloak connection failed: ${cause?.message ?? err.message}`,
        );
      },
    );

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      this.logger.error(`Keycloak token exchange HTTP ${resp.status}: ${body}`);
      throw new UnauthorizedException(`Keycloak token exchange failed (HTTP ${resp.status})`);
    }

    const kcTokens = (await resp.json()) as { id_token: string };

    // Decode ID token claims (token came directly from Keycloak over HTTPS backchannel is trusted)
    const payloadB64 = kcTokens.id_token.split('.')[1];
    if (!payloadB64) throw new UnauthorizedException('Malformed ID token from Keycloak');
    const claims = JSON.parse(
      Buffer.from(payloadB64, 'base64').toString('utf8'),
    ) as Record<string, unknown>;

    const user = await this.upsertKeycloakUser(claims);
    const tokens = await this.generateTokens(user);
    await this.saveRefreshTokenHash(user.id, tokens.refreshToken);
    await this.userRepo.update(user.id, { lastLoginAt: new Date() });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: this.sanitizeUser(user),
    };
  }

  private resolveKeycloakRole(claims: Record<string, unknown>, fallback: UserRole): UserRole {
    const realmAccess = claims['realm_access'] as { roles?: string[] } | undefined;
    const roles: string[] = realmAccess?.roles ?? [];
    if (roles.includes('prismalytics-admin')) return UserRole.ADMIN;
    if (roles.includes('prismalytics-editor')) return UserRole.EDITOR;
    if (roles.includes('prismalytics-viewer')) return UserRole.VIEWER;
    // Fall back to Keycloak groups claim (some realms use this instead of realm_access)
    const groups = claims['groups'] as string[] | undefined;
    if (groups?.includes('/prismalytics-admin') || groups?.includes('prismalytics-admin')) return UserRole.ADMIN;
    if (groups?.includes('/prismalytics-editor') || groups?.includes('prismalytics-editor')) return UserRole.EDITOR;
    return fallback;
  }

  private async upsertKeycloakUser(claims: Record<string, unknown>) {
    const externalId = claims['sub'] as string | undefined;
    const email = claims['email'] as string | undefined;
    if (!externalId || !email) throw new UnauthorizedException('Missing sub or email claim in ID token');
    const name =
      (claims['name'] as string | undefined) ??
      (claims['preferred_username'] as string | undefined) ??
      email;

    // Look up by externalId first, then fall back to email (existing local account)
    let user =
      (await this.userRepo.findOne({
        where: { externalId, provider: AuthProvider.KEYCLOAK },
      })) ?? (await this.userRepo.findOne({ where: { email } }));

    const tenant = await this.getOrCreateDefaultTenant();

    if (!user) {
      const userCount = await this.userRepo.count({ where: { tenantId: tenant.id } });
      const role = userCount === 0
        ? UserRole.ADMIN
        : this.resolveKeycloakRole(claims, UserRole.VIEWER);
      user = this.userRepo.create({
        name,
        email,
        externalId,
        role,
        provider: AuthProvider.KEYCLOAK,
        tenantId: tenant.id,
      });
    } else {
      user.externalId = externalId;
      user.provider = AuthProvider.KEYCLOAK;
      user.name = name;
      // Sync role from Keycloak claims on every login
      const synced = this.resolveKeycloakRole(claims, user.role);
      user.role = synced;
    }

    return this.userRepo.save(user);
  }

  // â”€â”€â”€ Shared helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private async getOrCreateDefaultTenant(): Promise<Tenant> {
    let tenant = await this.tenantRepo.findOne({ where: { slug: 'default' } });
    if (!tenant) {
      tenant = this.tenantRepo.create({ slug: 'default', name: 'Default Organization' });
      await this.tenantRepo.save(tenant);
    }
    return tenant;
  }

  private async generateTokens(user: User) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        expiresIn: this.config.get('JWT_EXPIRATION', '15m'),
      }),
      this.jwtService.signAsync(payload, {
        expiresIn: this.config.get('JWT_REFRESH_EXPIRATION', '7d'),
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private async saveRefreshTokenHash(userId: string, token: string) {
    const hash = await bcrypt.hash(token, 10);
    await this.userRepo.update(userId, { refreshTokenHash: hash });
  }

  sanitizeUser(user: User) {
    const { passwordHash: _p, refreshTokenHash: _r, ...safe } = user as User & {
      passwordHash?: string;
      refreshTokenHash?: string;
    };
    return safe;
  }

  private kcHttpPost(
    url: string,
    body: string,
    tlsSkipVerify: boolean,
  ): Promise<{ ok: boolean; status: number; text(): Promise<string>; json(): Promise<unknown> }> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const isHttps = parsed.protocol === 'https:';
      const lib = isHttps ? https : http;
      const options: https.RequestOptions = {
        hostname: parsed.hostname,
        port: parsed.port ? Number(parsed.port) : (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
        rejectUnauthorized: isHttps ? !tlsSkipVerify : undefined,
      };

      const req = lib.request(options, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          resolve({
            ok: (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300,
            status: res.statusCode ?? 0,
            text: () => Promise.resolve(raw),
            json: () => Promise.resolve(JSON.parse(raw) as unknown),
          });
        });
        res.on('error', reject);
      });

      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }
}
