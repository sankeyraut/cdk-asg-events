#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { AsgCdkStack } from "../lib/asg-cdk-stack";

const app = new cdk.App();

const asgstack = new AsgCdkStack(app, "AsgCdkStack", {
  VpcId: "vpc-0669cd60",
  InstanceType: "t3.micro",
  InstancePort: 80,
  HealthCheckPath: "/",
  HealthCheckPort: "80",
  HealthCheckHttpCodes: "200",
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
cdk.Tags.of(asgstack).add("auto-delete", "never");
