import { useGameStore } from '../../stores/useGameStore';
import type { GameState } from '../../stores/useGameStore';
import { GameSettings } from '../../config/GameSettings';
import { CapybaraPlayer } from './CapybaraPlayer';
import { VegetableSpawner } from './VegetableSpawner';
import { ParticleSystem } from '../effects/ParticleSystem';
import { GameHUD } from '../ui/GameHUD';
import { GameOverScreen } from '../ui/GameOverScreen';
import { LevelTransition } from '../ui/LevelTransition';
import { PauseOverlay } from '../ui/PauseOverlay';
import { HelpModal } from '../ui/HelpModal';
import { PauseButton } from '../ui/PauseButton';
import { MobileUIBar } from '../ui/MobileUIBar';
import { AudioManager } from '../../audio/AudioManager';
import type { Vegetable } from '../../types/game.types';

export class GameEngine {
  private container: HTMLElement;
  private player!: CapybaraPlayer;
  private spawner!: VegetableSpawner;
  private particles!: ParticleSystem;
  private hud!: GameHUD;
  private gameOverScreen!: GameOverScreen;
  private levelTransition!: LevelTransition;
  private pauseOverlay!: PauseOverlay;
  private helpModal!: HelpModal;
  private pauseButton!: PauseButton;
  private mobileUIBar!: MobileUIBar;
  private audioManager = AudioManager.getInstance();
  private isMobile: boolean = window.innerWidth <= 1024;
  private animationId: number = 0;
  private lastTime: number = 0;
  private vegetables: Vegetable[] = [];
  private gameStore = useGameStore;
  private unsubscribe: (() => void) | null = null;

  // Cached player element reference (avoid querySelector every catch)
  private playerElement: HTMLElement | null = null;

  // Score popup pool to avoid DOM creation/destruction
  private popupPool: HTMLElement[] = [];
  private activePopups: Set<HTMLElement> = new Set();

  // HUD cache to avoid unnecessary DOM updates
  private lastHudScore = -1;
  private lastHudLevel = -1;
  private lastHudLives = -1;
  private lastHudProgress = -1;
  private lastFillPercentage = -1;

  constructor(container: HTMLElement) {
    this.container = container;
    this.init();
  }

  private init(): void {
    // Initialize game components
    this.player = new CapybaraPlayer(this.container);
    this.spawner = new VegetableSpawner(this.container);
    this.particles = new ParticleSystem(this.container);
    
    // Only create GameHUD for desktop
    if (!this.isMobile) {
      this.hud = new GameHUD(this.container);
    }
    
    this.gameOverScreen = new GameOverScreen(this.container, () => this.restart());
    this.levelTransition = new LevelTransition(this.container);
    this.pauseOverlay = new PauseOverlay(this.container, () => this.helpModal.show());
    this.helpModal = new HelpModal();
    
    // Use MobileUIBar for mobile, separate buttons for desktop
    if (this.isMobile) {
      this.mobileUIBar = new MobileUIBar(
        (paused) => this.handlePauseToggle(paused),
        () => this.handleAudioToggle()
      );
    } else {
      this.pauseButton = new PauseButton(document.body, (paused) => this.handlePauseToggle(paused));
    }

    // Cache player element
    this.playerElement = this.container.querySelector('.capybara-player');

    // Pre-create popup pool
    this.initPopupPool(5);

    // Subscribe to Zustand store changes (store unsubscribe for cleanup)
    this.unsubscribe = useGameStore.subscribe((state) => this.handleGameStateChange(state));

    // Start game loop
    this.gameLoop(0);

    // Setup keyboard controls
    this.setupKeyboardControls();
  }

  private initPopupPool(size: number): void {
    for (let i = 0; i < size; i++) {
      const popup = document.createElement('div');
      popup.className = 'score-popup';
      popup.style.cssText = `
        position: absolute;
        color: #FFD700;
        font-weight: bold;
        font-size: 1.2rem;
        pointer-events: none;
        z-index: 1000;
        display: none;
      `;
      this.container.appendChild(popup);
      this.popupPool.push(popup);
    }
  }

  private levelTransitionActive = false;

  private handlePauseToggle(paused: boolean): void {
    const currentState = this.gameStore.getState();
    if (paused && currentState.gameStatus === 'playing') {
      currentState.pauseGame();
    } else if (!paused && currentState.gameStatus === 'paused') {
      currentState.resumeGame();
    }
  }
  
  private handleAudioToggle(): void {
    this.audioManager.toggle();
  }

