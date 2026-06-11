import Foundation

struct AppConfig {
    static let backendURL = "https://YOUR-API-ID.execute-api.YOUR-REGION.amazonaws.com/YOUR_STAGE"
    static let chatEndpoint = "\(backendURL)/chat"
    static let statusEndpoint = "\(backendURL)/status"
    static let uploadURLEndpoint = "\(backendURL)/upload-url"

    static var sessionID: String {
        let key = "smart_fridge_session_id"
        if let existing = UserDefaults.standard.string(forKey: key) {
            return existing
        }
        let newID = UUID().uuidString
        UserDefaults.standard.set(newID, forKey: key)
        return newID
    }
}
