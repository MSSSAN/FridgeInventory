import Foundation
import UIKit

struct FridgeAIService {
    struct ChatRequest: Codable {
        let sessionID: String
        let userText: String
        let imageKeys: [String]
    }

    struct SyncChatResponse: Codable {
        let response: String?
        let inventory: FoodInventory?
    }

    struct AsyncChatResponse: Codable {
        let status: String
        let requestId: String?
        let message: String?
    }

    struct StatusResponse: Codable {
        let status: String
        let response: String?
        let inventory: FoodInventory?
        let message: String?
        let error: String?
    }

    static func sendSync(text: String, images: [UIImage]) async throws -> SyncChatResponse {
        let imageKeys = try await S3UploadService.uploadImages(images)
        guard let url = URL(string: AppConfig.chatEndpoint) else { throw URLError(.badURL) }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 180
        request.httpBody = try JSONEncoder().encode(ChatRequest(
            sessionID: AppConfig.sessionID,
            userText: text,
            imageKeys: imageKeys
        ))

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw URLError(.badServerResponse)
        }
        return try JSONDecoder().decode(SyncChatResponse.self, from: data)
    }

    static func sendAsync(text: String, images: [UIImage]) async throws -> (sessionID: String, timestamp: Int) {
        let imageKeys = try await S3UploadService.uploadImages(images)
        guard let url = URL(string: AppConfig.chatEndpoint) else { throw URLError(.badURL) }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 30
        request.httpBody = try JSONEncoder().encode(ChatRequest(
            sessionID: AppConfig.sessionID,
            userText: text,
            imageKeys: imageKeys
        ))

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 202 else {
            throw URLError(.badServerResponse)
        }

        let chatResponse = try JSONDecoder().decode(AsyncChatResponse.self, from: data)
        let timestamp = extractTimestamp(from: chatResponse.requestId) ?? Int(Date().timeIntervalSince1970 * 1000)
        return (AppConfig.sessionID, timestamp)
    }

    static func checkStatus(sessionID: String, timestamp: Int) async throws -> StatusResponse {
        guard var components = URLComponents(string: AppConfig.statusEndpoint) else {
            throw URLError(.badURL)
        }
        components.queryItems = [
            URLQueryItem(name: "sessionID", value: sessionID),
            URLQueryItem(name: "timestamp", value: String(timestamp))
        ]
        guard let url = components.url else { throw URLError(.badURL) }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 10

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw URLError(.badServerResponse)
        }

        return try JSONDecoder().decode(StatusResponse.self, from: data)
    }

    static func pollForResponse(sessionID: String, timestamp: Int, maxAttempts: Int = 60) async throws -> StatusResponse {
        for _ in 1...maxAttempts {
            let status = try await checkStatus(sessionID: sessionID, timestamp: timestamp)
            switch status.status {
            case "completed":
                return status
            case "failed":
                throw NSError(domain: "AI Processing", code: -1, userInfo: [
                    NSLocalizedDescriptionKey: status.error ?? "Processing failed"
                ])
            case "processing":
                try await Task.sleep(nanoseconds: 2_000_000_000)
            default:
                throw URLError(.unknown)
            }
        }

        throw NSError(domain: "Timeout", code: -1, userInfo: [
            NSLocalizedDescriptionKey: "Request timed out after 2 minutes"
        ])
    }

    private static func extractTimestamp(from requestId: String?) -> Int? {
        guard let requestId else { return nil }
        return Int(requestId.split(separator: "-").last ?? "")
    }
}