  private handleGameStateChange(state: GameState): void {
    // Update pause button state
    if (this.isMobile && this.mobileUIBar) {
      this.mobileUIBar.updatePauseState(state.gameStatus === 'paused');
    } else if (this.pauseButton) {
      this.pauseButton.updateState(state.gameStatus === 'paused');
    }
    
    if (state.gameStatus === 'paused') {
      this.pauseOverlay.show(() => this.gameStore.getState().resumeGame());
    } else if (state.gameStatus === 'playing') {
      this.pauseOverlay.hide();
    } else if (state.gameStatus === 'won' && !this.levelTransitionActive) {
      this.levelTransitionActive = true;
      this.audioManager.play('levelup');
      
      // CRITICAL: Clear vegetables IMMEDIATELY to stop all collision detection
      this.clearAllVegetables();
      
      this.levelTransition.show(state.level + 1);
      
      setTimeout(() => {
        this.gameStore.getState().incrementLevel();
        this.gameStore.getState().resetForNextLevel();
        this.levelTransitionActive = false;
      }, 2000);
    } else if (state.gameStatus === 'lost') {
      this.audioManager.play('gameover');
      this.gameOverScreen.show(false, state.score, state.level);
    }
  }

  private setupKeyboardControls(): void {
    document.addEventListener('keydown', (e) => {
      switch(e.key) {
        case ' ':
        case 'Escape':
          e.preventDefault();
          const currentState = this.gameStore.getState();
          if (currentState.gameStatus === 'playing') {
            currentState.pauseGame();
          } else if (currentState.gameStatus === 'paused') {
            currentState.resumeGame();
          }
          break;
        case 'r':
        case 'R':
          const state = this.gameStore.getState();
          if (state.gameStatus === 'lost' || state.gameStatus === 'won') {
            this.restart();
          }
          break;
      }
    });
  }

  private gameLoop(currentTime: number): void {
    const deltaTime = currentTime - this.lastTime;
    this.lastTime = currentTime;

    const currentState = this.gameStore.getState();
    
    // CRITICAL: Only update game logic when actually playing
    if (currentState.gameStatus === 'playing' && !this.levelTransitionActive) {
      this.update(deltaTime);
      this.render();
    }

    this.animationId = requestAnimationFrame((time) => this.gameLoop(time));
  }

  private update(deltaTime: number): void {
    const state = this.gameStore.getState();
    
    // SAFETY: Double-check we should be updating
    if (state.gameStatus !== 'playing' || this.levelTransitionActive) {
      return;
    }
    
    // Spawn new vegetables
    const newVegetables = this.spawner.update(deltaTime, state.level);
    if (newVegetables.length > 0) {
      this.vegetables.push(...newVegetables);
    }

    // Cache player bounds once per frame (not per vegetable)
    const playerBounds = this.player.getBounds();
    const containerHeight = this.container.clientHeight;
    const vegetableSize = GameSettings.getVegetableSize();

    // Update existing vegetables - in-place removal
    let writeIdx = 0;
    for (let i = 0; i < this.vegetables.length; i++) {
      const vegetable = this.vegetables[i];
      const newY = vegetable.y + vegetable.speed;
      
      // Check collision with cached player bounds
      if (this.checkCollisionFast(playerBounds, vegetable.x, newY, vegetableSize)) {
        // Caught vegetable
        this.audioManager.play('catch');
        state.updateScore(vegetable.points);
        this.particles.createCatchEffect(vegetable.x, newY);
        this.spawner.removeVegetable(vegetable.id);
        
        // Bounce animation using cached element
        if (this.playerElement) {
          this.playerElement.classList.add('capybara-player--catch');
          setTimeout(() => {
            this.playerElement?.classList.remove('capybara-player--catch');
          }, 600);
        }
        
        // Score popup from pool
        this.showScorePopup(vegetable.x, newY, vegetable.points);
        continue;
      }

      // Check if vegetable fell off screen
      if (newY > containerHeight) {
        this.audioManager.play('miss');
        state.incrementMissed();
        this.spawner.removeVegetable(vegetable.id);
        continue;
      }

      // Update position
      vegetable.y = newY;
      this.spawner.updateVegetablePosition(vegetable);
      this.vegetables[writeIdx] = vegetable;
      writeIdx++;
    }
    this.vegetables.length = writeIdx;

    // Update particles
    this.particles.update();

    // Update UI only when values change
    const currentState = this.gameStore.getState();
    const visualFillPercentage = GameSettings.calculateFillPercentage(currentState.capybaraFillPercentage);
    const score = currentState.score;
    const level = currentState.level;
    const lives = 3 - currentState.missedVegetables;
    const progress = Math.round(visualFillPercentage);

    if (this.isMobile && this.mobileUIBar) {
      if (score !== this.lastHudScore) { this.mobileUIBar.updateScore(score); this.lastHudScore = score; }
      if (level !== this.lastHudLevel) { this.mobileUIBar.updateLevel(level); this.lastHudLevel = level; }
      if (lives !== this.lastHudLives) { this.mobileUIBar.updateLives(lives); this.lastHudLives = lives; }
      if (progress !== this.lastHudProgress) { this.mobileUIBar.updateProgress(visualFillPercentage); this.lastHudProgress = progress; }
    } else if (this.hud) {
      if (score !== this.lastHudScore) { this.hud.updateScore(score); this.lastHudScore = score; }
      if (level !== this.lastHudLevel) { this.hud.updateLevel(level); this.lastHudLevel = level; }
      if (lives !== this.lastHudLives) { this.hud.updateLives(lives); this.lastHudLives = lives; }
      if (progress !== this.lastHudProgress) { this.hud.updateProgress(visualFillPercentage); this.lastHudProgress = progress; }
    }
    
    if (progress !== this.lastFillPercentage) {
      this.player.updateFill(visualFillPercentage);
      this.lastFillPercentage = progress;
    }
  }

