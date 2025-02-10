import {
  SESv2Client,
  SendEmailCommand,
  SendEmailCommandInput,
} from '@aws-sdk/client-sesv2';

export class SesConfig {
  fromName: string;
  fromEmail: string;
  fromArn: string;
}

export class Ses {
  constructor(private config: SesConfig) {}

  sendEmail = async ({
    html,
    subject,
    text,
    toEmail,
  }: {
    html: string;
    subject: string;
    text: string;
    toEmail: string;
  }): Promise<void> => {
    const client = new SESv2Client();
    const input: SendEmailCommandInput = {
      FromEmailAddress: `${this.config.fromName} <${this.config.fromEmail}>`,
      FromEmailAddressIdentityArn: this.config.fromArn,
      Destination: {
        ToAddresses: [toEmail],
      },
      Content: {
        Simple: {
          Subject: {
            Data: subject,
          },
          Body: {
            Text: {
              Data: text,
            },
            Html: {
              Data: html,
            },
          },
        },
      },
    };
    const command = new SendEmailCommand(input);
    await client.send(command);
  };
}
