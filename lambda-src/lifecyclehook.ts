import { Context, Callback, SNSEvent, SNSEventRecord } from "aws-lambda";
import { AutoScaling } from "aws-sdk";
import AWS = require("aws-sdk");
import { customBackoffFunction } from "./helper";
import { Event, STATE } from "./interface";

AWS.config.update({
  retryDelayOptions: { customBackoff: customBackoffFunction },
});
const autoScaling = new AutoScaling({ maxRetries: 10 });
const docClient = new AWS.DynamoDB.DocumentClient({ maxRetries: 10 });
const tableName = process.env.TABLE_NAME || "Tablename";
exports.main = async (
  event: SNSEvent,
  context: Context,
  callback: Callback
) => {
  console.log("Received event:", JSON.stringify(event));
  var recordsArray: SNSEventRecord[] = event.Records;
  for (var i = 0; i < recordsArray.length; i++) {
    console.log("Record is => ", JSON.stringify(recordsArray[i]));
    console.log("Message is = > ", recordsArray[i].Sns.Message);
    const message = JSON.parse(recordsArray[i].Sns.Message);
    const params = {
      AutoScalingGroupName: message.AutoScalingGroupName,
      LifecycleActionResult: "CONTINUE",
      LifecycleActionToken: message.LifecycleActionToken,
      LifecycleHookName: message.LifecycleHookName,
    };
    const data = await autoScaling.completeLifecycleAction(params).promise();

    console.log("Lifecycle action completed successfully:", data);

    //insert record in ddb (life cycle action complete)
    const event: Event = {
      asgname: message.AutoScalingGroupName,
      instanceid: message.EC2InstanceId + "#" + STATE.LIFECYCLECOMPLETED,
      state: STATE.LIFECYCLECOMPLETED,
      starttimestamp: Date.parse(message.Time).valueOf(),
      endtimestamp: new Date().valueOf(),
      description: `TimeStamp : ${message.Time} : Lifecycle completed for ${message.EC2InstanceId} in ${message.AutoScalingGroupName}`,
    };

    await docClient
      .put({
        TableName: tableName,
        Item: event,
      })
      .promise();

    callback(null, "Lifecycle action completed successfully");
  }
};
