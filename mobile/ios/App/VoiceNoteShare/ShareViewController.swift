import UIKit
import UniformTypeIdentifiers
import AVFoundation

// Translates inside the share sheet. Does not use private APIs to force-launch
// the containing app, and never writes audio to an App Group or local database.
@MainActor final class ShareViewController: UIViewController {
    private let languages = [("ar-SA", "Arabic"), ("ar-AE", "Arabic (Gulf)"), ("ar-EG", "Arabic (Egyptian)"),
        ("ar-MA", "Arabic (Moroccan)"), ("en-US", "English"), ("fr-FR", "French"), ("nl-NL", "Dutch"),
        ("de-DE", "German"), ("hi-IN", "Hindi"), ("ml-IN", "Malayalam"), ("ta-IN", "Tamil")]
    private var audio: Data?
    private var operation: Task<Void, Never>?
    private var generation = 0
    private var acceptsIncomingAudio = true
    private var source = "ar-SA", target = "en-US", translated = ""
    private let status = UILabel(), result = UITextView(), consent = UISwitch()
    private let sourceButton = UIButton(type: .system), targetButton = UIButton(type: .system)
    private let translateButton = UIButton(type: .system), listenButton = UIButton(type: .system)
    private let speaker = AVSpeechSynthesizer()
    private let contentScroll = UIScrollView()

