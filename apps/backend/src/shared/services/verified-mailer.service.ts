import { Injectable, Logger } from '@nestjs/common';
import { MailService, SendMailOptions } from './mail.service';

@Injectable()
export class VerifiedMailerService {
  private readonly logger = new Logger(VerifiedMailerService.name);

  constructor(private readonly mailService: MailService) {}

  async sendNotification(
    user: { email: string; emailVerified?: boolean },
    options: Omit<SendMailOptions, 'to'>,
  ): Promise<void> {
    if (!this.mailService.isConfigured || !user.emailVerified) {
      return;
    }

    try {
      await this.mailService.sendMail({
        to: user.email,
        subject: options.subject,
        text: options.text,
        html: options.html,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to deliver notification to ${user.email}`,
        error,
      );
    }
  }
}
