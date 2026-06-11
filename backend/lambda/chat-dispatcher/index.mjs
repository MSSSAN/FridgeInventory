import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const REGION = process.env.AWS_REGION || "ap-southeast-1";
const TABLE_NAME = process.env.CHAT_TABLE || "ChatHistory";
const WORKER_LAMBDA_NAME = process.env.WORKER_LAMBDA_NAME || "chat-worker";

const dynamoClient = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const lambdaClient = new LambdaClient({ region: REGION });

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const sessionID = body.sessionID || body.sessionId;
    const userText = body.userText || body.message || "";
    const imageKeys = body.imageKeys || [];

    if (!sessionID) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing sessionID" }) };
    }

    const currentTimestamp = Date.now();
    const requestId = `${sessionID}-${currentTimestamp}`;

    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        sessionID,
        timestamp: currentTimestamp,
        role: "user",
        content: userText || "[Image]",
        imageKeys,
        status: "processing"
      }
    }));

    await lambdaClient.send(new InvokeCommand({
      FunctionName: WORKER_LAMBDA_NAME,
      InvocationType: "Event",
      Payload: JSON.stringify({
        sessionID,
        userText,
        imageKeys,
        requestId,
        userTimestamp: currentTimestamp
      })
    }));

    return {
      statusCode: 202,
      headers,
      body: JSON.stringify({
        status: "processing",
        requestId,
        message: "Request accepted, processing..."
      })
    };
  } catch (error) {
    console.error("Dispatcher error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Internal server error", message: error.message })
    };
  }
};
