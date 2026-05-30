import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

type SendArgs = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

/**
 * Email delivery via Resend (https://resend.com).
 *
 * - Production (NODE_ENV=production): Resend errors throw and surface to the caller.
 * - Development: if RESEND_API_KEY is unset OR Resend rejects the message (e.g.
 *   the `onboarding@resend.dev` test sender refusing non-owner recipients
 *   before you've verified a domain), the email body is logged to stdout so OTP
 *   / reset codes are still readable. The request succeeds.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend | null;
  private readonly from: string;
  private readonly isProd: boolean;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    this.from =
      this.config.get<string>('RESEND_FROM') ?? 'IndiaSmartTrade <onboarding@resend.dev>';
    this.isProd = this.config.get<string>('NODE_ENV') === 'production';

    if (apiKey) {
      this.resend = new Resend(apiKey);
      this.logger.log(`Resend configured (from ${this.from})`);
    } else {
      this.resend = null;
      this.logger.warn(
        'RESEND_API_KEY not set — emails will be logged to stdout (dev mode).',
      );
    }
  }

  async send({ to, subject, text, html }: SendArgs): Promise<void> {
    if (!this.resend) {
      this.logToConsole(to, subject, text);
      return;
    }
    try {
      const result = await this.resend.emails.send({
        from: this.from,
        to,
        subject,
        text,
        html: html ?? text.replace(/\n/g, '<br>'),
      });
      if (result.error) throw new Error(result.error.message);
    } catch (e) {
      const msg = (e as Error).message;
      if (this.isProd) {
        this.logger.error(`Resend rejected mail to ${to}: ${msg}`);
        throw e;
      }
      this.logger.warn(
        `Resend rejected mail to ${to} (${msg}) — falling back to stdout (dev mode).`,
      );
      this.logToConsole(to, subject, text);
    }
  }

  async sendOtp(to: string, code: string, purpose: 'signup' | 'reset'): Promise<void> {
    const subject =
      purpose === 'signup' ? 'Confirm your IndiaSmartTrade email' : 'Reset your IndiaSmartTrade password';
    const intro =
      purpose === 'signup'
        ? 'Welcome to IndiaSmartTrade! Use this code to finish creating your account.'
        : "Use this code to reset your IndiaSmartTrade password. If you didn't ask for this, ignore this email.";
    const text = `${intro}\n\nYour code: ${code}\n\nThis code expires in 10 minutes.`;
    await this.send({ to, subject, text });
  }

  private logToConsole(to: string, subject: string, text: string) {
    this.logger.log(
      `\n┌─── EMAIL (dev) ─────────────────────────────\n│ To:      ${to}\n│ Subject: ${subject}\n├─────────────────────────────────────────────\n${text
        .split('\n')
        .map((l) => `│ ${l}`)
        .join('\n')}\n└─────────────────────────────────────────────`,
    );
  }
}
