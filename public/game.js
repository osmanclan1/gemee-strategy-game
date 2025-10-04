class GameClient {
    constructor() {
        console.log('GameClient constructor called');
        this.socket = io();
        this.gameState = null;
        this.playerId = null;
        this.gameId = null;
        this.selectedUnitType = null;
        this.selectedUnit = null;
        this.abilityTargetingMode = null; // NEW: To track when we're using an ability
        this.canvas = null;
        this.ctx = null;
        this.gridSize = 8;
        this.tileSize = 80;
        
        this.initializeElements();
        this.initializeCanvas();
        this.setupEventListeners();
        this.setupSocketListeners();
        console.log('GameClient initialized successfully');
    }
    
    initializeElements() {
        console.log('Initializing elements...');
        
        this.lobbyScreen = document.getElementById('lobby');
        this.gameScreen = document.getElementById('game');
        this.victoryModal = document.getElementById('victoryModal');
        
        this.createGameBtn = document.getElementById('createGameBtn');
        this.joinGameBtn = document.getElementById('joinGameBtn');
        this.gameIdInput = document.getElementById('gameIdInput');
        this.gameIdDisplay = document.getElementById('gameIdDisplay');
        this.gameIdText = document.getElementById('gameIdText');
        
        this.playerIdElement = document.getElementById('playerId');
        this.currentTurnElement = document.getElementById('currentTurn');
        this.energyDisplay = document.getElementById('energyDisplay');
        this.endTurnBtn = document.getElementById('endTurnBtn');
        
        this.selectedUnitElement = document.getElementById('selectedUnit');
        this.gameMessagesElement = document.getElementById('gameMessages');
        this.abilityContainer = document.getElementById('abilityContainer'); // NEW
        
        this.victoryTitle = document.getElementById('victoryTitle');
        this.victoryMessage = document.getElementById('victoryMessage');
        this.playAgainBtn = document.getElementById('playAgainBtn');
        this.backToLobbyBtn = document.getElementById('backToLobbyBtn');
        
        if (!this.createGameBtn) console.error('Create game button not found!');
        if (!this.gameMessagesElement) console.error('Game messages element not found!');
    }
    
    setupEventListeners() {
        this.createGameBtn.addEventListener('click', () => this.createGame());
        this.joinGameBtn.addEventListener('click', () => this.joinGame());
        this.endTurnBtn.addEventListener('click', () => this.endTurn());
        this.playAgainBtn.addEventListener('click', () => this.playAgain());
        this.backToLobbyBtn.addEventListener('click', () => this.backToLobby());
        
        document.querySelectorAll('.unit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.selectUnitType(e.currentTarget.dataset.type));
        });
        
        if (this.canvas) {
            this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
        } else {
            console.error('Canvas not found!');
        }
    }
    
    setupSocketListeners() {
        // ... (This method remains unchanged)
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.addMessage('Connected to server');
        });
        
        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.addMessage('Disconnected from server', 'error');
        });
        
        this.socket.on('gameCreated', (data) => {
            console.log('Game created:', data);
            this.playerId = data.playerId;
            this.gameId = data.gameId;
            this.gameIdText.textContent = data.gameId;
            this.gameIdDisplay.style.display = 'block';
            this.addMessage('Game created! Share the Game ID with your opponent.');
        });
        
        this.socket.on('gameJoined', (data) => {
            this.playerId = data.playerId;
            this.gameId = data.gameId;
            this.showGameScreen();
            this.addMessage('Joined game successfully!');
        });
        
        this.socket.on('gameState', (data) => {
            console.log('Received game state:', data);
            this.gameState = data;
            this.updateGameDisplay();
            
            if (data.gameState === 'playing') {
                this.showGameScreen();
            }
        });
        
        this.socket.on('error', (data) => {
            console.error('Socket error:', data);
            this.addMessage(`Error: ${data.message}`, 'error');
        });
        
        this.socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            this.addMessage('Failed to connect to server', 'error');
        });
    }
    
    initializeCanvas() {
        // ... (This method remains unchanged)
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = this.gridSize * this.tileSize;
        this.canvas.height = this.gridSize * this.tileSize;
    }
    
    createGame() {
        // ... (This method remains unchanged)
        console.log('Create game button clicked');
        this.socket.emit('createGame');
        this.addMessage('Creating game...');
    }
    
    joinGame() {
        // ... (This method remains unchanged)
        const gameId = this.gameIdInput.value.trim();
        if (!gameId) {
            this.addMessage('Please enter a Game ID', 'error');
            return;
        }
        this.socket.emit('joinGame', { gameId });
    }
    
    selectUnitType(unitType) {
        this.selectedUnitType = unitType;
        this.selectedUnit = null;
        this.abilityTargetingMode = null; // Reset ability mode
        
        document.querySelectorAll('.unit-btn').forEach(btn => btn.classList.remove('selected'));
        document.querySelector(`[data-type="${unitType}"]`).classList.add('selected');
        
        this.updateSelectedUnitDisplay();
    }
    
    handleCanvasClick(e) {
        if (!this.gameState || this.gameState.gameState !== 'playing') return;
        
        // Prevent default browser behavior (zooming, text selection, etc.)
        e.preventDefault();
        e.stopPropagation();
        
        const rect = this.canvas.getBoundingClientRect();
        const x = Math.floor((e.clientX - rect.left) / this.tileSize);
        const y = Math.floor((e.clientY - rect.top) / this.tileSize);
        
        if (x < 0 || x >= this.gridSize || y < 0 || y >= this.gridSize) return;
        
        const clickedUnit = this.getUnitAtPosition(x, y);

        // --- MODIFIED: Handle ability targeting first ---
        if (this.abilityTargetingMode && this.selectedUnit) {
            if (!clickedUnit) {
                this.addMessage('Invalid ability target.', 'error');
                return;
            }
            this.socket.emit('useAbility', {
                unitId: this.selectedUnit.id,
                targetId: clickedUnit.id
            });
            this.abilityTargetingMode = null;
            this.selectedUnit = null; // Deselect after using ability
            this.updateSelectedUnitDisplay();
            return;
        }
        
        if (clickedUnit) {
            this.handleUnitClick(clickedUnit);
        } else if (this.selectedUnitType) {
            this.deployUnit(x, y);
        } else if (this.selectedUnit) {
            // Only move if we haven't just attacked (selectedUnit shouldn't be null after attack)
            console.log('Attempting to move unit:', this.selectedUnit.id, 'from', this.selectedUnit.x, this.selectedUnit.y, 'to:', x, y);
            this.moveUnit(x, y);
        } else {
            console.log('No action - no unit selected at:', x, y);
        }
    }
    
    handleUnitClick(unit) {
        // Reset ability targeting whenever a new unit is clicked
        this.abilityTargetingMode = null;

        if (unit.owner === this.playerId) {
            // Select own unit
            this.selectedUnit = unit;
            this.selectedUnitType = null;
            this.addMessage(`Selected ${unit.type} unit (Health: ${unit.health}/${unit.maxHealth})`);
        } else if (this.selectedUnit && this.selectedUnit.owner === this.playerId) {
            // Attack enemy unit
            console.log('Attacking enemy unit:', unit.id, 'with attacker:', this.selectedUnit.id);
            this.attackUnit(unit.id);
            // Don't continue processing - attack is complete
            return;
        }
        this.updateSelectedUnitDisplay();
    }
    
    deployUnit(x, y) {
        // ... (This method remains unchanged)
        if (!this.selectedUnitType) return;
        
        this.socket.emit('deployUnit', {
            unitType: this.selectedUnitType,
            x: x,
            y: y
        });
        
        this.selectedUnitType = null;
        document.querySelectorAll('.unit-btn').forEach(btn => {
            btn.classList.remove('selected');
        });
        this.updateSelectedUnitDisplay();
    }
    
    moveUnit(x, y) {
        // ... (This method remains unchanged)
        if (!this.selectedUnit) return;
        
        this.socket.emit('moveUnit', {
            unitId: this.selectedUnit.id,
            x: x,
            y: y
        });
        
        this.selectedUnit = null;
        this.updateSelectedUnitDisplay();
    }
    
    attackUnit(targetId) {
        // ... (This method remains unchanged)
        if (!this.selectedUnit) return;
        
        this.socket.emit('attackUnit', {
            attackerId: this.selectedUnit.id,
            targetId: targetId
        });
        
        this.selectedUnit = null;
        this.updateSelectedUnitDisplay();
    }
    
    endTurn() {
        this.socket.emit('endTurn');
        this.selectedUnit = null;
        this.selectedUnitType = null;
        this.abilityTargetingMode = null;
        document.querySelectorAll('.unit-btn').forEach(btn => btn.classList.remove('selected'));
        this.updateSelectedUnitDisplay();
    }
    
    updateGameDisplay() {
        // ... (This method remains unchanged)
        if (!this.gameState) return;
        
        this.playerIdElement.textContent = this.playerId;
        this.currentTurnElement.textContent = this.gameState.currentTurn === this.playerId ? 'You' : 'Opponent';
        this.energyDisplay.textContent = this.gameState.energy[this.playerId] || 0;
        
        this.drawGame();
        
        if (this.gameState.gameState === 'finished') {
            this.showVictoryModal();
        }
    }
    
    drawGame() {
        // ... (This method remains unchanged)
        if (!this.gameState) return;
        
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawGrid();
        this.gameState.units.forEach(unit => this.drawUnit(unit));
        this.drawSelectionHighlights();
    }
    
    drawGrid() {
        // ... (This method remains unchanged)
        this.ctx.strokeStyle = '#e2e8f0';
        this.ctx.lineWidth = 1;
        
        for (let i = 0; i <= this.gridSize; i++) {
            const pos = i * this.tileSize;
            this.ctx.beginPath();
            this.ctx.moveTo(pos, 0);
            this.ctx.lineTo(pos, this.canvas.height);
            this.ctx.stroke();
            this.ctx.beginPath();
            this.ctx.moveTo(0, pos);
            this.ctx.lineTo(this.canvas.width, pos);
            this.ctx.stroke();
        }
        
        this.ctx.fillStyle = 'rgba(102, 126, 234, 0.1)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.tileSize * 4);
        this.ctx.fillStyle = 'rgba(118, 75, 162, 0.1)';
        this.ctx.fillRect(0, this.tileSize * 4, this.canvas.width, this.tileSize * 4);
    }
    
    // --- MODIFIED drawUnit method ---
    drawUnit(unit) {
        const x = unit.x * this.tileSize;
        const y = unit.y * this.tileSize;
        const centerX = x + this.tileSize / 2;
        const centerY = y + this.tileSize / 2;
        
        this.ctx.fillStyle = unit.owner === this.playerId ? '#667eea' : '#764ba2';
        this.ctx.fillRect(x + 5, y + 5, this.tileSize - 10, this.tileSize - 10);
        
        this.ctx.font = '24px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillStyle = 'white';
        
        let icon = '?';
        if (unit.type === 'melee') icon = '⚔️';
        if (unit.type === 'ranged') icon = '🏹';
        if (unit.type === 'medic') icon = '⚕️';
        if (unit.type === 'guardian') icon = '🛡️';
        if (unit.type === 'generator') icon = '⚡';
        this.ctx.fillText(icon, centerX, centerY - 5);
        
        const healthPercent = unit.health / unit.maxHealth;
        this.ctx.fillStyle = healthPercent > 0.5 ? '#48bb78' : healthPercent > 0.25 ? '#ed8936' : '#f56565';
        this.ctx.fillRect(x + 5, y + this.tileSize - 15, (this.tileSize - 10) * healthPercent, 8);
        
        this.ctx.font = '10px Arial';
        this.ctx.fillStyle = 'white';
        this.ctx.fillText(`${unit.health}/${unit.maxHealth}`, centerX, y + this.tileSize - 8);
        
        // Generator turns remaining
        if (unit.type === 'generator') {
            this.ctx.font = '10px Arial';
            this.ctx.fillStyle = '#ffd700';
            const turnsLeft = unit.maxTurns - unit.turnsActive;
            this.ctx.fillText(`${turnsLeft}T`, centerX, y + this.tileSize + 5);
        }
        
        // Draw status effects
        const isTaunted = unit.statusEffects.some(s => s.type === 'taunt');
        if (isTaunted) {
            this.ctx.font = '20px Arial';
            this.ctx.fillText('❗', centerX + 20, y + 20);
        }
    }
    
    drawSelectionHighlights() {
        // ... (This method remains unchanged)
        if (!this.selectedUnit) return;
        
        const x = this.selectedUnit.x * this.tileSize;
        const y = this.selectedUnit.y * this.tileSize;
        
        this.ctx.strokeStyle = '#ffd700';
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(x + 2, y + 2, this.tileSize - 4, this.tileSize - 4);
    }
    
    getUnitAtPosition(x, y) {
        // ... (This method remains unchanged)
        if (!this.gameState) return null;
        return this.gameState.units.find(unit => unit.x === x && unit.y === y);
    }
    
    // --- MODIFIED updateSelectedUnitDisplay method ---
    updateSelectedUnitDisplay() {
        this.abilityContainer.innerHTML = ''; // Clear old ability buttons

        if (this.selectedUnit) {
            const hasAction = this.selectedUnit.hasMoved || this.selectedUnit.hasAttacked;
            const abilityText = this.selectedUnit.ability ? this.selectedUnit.ability.charAt(0).toUpperCase() + this.selectedUnit.ability.slice(1) : '';

            this.selectedUnitElement.innerHTML = `
                <h4>Selected ${this.selectedUnit.type}</h4>
                <p>Health: ${this.selectedUnit.health}/${this.selectedUnit.maxHealth}</p>
                <p>Damage: ${this.selectedUnit.damage}</p>
                <p>Range: ${this.selectedUnit.range}</p>
                <div class="energy-costs">
                    <p><strong>Energy Costs:</strong></p>
                    <p>• Move: 1 energy per tile</p>
                    <p>• Attack: 2 energy</p>
                    ${this.selectedUnit.ability ? `<p>• Ability: 1 energy</p>` : ''}
                </div>
                <p><em>Click on enemy to attack or empty tile to move.</em></p>
                <p><em>${hasAction ? 'Unit has already acted this turn.' : ''}</em></p>
            `;

            // If unit has an ability and hasn't acted, create the button
            if (this.selectedUnit.ability && !hasAction) {
                const abilityBtn = document.createElement('button');
                abilityBtn.textContent = `Use ${abilityText}`;
                abilityBtn.onclick = () => {
                    this.abilityTargetingMode = this.selectedUnit.ability;
                    this.addMessage(`Targeting ${abilityText}. Click a valid target.`);
                };
                this.abilityContainer.appendChild(abilityBtn);
            }

        } else if (this.selectedUnitType) {
            this.selectedUnitElement.innerHTML = `
                <h4>Deploying ${this.selectedUnitType}</h4>
                <p><em>Click on your side of the board to deploy.</em></p>
            `;
        } else {
            this.selectedUnitElement.innerHTML = `
                <p>Click a unit to select it or choose a unit type to deploy.</p>
            `;
        }
    }
    
    showGameScreen() { /* ... (unchanged) ... */ 
        this.lobbyScreen.style.display = 'none';
        this.gameScreen.style.display = 'block';
    }
    showVictoryModal() { /* ... (unchanged) ... */
        const isWinner = this.gameState.winner === this.playerId;
        this.victoryTitle.textContent = isWinner ? 'Victory!' : 'Defeat!';
        this.victoryMessage.textContent = isWinner ? 
            'Congratulations! You have won the game!' : 
            'Better luck next time!';
        this.victoryModal.style.display = 'flex';
     }
    playAgain() { /* ... (unchanged) ... */ 
        this.victoryModal.style.display = 'none';
        this.gameScreen.style.display = 'none';
        this.lobbyScreen.style.display = 'block';
        this.gameIdDisplay.style.display = 'none';
        this.gameIdInput.value = '';
        this.selectedUnit = null;
        this.selectedUnitType = null;
        this.updateSelectedUnitDisplay();
    }
    backToLobby() { /* ... (unchanged) ... */ 
        this.victoryModal.style.display = 'none';
        this.gameScreen.style.display = 'none';
        this.lobbyScreen.style.display = 'block';
        this.gameIdDisplay.style.display = 'none';
        this.gameIdInput.value = '';
        this.selectedUnit = null;
        this.selectedUnitType = null;
        this.updateSelectedUnitDisplay();
    }
    addMessage(message, type = 'info') { /* ... (unchanged) ... */ 
        if (!this.gameMessagesElement) {
            console.log('Messages element not ready:', message);
            return;
        }
        
        const messageElement = document.createElement('div');
        messageElement.className = `message ${type}`;
        messageElement.textContent = message;
        
        this.gameMessagesElement.appendChild(messageElement);
        this.gameMessagesElement.scrollTop = this.gameMessagesElement.scrollHeight;
        
        setTimeout(() => {
            if (messageElement.parentNode) {
                messageElement.parentNode.removeChild(messageElement);
            }
        }, 5000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing GameClient');
    new GameClient();
});