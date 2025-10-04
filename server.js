const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Game state management
const games = new Map();
const players = new Map();

// --- MODIFIED UNIT_TYPES ---
const UNIT_TYPES = {
  melee: {
    cost: 2,
    health: 100,
    damage: 25,
    range: 1,
    speed: 2,
    type: 'melee'
  },
  ranged: {
    cost: 3,
    health: 60,
    damage: 30,
    range: 3,
    speed: 1,
    type: 'ranged'
  },
  medic: {
    cost: 4,
    health: 50,
    damage: 0, // Cannot attack
    range: 2,  // Heal range
    speed: 1,
    type: 'medic',
    ability: 'heal',
    healAmount: 30
  },
   guardian: {
     cost: 5,
     health: 150,
     damage: 15,
     range: 1,
     speed: 1,
     type: 'guardian',
     ability: 'taunt'
   },
   generator: {
     cost: 6,
     health: 80,
     damage: 0, // Cannot attack
     range: 0,
     speed: 0, // Cannot move
     type: 'generator',
     ability: 'generate',
     energyPerTurn: 1,
     maxTurns: 10 // Generates energy for 10 turns then dies
   }
};

// Game class
class Game {
  constructor(gameId, hostId) {
    this.gameId = gameId;
    this.hostId = hostId;
    this.players = new Map();
    this.currentTurn = hostId;
    this.gameState = 'waiting'; // waiting, playing, finished
    this.gridSize = 8;
    this.grid = this.initializeGrid();
    this.units = new Map();
    this.nextUnitId = 1;
    this.energy = new Map();
    this.turnNumber = 0; // Track how many turns have passed
  }

  initializeGrid() {
    const grid = [];
    for (let y = 0; y < this.gridSize; y++) {
      grid[y] = [];
      for (let x = 0; x < this.gridSize; x++) {
        grid[y][x] = { occupied: false, unitId: null };
      }
    }
    return grid;
  }

  addPlayer(playerId, socketId) {
    this.players.set(playerId, {
      socketId,
      ready: false,
      energy: 10,
      hasDeployedUnits: false
    });
    this.energy.set(playerId, 10);
    
    if (this.players.size === 2) {
      this.gameState = 'playing';
      this.startTurn();
    }
  }

  removePlayer(playerId) {
    this.players.delete(playerId);
    this.energy.delete(playerId);
    for (let [unitId, unit] of this.units) {
      if (unit.owner === playerId) {
        this.units.delete(unitId);
        this.grid[unit.y][unit.x].occupied = false;
        this.grid[unit.y][unit.x].unitId = null;
      }
    }
  }

  deployUnit(playerId, unitType, x, y) {
    if (this.gameState !== 'playing' || this.currentTurn !== playerId) return false;
    
    const unitConfig = UNIT_TYPES[unitType];
    const playerEnergy = this.energy.get(playerId);

    if (!unitConfig || playerEnergy < unitConfig.cost) return false;
    
    const isHost = playerId === this.hostId;
    const validRows = isHost ? [0, 1, 2, 3] : [4, 5, 6, 7];
    if (!validRows.includes(y) || this.grid[y][x].occupied) return false;
    
      const unit = {
        id: this.nextUnitId++,
        owner: playerId,
        ...unitConfig,
        health: unitConfig.health,
        maxHealth: unitConfig.health,
        x,
        y,
        hasMoved: false,
        hasAttacked: false,
        statusEffects: [], // NEW: For taunt, etc.
        turnsActive: 0 // NEW: For generators
      };
    
    const player = this.players.get(playerId);
    if (player && !player.hasDeployedUnits) {
      player.hasDeployedUnits = true;
    }
    
    this.units.set(unit.id, unit);
    this.grid[y][x] = { occupied: true, unitId: unit.id };
    this.energy.set(playerId, playerEnergy - unitConfig.cost);
    
    this.broadcastGameState();
    return true;
  }

