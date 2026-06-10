import {
  Controller,
  Post,
  Put,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Get,
  Query,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto, RefreshTokenDto, KeycloakExchangeDto } from './dto/login.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { User } from '../../database/entities';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('local'))
  @ApiOperation({ summary: 'Login with email and password' })
  async login(@Request() req: { user: User }) {
    return this.authService.login(req.user);
  }

  @Public()
  @Get('registration-enabled')
  @ApiOperation({ summary: 'Check whether public registration is currently enabled' })
  async registrationEnabled() {
    return { enabled: await this.authService.isRegistrationEnabled() };
  }

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a new user account' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout and invalidate refresh token' })
  async logout(@CurrentUser() user: User) {
    await this.authService.logout(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current authenticated user' })
  async me(@CurrentUser() user: User) {
    return this.authService.sanitizeUser(user);
  }

  // â”€â”€â”€ Keycloak OIDC â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  @Public()
  @Get('keycloak/url')
  @ApiOperation({ summary: 'Get Keycloak authorization URL (returns 503 if not configured)' })
  async keycloakUrl() {
    const url = await this.authService.getKeycloakAuthUrl();
    return { url };
  }

  @Public()
  @Post('keycloak/exchange')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange Keycloak authorization code for prismalytics JWT pair' })
  async keycloakExchange(@Body() dto: KeycloakExchangeDto) {
    return this.authService.exchangeKeycloakCode(dto.code, dto.state);
  }

  @UseGuards(JwtAuthGuard)
  @Get('keycloak/logout-url')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get Keycloak RP-initiated logout URL' })
  async keycloakLogoutUrl(@Query('post_logout_redirect_uri') redirectUri: string) {
    const url = await this.authService.getKeycloakLogoutUrl(redirectUri ?? '');
    return { url };
  }

  @UseGuards(JwtAuthGuard)
  @Get('keycloak/config')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get Keycloak configuration (admin only)' })
  async getKeycloakConfig(@CurrentUser() user: User) {
    if (user.role !== 'admin') throw new ForbiddenException();
    return this.authService.getKeycloakConfig();
  }

  @UseGuards(JwtAuthGuard)
  @Put('keycloak/config')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Save Keycloak configuration (admin only)' })
  async saveKeycloakConfig(
    @CurrentUser() user: User,
    @Body() dto: { url: string; realm: string; clientId: string; clientSecret?: string; redirectUri: string; tlsSkipVerify?: boolean },
  ) {
    if (user.role !== 'admin') throw new ForbiddenException();
    await this.authService.saveKeycloakConfig(dto);
  }
}
