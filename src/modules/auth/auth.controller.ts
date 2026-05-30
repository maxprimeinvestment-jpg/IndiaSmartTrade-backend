import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { SignupDto } from './dto/signup.dto';
import {
  ForgotPasswordDto,
  ResetPasswordDto,
  VerifySignupOtpDto,
} from './dto/otp.dto';
import type { AuthenticatedUser } from './types/authenticated-user';

function ctxFromReq(req: Request) {
  return {
    userAgent: req.headers['user-agent'] ?? undefined,
    ip: req.ip ?? undefined,
  };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('signup/request-otp')
  @ApiOperation({
    summary:
      'Signup step 1. With AUTH_OTP_ENABLED=true (default), sends a 6-digit OTP and defers account creation. With AUTH_OTP_ENABLED=false, creates the account immediately and returns tokens.',
  })
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  requestSignupOtp(@Body() dto: SignupDto, @Req() req: Request) {
    return this.auth.requestSignupOtp(dto, ctxFromReq(req));
  }

  @Post('signup/verify-otp')
  @ApiOperation({
    summary: 'Step 2 of signup — verifies the OTP and creates the account.',
  })
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verifySignupOtp(@Body() dto: VerifySignupOtpDto, @Req() req: Request) {
    return this.auth.verifySignupOtp(dto.email, dto.otp, ctxFromReq(req));
  }

  @Post('password/forgot')
  @ApiOperation({
    summary: 'Step 1 of password reset — sends an OTP to the email if it exists.',
  })
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.requestPasswordReset(dto.email);
  }

  @Post('password/reset')
  @ApiOperation({
    summary: 'Step 2 of password reset — verifies the OTP and sets the new password.',
  })
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.email, dto.otp, dto.newPassword);
  }

  @Post('login')
  @ApiOperation({ summary: 'Email + password login' })
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto, ctxFromReq(req));
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Rotate the access token using a refresh token' })
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    return this.auth.refresh(dto.refreshToken, ctxFromReq(req));
  }

  @Post('logout')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke the current session' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async logout(@CurrentUser() user: AuthenticatedUser) {
    await this.auth.logout(user.sessionId);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the current authenticated user' })
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.me(user.id);
  }
}
