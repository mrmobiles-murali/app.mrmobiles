# Repair Rush

BotFather registered `repairrush` for **@MrMobileDoctor_bot**. The game link is
https://t.me/MrMobileDoctor_bot?game=repairrush.

The playable page is `public/games/repairrush/index.html`, served at
`/games/repairrush/index.html`. It is a self-contained 60-second arcade game with
six parts, speed bonuses, combos, three chances, pause and replay. It makes no
external requests and uses no cookies, persistent storage or Telegram identity.
Scores stay in memory; Telegram chat leaderboards are not implemented.

The existing authenticated webhook handles `/game`, `/start repairrush`, the home
menu game shortcut, inline searches for `repairrush`, `repair rush` or `game`, and
Play callbacks from private chats, groups and inline messages. Product inline
searches and support flows continue normally. The bot token remains server-side.
For game requests, the webhook checks `getMe` against @MrMobileDoctor_bot before
enabling a launch. Another bot cannot launch this BotFather registration.

## Read-only checks

1. Run `npm test` and `npm run build`.
2. Run `python3 scripts/botctl.py status` using the existing private configuration.
   Confirm the bot username is **MrMobileDoctor_bot** and the deployed bot ID
   matches the saved token. Do not rotate or copy a token from another bot.
3. Inspect the actual deployed `/api/telegram/webhook` endpoint. Once this code is
   deployed it reports `gameShortName`, `gameBotUsername`, `gameConfigured` and
   `gameConfigurationInvalid`. `gameConfigured` means the optional URL is valid;
   it does not prove public reachability or a successful Telegram launch.
4. Open the deployed game page in a signed-out/incognito browser. Check the
   response is HTML with HTTP 200, no sign-in redirect and no `Set-Cookie`.
   Vercel's authenticated fetch/share tools do not prove public access.
   Verify start, correct/wrong choices, timeout, pause, replay and a mobile screen.

## Production actions

1. Merge this game integration and deploy the repository with the existing
   project workflow. No Telegram settings are changed merely by deploying it.
2. Choose a publicly reachable HTTPS game host. If this Vercel project's URLs
   require sign-in, use a correctly routed public custom domain or a separate
   public static project. Do not change store routing or remove project-wide
   protections just to launch the game. The exact page path is
   `/games/repairrush/index.html` when deployed from this repository.
3. Set the server-only `REPAIR_RUSH_GAME_URL` to the verified public page URL
   without credentials, query parameters or a fragment. Redeploy to load it.
   With this variable absent or invalid, `/game` reports setup in progress and
   Play answers with an alert. Other bot flows continue.
4. Send `/game` to @MrMobileDoctor_bot, press Play, complete a round and replay.
   Test a forwarded game in a group and an inline game search. Confirm the
   expected bot owns the game before inviting customers.

The current webhook already subscribes to `callback_query` and `inline_query`.
Do not replace it, clear pending updates or start a second polling process.
Sending `/start` uses the existing profile/menu synchronization and includes the
new `/game` command; that step changes Telegram settings. It is optional for
typing `/game` directly. Existing `botctl.py activate` also changes settings and
is not needed merely to add this handler.

## Rollback

Unset `REPAIR_RUSH_GAME_URL` and redeploy to disable launches while retaining
support. Revert the game commit to remove the page and command entirely.

Official references: https://core.telegram.org/bots/games and
https://core.telegram.org/bots/api#games.
