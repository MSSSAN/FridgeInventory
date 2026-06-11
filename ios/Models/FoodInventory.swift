import Foundation
import UIKit

struct FoodInventory: Codable {
    var categories: [String: [FoodItem]] = [:]

    var allItems: [FoodItem] {
        categories.values.flatMap { $0 }
    }
}

struct FoodItem: Identifiable, Codable, Hashable {
    var id: String
    var name: String
    var category: String
    var quantity: String?
    var bbox: BoundingBox?
    var sourceImageIndex: Int?
    var pictureTakenAt: String?
    var expirationDate: String?
    var purchaseDate: String?
    var conditionWhenPhotographed: String?
    var estimatedConditionNow: String?
    var daysUntilExpiration: Int?
    var storageGuidance: String?
    var aiNotes: String?
    var userNotes: String?

    // Runtime-only value. Store generated thumbnails separately if persistence is needed.
    var croppedImage: UIImage? = nil

    enum CodingKeys: String, CodingKey {
        case id, name, category, quantity, bbox, sourceImageIndex, pictureTakenAt, expirationDate
        case purchaseDate, conditionWhenPhotographed, estimatedConditionNow, daysUntilExpiration
        case storageGuidance, aiNotes, userNotes
    }
}

struct BoundingBox: Codable, Hashable {
    var ymin: CGFloat
    var xmin: CGFloat
    var ymax: CGFloat
    var xmax: CGFloat
}
