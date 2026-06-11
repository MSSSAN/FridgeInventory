import Foundation
import UIKit

struct S3UploadService {
    struct PresignedURLResponse: Codable {
        let uploadUrl: String
        let imageKey: String
        let expiresIn: Int?
        let contentType: String?
    }

    static func getPresignedURL(contentType: String = "image/jpeg") async throws -> PresignedURLResponse {
        guard var components = URLComponents(string: AppConfig.uploadURLEndpoint) else {
            throw URLError(.badURL)
        }
        components.queryItems = [URLQueryItem(name: "contentType", value: contentType)]

        guard let url = components.url else { throw URLError(.badURL) }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 30

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw URLError(.badServerResponse)
        }

        return try JSONDecoder().decode(PresignedURLResponse.self, from: data)
    }

    static func uploadImage(_ image: UIImage, to presignedURL: String, compressionQuality: CGFloat = 0.8) async throws {
        guard let url = URL(string: presignedURL) else { throw URLError(.badURL) }
        guard let imageData = image.jpegData(compressionQuality: compressionQuality) else {
            throw URLError(.cannotDecodeContentData)
        }

        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        request.setValue("image/jpeg", forHTTPHeaderField: "Content-Type")
        request.httpBody = imageData
        request.timeoutInterval = 60

        let (_, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw URLError(.badServerResponse)
        }
    }

    static func uploadImages(_ images: [UIImage]) async throws -> [String] {
        var imageKeys: [String] = []
        for image in images {
            let urlResponse = try await getPresignedURL()
            try await uploadImage(image, to: urlResponse.uploadUrl)
            imageKeys.append(urlResponse.imageKey)
        }
        return imageKeys
    }
}
