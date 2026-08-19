#!/usr/bin/env node
import { App, Aspects } from "aws-cdk-lib";
import { AwsSolutionsChecks } from "cdk-nag";
import { ConsultAwsPilotStack } from "../lib/consult-aws-pilot-stack.js";

const app = new App();
new ConsultAwsPilotStack(app, "ConsultAwsPilotStack", {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION ?? "us-east-1" },
  description: "Synthetic-only durable audio transcription and structured analysis pilot for Trinity Consult",
});
Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));
