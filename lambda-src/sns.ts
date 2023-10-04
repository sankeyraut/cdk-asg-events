/* eslint-disable @typescript-eslint/require-await */
import { SNSEvent, SNSEventRecord } from "aws-lambda";
import AWS = require("aws-sdk");
import { customBackoffFunction } from "./helper";
import { Event, STATE } from "./interface";
AWS.config.update({
  retryDelayOptions: { customBackoff: customBackoffFunction },
});

const docClient = new AWS.DynamoDB.DocumentClient({ maxRetries: 10 });
const tableName = process.env.TABLE_NAME || "Tablename";
export async function main(event: SNSEvent): Promise<void> {
  console.log("event 👉", JSON.stringify(event));
  var recordsArray: SNSEventRecord[] = event.Records;
  for (var i = 0; i < recordsArray.length; i++) {
    console.log("Record is => ", JSON.stringify(recordsArray[i]));
    console.log("Message is = > ", recordsArray[i].Sns.Message);
    const message = JSON.parse(recordsArray[i].Sns.Message);
    //insert record in ddb (provisioned and in inservice)
    const event: Event = {
      asgname: message.AutoScalingGroupName,
      instanceid: message.EC2InstanceId + "#" + STATE.LAUNCHED,
      state: STATE.LAUNCHED,
      starttimestamp: Date.parse(message.StartTime).valueOf(),
      endtimestamp: Date.parse(message.EndTime).valueOf(),
      description: `TimeStamp : ${message.StartTime} : ${message.EC2InstanceId} launched in  asg ${message.AutoScalingGroupName}`,
    };

    await docClient
      .put({
        TableName: tableName,
        Item: event,
      })
      .promise();
  }
}
