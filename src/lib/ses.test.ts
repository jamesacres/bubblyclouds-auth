import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockSend = jest.fn().mockResolvedValue(undefined as never);

jest.mock('@aws-sdk/client-sesv2', () => ({
  SESv2Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  SendEmailCommand: jest
    .fn()
    .mockImplementation((input: unknown) => ({ input })),
}));

describe('Ses', () => {
  const config = {
    fromName: 'Test Sender',
    fromEmail: 'noreply@example.com',
    fromArn: 'arn:aws:ses:us-east-1:123456789:identity/example.com',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSend.mockResolvedValue(undefined as never);
  });

  it('sends an email without throwing', async () => {
    const { Ses } = await import('./ses');
    const ses = new Ses(config);
    await expect(
      ses.sendEmail({
        html: '<p>Hello</p>',
        subject: 'Test Subject',
        text: 'Hello',
        toEmail: 'recipient@example.com',
      })
    ).resolves.toBeUndefined();
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('constructs FromEmailAddress with name and email', async () => {
    const { SendEmailCommand } = await import('@aws-sdk/client-sesv2');
    const { Ses } = await import('./ses');
    const ses = new Ses(config);
    await ses.sendEmail({
      html: '<p>Hi</p>',
      subject: 'Hi',
      text: 'Hi',
      toEmail: 'to@example.com',
    });
    const callArg = (SendEmailCommand as unknown as jest.Mock).mock
      .calls[0][0] as {
      FromEmailAddress: string;
    };
    expect(callArg.FromEmailAddress).toBe('Test Sender <noreply@example.com>');
  });

  it('sets destination to the toEmail', async () => {
    const { SendEmailCommand } = await import('@aws-sdk/client-sesv2');
    const { Ses } = await import('./ses');
    const ses = new Ses(config);
    await ses.sendEmail({
      html: '<p>Hi</p>',
      subject: 'Hi',
      text: 'Hi',
      toEmail: 'target@example.com',
    });
    const callArg = (SendEmailCommand as unknown as jest.Mock).mock
      .calls[0][0] as {
      Destination: { ToAddresses: string[] };
    };
    expect(callArg.Destination.ToAddresses).toEqual(['target@example.com']);
  });

  it('passes aws config to SESv2Client when provided', async () => {
    const { SESv2Client } = await import('@aws-sdk/client-sesv2');
    const { Ses } = await import('./ses');
    const awsConfig = { region: 'eu-west-1' };
    const ses = new Ses({ ...config, aws: awsConfig });
    await ses.sendEmail({
      html: '<p>Hi</p>',
      subject: 'Hi',
      text: 'Hi',
      toEmail: 'to@example.com',
    });
    expect(SESv2Client as unknown as jest.Mock).toHaveBeenCalledWith(awsConfig);
  });

  it('passes empty array to SESv2Client when no aws config provided', async () => {
    const { SESv2Client } = await import('@aws-sdk/client-sesv2');
    const { Ses } = await import('./ses');
    const ses = new Ses(config);
    await ses.sendEmail({
      html: '<p>Hi</p>',
      subject: 'Hi',
      text: 'Hi',
      toEmail: 'to@example.com',
    });
    expect(SESv2Client as unknown as jest.Mock).toHaveBeenCalledWith([]);
  });

  it('sets subject, html, and text body correctly', async () => {
    const { SendEmailCommand } = await import('@aws-sdk/client-sesv2');
    const { Ses } = await import('./ses');
    const ses = new Ses(config);
    await ses.sendEmail({
      html: '<b>html body</b>',
      subject: 'My Subject',
      text: 'text body',
      toEmail: 'to@example.com',
    });
    const callArg = (SendEmailCommand as unknown as jest.Mock).mock
      .calls[0][0] as {
      Content: {
        Simple: {
          Subject: { Data: string };
          Body: { Text: { Data: string }; Html: { Data: string } };
        };
      };
    };
    expect(callArg.Content.Simple.Subject.Data).toBe('My Subject');
    expect(callArg.Content.Simple.Body.Html.Data).toBe('<b>html body</b>');
    expect(callArg.Content.Simple.Body.Text.Data).toBe('text body');
  });

  it('sets FromEmailAddressIdentityArn', async () => {
    const { SendEmailCommand } = await import('@aws-sdk/client-sesv2');
    const { Ses } = await import('./ses');
    const ses = new Ses(config);
    await ses.sendEmail({
      html: '<p>Hi</p>',
      subject: 'Hi',
      text: 'Hi',
      toEmail: 'to@example.com',
    });
    const callArg = (SendEmailCommand as unknown as jest.Mock).mock
      .calls[0][0] as {
      FromEmailAddressIdentityArn: string;
    };
    expect(callArg.FromEmailAddressIdentityArn).toBe(config.fromArn);
  });
});
