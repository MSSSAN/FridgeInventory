import UIKit

struct ImageCropper {
    static func crop(image: UIImage, bbox: BoundingBox, paddingRatio: CGFloat = 0.04) -> UIImage? {
        guard let cgImage = image.cgImage else { return nil }

        let imageWidth = CGFloat(cgImage.width)
        let imageHeight = CGFloat(cgImage.height)

        var x = bbox.xmin * imageWidth
        var y = bbox.ymin * imageHeight
        var width = (bbox.xmax - bbox.xmin) * imageWidth
        var height = (bbox.ymax - bbox.ymin) * imageHeight

        let paddingX = width * paddingRatio
        let paddingY = height * paddingRatio

        x = max(0, x - paddingX)
        y = max(0, y - paddingY)
        width = min(imageWidth - x, width + paddingX * 2)
        height = min(imageHeight - y, height + paddingY * 2)

        let rect = CGRect(x: x, y: y, width: width, height: height).integral
        guard let croppedCGImage = cgImage.cropping(to: rect) else { return nil }
        return UIImage(cgImage: croppedCGImage, scale: image.scale, orientation: image.imageOrientation)
    }

    static func attachCrops(to inventory: FoodInventory, sourceImages: [UIImage]) -> FoodInventory {
        var updated = inventory
        for category in updated.categories.keys {
            updated.categories[category] = updated.categories[category]?.map { item in
                var newItem = item
                if let bbox = item.bbox,
                   let sourceIndex = item.sourceImageIndex,
                   sourceImages.indices.contains(sourceIndex) {
                    newItem.croppedImage = crop(image: sourceImages[sourceIndex], bbox: bbox)
                }
                return newItem
            }
        }
        return updated
    }
}
