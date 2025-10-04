# Gemee Strategy Game

A 1v1 turn-based strategy game where players deploy troops to destroy their opponent's army.

## Features

- **Turn-based gameplay**: Strategic planning with alternating turns
- **Unit deployment**: Deploy melee and ranged units using energy
- **Grid-based combat**: 8x8 battlefield with tactical positioning
- **Real-time multiplayer**: Socket.IO for seamless online play
- **Win condition**: Eliminate all enemy units to win

## Unit Types

### Melee Unit
- **Cost**: 2 Energy
- **Health**: 100 HP
- **Damage**: 25
- **Range**: 1 tile (adjacent only)
- **Speed**: 2 tiles per turn

### Ranged Unit
- **Cost**: 3 Energy
- **Health**: 60 HP
- **Damage**: 30
- **Range**: 3 tiles
- **Speed**: 1 tile per turn

## How to Play

1. **Create or Join Game**: 
   - Host creates a game and shares the Game ID
   - Opponent joins using the Game ID

2. **Deploy Units**:
   - Select a unit type (Melee or Ranged)
   - Click on your side of the battlefield to deploy
   - Units cost energy to deploy

3. **Movement & Combat**:
   - Click on your units to select them
   - Click on empty tiles to move
   - Click on enemy units to attack
   - Each unit can move and attack once per turn

4. **Victory**:
   - Eliminate all enemy units to win
   - Congratulations popup appears for the winner

## Installation & Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Start the Server**:
   ```bash
   npm start
   ```

3. **Open in Browser**:
   Navigate to `http://localhost:3000`

## Development

For development with auto-restart:
```bash
npm run dev
```

## Game Rules

- Players start with 10 energy
- Energy regenerates by 2 per turn
- Units can only move and attack once per turn
- Melee units attack adjacent enemies
- Ranged units can attack from up to 3 tiles away
- Game ends when one player has no units remaining

## Technical Stack

- **Backend**: Node.js, Express, Socket.IO
- **Frontend**: HTML5 Canvas, JavaScript, CSS3
- **Real-time**: WebSocket communication via Socket.IO

## Future Enhancements (Phase 2+)

- Additional unit types (Tank, Support)
- Deck building system
- User accounts and statistics
- Enhanced graphics and animations
- Database persistence (PostgreSQL + Redis)
