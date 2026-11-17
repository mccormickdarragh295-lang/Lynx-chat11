# LYNX CHAT v4 🐆

Talk to strangers — **video + voice + text**, country matching, soundboard, and a **friends system**.

## What's in v4
- 👥 **Friends system** — everyone gets a shareable `LYNX-XXXXXX` code. Tap ➕ during a chat to send a friend request. Accepted friends are saved on your device and listed in the Friends tab.
- 🔒 **Private 1-on-1 connect** — enter a friend's code in the Friends tab → you two get matched privately (no strangers).
- 🔊 **Soundboard** — 8 synthesized sounds, both sides hear it.
- 🎤📷 Two-way camera + mic with one-tap toggles.
- 🌍 Country flags + worldwide / same-country matching.
- 💬 Text chat, NEXT skip, online counter, typing indicator.

## Deploy to Render (free)
1. Upload all files in this folder to your GitHub repo **root** (including the `public/` folder).
2. Render → New Web Service → connect the repo.
3. Build Command: `npm install` · Start Command: `npm start` · Root Directory: *(blank)* → Create.

## Run locally
```
npm install && npm start
```
Then open http://localhost:3000 in two tabs.

> Camera & mic require **HTTPS** (Render provides it) or `localhost`.
> Friend codes are saved in your browser (localStorage) — they stay on that device.
