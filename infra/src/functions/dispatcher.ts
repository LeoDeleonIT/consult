import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import type { SQSEvent } from "aws-lambda";
import { z } from "zod";

const sfn = new SFNClient({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const messageSchema = z.object({ jobId: z.string().uuid(), attempt: z.number().int().positive() });

export async function handler(event: SQSEvent): Promise<void> {
  for (const record of event.Records) {
    const message = messageSchema.parse(JSON.parse(record.body));
    const job = await ddb.send(new GetCommand({ TableName: required("JOBS_TABLE_NAME"), Key: { jobId: message.jobId }, ConsistentRead: true }));
    if (!job.Item || job.Item.status !== "queued" || job.Item.attempt !== message.attempt) continue;
    try {
      await sfn.send(new StartExecutionCommand({
        stateMachineArn: required("STATE_MACHINE_ARN"),
        name: `${message.jobId}-${message.attempt}`,
        input: JSON.stringify({ jobId: message.jobId, pollCount: 0 }),
      }));
    } catch (error) {
      if (!(error instanceof Error) || error.name !== "ExecutionAlreadyExists") throw error;
    }
  }
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error("dispatcher_configuration_error");
  return value;
}
