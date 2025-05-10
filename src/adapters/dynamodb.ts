// https://github.com/panva/node-oidc-provider/blob/270af1da83dda4c49edb4aaab48908f737d73379/example/adapters/contributed/dynamodb-gsi.ts
// This adapter is written in Typescript. If you want to get Javascript version without compiling it with tsc, paste this code here: https://babeljs.io/en/repl (choose Typescript preset)

// The filename is suffixed with 'gsi' because this adapter makes use of Global Secondary Indexes.

/**
 * Prerequisites:
 *
 * 1. Create a DynamoDB Table with following details:
 *        Partition Key: modelId
 *        TTL Attribute: expiresAt
 *        Three Global Secondary Indexes:
 *            GSI 1:
 *                Index Name: uidIndex
 *                Partition Key: uid
 *            GSI 2:
 *                Index Name: grantIdIndex
 *                Partition Key: grantId
 *            GSI 3:
 *                Index Name: userCodeIndex
 *                Partition Key: userCode
 *
 * 2. Put the Table's name in environment variable OAUTH_TABLE or simply replace the value of constant TABLE_NAME below.
 *
 * 3. You'll also need to change value of TABLE_REGION constant below if you aren't in AWS compute environment or if DynamoDB Table exists in different region.
 *
 * 4. If you are in AWS' compute environment, nothing more needs to be changed in code.
 *    You just need to give proper IAM permissions of DynamoDB Table.
 *    Required Permissions:
 *        dynamodb:GetItem
 *        dynamodb:ConditionCheckItem
 *        dynamodb:UpdateItem
 *        dynamodb:DeleteItem
 *        dynamodb:Query
 *        dynamodb:BatchWriteItem
 *    If you aren't in AWS' compute environment, you'll also need to configure SDK with proper credentials.
 *    @see https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/configuring-the-jssdk.html
 */

// Author: Sachin Shekhar <https://github.com/SachinShekhar>
// Mention @SachinShekhar in issues to ask questions about this code.

import { Adapter } from 'oidc-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand,
  BatchWriteCommandInput,
  DeleteCommand,
  DeleteCommandInput,
  DynamoDBDocumentClient,
  GetCommand,
  GetCommandInput,
  QueryCommand,
  QueryCommandInput,
  UpdateCommand,
  UpdateCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { NativeAttributeValue } from '@aws-sdk/util-dynamodb';
import { backOff } from 'exponential-backoff';
import { Model } from '../types/Model';
import { BubblyAdapterPayload } from '../types/BubblyAdapterPayload';

const TABLE_NAME = process.env.OAUTH_TABLE!;
const TABLE_REGION = process.env.AWS_REGION;
const MAX_RETRIES = 5;

const dynamoClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region: TABLE_REGION,
  }),
  {
    marshallOptions: {
      removeUndefinedValues: true,
    },
  }
);

export class DynamoDBAdapter implements Adapter {
  name: string | Model;

  constructor(name: string | Model) {
    this.name = name;
  }

  async upsert(
    id: string,
    payload: BubblyAdapterPayload,
    expiresIn?: number
  ): Promise<void> {
    // DynamoDB can recognise TTL values only in seconds
    const expiresAt = expiresIn
      ? Math.floor(Date.now() / 1000) + expiresIn
      : null;

    const params: UpdateCommandInput = {
      TableName: TABLE_NAME,
      Key: { modelId: this.name + '-' + id },
      UpdateExpression:
        'SET payload = :payload' +
        (expiresAt ? ', expiresAt = :expiresAt' : '') +
        (payload.userCode ? ', userCode = :userCode' : '') +
        (payload.uid ? ', uid = :uid' : '') +
        (payload.grantId ? ', grantId = :grantId' : ''),
      ExpressionAttributeValues: {
        ':payload': payload,
        ...(expiresAt ? { ':expiresAt': expiresAt } : {}),
        ...(payload.userCode ? { ':userCode': payload.userCode } : {}),
        ...(payload.uid ? { ':uid': payload.uid } : {}),
        ...(payload.grantId ? { ':grantId': payload.grantId } : {}),
      },
    };
    const command = new UpdateCommand(params);

    await dynamoClient.send(command);
  }

  async find(id: string): Promise<BubblyAdapterPayload | undefined> {
    const params: GetCommandInput = {
      TableName: TABLE_NAME,
      Key: { modelId: this.name + '-' + id },
      ProjectionExpression: 'payload, expiresAt',
    };
    const command = new GetCommand(params);

    const getResult = async () => {
      const commandResult = await dynamoClient.send(command);
      const result = commandResult?.Item as
        | { payload: BubblyAdapterPayload; expiresAt?: number }
        | undefined;
      if (!result) {
        throw Error('not found');
      }
      return result;
    };

    const result = await backOff(getResult, {
      jitter: 'full',
      numOfAttempts: MAX_RETRIES,
    }).catch((e) => {
      console.error(e);
      return undefined;
    });

    // DynamoDB can take upto 48 hours to drop expired items, so a check is required
    if (!result || (result.expiresAt && Date.now() > result.expiresAt * 1000)) {
      return undefined;
    }

    if (this.name === 'Session') {
      // When we delete accounts we don't delete sessions, so we need to check account still exists
      const accountId = result.payload.accountId;
      console.info('checking if account exists', accountId);
      let account: BubblyAdapterPayload | undefined;
      if (accountId) {
        // Check the account still exists
        const accountAdapter = new DynamoDBAdapter(Model.BubblyUser);
        account = await accountAdapter.find(accountId);
      }
      if (!account) {
        console.warn('account no longer exists', accountId);
        return undefined;
      }
    }

    return result.payload;
  }