  private render(): void {
    this.particles.render();
  }

  // Optimized collision: no object spread, no intermediate objects
  private checkCollisionFast(player: { x: number; y: number; width: number; height: number }, vegX: number, vegY: number, vegSize: number): boolean {
    const overlapThreshold = 0.3;
    
    const xOverlap = Math.max(0, Math.min(player.x + player.width, vegX + vegSize) - Math.max(player.x, vegX));
    const yOverlap = Math.max(0, Math.min(player.y + player.height, vegY + vegSize) - Math.max(player.y, vegY));
    
    const minArea = Math.min(player.width * player.height, vegSize * vegSize);
    const requiredOverlap = minArea * overlapThreshold;
    
    return (xOverlap * yOverlap) >= requiredOverlap;
  }

  private clearAllVegetables(): void {
    this.vegetables.length = 0;
    this.spawner.reset();
  }

  private restart(): void {
    this.clearAllVegetables();
    this.gameStore.getState().resetGame();
    this.gameOverScreen.hide();
    
    // Reset HUD cache
    this.lastHudScore = -1;
    this.lastHudLevel = -1;
    this.lastHudLives = -1;
    this.lastHudProgress = -1;
    this.lastFillPercentage = -1;
    
    if (this.isMobile && this.mobileUIBar) {
      this.mobileUIBar.updateScore(0);
      this.mobileUIBar.updateLevel(1);
      this.mobileUIBar.updateLives(3);
      this.mobileUIBar.updateProgress(0);
    } else if (this.hud) {
      this.hud.updateScore(0);
      this.hud.updateLevel(1);
      this.hud.updateLives(3);
      this.hud.updateProgress(0);
    }
    this.player.updateFill(0);
  }

  private showScorePopup(x: number, y: number, points: number): void {
    // Get from pool or create new
    let popup = this.popupPool.pop();
    if (!popup) {
      popup = document.createElement('div');
      popup.className = 'score-popup';
      popup.style.cssText = `
        position: absolute;
        color: #FFD700;
        font-weight: bold;
        font-size: 1.2rem;
        pointer-events: none;
        z-index: 1000;
      `;
      this.container.appendChild(popup);
    }
    
    popup.textContent = `+${points}`;
    popup.style.left = `${x}px`;
    popup.style.top = `${y}px`;
    popup.style.display = 'block';
    // Reset animation
    popup.classList.remove('score-popup');
    void popup.offsetWidth; // force reflow to restart animation
    popup.classList.add('score-popup');
    
    this.activePopups.add(popup);
    
    setTimeout(() => {
      popup!.style.display = 'none';
      this.activePopups.delete(popup!);
      this.popupPool.push(popup!);
    }, 1000);
  }

  public destroy(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    
    // Unsubscribe from store
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    
    this.player.destroy();
    this.particles.destroy();
    
    if (!this.isMobile && this.hud) {
      this.hud.destroy();
    }
    
    this.gameOverScreen.destroy();
    
    if (this.isMobile && this.mobileUIBar) {
      this.mobileUIBar.destroy();
    } else if (this.pauseButton) {
      this.pauseButton.destroy();
    }

    // Clean up popup pool
    this.popupPool.forEach(p => p.parentNode?.removeChild(p));
    this.activePopups.forEach(p => p.parentNode?.removeChild(p));
    this.popupPool = [];
    this.activePopups.clear();
  }
}
