import { DynamoDBAdapter } from '../adapters/dynamodb';
import { Model } from '../types/Model';
import { sanitiseEmail } from '../utils/email';
import { randomHumanCode } from '../utils/random';

export class SignInCode {
  private adapter = new DynamoDBAdapter(Model.BubblySignInCode);

  constructor() {}

  async getCode(requestEmail: string): Promise<string> {
    const email = sanitiseEmail(requestEmail);

    const existingCode = await this.adapter.find(email);
    if (existingCode && !existingCode.consumed && existingCode.signInCode) {
      return existingCode.signInCode;
    }

    const now = new Date();
    const expiresInSeconds = 3600; // one hour
    const signInCode = randomHumanCode();
    await this.adapter.upsert(
      email,
      {
        signInCode,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
      expiresInSeconds
    );
    return signInCode;
  }

  async checkCode(requestEmail: string, requestCode: string): Promise<boolean> {
    const email = sanitiseEmail(requestEmail);
    if (
      typeof requestCode === 'string' &&
      requestCode.toLowerCase().replaceAll('-', '').trim() ===
        (await this.getCode(email)).toLowerCase().replaceAll('-', '').trim()
    ) {
      await this.adapter.consume(email);
      return true;
    }
    return false;
  }
}
