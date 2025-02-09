import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { signInEmail } from '../views/signInEmail';

const sendSignInEmail = async (email: string, code: string): Promise<void> => {
  const client = new SESv2Client();
  const input = {
    FromEmailAddress: 'hello@bubblyclouds.com',
    FromEmailAddressIdentityArn:
      'arn:aws:ses:eu-west-2:679604770237:identity/hello@bubblyclouds.com',
    Destination: {
      ToAddresses: [email],
    },
    Content: {
      Simple: {
        Subject: {
          Data: 'Finish signing in to Bubbly Clouds',
        },
        Body: {
          Text: {
            Data: `Use this code to sign in

${code}

Enter this code to verify your email address and continue signing in.

Not trying to sign in? Please ignore this email.

Thanks, Bubbly Clouds`,
          },
          Html: {
            Data: signInEmail(code),
          },
        },
      },
    },
  };
  const command = new SendEmailCommand(input);
  await client.send(command);
};

export { sendSignInEmail };
