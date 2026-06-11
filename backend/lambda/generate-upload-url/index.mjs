import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const REGION = process.env.AWS_REGION || "ap-southeast-1";
const BUCKET_NAME = process.env.IMAGE_BUCKET || "your-app-chat-images";
const UPLOAD_PREFIX = process.env.UPLOAD_PREFIX || "uploads";

const s3Client = new S3Client({ region: REGION });

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
    const contentType = event.queryStringParameters?.contentType || "image/jpeg";
    const extension = contentType.includes("png") ? "png" : "jpg";
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 10);
    const imageKey = `${UPLOAD_PREFIX}/${timestamp}-${randomId}.${extension}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: imageKey,
      ContentType: contentType
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        uploadUrl,
        imageKey,
        expiresIn: 300,
        contentType
      })
    };
  } catch (error) {
    console.error("Error generating presigned URL:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Failed to generate upload URL", message: error.message })
    };
  }
};
