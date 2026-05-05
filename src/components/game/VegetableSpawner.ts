import type { Vegetable } from '../../types/game.types';
import { GameSettings } from '../../config/GameSettings';

export class VegetableSpawner {
  private container: HTMLElement;
  private spawnTimer: number = 0;
  private readonly vegetableTypes = ['carrot', 'broccoli', 'lettuce', 'tomato', 'pepper'];
  private activeVegetables: Map<string, HTMLElement> = new Map();

  // Pre-computed speed multipliers (avoid object creation per spawn)
  private static readonly SPEED_MULTIPLIERS: Record<string, number> = {
    lettuce: 0.8,
    carrot: 1.0,
    tomato: 1.1,
    broccoli: 1.25,
    pepper: 1.4
  };

  private static readonly POINTS: Record<string, number> = {
    carrot: 5,
    broccoli: 8,
    lettuce: 3,
    tomato: 6,
    pepper: 10
  };

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public update(deltaTime: number, level: number): Vegetable[] {
    this.spawnTimer += deltaTime;
    
    const spawnRate = Math.max(800, 2000 - (level * 100));
    const newVegetables: Vegetable[] = [];
    
    if (this.spawnTimer >= spawnRate) {
      const vegetable = this.spawnVegetable(level);
      newVegetables.push(vegetable);
      this.spawnTimer = 0;
    }

    return newVegetables;
  }

  private spawnVegetable(level: number): Vegetable {
    const type = this.vegetableTypes[Math.floor(Math.random() * this.vegetableTypes.length)];
    const x = Math.random() * (this.container.clientWidth - GameSettings.getVegetableSize());
    
    const vegetable: Vegetable = {
      id: Date.now().toString() + Math.random(),
      type: type as any,
      x,
      y: -GameSettings.getVegetableSize(),
      speed: this.calculateVegetableSpeed(type, level),
      points: VegetableSpawner.POINTS[type] || 5
    };

    this.createVegetableElement(vegetable);
    return vegetable;
  }

  private createVegetableElement(vegetable: Vegetable): void {
    const element = document.createElement('div');
    element.className = `vegetable vegetable--${vegetable.type} vegetable--spawning`;
    element.style.left = `${vegetable.x}px`;
    element.style.transform = `translateY(${vegetable.y}px)`;
    element.style.top = '0';
    element.style.willChange = 'transform';
    element.id = vegetable.id;
    
    // Create SVG element
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 30 30');
    svg.setAttribute('width', GameSettings.getVegetableSize().toString());
    svg.setAttribute('height', GameSettings.getVegetableSize().toString());
    
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', `#${vegetable.type}`);
    
    svg.appendChild(use);
    element.appendChild(svg);
    
    this.container.appendChild(element);
    this.activeVegetables.set(vegetable.id, element);
    
    // Remove spawn animation class after animation completes
    setTimeout(() => {
      element.classList.remove('vegetable--spawning');
    }, 300);
  }

  public updateVegetablePosition(vegetable: Vegetable): void {
    const element = this.activeVegetables.get(vegetable.id);
    if (element) {
      element.style.transform = `translateY(${vegetable.y}px)`;
    }
  }
  
  public reset(): void {
    // Clear all active vegetables from DOM immediately
    this.activeVegetables.forEach(element => {
      if (element.parentNode) {
        element.parentNode.removeChild(element);
      }
    });
    this.activeVegetables.clear();
    
    // Reset spawn timer to prevent immediate spawning
    this.spawnTimer = 0;
  }

  public removeVegetable(id: string): void {
    const element = this.activeVegetables.get(id);
    if (element && element.parentNode) {
      element.parentNode.removeChild(element);
      this.activeVegetables.delete(id);
    }
  }
  
  private calculateVegetableSpeed(type: string, level: number): number {
    const baseSpeed = 1.8 + (level * 0.25);
    const multiplier = VegetableSpawner.SPEED_MULTIPLIERS[type] || 1.0;
    return baseSpeed * multiplier;
  }
}
