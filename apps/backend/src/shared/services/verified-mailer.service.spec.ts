import { MailService } from './mail.service';
import { VerifiedMailerService } from './verified-mailer.service';

describe('VerifiedMailerService', () => {
  let mailService: {
    isConfigured: boolean;
    sendMail: jest.Mock;
  };
  let service: VerifiedMailerService;

  beforeEach(() => {
    mailService = {
      isConfigured: true,
      sendMail: jest.fn().mockResolvedValue(undefined),
    };
    service = new VerifiedMailerService(mailService as unknown as MailService);
  });

  it('does nothing when mailService is not configured', async () => {
    mailService.isConfigured = false;
    await service.sendNotification(
      { email: 'user@example.com', emailVerified: true },
      { subject: 'Hello', text: 'Text', html: '<p>Text</p>' },
    );
    expect(mailService.sendMail).not.toHaveBeenCalled();
  });

  it('does nothing when user email is not verified', async () => {
    await service.sendNotification(
      { email: 'user@example.com', emailVerified: false },
      { subject: 'Hello', text: 'Text', html: '<p>Text</p>' },
    );
    await service.sendNotification(
      { email: 'user@example.com' },
      { subject: 'Hello', text: 'Text', html: '<p>Text</p>' },
    );
    expect(mailService.sendMail).not.toHaveBeenCalled();
  });

  it('sends email when configured and email is verified', async () => {
    await service.sendNotification(
      { email: 'user@example.com', emailVerified: true },
      {
        subject: 'Security alert',
        text: 'Alert text',
        html: '<p>Alert text</p>',
      },
    );
    expect(mailService.sendMail).toHaveBeenCalledWith({
      to: 'user@example.com',
      subject: 'Security alert',
      text: 'Alert text',
      html: '<p>Alert text</p>',
    });
  });

  it('catches and logs errors when sendMail throws without propagating', async () => {
    mailService.sendMail.mockRejectedValueOnce(
      new Error('SMTP connection error'),
    );
    await expect(
      service.sendNotification(
        { email: 'user@example.com', emailVerified: true },
        { subject: 'Hello', text: 'Text', html: '<p>Text</p>' },
      ),
    ).resolves.toBeUndefined();
  });
});
