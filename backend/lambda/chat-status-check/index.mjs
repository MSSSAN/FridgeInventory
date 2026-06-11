import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

const REGION = process.env.AWS_REGION || "ap-southeast-1";
const TABLE_NAME = process.env.CHAT_TABLE || "ChatHistory";

const dynamoClient = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "application/json"
};

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    const sessionID = event.queryStringParameters?.sessionID || event.queryStringParameters?.sessionId;
    const timestamp = Number(event.queryStringParameters?.timestamp);

    if (!sessionID || !timestamp) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing sessionID or timestamp" }) };
    }

    const result = await docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "sessionID = :s AND #ts >= :t",
      ExpressionAttributeNames: { "#ts": "timestamp" },
      ExpressionAttributeValues: { ":s": sessionID, ":t": timestamp },
      Limit: 2,
      ScanIndexForward: true
    }));

    const userMessage = result.Items?.[0];
    const aiMessage = result.Items?.[1];

    if (!userMessage) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: "Message not found" }) };
    }

    if (userMessage.status === "failed") {
      return { statusCode: 200, headers, body: JSON.stringify({ status: "failed", error: userMessage.errorMessage || "Processing failed" }) };
    }

    if (userMessage.status === "completed" && aiMessage) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          status: "completed",
          response: aiMessage.content,
          inventory: aiMessage.inventory || null
        })
      };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ status: "processing", message: "Still thinking..." }) };
  } catch (error) {
    console.error("Status check error:", error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Internal server error", message: error.message }) };
  }
};