  moveUnit(playerId, unitId, newX, newY) {
    if (this.gameState !== 'playing') return false;
    if (this.currentTurn !== playerId) return false;
    
    const unit = this.units.get(unitId);
    if (!unit || unit.owner !== playerId) return false;
    if (unit.hasMoved) return false;
    
    const distance = Math.abs(newX - unit.x) + Math.abs(newY - unit.y);
    if (distance > unit.speed) return false;
    
    if (newX < 0 || newX >= this.gridSize || newY < 0 || newY >= this.gridSize) return false;
    if (this.grid[newY][newX].occupied) return false;
    
    // Check energy cost for movement (1 energy per tile moved)
    const playerEnergy = this.energy.get(playerId);
    const energyCost = distance; // 1 energy per tile
    if (playerEnergy < energyCost) return false;
    
    // Deduct energy cost
    this.energy.set(playerId, playerEnergy - energyCost);
    
    this.grid[unit.y][unit.x].occupied = false;
    this.grid[unit.y][unit.x].unitId = null;
    
    unit.x = newX;
    unit.y = newY;
    unit.hasMoved = true;
    
    this.grid[newY][newX].occupied = true;
    this.grid[newY][newX].unitId = unitId;
    
    this.broadcastGameState();
    return true;
  }

  attackUnit(playerId, attackerId, targetId) {
    console.log('Attack attempt:', { playerId, attackerId, targetId, currentTurn: this.currentTurn, gameState: this.gameState });
    
    if (this.gameState !== 'playing' || this.currentTurn !== playerId) {
      console.log('Attack failed: Wrong turn or game state');
      return false;
    }
    
    const attacker = this.units.get(attackerId);
    const target = this.units.get(targetId);
    
    console.log('Units found:', { attacker: !!attacker, target: !!target, attackerOwner: attacker?.owner, playerId, attackerHasAttacked: attacker?.hasAttacked });
    
    if (!attacker || !target || attacker.owner !== playerId || attacker.hasAttacked) return false;
    
    // --- MODIFIED: Check for Taunt status ---
    const tauntStatus = attacker.statusEffects.find(s => s.type === 'taunt');
    if (tauntStatus && tauntStatus.byUnitId !== targetId) {
        return false; // Must attack the taunting unit
    }

    const distance = Math.abs(target.x - attacker.x) + Math.abs(target.y - attacker.y);
    console.log('Attack distance:', { distance, attackerRange: attacker.range, attackerPos: [attacker.x, attacker.y], targetPos: [target.x, target.y] });
    
    if (distance > attacker.range) {
      console.log('Attack failed: Out of range');
      return false;
    }
    
    // Check energy cost for attack (2 energy per attack)
    const playerEnergy = this.energy.get(playerId);
    const energyCost = 2; // 2 energy per attack
    console.log('Energy check:', { playerEnergy, energyCost, hasEnoughEnergy: playerEnergy >= energyCost });
    
    if (playerEnergy < energyCost) {
      console.log('Attack failed: Not enough energy');
      return false;
    }
    
    // Deduct energy cost
    this.energy.set(playerId, playerEnergy - energyCost);
    
    target.health -= attacker.damage;
    attacker.hasAttacked = true;
    
    if (target.health <= 0) {
      this.units.delete(targetId);
      this.grid[target.y][target.x] = { occupied: false, unitId: null };
    }
    
    this.broadcastGameState();
    return true;
  }
  
  // --- NEW METHOD for abilities ---
  useAbility(playerId, unitId, targetId) {
    if (this.gameState !== 'playing' || this.currentTurn !== playerId) return false;

    const unit = this.units.get(unitId);
    const target = this.units.get(targetId);

    if (!unit || !target || unit.owner !== playerId || unit.hasAttacked) return false;

    const distance = Math.abs(target.x - unit.x) + Math.abs(target.y - unit.y);
    if (distance > unit.range) return false;

    // Check energy cost for abilities (1 energy per ability use)
    const playerEnergy = this.energy.get(playerId);
    const energyCost = 1; // 1 energy per ability use
    if (playerEnergy < energyCost) return false;

    if (unit.ability === 'heal') {
        if (target.owner !== playerId || target.health >= target.maxHealth) return false; // Can only heal allies who are hurt
        target.health = Math.min(target.maxHealth, target.health + unit.healAmount);
        unit.hasAttacked = true; // Using ability counts as an action
    } else if (unit.ability === 'taunt') {
        if (target.owner === playerId) return false; // Can only taunt enemies
        target.statusEffects.push({ type: 'taunt', turns: 1, byUnitId: unitId });
        unit.hasAttacked = true;
    } else {
        return false;
    }
    
    // Deduct energy cost
    this.energy.set(playerId, playerEnergy - energyCost);
    
    this.broadcastGameState();
    return true;
  }