  async findByUserCode(
    userCode: string
  ): Promise<BubblyAdapterPayload | undefined> {
    const params: QueryCommandInput = {
      TableName: TABLE_NAME,
      IndexName: 'userCodeIndex',
      KeyConditionExpression: 'userCode = :userCode',
      ExpressionAttributeValues: {
        ':userCode': userCode,
      },
      Limit: 1,
      ProjectionExpression: 'payload, expiresAt',
    };
    const command = new QueryCommand(params);

    const getResult = async () => {
      const commandResult = await dynamoClient.send(command);
      const result = commandResult?.Items?.[0] as
        | { payload: BubblyAdapterPayload; expiresAt?: number }
        | undefined;
      if (!result) {
        throw Error('not found');
      }
      return result;
    };

    const result = await backOff(getResult, {
      jitter: 'full',
      numOfAttempts: MAX_RETRIES,
    }).catch((e) => {
      console.error(e);
      return undefined;
    });

    // DynamoDB can take upto 48 hours to drop expired items, so a check is required
    if (!result || (result.expiresAt && Date.now() > result.expiresAt * 1000)) {
      return undefined;
    }

    return result.payload;
  }

  async findByUid(uid: string): Promise<BubblyAdapterPayload | undefined> {
    const params: QueryCommandInput = {
      TableName: TABLE_NAME,
      IndexName: 'uidIndex',
      KeyConditionExpression: 'uid = :uid',
      ExpressionAttributeValues: {
        ':uid': uid,
      },
      Limit: 1,
      ProjectionExpression: 'payload, expiresAt',
    };
    const command = new QueryCommand(params);

    const getResult = async () => {
      const commandResult = await dynamoClient.send(command);
      const result = commandResult?.Items?.[0] as
        | { payload: BubblyAdapterPayload; expiresAt?: number }
        | undefined;
      if (!result) {
        throw Error('not found');
      }
      return result;
    };

    const result = await backOff(getResult, {
      jitter: 'full',
      numOfAttempts: MAX_RETRIES,
    }).catch((e) => {
      console.error(e);
      return undefined;
    });

    // DynamoDB can take upto 48 hours to drop expired items, so a check is required
    if (!result || (result.expiresAt && Date.now() > result.expiresAt * 1000)) {
      return undefined;
    }

    return result.payload;
  }

  async consume(id: string): Promise<void> {
    const params: UpdateCommandInput = {
      TableName: TABLE_NAME,
      Key: { modelId: this.name + '-' + id },
      UpdateExpression: 'SET #payload.#consumed = :value',
      ExpressionAttributeNames: {
        '#payload': 'payload',
        '#consumed': 'consumed',
      },
      ExpressionAttributeValues: {
        ':value': Math.floor(Date.now() / 1000),
      },
      ConditionExpression: 'attribute_exists(modelId)',
    };
    const command = new UpdateCommand(params);

    await dynamoClient.send(command);
  }

  async destroy(id: string): Promise<void> {
    const params: DeleteCommandInput = {
      TableName: TABLE_NAME,
      Key: { modelId: this.name + '-' + id },
    };
    const command = new DeleteCommand(params);

    await dynamoClient.send(command);
  }

  async revokeByGrantId(grantId: string): Promise<void> {
    let ExclusiveStartKey: Record<string, NativeAttributeValue> | undefined =
      undefined;

    do {
      const params: QueryCommandInput = {
        TableName: TABLE_NAME,
        IndexName: 'grantIdIndex',
        KeyConditionExpression: 'grantId = :grantId',
        ExpressionAttributeValues: {
          ':grantId': grantId,
        },
        ProjectionExpression: 'modelId',
        Limit: 25,
        ExclusiveStartKey,
      };
      const queryCommand = new QueryCommand(params);

      const queryResult = await dynamoClient.send(queryCommand);
      ExclusiveStartKey = queryResult.LastEvaluatedKey;

      const items = <{ modelId: string }[] | undefined>queryResult.Items;

      if (!items || !items.length) {
        return;
      }

      const batchWriteParams: BatchWriteCommandInput = {
        RequestItems: {
          [TABLE_NAME]: items.map((item) => ({
            DeleteRequest: { Key: { modelId: item.modelId } },
          })),
        },
      };
      const command = new BatchWriteCommand(batchWriteParams);

      await dynamoClient.send(command);
    } while (ExclusiveStartKey);
  }
}
