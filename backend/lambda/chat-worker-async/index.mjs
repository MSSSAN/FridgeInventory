import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
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

const systemPrompt = `You are a smart refrigerator inventory assistant. Analyze refrigerator images and return structured food inventory JSON inside <INVENTORY> tags. Include category, quantity, freshness, estimated expiration, storage guidance, sourceImageIndex, and normalized bbox coordinates for every visible item.`;

export const handler = async (event) => {
  console.log("Worker started:", JSON.stringify(event));

  try {
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

    const { sessionID, userText = "", imageKeys = [], userTimestamp } = event;

    const historyResult = await docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "sessionID = :s",
      ExpressionAttributeValues: { ":s": sessionID },
      Limit: 20,
      ScanIndexForward: true
    }));

    const previousMessages = (historyResult.Items || [])
      .filter(item => item.status === "completed" && item.content)
      .map(item => ({ role: item.role === "assistant" ? "assistant" : "user", content: item.content }));

    const currentContent = [];
    if (userText) currentContent.push({ type: "text", text: userText });
    if (!userText && imageKeys.length > 0) {
      currentContent.push({ type: "text", text: "Analyze these refrigerator images and create an inventory." });
    }

    for (const imageKey of imageKeys) {
      const imageBase64 = await getImageBase64FromS3(imageKey);
      currentContent.push({
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${imageBase64}` }
      });
    }

    const currentUserMessage = {
      role: "user",
      content: currentContent.length === 1 && currentContent[0].type === "text" ? currentContent[0].text : currentContent
    };

    const openaiResponse = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          ...previousMessages,
          currentUserMessage
        ],
        max_tokens: 4096,
        temperature: 0.2
      })
    });

    const openaiData = await openaiResponse.json();
    if (!openaiResponse.ok) throw new Error(openaiData.error?.message || "OpenAI API error");

    const aiResponseText = openaiData.choices?.[0]?.message?.content || "";

    await docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { sessionID, timestamp: userTimestamp },
      UpdateExpression: "SET #status = :completed",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":completed": "completed" }
    }));

    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        sessionID,
        timestamp: userTimestamp + 1,
        role: "assistant",
        content: aiResponseText,
        status: "completed",
        inventory: extractInventoryJson(aiResponseText)
      }
    }));

    console.log("Worker completed successfully");
    return { success: true };
  } catch (error) {
    console.error("Worker error:", error);
    await markFailed(event, error).catch(updateError => console.error("Failed to mark error:", updateError));
    throw error;
  }
};

async function getImageBase64FromS3(imageKey) {
  const response = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: imageKey }));
  const buffer = await streamToBuffer(response.Body);
  return buffer.toString("base64");
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function markFailed(event, error) {
  if (!event?.sessionID || !event?.userTimestamp) return;
  await docClient.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { sessionID: event.sessionID, timestamp: event.userTimestamp },
    UpdateExpression: "SET #status = :failed, errorMessage = :msg",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: { ":failed": "failed", ":msg": error.message }
  }));
}

function extractInventoryJson(text) {
  const match = text.match(/<INVENTORY>\s*([\s\S]*?)\s*<\/INVENTORY>/i);
  if (!match) return null;
  try { return JSON.parse(match[1]); } catch { return null; }
}
