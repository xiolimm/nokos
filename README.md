# NOKOSS XIOLIM FREE — Full Telegram Task/Reward Bot

## Important
Do NOT commit your Telegram bot token. The token previously shared in chat should be regenerated in BotFather.

This project is designed for:
- Telegram webhook on Vercel
- PostgreSQL (Neon/Vercel Marketplace)
- User registration/profile
- Task menu
- User proof submission
- Admin approve/reject
- Reward ledger
- Broadcast
- Statistics
- Inline keyboards
- `/start` video intro

The bot intentionally does not automate OTP, phone-number verification, account creation, or bypass third-party verification.

## Deploy
1. Push this folder to GitHub.
2. Import the repo into Vercel.
3. Create a PostgreSQL database through Vercel Marketplace/Neon.
4. Add all variables from `.env.example`.
5. Deploy.
6. Open:
   `https://YOUR-PROJECT.vercel.app/api/setup?secret=YOUR_SETUP_SECRET`
7. Send `/start` to the Telegram bot.

## Task configuration
Edit `src/config.js` to change task titles, descriptions, links and reward amounts.

## Admin
Admin ID is configured by `ADMIN_ID`.
Admin commands:
- `/admin`
- `/stats`
- `/broadcast`

Broadcast flow:
`/broadcast` -> send the message -> confirm.

## Security
- Webhook validates `X-Telegram-Bot-Api-Secret-Token`.
- Setup endpoint requires `SETUP_SECRET`.
- SQL uses parameterized queries.
- Bot token is only read from environment variables.
