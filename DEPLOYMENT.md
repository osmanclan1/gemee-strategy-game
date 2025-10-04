# Deployment Guide

## Railway (Recommended)

1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub
3. Click "New Project" → "Deploy from GitHub repo"
4. Select `gemee-strategy-game` repository
5. Railway will automatically detect Node.js and deploy
6. Get your live URL (e.g., `https://your-app.up.railway.app`)

### Railway Configuration
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Port**: Automatically handled by Railway
- **Environment**: Production

## Render

1. Go to [render.com](https://render.com)
2. Sign up with GitHub
3. Create "Web Service"
4. Connect your GitHub repository
5. Configure:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment**: Node.js
6. Deploy!

## Heroku

1. Install Heroku CLI: `npm install -g heroku`
2. Login: `heroku login`
3. Create app: `heroku create your-app-name`
4. Deploy: `git push heroku main`
5. Open: `heroku open`

## Environment Variables

For production deployment, you may want to set:
- `NODE_ENV=production`
- `PORT=3000`

## Testing Your Deployment

After deployment:
1. Visit your live URL
2. Open in two browser tabs
3. Create a game in one tab
4. Join with the game ID in the other tab
5. Verify multiplayer works!

## Troubleshooting

### Common Issues:
- **Port**: Make sure your app listens on `process.env.PORT` for production
- **Dependencies**: Ensure all `npm install` dependencies are listed in `package.json`
- **Build**: Check that build command completes without errors

### For Vercel (Static Only):
- Remove server-side code
- Convert to static HTML/CSS/JS only
- Loses multiplayer functionality
