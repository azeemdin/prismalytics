import { UserRole } from '../../database/entities';

export interface JwtPayload {
  sub: string;       // user id
  email: string;
  role: UserRole;
  tenantId: string;
  iat?: number;
  exp?: number;
}
