import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  Tags,
  type StackProps,
} from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as authorizers from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as kms from "aws-cdk-lib/aws-kms";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as eventSources from "aws-cdk-lib/aws-lambda-event-sources";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import { Construct } from "constructs";
import { NagSuppressions } from "cdk-nag";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

export class ConsultAwsPilotStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    if (this.region !== "us-east-1") throw new Error("The synthetic AWS pilot must be synthesized for us-east-1.");

    const allowedOrigins = parseAllowedOrigins(this.node.tryGetContext("allowedOrigins"));
    if (!allowedOrigins.length || allowedOrigins.some((origin) => !isExactHttpsOrigin(origin))) {
      throw new Error("allowedOrigins must contain one or more explicit HTTPS origins and no wildcard.");
    }
    const retentionDays = positiveInteger(this.node.tryGetContext("audioRetentionDays"), 30);
    const maxUploadMb = positiveInteger(this.node.tryGetContext("maxUploadMb"), 25);
    const modelId = String(this.node.tryGetContext("bedrockModelId") ?? "").trim();
    if (!modelId || /fable|mythos/i.test(modelId)) throw new Error("A non-Fable/non-Mythos bedrockModelId is required.");
    const languageCode = String(this.node.tryGetContext("transcribeLanguageCode") ?? "en-US");
    const maxSpeakers = positiveInteger(this.node.tryGetContext("transcribeMaxSpeakers"), 2);
    if (maxSpeakers !== 2) throw new Error("The synthetic pilot requires exactly two configured Transcribe speaker labels.");

    const dataKey = new kms.Key(this, "DataKey", {
      alias: "alias/trinity-consult-aws-pilot",
      description: "Synthetic Trinity Consult pilot data",
      enableKeyRotation: true,
      removalPolicy: RemovalPolicy.RETAIN,
      pendingWindow: Duration.days(30),
    });

    const accessLogBucket = new s3.Bucket(this, "AccessLogBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      lifecycleRules: [{ id: "expire-access-logs", expiration: Duration.days(90), enabled: true }],
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const audioBucket = new s3.Bucket(this, "AudioBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: dataKey,
      enforceSSL: true,
      versioned: false,
      removalPolicy: RemovalPolicy.RETAIN,
      serverAccessLogsBucket: accessLogBucket,
      serverAccessLogsPrefix: "audio-access/",
      cors: [{
        allowedOrigins,
        allowedMethods: [s3.HttpMethods.POST],
        allowedHeaders: ["content-type", "x-amz-server-side-encryption", "x-amz-server-side-encryption-aws-kms-key-id"],
        exposedHeaders: [],
        maxAge: 300,
      }],
      lifecycleRules: ["uploads/", "transcripts/", "analysis/", "temporary/"].map((prefix) => ({ id: `expire-${prefix.slice(0, -1)}`, prefix, expiration: Duration.days(retentionDays), enabled: true })),
    });
    audioBucket.addToResourcePolicy(new iam.PolicyStatement({
      sid: "DenyUploadsWithoutKms",
      effect: iam.Effect.DENY,
      principals: [new iam.AnyPrincipal()],
      actions: ["s3:PutObject"],
      resources: [`${audioBucket.bucketArn}/*`],
      conditions: { StringNotEquals: { "s3:x-amz-server-side-encryption": "aws:kms" } },
    }));
    audioBucket.addToResourcePolicy(new iam.PolicyStatement({
      sid: "DenyUploadsWithWrongKmsKey",
      effect: iam.Effect.DENY,
      principals: [new iam.AnyPrincipal()],
      actions: ["s3:PutObject"],
      resources: [`${audioBucket.bucketArn}/*`],
      conditions: { StringNotEquals: { "s3:x-amz-server-side-encryption-aws-kms-key-id": dataKey.keyArn } },
    }));

    const jobsTable = new dynamodb.Table(this, "JobsTable", {
      partitionKey: { name: "jobId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: dataKey,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      timeToLiveAttribute: "retentionExpiresAt",
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const deadLetterQueue = new sqs.Queue(this, "JobsDeadLetterQueue", {
      encryption: sqs.QueueEncryption.KMS,
      encryptionMasterKey: dataKey,
      retentionPeriod: Duration.days(14),
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const jobsQueue = new sqs.Queue(this, "JobsQueue", {
      encryption: sqs.QueueEncryption.KMS,
      encryptionMasterKey: dataKey,
      visibilityTimeout: Duration.minutes(2),
      retentionPeriod: Duration.days(4),
      deadLetterQueue: { queue: deadLetterQueue, maxReceiveCount: 3 },
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const bridgeSecret = new secretsmanager.Secret(this, "BridgeSecret", {
      description: "Server-only HMAC bridge secret for the synthetic Trinity Consult AWS pilot",
      encryptionKey: dataKey,
      generateSecretString: { secretStringTemplate: "{}", generateStringKey: "tokenSecret", passwordLength: 64, excludePunctuation: true },
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const transcribeDataRole = new iam.Role(this, "TranscribeDataRole", {
      assumedBy: new iam.ServicePrincipal("transcribe.amazonaws.com", {
        conditions: {
          StringEquals: { "aws:SourceAccount": this.account },
          ArnLike: { "aws:SourceArn": Stack.of(this).formatArn({ service: "transcribe", resource: "*" }) },
        },
      }),
      description: "Scoped S3 and KMS access for synthetic Consult Transcribe batch jobs",
    });
    transcribeDataRole.addToPolicy(new iam.PolicyStatement({ actions: ["s3:GetObject"], resources: [`${audioBucket.bucketArn}/uploads/*`] }));
    transcribeDataRole.addToPolicy(new iam.PolicyStatement({ actions: ["s3:PutObject"], resources: [`${audioBucket.bucketArn}/transcripts/*`] }));
    transcribeDataRole.addToPolicy(new iam.PolicyStatement({ actions: ["s3:ListBucket"], resources: [audioBucket.bucketArn], conditions: { StringLike: { "s3:prefix": ["uploads/*", "transcripts/*"] } } }));
    this.grantDataKeyUse(dataKey, transcribeDataRole);

    const commonEnvironment = {
      AUDIO_BUCKET_NAME: audioBucket.bucketName,
      JOBS_TABLE_NAME: jobsTable.tableName,
      KMS_KEY_ARN: dataKey.keyArn,
      MAX_UPLOAD_BYTES: String(maxUploadMb * 1024 * 1024),
      MAX_RECORDING_SECONDS: String(90 * 60 + 5),
      AUDIO_RETENTION_DAYS: String(retentionDays),
    };

    const authorizerFunction = this.nodeFunction("AuthorizerFunction", "authorizer.ts", { BRIDGE_SECRET_ARN: bridgeSecret.secretArn }, Duration.seconds(10), 256);
    bridgeSecret.grantRead(authorizerFunction);

    const apiFunction = this.nodeFunction("ApiFunction", "api.ts", { ...commonEnvironment, JOBS_QUEUE_URL: jobsQueue.queueUrl }, Duration.seconds(30), 512);
    this.grantActions(apiFunction, jobsTable.tableArn, ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem"]);
    this.grantActions(apiFunction, jobsQueue.queueArn, ["sqs:SendMessage"]);
    this.grantBucketPrefixAccess(audioBucket, apiFunction, ["uploads/*", "transcripts/*", "analysis/*"], ["s3:DeleteObject", "s3:GetObject"]);
    this.grantBucketPrefixAccess(audioBucket, apiFunction, ["uploads/*"], ["s3:PutObject"]);
    this.grantDataKeyUse(dataKey, apiFunction);
    apiFunction.addToRolePolicy(new iam.PolicyStatement({ actions: ["transcribe:DeleteTranscriptionJob"], resources: ["*"] }));

    const workerFunction = this.nodeFunction("WorkerFunction", "worker.ts", {
      ...commonEnvironment,
      BEDROCK_MODEL_ID: modelId,
      TRANSCRIBE_LANGUAGE_CODE: languageCode,
      TRANSCRIBE_MAX_SPEAKERS: String(maxSpeakers),
      TRANSCRIBE_VOCABULARY_NAME: String(this.node.tryGetContext("transcribeVocabularyName") ?? ""),
      TRANSCRIBE_DATA_ROLE_ARN: transcribeDataRole.roleArn,
    }, Duration.minutes(5), 1024);
    this.grantActions(workerFunction, jobsTable.tableArn, ["dynamodb:GetItem", "dynamodb:UpdateItem"]);
    this.grantBucketPrefixAccess(audioBucket, workerFunction, ["uploads/*", "transcripts/*"], ["s3:GetObject"]);
    this.grantBucketPrefixAccess(audioBucket, workerFunction, ["transcripts/*", "analysis/*"], ["s3:PutObject"]);
    this.grantDataKeyUse(dataKey, workerFunction);
    workerFunction.addToRolePolicy(new iam.PolicyStatement({ actions: ["transcribe:StartTranscriptionJob", "transcribe:GetTranscriptionJob"], resources: ["*"] }));
    transcribeDataRole.grantPassRole(workerFunction.grantPrincipal);
    workerFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ["bedrock:InvokeModel"],
      resources: [
        Stack.of(this).formatArn({ service: "bedrock", region: this.region, account: "", resource: "foundation-model", resourceName: modelId }),
        Stack.of(this).formatArn({ service: "bedrock", region: this.region, account: this.account, resource: "inference-profile", resourceName: modelId }),
      ],
    }));

    const failTask = new tasks.LambdaInvoke(this, "PersistSafeFailure", {
      lambdaFunction: workerFunction,
      payloadResponseOnly: true,
      payload: sfn.TaskInput.fromObject({ action: "fail", "jobId.$": "$.jobId", "failureCode.$": "$.failure.Error" }),
    });
    const workflowFailed = new sfn.Fail(this, "WorkflowFailed", { error: "aws_processing_failed", cause: "See the safe DynamoDB failure code." });
    failTask.next(workflowFailed);
    const startTask = new tasks.LambdaInvoke(this, "StartTranscription", {
      lambdaFunction: workerFunction,
      payloadResponseOnly: true,
      payload: sfn.TaskInput.fromObject({ action: "start", "jobId.$": "$.jobId" }),
      resultPath: sfn.JsonPath.DISCARD,
    });
    const wait = new sfn.Wait(this, "WaitForTranscription", { time: sfn.WaitTime.duration(Duration.seconds(20)) });
    const checkTask = new tasks.LambdaInvoke(this, "CheckTranscription", {
      lambdaFunction: workerFunction,
      payloadResponseOnly: true,
      payload: sfn.TaskInput.fromObject({ action: "check", "jobId.$": "$.jobId" }),
      resultPath: "$.check",
    });
    const summarizeTask = new tasks.LambdaInvoke(this, "CreateStructuredAnalysis", {
      lambdaFunction: workerFunction,
      payloadResponseOnly: true,
      payload: sfn.TaskInput.fromObject({ action: "summarize", "jobId.$": "$.jobId" }),
      resultPath: sfn.JsonPath.DISCARD,
    });
    const success = new sfn.Succeed(this, "ProcessingComplete");
    summarizeTask.next(success);
    const timeoutFailure = new tasks.LambdaInvoke(this, "PersistTranscriptionTimeout", {
      lambdaFunction: workerFunction,
      payloadResponseOnly: true,
      payload: sfn.TaskInput.fromObject({ action: "fail", "jobId.$": "$.jobId", failureCode: "transcription_timeout" }),
    });
    timeoutFailure.next(workflowFailed);
    const incrementPoll = new sfn.Pass(this, "IncrementPollCount", {
      parameters: { "jobId.$": "$.jobId", "pollCount.$": "States.MathAdd($.pollCount, 1)" },
    });
    incrementPoll.next(wait);
    const choice = new sfn.Choice(this, "TranscriptionFinished")
      .when(sfn.Condition.booleanEquals("$.check.complete", true), summarizeTask)
      .when(sfn.Condition.numberGreaterThanEquals("$.pollCount", 180), timeoutFailure)
      .otherwise(incrementPoll);
    checkTask.next(choice);
    wait.next(checkTask);
    for (const [task, retryError] of [[startTask, "transcription_start_failed"], [checkTask, "transcription_check_failed"], [summarizeTask, "bedrock_processing_failed"]] as const) {
      task.addRetry({ errors: [retryError, "Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException", "Lambda.TooManyRequestsException"], interval: Duration.seconds(2), backoffRate: 2, maxAttempts: 3 });
      task.addCatch(failTask, { resultPath: "$.failure" });
    }
    const stateMachine = new sfn.StateMachine(this, "ProcessingStateMachine", {
      definitionBody: sfn.DefinitionBody.fromChainable(startTask.next(wait)),
      stateMachineType: sfn.StateMachineType.STANDARD,
      timeout: Duration.hours(2),
      logs: { destination: this.logGroup("StateMachineLogs"), level: sfn.LogLevel.ALL, includeExecutionData: false },
      tracingEnabled: true,
    });

    const dispatcherFunction = this.nodeFunction("DispatcherFunction", "dispatcher.ts", { JOBS_TABLE_NAME: jobsTable.tableName, STATE_MACHINE_ARN: stateMachine.stateMachineArn }, Duration.seconds(30), 256);
    this.grantActions(dispatcherFunction, jobsTable.tableArn, ["dynamodb:GetItem"]);
    stateMachine.grantStartExecution(dispatcherFunction);
    dispatcherFunction.addEventSource(new eventSources.SqsEventSource(jobsQueue, { batchSize: 1, reportBatchItemFailures: false }));

    const accessLogs = this.logGroup("ApiAccessLogs");
    const httpApi = new apigwv2.HttpApi(this, "HttpApi", {
      corsPreflight: {
        allowOrigins: allowedOrigins,
        allowMethods: [apigwv2.CorsHttpMethod.GET, apigwv2.CorsHttpMethod.POST, apigwv2.CorsHttpMethod.DELETE, apigwv2.CorsHttpMethod.OPTIONS],
        allowHeaders: ["authorization", "content-type"],
        maxAge: Duration.minutes(5),
      },
    });
    const defaultStage = httpApi.defaultStage?.node.defaultChild as apigwv2.CfnStage;
    defaultStage.accessLogSettings = {
      destinationArn: accessLogs.logGroupArn,
      format: JSON.stringify({ requestId: "$context.requestId", routeKey: "$context.routeKey", status: "$context.status", responseLatency: "$context.responseLatency" }),
    };
    const authorizer = new authorizers.HttpLambdaAuthorizer("BridgeAuthorizer", authorizerFunction, {
      authorizerName: "trinity-consult-bridge",
      identitySource: ["$request.header.Authorization"],
      responseTypes: [authorizers.HttpLambdaResponseType.SIMPLE],
      resultsCacheTtl: Duration.seconds(0),
    });
    const integration = new integrations.HttpLambdaIntegration("ApiIntegration", apiFunction);
    for (const [pathName, methods] of [
      ["/v1/uploads", [apigwv2.HttpMethod.POST]],
      ["/v1/jobs", [apigwv2.HttpMethod.POST]],
      ["/v1/jobs/{jobId}", [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.DELETE]],
      ["/v1/jobs/{jobId}/audio", [apigwv2.HttpMethod.GET]],
    ] as const) {
      httpApi.addRoutes({ path: pathName, methods: [...methods], integration, authorizer });
    }

    this.alarm("DeadLetterMessagesAlarm", deadLetterQueue.metricApproximateNumberOfMessagesVisible(), 1);
    this.alarm("WorkflowFailuresAlarm", stateMachine.metricFailed(), 1);
    for (const fn of [authorizerFunction, apiFunction, dispatcherFunction, workerFunction]) this.alarm(`${fn.node.id}ErrorsAlarm`, fn.metricErrors(), 1);

    Tags.of(this).add("Application", "TrinityConsult");
    Tags.of(this).add("Environment", "synthetic-pilot");
    Tags.of(this).add("DataClassification", "synthetic-only");

    NagSuppressions.addResourceSuppressions(accessLogBucket, [{
      id: "AwsSolutions-S1",
      reason: "This bucket is the terminal server-access-log archive. Sending its own access logs to itself would recurse; it stores no consultation payloads and expires log objects after 90 days.",
    }]);
    NagSuppressions.addResourceSuppressions(bridgeSecret, [{
      id: "AwsSolutions-SMG4",
      reason: "The short-lived bridge HMAC requires coordinated dual-key application rotation. The pre-production runbook requires manual rotation and application restart; no database credential is stored here.",
    }]);
    NagSuppressions.addResourceSuppressions(transcribeDataRole, [{
      id: "AwsSolutions-IAM5",
      reason: "Object resources are restricted to uploads/ and transcripts/ prefixes; Transcribe processes randomized object keys within those prefixes.",
    }], true);
    NagSuppressions.addResourceSuppressions([apiFunction.role!, workerFunction.role!], [{
      id: "AwsSolutions-IAM5",
      reason: "S3 wildcard resources are operation-specific and restricted to opaque-key uploads, transcripts, or analysis prefixes; CloudWatch log-stream names are dynamic. Transcribe Start/Get/Delete and X-Ray APIs do not support resource-level permissions, so only those named actions use Resource '*'.",
    }], true);
    NagSuppressions.addResourceSuppressions(authorizerFunction.role!, [{
      id: "AwsSolutions-IAM5",
      reason: "CloudWatch log-stream names are dynamic. X-Ray PutTraceSegments and PutTelemetryRecords do not support resource-level permissions; secret access remains restricted to the one bridge secret.",
    }], true);
    NagSuppressions.addResourceSuppressions(stateMachine, [{
      id: "AwsSolutions-IAM5",
      reason: "CloudWatch Logs delivery APIs and X-Ray tracing require wildcard resources; Lambda invocation remains restricted to the worker function and its generated versions.",
    }], true);
    NagSuppressions.addResourceSuppressions(dispatcherFunction.role!, [{
      id: "AwsSolutions-IAM5",
      reason: "CloudWatch log-stream names are dynamic and X-Ray APIs require wildcard resources. Queue, KMS, DynamoDB, and Step Functions permissions remain bound to this stack's resources.",
    }], true);

    new CfnOutput(this, "ApiBaseUrl", { value: httpApi.apiEndpoint });
    new CfnOutput(this, "BridgeSecretArn", { value: bridgeSecret.secretArn });
    new CfnOutput(this, "AudioBucketName", { value: audioBucket.bucketName });
    new CfnOutput(this, "JobsTableName", { value: jobsTable.tableName });
    new CfnOutput(this, "KmsKeyArn", { value: dataKey.keyArn });
    new CfnOutput(this, "BedrockModelId", { value: modelId });
  }

  private nodeFunction(id: string, entry: string, environment: Record<string, string>, timeout: Duration, memorySize: number): nodejs.NodejsFunction {
    const logGroup = this.logGroup(`${id}Logs`);
    const role = new iam.Role(this, `${id}Role`, {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      description: `Least-privilege execution role for ${id}`,
    });
    role.addToPolicy(new iam.PolicyStatement({
      actions: ["logs:CreateLogStream", "logs:PutLogEvents"],
      resources: [`${logGroup.logGroupArn}:*`],
    }));
    role.addToPolicy(new iam.PolicyStatement({
      actions: ["xray:PutTraceSegments", "xray:PutTelemetryRecords"],
      resources: ["*"],
    }));
    return new nodejs.NodejsFunction(this, id, {
      entry: path.join(currentDirectory, `../src/functions/${entry}`),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_24_X,
      architecture: lambda.Architecture.ARM_64,
      timeout,
      memorySize,
      environment,
      logGroup,
      role,
      tracing: lambda.Tracing.ACTIVE,
      bundling: { minify: true, sourceMap: false, externalModules: [] },
      depsLockFilePath: path.join(currentDirectory, "../package-lock.json"),
    });
  }

  private grantDataKeyUse(key: kms.IKey, grantee: iam.IGrantable): void {
    grantee.grantPrincipal.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ["kms:Decrypt", "kms:DescribeKey", "kms:Encrypt", "kms:GenerateDataKey", "kms:GenerateDataKeyWithoutPlaintext", "kms:ReEncryptFrom", "kms:ReEncryptTo"],
      resources: [key.keyArn],
    }));
  }

  private grantBucketPrefixAccess(bucket: s3.IBucket, grantee: iam.IGrantable, prefixes: string[], actions: string[]): void {
    grantee.grantPrincipal.addToPrincipalPolicy(new iam.PolicyStatement({
      actions,
      resources: prefixes.map((prefix) => `${bucket.bucketArn}/${prefix}`),
    }));
  }

  private grantActions(grantee: iam.IGrantable, resource: string, actions: string[]): void {
    grantee.grantPrincipal.addToPrincipalPolicy(new iam.PolicyStatement({ actions, resources: [resource] }));
  }

  private logGroup(id: string): logs.LogGroup {
    return new logs.LogGroup(this, id, { retention: logs.RetentionDays.ONE_WEEK, removalPolicy: RemovalPolicy.DESTROY });
  }

  private alarm(id: string, metric: cloudwatch.IMetric, threshold: number): cloudwatch.Alarm {
    return new cloudwatch.Alarm(this, id, { metric, threshold, evaluationPeriods: 1, datapointsToAlarm: 1, treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING });
  }
}

function positiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error("CDK numeric context must contain positive integers.");
  return parsed;
}

function parseAllowedOrigins(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    // A single explicit origin is also accepted as CDK command-line context.
  }
  return [value];
}

function isExactHttpsOrigin(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.origin === value && !parsed.username && !parsed.password && !value.includes("*");
  } catch {
    return false;
  }
}
