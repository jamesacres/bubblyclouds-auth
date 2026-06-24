import {
  AttributeValue,
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  ResourceNotFoundException,
  ScanCommand,
  BatchWriteItemCommand,
} from '@aws-sdk/client-dynamodb';
import { TEST_TABLE_NAME } from './mockConfig.js';

const DYNAMODB_ENDPOINT = 'http://localhost:8000';

let dynamodbClient: DynamoDBClient;

export const getDynamoDBClient = (): DynamoDBClient => {
  if (!dynamodbClient) {
    dynamodbClient = new DynamoDBClient({
      endpoint: DYNAMODB_ENDPOINT,
      region: 'us-east-1',
      credentials: {
        accessKeyId: 'local',
        secretAccessKey: 'local',
      },
    });
  }
  return dynamodbClient;
};

export const tableExists = async (): Promise<boolean> => {
  const client = getDynamoDBClient();
  try {
    await client.send(new DescribeTableCommand({ TableName: TEST_TABLE_NAME }));
    return true;
  } catch (err) {
    if (err instanceof ResourceNotFoundException) {
      return false;
    }
    throw err;
  }
};

export const createTable = async (): Promise<void> => {
  const client = getDynamoDBClient();

  await client.send(
    new CreateTableCommand({
      TableName: TEST_TABLE_NAME,
      AttributeDefinitions: [
        { AttributeName: 'modelId', AttributeType: 'S' },
        { AttributeName: 'uid', AttributeType: 'S' },
        { AttributeName: 'grantId', AttributeType: 'S' },
        { AttributeName: 'userCode', AttributeType: 'S' },
      ],
      KeySchema: [{ AttributeName: 'modelId', KeyType: 'HASH' }],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'uidIndex',
          KeySchema: [{ AttributeName: 'uid', KeyType: 'HASH' }],
          Projection: { ProjectionType: 'ALL' },
          ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5,
          },
        },
        {
          IndexName: 'grantIdIndex',
          KeySchema: [{ AttributeName: 'grantId', KeyType: 'HASH' }],
          Projection: { ProjectionType: 'ALL' },
          ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5,
          },
        },
        {
          IndexName: 'userCodeIndex',
          KeySchema: [{ AttributeName: 'userCode', KeyType: 'HASH' }],
          Projection: { ProjectionType: 'ALL' },
          ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5,
          },
        },
      ],
      ProvisionedThroughput: {
        ReadCapacityUnits: 5,
        WriteCapacityUnits: 5,
      },
    })
  );
};

export const deleteTable = async (): Promise<void> => {
  const client = getDynamoDBClient();
  try {
    await client.send(new DeleteTableCommand({ TableName: TEST_TABLE_NAME }));
  } catch (err) {
    if (!(err instanceof ResourceNotFoundException)) {
      throw err;
    }
  }
};

export const clearTable = async (): Promise<void> => {
  const client = getDynamoDBClient();

  // Scan all items
  let lastEvaluatedKey: Record<string, AttributeValue> | undefined;
  do {
    const scanResult = await client.send(
      new ScanCommand({
        TableName: TEST_TABLE_NAME,
        ProjectionExpression: 'modelId',
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );

    lastEvaluatedKey = scanResult.LastEvaluatedKey as
      | Record<string, AttributeValue>
      | undefined;
    const items = scanResult.Items || [];

    if (items.length === 0) {
      break;
    }

    // Batch delete in chunks of 25
    const chunks: (typeof items)[] = [];
    for (let i = 0; i < items.length; i += 25) {
      chunks.push(items.slice(i, i + 25));
    }

    for (const chunk of chunks) {
      await client.send(
        new BatchWriteItemCommand({
          RequestItems: {
            [TEST_TABLE_NAME]: chunk.map((item) => ({
              DeleteRequest: {
                Key: { modelId: item.modelId },
              },
            })),
          },
        })
      );
    }
  } while (lastEvaluatedKey);
};

export const setupDynamoDB = async (): Promise<void> => {
  const exists = await tableExists();
  if (!exists) {
    await createTable();
  }
};

export const teardownDynamoDB = async (): Promise<void> => {
  await deleteTable();
};
