import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { ConsultAwsPilotStack } from "../lib/consult-aws-pilot-stack.js";

function synthesizedTemplate(): Template {
  const app = new App({ context: {
    allowedOrigins: ["https://consult.synthetic.example"],
    audioRetentionDays: 30,
    maxUploadMb: 25,
    bedrockModelId: "amazon.nova-lite-v1:0",
    transcribeLanguageCode: "en-US",
    transcribeMaxSpeakers: 2,
  } });
  const stack = new ConsultAwsPilotStack(app, "TestStack", { env: { account: "111111111111", region: "us-east-1" } });
  return Template.fromStack(stack);
}

describe("synthetic AWS pilot infrastructure", () => {
  const template = synthesizedTemplate();

  it("uses private encrypted storage, explicit CORS, retention, and durable state", () => {
    template.hasResourceProperties("AWS::S3::Bucket", {
      BucketEncryption: Match.objectLike({ ServerSideEncryptionConfiguration: Match.arrayWith([Match.objectLike({ ServerSideEncryptionByDefault: Match.objectLike({ SSEAlgorithm: "aws:kms" }) })]) }),
      PublicAccessBlockConfiguration: { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true },
      CorsConfiguration: Match.objectLike({ CorsRules: Match.arrayWith([Match.objectLike({ AllowedOrigins: ["https://consult.synthetic.example"], AllowedMethods: ["POST"] })]) }),
      LifecycleConfiguration: Match.objectLike({ Rules: Match.arrayWith([Match.objectLike({ Prefix: "uploads/", Status: "Enabled" })]) }),
      LoggingConfiguration: Match.anyValue(),
    });
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      BillingMode: "PAY_PER_REQUEST",
      PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
      TimeToLiveSpecification: { AttributeName: "retentionExpiresAt", Enabled: true },
      SSESpecification: Match.objectLike({ SSEEnabled: true, SSEType: "KMS" }),
    });
    template.resourceCountIs("AWS::SQS::Queue", 2);
    template.hasResourceProperties("AWS::SQS::Queue", { RedrivePolicy: Match.anyValue(), KmsMasterKeyId: Match.anyValue() });
  });

  it("protects every route and uses a logged Standard workflow", () => {
    template.resourceCountIs("AWS::ApiGatewayV2::Route", 5);
    const routes = template.findResources("AWS::ApiGatewayV2::Route");
    expect(Object.values(routes).every((route) => route.Properties.AuthorizationType === "CUSTOM" && route.Properties.AuthorizerId)).toBe(true);
    template.hasResourceProperties("AWS::StepFunctions::StateMachine", {
      StateMachineType: "STANDARD",
      TracingConfiguration: { Enabled: true },
      LoggingConfiguration: Match.objectLike({ IncludeExecutionData: false, Level: "ALL" }),
    });
    template.hasResourceProperties("AWS::Lambda::Function", { Runtime: "nodejs24.x", TracingConfig: { Mode: "Active" } });
    template.resourceCountIs("AWS::CloudWatch::Alarm", 6);
  });

  it("has no AWS-managed role policy, wildcard IAM action, or existing-Lambda mutation", () => {
    template.hasResourceProperties("AWS::IAM::Role", {
      AssumeRolePolicyDocument: Match.objectLike({ Statement: Match.arrayWith([Match.objectLike({
        Principal: { Service: "transcribe.amazonaws.com" },
        Condition: Match.objectLike({ StringEquals: Match.objectLike({ "aws:SourceAccount": "111111111111" }), ArnLike: Match.anyValue() }),
      })]) }),
    });
    const json = template.toJSON() as { Resources: Record<string, { Type: string; Properties?: Record<string, unknown> }> };
    const serialized = JSON.stringify(json);
    expect(serialized).not.toContain("consult-transcribe");
    expect(serialized).not.toContain("AWSLambdaBasicExecutionRole");
    for (const resource of Object.values(json.Resources)) {
      if (resource.Type !== "AWS::IAM::Policy") continue;
      const document = resource.Properties?.PolicyDocument as { Statement?: Array<{ Action?: string | string[] }> } | undefined;
      for (const statement of document?.Statement ?? []) {
        const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
        expect(actions).not.toContain("*");
      }
    }
  });
});
