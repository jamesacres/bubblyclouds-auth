import {
  errors,
  type AccountClaims,
  type Account as AccountInterface,
  type FindAccount,
} from 'oidc-provider';
import { IdTokenClaims, UserinfoResponse } from 'openid-client';
import { nanoid } from 'nanoid';

export enum UserStore {
  GOOGLE = 'google',
}

export class Account implements AccountInterface {
  constructor(
    public accountId: string,
    private profile?: UserinfoResponse
  ) {}
  [key: string]: unknown;

  async claims(): Promise<AccountClaims> {
    if (!this.profile) {
      // TODO lookup account from database
      // TODO set this.profile to their claims
    }
    return {
      ...this.profile,
      sub: this.accountId,
    };
  }

  static async findByFederated(provider: UserStore, claims: IdTokenClaims) {
    if (!(claims.sub, claims.email && claims.email_verified)) {
      // All federated accounts require a verified email
      throw new errors.InvalidToken('account not found');
    }

    // TODO lookup user by email in our database
    // TODO If we haven't seen the email before, store in our database
    // TODO If we have seen the email before, update any fields with the new information

    const accountId = `bubblyclouds|${nanoid()}`;

    const profile = {
      sub: accountId,
      name: claims.name,
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

    return new Account(accountId, profile);
  }

  static findAccount(): FindAccount {
    return (_ctx, id) => {
      // Provide account object, will be verified when claims method is called
      return new Account(id);
    };
  }
}
