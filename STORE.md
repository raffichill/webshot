# Chrome Web Store listing

Copy-paste answers for the Developer Dashboard. Not shipped with the extension.

## Item name
Webshot

## Short description (≤132 chars)
Right-click any webpage to copy it as a PNG — paste straight into Figma, Notion, or any moodboard. No download, no file management.

## Detailed description
Webshot is a tiny, no-nonsense Chrome extension for designers and anyone who collects references.

Right-click any page → choose "Webshot" → the page is copied to your clipboard as a PNG. Paste straight into Figma, Notion, your moodboard, or anywhere that accepts images. No download, no Downloads folder cleanup, no screenshot app in the middle.

Features
• Captures the visible viewport exactly as you see it
• Output matches CSS pixel dimensions (Retina captures are automatically downscaled so pasting into Figma gives you the size you expect — not a 2× oversized file)
• PNG, lossless
• One toolbar click, or right-click anywhere on the page
• Tiny, single-purpose, no settings to configure

Privacy
Webshot does not store, transmit, or collect any data. Everything happens locally in your browser.

Open source, MIT licensed. Source: https://github.com/raffichill/webshot

## Category
Productivity

## Language
English

## Single purpose (required field)
Capture the visible browser tab as a PNG and copy it to the clipboard.

## Permission justifications

**activeTab**
Used when the user explicitly triggers a capture (via the right-click menu or toolbar button). This grants temporary access to the active tab so the extension can call `chrome.tabs.captureVisibleTab()`. Access ends when the tab is closed or navigated.

**contextMenus**
Adds a "Webshot" item to the right-click menu, which is the primary way users trigger a capture.

**scripting**
Used to inject a small script into the active tab that writes the captured PNG to the clipboard and shows a brief confirmation toast. This is required because `navigator.clipboard.write()` must run from a document with user activation — it cannot be called from the extension's background service worker.

## Host permissions
None required — `activeTab` covers all use.

## Privacy practices form

- Does the extension collect or use user data? **No**
- Does it transmit data off-device? **No**
- Does it sell or share data with third parties? **No**
- Does it use remote code? **No**
- Certification: I certify my data use complies with the Developer Program Policies. **Yes**

No privacy policy URL required — nothing is collected.
