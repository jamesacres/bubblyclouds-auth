import {
  errors,
  type AccountClaims,
  type Account as AccountInterface,
  type FindAccount,
} from 'oidc-provider';
import { IdTokenClaims } from 'openid-client';
import { nanoid } from 'nanoid';
import { DynamoDBAdapter } from '../adapters/dynamodb';
import { Model } from '../types/Model';
import { BubblyUserProfile } from '../types/BubblyUserProfile';
import { IdentityProvider } from '../types/IdentityProvider';

export class Account implements AccountInterface {
  private static adapter = new DynamoDBAdapter(Model.BubblyUser);

  constructor(
    public accountId: string,
    private profile?: BubblyUserProfile
  ) {}
  [key: string]: unknown;

  async claims(): Promise<AccountClaims> {
    if (!this.profile) {
      const user = await Account.adapter.find(this.accountId);
      if (!user) {
        throw new errors.UnknownUserId();
      }
      this.profile = user.profile;
    }
    return {
      ...this.profile,
      sub: this.accountId,
    };
  }

  static async findByIDP(
    provider: IdentityProvider,
    claims: Partial<IdTokenClaims>
  ) {
    console.info(claims);
    if (!(claims.email && claims.email_verified)) {
      // All federated accounts require a verified email
      throw new errors.InvalidToken('account not found');
    }

    const profile: Omit<BubblyUserProfile, 'sub'> = {
      name: claims.name || claims.email.split('@')[0],
      given_name: claims.given_name,
      family_name: claims.family_name,
      middle_name: claims.middle_name,
      nickname: claims.nickname,
      preferred_username: claims.preferred_username,
      profile: claims.profile,
      picture: claims.picture,
      website: claims.website,
      email: claims.email,
      email_verified: claims.email_verified,
      gender: claims.gender,
      birthdate: claims.birthdate,
      zoneinfo: claims.zoneinfo,
      locale: claims.locale,
      phone_number: claims.phone_number,
      updated_at: claims.updated_at,
      address: claims.address,
    };

    const user = await Account.adapter.findByUid(claims.email);

    // Update existing user, or store new user
    const now = new Date();
    const sub: string = user?.profile?.sub || `bubblyclouds|${nanoid()}`;
    const createdAt: Date = new Date(user?.createdAt || now);
    await Account.adapter.upsert(sub, {
      federatedProvider: provider,
      uid: claims.email,
      profile: { ...profile, sub },
      createdAt: createdAt.toISOString(),
      updatedAt: now.toISOString(),
    });

    return new Account(sub, { ...profile, sub });
  }

  static findAccount(): FindAccount {
    return (_ctx, id) => {
      // Provide account object, will be verified when claims method is called
      return new Account(id);
    };
  }
}
