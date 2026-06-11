import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const REGION = process.env.AWS_REGION || "ap-southeast-1";
const TABLE_NAME = process.env.CHAT_TABLE || "ChatHistory";
const BUCKET_NAME = process.env.IMAGE_BUCKET || "your-app-chat-images";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

const dynamoClient = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({ region: REGION });

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

const systemPrompt = `You are a smart refrigerator inventory assistant.
Analyze the uploaded refrigerator images and detect visible food and beverage items.
Return a concise summary and include valid JSON inside <INVENTORY> tags.
Each item should include id, name, category, quantity, bbox, sourceImageIndex, expirationDate, daysUntilExpiration, conditionWhenPhotographed, estimatedConditionNow, storageGuidance, aiNotes, and userNotes.
All bbox values must be normalized numbers from 0 to 1: ymin, xmin, ymax, xmax.`;

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

    const body = JSON.parse(event.body || "{}");
    const sessionID = body.sessionID || body.sessionId;
    const userText = body.userText || body.message || "Analyze this refrigerator image and organize the food inventory.";
    const imageKeys = body.imageKeys || [];
    const timestamp = Date.now();

    if (!sessionID) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing sessionID" }) };
    }

    const historyResult = await docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "sessionID = :s",
      ExpressionAttributeValues: { ":s": sessionID },
      Limit: 20,
      ScanIndexForward: true
    }));

    const previousMessages = (historyResult.Items || [])
      .filter(item => item.status !== "processing" && item.content)
      .map(item => ({ role: item.role === "assistant" ? "assistant" : "user", content: item.content }));

    const currentContent = [{ type: "text", text: userText }];

    for (let index = 0; index < imageKeys.length; index += 1) {
      const imageBase64 = await getImageBase64FromS3(imageKeys[index]);
      currentContent.push({
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${imageBase64}` }
      });
    }

    const currentUserMessage = {
      role: "user",
      content: currentContent.length === 1 ? userText : currentContent
    };

    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        sessionID,
        timestamp,
        role: "user",
        content: userText || "[Image]",
        imageKeys,
        status: "completed"
      }
    }));

    const messages = [
      { role: "system", content: systemPrompt },
      ...previousMessages,
      currentUserMessage
    ];

    const openaiResponse = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages,
        max_tokens: 4096,
        temperature: 0.2
      })
    });

    const openaiData = await openaiResponse.json();
    if (!openaiResponse.ok) {
      throw new Error(openaiData.error?.message || "OpenAI API error");
    }

    const aiResponseText = openaiData.choices?.[0]?.message?.content || "";

    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        sessionID,
        timestamp: timestamp + 1,
        role: "assistant",
        content: aiResponseText,
        status: "completed"
      }
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        response: aiResponseText,
        inventory: extractInventoryJson(aiResponseText)
      })
    };
  } catch (error) {
    console.error("Chat worker error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Internal server error", message: error.message })
    };
  }
};

async function getImageBase64FromS3(imageKey) {
  const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: imageKey });
  const response = await s3Client.send(command);
  const buffer = await streamToBuffer(response.Body);
  return buffer.toString("base64");
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function extractInventoryJson(text) {
  const match = text.match(/<INVENTORY>\s*([\s\S]*?)\s*<\/INVENTORY>/i);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}