  endTurn(playerId) {
    if (this.gameState !== 'playing' || this.currentTurn !== playerId) return false;
    
    // Increment turn counter
    this.turnNumber++;
    
    // --- MODIFIED: Process status effects at end of turn ---
    for (let [unitId, unit] of this.units) {
      // Reset actions for the player whose turn just ended
      if (unit.owner === playerId) {
        unit.hasMoved = false;
        unit.hasAttacked = false;
      }
      // Decrease duration for the player whose turn is about to start
      const opponentId = Array.from(this.players.keys()).find(id => id !== playerId);
      if(unit.owner === opponentId) {
        unit.statusEffects = unit.statusEffects.filter(effect => {
            effect.turns -= 1;
            return effect.turns > 0;
        });
      }
    }
    
    // Remove automatic combat - only manual attacks allowed
    // this.processTurnBasedCombat();
    
    this.currentTurn = this.currentTurn === this.hostId ? 
      Array.from(this.players.keys()).find(id => id !== this.hostId) : 
      this.hostId;
    
    this.startTurn();
    return true;
  }
  
   startTurn() {
     this.checkWinCondition();
     if (this.gameState === 'finished') {
       this.broadcastGameState();
       return;
     }
     
     const currentPlayerEnergy = this.energy.get(this.currentTurn) || 10;
     this.energy.set(this.currentTurn, currentPlayerEnergy + 2);
     
     // Process generators for the current player
     this.processGenerators();
     
     this.broadcastGameState();
   }

  processGenerators() {
    const generators = Array.from(this.units.values()).filter(unit => 
      unit.type === 'generator' && unit.owner === this.currentTurn
    );
    
    for (const generator of generators) {
      // Increment turns active
      generator.turnsActive++;
      
      // Generate energy for the player
      const currentEnergy = this.energy.get(this.currentTurn);
      this.energy.set(this.currentTurn, currentEnergy + generator.energyPerTurn);
      
      // Check if generator should expire
      if (generator.turnsActive >= generator.maxTurns) {
        // Remove expired generator
        this.units.delete(generator.id);
        this.grid[generator.y][generator.x] = { occupied: false, unitId: null };
      }
    }
  }

  checkWinCondition() {
    const playerIds = Array.from(this.players.keys());
    if (playerIds.length < 2) return;

    const player1Units = Array.from(this.units.values()).filter(u => u.owner === playerIds[0]);
    const player2Units = Array.from(this.units.values()).filter(u => u.owner === playerIds[1]);

    // Only check win condition after both players have had at least 2 turns each
    // (so both players have had a chance to deploy units and play)
    if (this.turnNumber < 4) return; // 4 turns = 2 turns each player

    if (player1Units.length === 0) {
      this.gameState = 'finished';
      this.winner = playerIds[1];
      this.broadcastGameState();
    } else if (player2Units.length === 0) {
      this.gameState = 'finished';
      this.winner = playerIds[0];
      this.broadcastGameState();
    }
  }

  processTurnBasedCombat() {
    const units = Array.from(this.units.values());
    const combatPairs = [];
    
    for (let i = 0; i < units.length; i++) {
      for (let j = i + 1; j < units.length; j++) {
        const unit1 = units[i];
        const unit2 = units[j];
        
        // Only fight if they're enemies, adjacent, AND haven't attacked this turn
        if (unit1.owner !== unit2.owner && 
            this.areAdjacent(unit1, unit2) && 
            !unit1.hasAttacked && !unit2.hasAttacked) {
          combatPairs.push([unit1, unit2]);
        }
      }
    }
    
    for (let [unit1, unit2] of combatPairs) {
      this.processCombat(unit1, unit2);
    }
  }
  
  areAdjacent(unit1, unit2) {
    // ... (This method remains unchanged)
    const distance = Math.abs(unit1.x - unit2.x) + Math.abs(unit1.y - unit2.y);
    return distance === 1;
  }
  