    override func viewDidLoad() {
        super.viewDidLoad(); view.backgroundColor = .systemBackground
        preferredContentSize = CGSize(width: 390, height: 680)
        view.tintColor = UIColor { traits in
            traits.userInterfaceStyle == .dark ? UIColor(red: 0.39, green: 0.85, blue: 0.72, alpha: 1) : UIColor(red: 0.06, green: 0.46, blue: 0.43, alpha: 1)
        }
        contentScroll.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(contentScroll)
        let stack = UIStackView(); stack.axis = .vertical; stack.spacing = 14
        stack.translatesAutoresizingMaskIntoConstraints = false; contentScroll.addSubview(stack)
        NSLayoutConstraint.activate([
            contentScroll.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            contentScroll.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
            contentScroll.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            contentScroll.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            stack.leadingAnchor.constraint(equalTo: contentScroll.contentLayoutGuide.leadingAnchor, constant: 20),
            stack.trailingAnchor.constraint(equalTo: contentScroll.contentLayoutGuide.trailingAnchor, constant: -20),
            stack.topAnchor.constraint(equalTo: contentScroll.contentLayoutGuide.topAnchor, constant: 20),
            stack.bottomAnchor.constraint(equalTo: contentScroll.contentLayoutGuide.bottomAnchor, constant: -16),
            stack.widthAnchor.constraint(equalTo: contentScroll.frameLayoutGuide.widthAnchor, constant: -40)])
        let heading = UILabel(); heading.text = "Translate a voice note"; heading.font = .preferredFont(forTextStyle: .title2)
        heading.adjustsFontForContentSizeCategory = true; heading.numberOfLines = 0
        stack.addArrangedSubview(heading)
        sourceButton.setTitle("Voice language: Arabic", for: .normal)
        targetButton.setTitle("Translate to: English", for: .normal)
        for (button, isSource) in [(sourceButton, true), (targetButton, false)] {
            button.showsMenuAsPrimaryAction = true
            button.menu = UIMenu(children: languages.map { code, name in UIAction(title: name) { [weak self] _ in
                guard let self else { return }; self.cancelWork()
                if isSource { self.source = code } else { self.target = code }
                var configuration = button.configuration
                configuration?.title = (isSource ? "Voice language: " : "Translate to: ") + name
                button.configuration = configuration
            } })
            stack.addArrangedSubview(button)
        }
        let disclosure = UILabel(); disclosure.numberOfLines = 0; disclosure.font = .preferredFont(forTextStyle: .body)
        disclosure.adjustsFontForContentSizeCategory = true
        disclosure.text = "VoiceTranslator.eu processes this note and its words for translation. Confirm you have permission to share it."
        stack.addArrangedSubview(disclosure)
        consent.accessibilityLabel = "I agree to audio processing"; consent.addTarget(self, action: #selector(consentChanged), for: .valueChanged)
        let consentLabel = UILabel(); consentLabel.text = "I agree to audio processing"; consentLabel.numberOfLines = 0
        consentLabel.font = .preferredFont(forTextStyle: .body); consentLabel.adjustsFontForContentSizeCategory = true
        let consentRow = UIStackView(arrangedSubviews: [consentLabel, consent]); consentRow.spacing = 12; stack.addArrangedSubview(consentRow)
        consentRow.alignment = .center; consentRow.heightAnchor.constraint(greaterThanOrEqualToConstant: 48).isActive = true
        let privacy = UIButton(type: .system); privacy.setTitle("Privacy notice", for: .normal); privacy.addTarget(self, action: #selector(showPrivacy), for: .touchUpInside); stack.addArrangedSubview(privacy)
        translateButton.setTitle("Translate voice note", for: .normal); translateButton.isEnabled = false
        translateButton.addTarget(self, action: #selector(translate), for: .touchUpInside); stack.addArrangedSubview(translateButton)
        status.numberOfLines = 0; status.text = "Opening the selected voice note…"; status.accessibilityTraits = .updatesFrequently; stack.addArrangedSubview(status)
        result.font = .preferredFont(forTextStyle: .body); result.isEditable = false
        result.isHidden = true
        let resultHeight = result.heightAnchor.constraint(equalToConstant: 240)
        resultHeight.priority = .defaultHigh; resultHeight.isActive = true
        result.adjustsFontForContentSizeCategory = true; result.textAlignment = .natural
        result.layer.cornerRadius = 16; result.textContainerInset = UIEdgeInsets(top: 16, left: 12, bottom: 16, right: 12)
        result.backgroundColor = UIColor { traits in
            traits.userInterfaceStyle == .dark ? UIColor.secondarySystemBackground : UIColor(red: 0.88, green: 0.95, blue: 0.91, alpha: 1)
        }
        result.accessibilityLabel = "Original transcript and translation"; stack.addArrangedSubview(result)
        listenButton.setTitle("Listen to translation", for: .normal); listenButton.isEnabled = false; listenButton.isHidden = true
        listenButton.addTarget(self, action: #selector(listen), for: .touchUpInside); stack.addArrangedSubview(listenButton)
        let close = UIButton(type: .system); close.setTitle("Clear and close", for: .normal)
        close.addTarget(self, action: #selector(closeShare), for: .touchUpInside); stack.addArrangedSubview(close)
        consent.onTintColor = view.tintColor
        for button in [sourceButton, targetButton, privacy, listenButton, close, translateButton] {
            var configuration: UIButton.Configuration = button == translateButton ? .filled() : .tinted()
            configuration.title = button.title(for: .normal)
            configuration.baseBackgroundColor = view.tintColor
            configuration.cornerStyle = .capsule
            configuration.contentInsets = NSDirectionalEdgeInsets(top: 12, leading: 16, bottom: 12, trailing: 16)
            button.configuration = configuration
            button.titleLabel?.adjustsFontForContentSizeCategory = true
            button.titleLabel?.numberOfLines = 0; button.titleLabel?.lineBreakMode = .byWordWrapping
            let minimumHeight = button.heightAnchor.constraint(greaterThanOrEqualToConstant: 48)
            minimumHeight.priority = .defaultHigh; minimumHeight.isActive = true
        }
        status.font = .preferredFont(forTextStyle: .body); status.adjustsFontForContentSizeCategory = true
        loadAudio()
    }
    private func showBusy(_ busy: Bool) {
        var configuration = translateButton.configuration
        configuration?.title = busy ? "Cancel translation" : "Translate"
        configuration?.showsActivityIndicator = busy
        translateButton.configuration = configuration
        translateButton.isEnabled = busy || (consent.isOn && audio != nil)
    }
    private func loadAudio() {
        let attachments = (extensionContext?.inputItems as? [NSExtensionItem] ?? []).flatMap { $0.attachments ?? [] }
        guard attachments.count == 1, let provider = attachments.first else { fail(VoiceNoteError.invalidAudio); return }
        let types = [UTType.audio.identifier, "org.xiph.ogg-audio", "org.xiph.opus"]
        guard let type = types.first(where: { provider.hasItemConformingToTypeIdentifier($0) }) else { fail(VoiceNoteError.invalidAudio); return }
        provider.loadFileRepresentation(forTypeIdentifier: type) { [weak self] url, _ in
            do {
                guard let url, url.isFileURL else { throw VoiceNoteError.invalidAudio }
                let file = try FileHandle(forReadingFrom: url); defer { try? file.close() }
                let bytes = try file.read(upToCount: 4_000_001) ?? Data()
                _ = try VoiceNoteAPI.mime(bytes)
                Task { @MainActor [weak self] in
                    guard let self, self.acceptsIncomingAudio else { return }; self.audio = bytes
                    self.status.text = "Ready. Choose the languages and confirm processing."
                    self.translateButton.isEnabled = self.consent.isOn
                }
            } catch { Task { @MainActor [weak self] in self?.fail(VoiceNoteError.invalidAudio) } }
        }
    }
    private func fail(_ error: Error) { status.text = (error as? VoiceNoteError)?.localizedDescription ?? VoiceNoteError.unavailable.localizedDescription }
    private func cancelWork() {
        generation += 1; operation?.cancel(); operation = nil; speaker.stopSpeaking(at: .immediate)
        result.text = ""; translated = ""; result.isHidden = true; listenButton.isEnabled = false; listenButton.isHidden = true
        showBusy(false)
    }
    @objc private func consentChanged() { cancelWork(); status.text = consent.isOn ? "Ready to translate." : "Confirm processing to translate this note." }
    @objc private func translate() {
        if operation != nil { cancelWork(); status.text = "Cancelled. Your note is ready to try again."; return }
        guard consent.isOn, let audio else { return }; cancelWork()
        let version = generation, source = self.source, target = self.target
        showBusy(true); status.text = "Translating your voice note…"
        operation = Task { [weak self] in
            do {
                let api = try VoiceNoteAPI()
                let (original, translated) = try await api.translate(audio, source: source, target: target)
                try Task.checkCancellation()
                guard let self, self.generation == version else { return }
                self.translated = translated
                self.result.isHidden = false; self.listenButton.isHidden = false
                self.result.text = "Translation\n\n\(translated)\n\nOriginal words\n\n\(original)"
                self.status.text = "Check names, numbers, dates and instructions against the original. Speech recognition can miss details."
                self.listenButton.isEnabled = true; self.operation = nil; self.showBusy(false)
                self.contentScroll.scrollRectToVisible(self.result.convert(self.result.bounds, to: self.contentScroll), animated: !UIAccessibility.isReduceMotionEnabled)
            } catch {
                guard let self, self.generation == version, !Task.isCancelled else { return }
                self.fail(error); self.operation = nil; self.showBusy(false)
            }
        }
    }
    @objc private func listen() {
        if speaker.isSpeaking { speaker.stopSpeaking(at: .immediate); return }
        guard !translated.isEmpty, let voice = AVSpeechSynthesisVoice(language: target) else { status.text = "A matching voice is not installed. You can read or copy the translation."; return }
        let utterance = AVSpeechUtterance(string: translated); utterance.voice = voice; speaker.speak(utterance)
    }
    @objc private func showPrivacy() {
        let controller = UIViewController(); controller.view.backgroundColor = .systemBackground
        let text = UITextView(); text.isEditable = false; text.font = .preferredFont(forTextStyle: .body)
        text.text = "VoiceTranslator.eu — MetaInsights BV, Belgium\n\nOnly the audio you select is processed, after you confirm. The audio is sent to our speech service; its transcript is sent to our translation service. Cloud providers apply their own processing and retention terms. We do not use your note to train our own models.\n\nThis extension keeps audio and results in memory and releases them when closed. It does not save them to an application database. Copies in WhatsApp, your files or the clipboard remain under your control.\n\nContact: metainsights.bv@gmail.com\nFull notice: https://www.voicetranslator.eu/privacy.html\n\nTranslation can contain mistakes. Check important details against the original."
        text.frame = controller.view.bounds; text.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        controller.view.addSubview(text); present(controller, animated: true)
    }
    @objc private func closeShare() { acceptsIncomingAudio = false; cancelWork(); audio = nil; extensionContext?.completeRequest(returningItems: nil) }
    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        if presentedViewController == nil { acceptsIncomingAudio = false; cancelWork(); audio = nil }
    }
}
