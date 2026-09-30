import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { AppService } from './app.service';

export type SendMailOptions = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;

  constructor(private readonly appService: AppService) {
    this.transporter = this.createTransporter();
  }

  get isConfigured(): boolean {
    return this.transporter !== null;
  }

  async sendMail(options: SendMailOptions): Promise<void> {
    if (!this.transporter) {
      throw new ServiceUnavailableException('Email delivery is not configured');
    }

    try {
      await this.transporter.sendMail({
        from: this.appService.SMTP_FROM,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      });
    } catch (error) {
      this.logger.error('Failed to send email', error);
      throw new ServiceUnavailableException('Failed to send email');
    }
  }

  private createTransporter(): Transporter | null {
    const host = this.appService.SMTP_HOST;
    if (!host) {
      return null;
    }

    const encryption = this.appService.SMTP_ENCRYPTION;
    const options: SMTPTransport.Options = {
      host,
      port: this.appService.SMTP_PORT,
      secure: encryption === 'TLS',
      requireTLS: encryption === 'STARTTLS',
      ignoreTLS: encryption === null,
      tls: {
        rejectUnauthorized: this.appService.SMTP_TLS_REJECT_UNAUTHORIZED,
      },
    };

    if (this.appService.SMTP_USER && this.appService.SMTP_PASS) {
      options.auth = {
        user: this.appService.SMTP_USER,
        pass: this.appService.SMTP_PASS,
      };
    }

    return nodemailer.createTransport(options);
  }
}
