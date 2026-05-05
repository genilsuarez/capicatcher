import { gameState } from '../../stores/GameState';
import { GameSettings } from '../../config/GameSettings';

export class CapybaraPlayer {
  private element!: HTMLElement;
  private fillElement!: HTMLElement;
  private svgElement!: SVGElement;
  private x: number = 0;
  private lastX: number = 0;
  private gameContainer: HTMLElement;
  private readonly speed: number = 8;
  private direction: 'left' | 'right' = 'right';

  constructor(container: HTMLElement) {
    this.gameContainer = container;
    this.x = this.gameContainer.clientWidth / 2 - GameSettings.getCapybaraWidth() / 2;
    this.lastX = this.x;
    this.createElement();
    container.appendChild(this.element);
    this.setupControls();
  }



  private createElement(): void {
    this.element = document.createElement('div');
    this.element.className = 'capybara-player';
    
    const body = document.createElement('div');
    body.className = 'capybara-player__body';
    
    // Create SVG capybara
    this.svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svgElement.setAttribute('class', 'capybara-player__svg');
    this.svgElement.setAttribute('viewBox', '0 0 80 60');
    
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '#capybara-right');
    this.svgElement.appendChild(use);
    
    // Fill indicator inside capybara body
    this.fillElement = document.createElement('div');
    this.fillElement.className = 'capybara-player__fill';
    this.fillElement.style.cssText = `
      position: absolute;
      bottom: 0;
      left: 0;
      width: 100%;
      height: 0%;
      background: linear-gradient(45deg, #FF4500, #DC143C);
      border-radius: 50% 50% 40% 40%;
      transition: height 0.15s ease-out, background 0.15s ease-out;
    `;
    
    body.appendChild(this.fillElement);
    body.appendChild(this.svgElement);
    this.element.appendChild(body);
    
    this.updatePosition();
  }

  private setupControls(): void {
    document.addEventListener('keydown', (e) => {
      if (gameState.gameStatus !== 'playing') return;
      
      switch(e.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
          this.moveLeft();
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          this.moveRight();
          break;
      }
    });

    // Mouse controls
    document.addEventListener('mousemove', (e) => {
      if (gameState.gameStatus !== 'playing') return;
      
      const rect = this.gameContainer.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;
      const capybaraWidth = GameSettings.getCapybaraWidth();
      const offset = capybaraWidth / 2;
      this.x = Math.max(0, Math.min(this.gameContainer.clientWidth - capybaraWidth, relativeX - offset));
      this.updatePosition();
    });

    // Touch controls - LIMITED TO GAME CONTAINER ONLY
    let isDragging = false;
    
    this.gameContainer.addEventListener('touchstart', (e) => {
      // Only handle touches on the game area, not UI elements
      const target = e.target as HTMLElement;
      if (target.closest('.pause-overlay') || target.closest('.game-over') || target.closest('.level-transition') || target.closest('.audio-toggle')) {
        return;
      }
      
      isDragging = true;
      e.preventDefault();
    }, { passive: false });

    this.gameContainer.addEventListener('touchmove', (e) => {
      if (!isDragging || gameState.gameStatus !== 'playing') return;
      
      // Only handle touches on the game area
      const target = e.target as HTMLElement;
      if (target.closest('.pause-overlay') || target.closest('.game-over') || target.closest('.level-transition') || target.closest('.audio-toggle')) {
        return;
      }
      
      const touch = e.touches[0];
      const rect = this.gameContainer.getBoundingClientRect();
      const relativeX = touch.clientX - rect.left;
      const capybaraWidth = GameSettings.getCapybaraWidth();
      const offset = capybaraWidth / 2;
      this.x = Math.max(0, Math.min(this.gameContainer.clientWidth - capybaraWidth, relativeX - offset));
      this.updatePosition();
      e.preventDefault();
    }, { passive: false });

    this.gameContainer.addEventListener('touchend', () => {
      isDragging = false;
    });
  }

  private moveLeft(): void {
    this.x = Math.max(0, this.x - this.speed);
    this.updatePosition();
  }

  private moveRight(): void {
    const capybaraWidth = GameSettings.getCapybaraWidth();
    this.x = Math.min(this.gameContainer.clientWidth - capybaraWidth, this.x + this.speed);
    this.updatePosition();
  }

  private updatePosition(): void {
    this.element.style.left = `${this.x}px`;
    
    // Update direction based on movement
    const newDirection = this.x > this.lastX ? 'right' : this.x < this.lastX ? 'left' : this.direction;
    
    if (newDirection !== this.direction) {
      this.direction = newDirection;
      const use = this.svgElement.querySelector('use');
      if (use) {
        use.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', `#capybara-${this.direction}`);
      }
      
      // Add running animation
      this.element.classList.add('capybara-player--running');
      setTimeout(() => {
        this.element.classList.remove('capybara-player--running');
      }, 300);
    }
    
    this.lastX = this.x;
  }

  public updateFill(percentage: number): void {
    this.fillElement.style.height = `${percentage}%`;
    
    // Energy color progression: Red (low) → Yellow (medium) → Green (high)
    if (percentage >= 80) {
      // High energy: Bright green
      this.fillElement.style.background = 'linear-gradient(45deg, #32CD32, #228B22)';
    } else if (percentage >= 50) {
      // Medium energy: Yellow/orange
      this.fillElement.style.background = 'linear-gradient(45deg, #FFD700, #FFA500)';
    } else if (percentage >= 20) {
      // Low-medium energy: Orange/red-orange
      this.fillElement.style.background = 'linear-gradient(45deg, #FF8C00, #FF6347)';
    } else {
      // Very low energy: Red
      this.fillElement.style.background = 'linear-gradient(45deg, #FF4500, #DC143C)';
    }
  }

  public getBounds() {
    return GameSettings.getCapybaraBounds(this.x, this.gameContainer.clientHeight);
  }

  public getX(): number {
    return this.x;
  }

  public destroy(): void {
    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}