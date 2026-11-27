import Foundation

enum VoiceNoteError: LocalizedError {
    case invalidAudio, configuration, unavailable, unclear, tooLong
    var errorDescription: String? {
        switch self {
        case .invalidAudio: return "Choose an Opus/OGG, M4A, MP3, WAV or WebM note smaller than 4 MB."
        case .configuration: return "This app build is not connected to the mobile translation service."
        case .unavailable: return "Translation is unavailable. Check your connection and try again shortly."
        case .unclear: return "No clear translation was returned. Try a clearer note and check the original."
        case .tooLong: return "Choose a shorter voice note."
        }
    }
}

// No API keys in the extension. Uses the same server-side transcription and
// translation pipeline as the PWA, through the gated mobile API adapter.
struct VoiceNoteAPI {
    let backend: URL
    init(bundle: Bundle = .main) throws {
        guard let path = bundle.url(forResource: "Backend", withExtension: "plist"),
              let data = try? Data(contentsOf: path),
              let info = try? PropertyListSerialization.propertyList(from: data, format: nil) as? [String: String],
              let value = info["BackendOrigin"], let url = URL(string: value), url.scheme == "https",
              let host = url.host, (host.hasSuffix(".vercel.app") || host == "voicetranslator.eu" || host.hasSuffix(".voicetranslator.eu")),
              url.user == nil, url.password == nil, url.port == nil, url.query == nil, url.fragment == nil,
              url.path.isEmpty || url.path == "/" else { throw VoiceNoteError.configuration }
        backend = url
    }
    static func mime(_ data: Data) throws -> String {
        let b = [UInt8](data.prefix(64))
        guard data.count >= 12, data.count <= 4_000_000 else { throw VoiceNoteError.invalidAudio }
        func text(_ from: Int, _ to: Int) -> String { String(bytes: b[from..<min(to, b.count)], encoding: .ascii) ?? "" }
        if text(0, 4) == "OggS" { return "audio/ogg" }
        if text(4, 8) == "ftyp" { return "audio/mp4" }
        if text(0, 3) == "ID3" || (b[0] == 0xff && b[1] & 0xe0 == 0xe0) { return "audio/mpeg" }
        if text(0, 4) == "RIFF" && text(8, 12) == "WAVE" { return "audio/wav" }
        if Array(b.prefix(4)) == [0x1a, 0x45, 0xdf, 0xa3] { return "audio/webm" }
        throw VoiceNoteError.invalidAudio
    }
    func post(_ route: String, body: Data, type: String = "application/json", source: String? = nil) async throws -> Data {
        guard ["transcribe-audio", "translate"].contains(route) else { throw VoiceNoteError.configuration }
        var request = URLRequest(url: backend.appendingPathComponent("api/mobile/v1/" + route))
        request.httpMethod = "POST"; request.httpBody = body
        request.timeoutInterval = route == "transcribe-audio" ? 40 : 25
        request.setValue(type, forHTTPHeaderField: "Content-Type")
        request.setValue("capacitor://localhost", forHTTPHeaderField: "Origin")
        if let source {
            request.setValue(source, forHTTPHeaderField: "X-Source-Language")
            request.setValue("audio-v1", forHTTPHeaderField: "X-VoiceTranslator-Consent")
        }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.urlCache = nil; configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.timeoutIntervalForResource = request.timeoutInterval
        let delegate = NoRedirects()
        let session = URLSession(configuration: configuration, delegate: delegate, delegateQueue: nil)
        defer { session.invalidateAndCancel() }
        let (bytes, response) = try await session.bytes(for: request)
        try Task.checkCancellation()
        guard let http = response as? HTTPURLResponse, http.statusCode == 200,
              response.url?.host == backend.host, response.expectedContentLength <= 1_000_000 else { throw VoiceNoteError.unavailable }
        var data = Data()
        for try await byte in bytes {
            guard data.count < 1_000_000 else { throw VoiceNoteError.unavailable }
            data.append(byte)
        }
        try Task.checkCancellation()
        return data
    }
    func translate(_ audio: Data, source: String, target: String) async throws -> (String, String) {
        let supported = ["ar-SA", "ar-AE", "ar-EG", "ar-MA", "en-US", "fr-FR", "nl-NL", "de-DE", "hi-IN", "ml-IN", "ta-IN"]
        guard supported.contains(source), supported.contains(target) else { throw VoiceNoteError.configuration }
        let data = try await post("transcribe-audio", body: audio, type: Self.mime(audio), source: source)
        guard let payload = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let text = payload["text"] as? String, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              text.utf16.count <= 12_000 else { throw VoiceNoteError.unclear }
        var translated: [String] = []
        for phrase in Self.phrases(text) {
            try Task.checkCancellation()
            let request = try JSONSerialization.data(withJSONObject: ["text": phrase, "sourceLanguage": source,
                "targetLanguage": target, "quality": "accurate", "context": [], "stream": true] as [String: Any])
            let response = try await post("translate", body: request)
            var result: [String: Any]?
            for line in response.split(separator: 10) {
                guard let event = try JSONSerialization.jsonObject(with: Data(line)) as? [String: Any] else { throw VoiceNoteError.unclear }
                if event["type"] as? String == "error" { throw VoiceNoteError.unclear }
                if event["type"] as? String == "done" { result = event["result"] as? [String: Any] }
            }
            guard let result, result["needsReview"] as? Bool != true,
                  result["targetLanguage"] as? String == target,
                  let value = result["translation"] as? String, !value.isEmpty, value.utf16.count <= 20_000 else { throw VoiceNoteError.unclear }
            translated.append(value)
        }
        return (text, translated.joined(separator: "\n\n"))
    }
    static func phrases(_ text: String) -> [String] {
        var output: [String] = [], part = ""
        for word in text.split(whereSeparator: { $0.isWhitespace }) {
            if !part.isEmpty && part.utf16.count + word.utf16.count + 1 > 2400 { output.append(part); part = "" }
            // Long unbroken words are split at Character boundaries, not UTF-16 pairs.
            for character in word {
                if part.utf16.count + String(character).utf16.count > 2400 { output.append(part); part = "" }
                part.append(character)
            }
            part.append(" ")
        }
        if !part.isEmpty { output.append(part.trimmingCharacters(in: .whitespaces)) }
        return output
    }
}

private final class NoRedirects: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}
