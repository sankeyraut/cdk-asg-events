import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as autoscaling from "aws-cdk-lib/aws-autoscaling";
import * as sns from "aws-cdk-lib/aws-sns";
import * as events from "aws-cdk-lib/aws-events";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { LambdaSubscription } from "aws-cdk-lib/aws-sns-subscriptions";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as path from "path";
import { aws_autoscaling_hooktargets as autoscaling_hooktargets } from "aws-cdk-lib";
import * as targets from "aws-cdk-lib/aws-events-targets";

interface ICdkEc2Props extends cdk.StackProps {
  VpcId: string;
  InstanceType: string;
  InstancePort: number;
  HealthCheckPath: string;
  HealthCheckPort: string;
  HealthCheckHttpCodes: string;
}

export class AsgCdkStack extends cdk.Stack {
  readonly loadBalancer: elbv2.ApplicationLoadBalancer;
  constructor(scope: Construct, id: string, props: ICdkEc2Props) {
    super(scope, id, props);

    //dynamodb
    const dynamodbloggertable = new dynamodb.TableV2(this, "LoggerTable", {
      partitionKey: { name: "asgname", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "instanceid", type: dynamodb.AttributeType.STRING },
    });

    const asgnotification = new sns.Topic(this, "ASG NOtifications");

    const vpc = ec2.Vpc.fromLookup(this, "VPC", {
      vpcId: props.VpcId,
    });

    const asgnotificationlogger = new NodejsFunction(
      this,
      "notificationlogger",
      {
        memorySize: 1024,
        timeout: cdk.Duration.seconds(5),
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: "main",
        entry: path.join(__dirname, `./../lambda-src/sns.ts`),
      }
    );
    asgnotification.addSubscription(
      new LambdaSubscription(asgnotificationlogger)
    );

    const asgLifecyclelogger = new NodejsFunction(this, "lifecyclelogger", {
      memorySize: 1024,
      timeout: cdk.Duration.seconds(5),
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: "main",
      entry: path.join(__dirname, `./../lambda-src/lifecyclehook.ts`),
    });

    const loadbalancerLogger = new NodejsFunction(this, "loadbalancerLogger", {
      memorySize: 1024,
      timeout: cdk.Duration.seconds(5),
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: "main",
      entry: path.join(__dirname, `./../lambda-src/loadbalancerLogger.ts`),
    });

    asgLifecyclelogger.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["autoscaling:CompleteLifecycleAction"],
        resources: ["*"],
      })
    );

    this.loadBalancer = new elbv2.ApplicationLoadBalancer(
      this,
      `ApplicationLoadBalancerPublic`,
      {
        vpc,
        internetFacing: true,
      }
    );

    const httpsListener = this.loadBalancer.addListener("ALBListenerHttps", {
      protocol: elbv2.ApplicationProtocol.HTTP,
      port: 80,
    });

    const autoScalingGroup = new autoscaling.AutoScalingGroup(
      this,
      "AutoScalingGroup",
      {
        vpc,

        instanceType: new ec2.InstanceType(props.InstanceType),
        machineImage: ec2.MachineImage.latestAmazonLinux2(),
        allowAllOutbound: true,
        healthCheck: autoscaling.HealthCheck.ec2(),
        desiredCapacity: 3,
        maxCapacity: 10,
        minCapacity: 0,
        notifications: [
          {
            topic: asgnotification,
            scalingEvents: autoscaling.ScalingEvents.ALL,
          },
        ],
      }
    );

    asgLifecyclelogger.addPermission("InvokeByASG", {
      principal: new iam.ServicePrincipal("autoscaling.amazonaws.com"),
    });

    autoScalingGroup.addUserData(
      "sudo yum install -y https://s3.region.amazonaws.com/amazon-ssm-region/latest/linux_amd64/amazon-ssm-agent.rpm"
    );
    autoScalingGroup.addUserData("sudo systemctl enable amazon-ssm-agent");
    autoScalingGroup.addUserData("sudo systemctl start amazon-ssm-agent");
    autoScalingGroup.addUserData("sudo yum install -y httpd");
    autoScalingGroup.addUserData("sudo systemctl start httpd");
    autoScalingGroup.addUserData("sudo systemctl enable httpd");
    autoScalingGroup.addUserData("sudo touch /var/www/html/index.html");

    //lifecycle hooks

    autoScalingGroup.addLifecycleHook("LoggingLC", {
      lifecycleTransition: autoscaling.LifecycleTransition.INSTANCE_LAUNCHING,
      defaultResult: autoscaling.DefaultResult.ABANDON,
      heartbeatTimeout: cdk.Duration.minutes(2),
      notificationTarget: new autoscaling_hooktargets.FunctionHook(
        asgLifecyclelogger
      ),
    });

    httpsListener.addTargets("TargetGroup", {
      port: props.InstancePort,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [autoScalingGroup],
      healthCheck: {
        path: props.HealthCheckPath,
        port: props.HealthCheckPort,
        healthyHttpCodes: props.HealthCheckHttpCodes,
      },
    });

    dynamodbloggertable.grantReadWriteData(asgLifecyclelogger);
    dynamodbloggertable.grantReadWriteData(asgnotificationlogger);
    dynamodbloggertable.grantReadWriteData(loadbalancerLogger);

    asgLifecyclelogger.addEnvironment(
      "TABLE_NAME",
      dynamodbloggertable.tableName
    );
    asgnotificationlogger.addEnvironment(
      "TABLE_NAME",
      dynamodbloggertable.tableName
    );
    loadbalancerLogger.addEnvironment(
      "TABLE_NAME",
      dynamodbloggertable.tableName
    );
    loadbalancerLogger.addEnvironment(
      "ASG_NAME",
      autoScalingGroup.autoScalingGroupName
    );

    const rule = new events.Rule(this, "rule", {
      eventPattern: {
        source: ["aws.elasticloadbalancing"],
      },
    });
    rule.addTarget(new targets.LambdaFunction(loadbalancerLogger));
  }
}
