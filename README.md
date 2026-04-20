# Webshot

Right-click any page → copy it as a PNG to your clipboard. Paste into Figma (or anywhere) for moodboarding.

A tiny, single-purpose Chrome extension. No popup, no settings, no download step.

## Install (unpacked)

1. Clone or download this repo
2. Open `chrome://extensions`
3. Toggle **Developer mode** (top-right)
4. Click **Load unpacked** → pick the repo folder
5. Pin the extension from the puzzle icon if you want the toolbar button

## Use

- Right-click anywhere on a page → **Webshot: copy page as image**
- Or click the toolbar icon to capture the active tab
- A small toast confirms the copy; `⌘V` / `Ctrl+V` into Figma

## Scope

- Captures the **visible viewport only** — what's on screen, no browser chrome
- PNG, full device-pixel resolution (Retina preserved)
- Does not work on `chrome://` pages, the Web Store, or other restricted origins — Chrome blocks capture there

## How it works

- `chrome.tabs.captureVisibleTab` grabs the viewport as a PNG data URL
- A small script injected into the tab writes the image to the clipboard via `navigator.clipboard.write()` with a `ClipboardItem`
- That's the whole thing — three files, under 100 lines

## License

MIT. See [LICENSE](LICENSE).