  processCombat(unit1, unit2) {
    // ... (This method remains unchanged)
    const damage1 = unit1.damage;
    const damage2 = unit2.damage;
    
    unit1.health -= damage2;
    unit2.health -= damage1;
    
    if (unit1.health <= 0) {
      this.units.delete(unit1.id);
      this.grid[unit1.y][unit1.x].occupied = false;
      this.grid[unit1.y][unit1.x].unitId = null;
    }
    
    if (unit2.health <= 0) {
      this.units.delete(unit2.id);
      this.grid[unit2.y][unit2.x].occupied = false;
      this.grid[unit2.y][unit2.x].unitId = null;
    }
  }

  broadcastGameState() {
    const gameData = {
      gameId: this.gameId,
      currentTurn: this.currentTurn,
      gameState: this.gameState,
      winner: this.winner,
      grid: this.grid,
      units: Array.from(this.units.values()),
      energy: Object.fromEntries(this.energy),
      players: Array.from(this.players.keys())
    };
    
    for (let [playerId, player] of this.players) {
      io.to(player.socketId).emit('gameState', gameData);
    }
  }
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);
  
  socket.on('createGame', () => { /* ... (unchanged) ... */ 
    const gameId = Math.random().toString(36).substr(2, 9);
    const game = new Game(gameId, socket.id);
    games.set(gameId, game);
    players.set(socket.id, { gameId, playerId: socket.id });
    
    game.addPlayer(socket.id, socket.id);
    socket.join(gameId);
    socket.emit('gameCreated', { gameId, playerId: socket.id });
  });
  
  socket.on('joinGame', (data) => { /* ... (unchanged) ... */ 
    const { gameId } = data;
    const game = games.get(gameId);
    
    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }
    
    if (game.players.size >= 2) {
      socket.emit('error', { message: 'Game is full' });
      return;
    }
    
    players.set(socket.id, { gameId, playerId: socket.id });
    game.addPlayer(socket.id, socket.id);
    socket.join(gameId);
    socket.emit('gameJoined', { gameId, playerId: socket.id });
  });
  
  socket.on('deployUnit', (data) => { /* ... (unchanged) ... */ 
    const player = players.get(socket.id);
    if (!player) return;
    
    const game = games.get(player.gameId);
    if (!game) return;
    
    const success = game.deployUnit(player.playerId, data.unitType, data.x, data.y);
    if (!success) {
      socket.emit('error', { message: 'Invalid deployment' });
    }
  });
  
  socket.on('moveUnit', (data) => { /* ... (unchanged) ... */ 
    const player = players.get(socket.id);
    if (!player) return;
    
    const game = games.get(player.gameId);
    if (!game) return;
    
    const success = game.moveUnit(player.playerId, data.unitId, data.x, data.y);
    if (!success) {
      socket.emit('error', { message: 'Invalid move' });
    }
  });
  
  socket.on('attackUnit', (data) => { /* ... (unchanged) ... */ 
    const player = players.get(socket.id);
    if (!player) return;
    
    const game = games.get(player.gameId);
    if (!game) return;
    
    const success = game.attackUnit(player.playerId, data.attackerId, data.targetId);
    if (!success) {
      socket.emit('error', { message: 'Invalid attack' });
    }
  });
  
  // --- NEW SOCKET HANDLER for abilities ---
  socket.on('useAbility', (data) => {
    const player = players.get(socket.id);
    if (!player) return;
    
    const game = games.get(player.gameId);
    if (!game) return;

    const success = game.useAbility(player.playerId, data.unitId, data.targetId);
    if (!success) {
      socket.emit('error', { message: 'Invalid ability use' });
    }
  });

  socket.on('endTurn', () => { /* ... (unchanged) ... */ 
    const player = players.get(socket.id);
    if (!player) return;
    
    const game = games.get(player.gameId);
    if (!game) return;
    
    const success = game.endTurn(player.playerId);
    if (!success) {
      socket.emit('error', { message: 'Cannot end turn' });
    }
  });
  
  socket.on('disconnect', () => { /* ... (unchanged) ... */ 
    console.log('Player disconnected:', socket.id);
    
    const player = players.get(socket.id);
    if (player) {
      const game = games.get(player.gameId);
      if (game) {
        game.removePlayer(player.playerId);
        if (game.players.size === 0) {
          games.delete(player.gameId);
        }
      }
      players.delete(socket.id);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});