import { Context, Callback } from "aws-lambda";
import { AutoScaling } from "aws-sdk";
import AWS = require("aws-sdk");
import { customBackoffFunction } from "./helper";
import { Event, STATE } from "./interface";

AWS.config.update({
  retryDelayOptions: { customBackoff: customBackoffFunction },
});

const docClient = new AWS.DynamoDB.DocumentClient({ maxRetries: 10 });
const tableName = process.env.TABLE_NAME || "Tablename";
const asgName = process.env.ASG_NAME || "AsgName";
exports.main = async (event: any, context: Context, callback: Callback) => {
  console.log("Received event:", JSON.stringify(event));
  console.log("Details of event : ", event.detail);
  const detail = event.detail;
  if (detail.eventName == "RegisterTargets") {
    //iterate through the targets
    var targets = [];
    for (var i = 0; i < detail.requestParameters.targets.length; i++) {
      const event: Event = {
        asgname: asgName,
        instanceid:
          detail.requestParameters.targets[i].id + "#" + STATE.REGISTERED,
        state: STATE.REGISTERED,
        starttimestamp: Date.parse(detail.eventTime).valueOf(),
        endtimestamp: new Date().valueOf(),
        description: `TimeStamp : ${detail.eventTime} : ${detail.eventName} for ${detail.requestParameters.targets[i].id} for asg ${asgName}`,
      };

      await docClient
        .put({
          TableName: tableName,
          Item: event,
        })
        .promise();

      console.log(
        "Instnace id ",
        detail.requestParameters.targets[i].id,
        " registered for ",
        asgName
      );
    }
  }
};
