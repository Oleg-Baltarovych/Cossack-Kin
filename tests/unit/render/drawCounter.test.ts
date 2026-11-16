import { describe, expect, it } from 'vitest';
import { installDrawCounter } from '../../../src/render/debug/drawCounter.ts';

class FakeGl {
  log: string[] = [];
  drawElements(mode: number): void {
    this.log.push(`elements:${String(mode)}`);
  }
  drawArrays(mode: number): void {
    this.log.push(`arrays:${String(mode)}`);
  }
  drawElementsInstanced(mode: number): void {
    this.log.push(`elementsInstanced:${String(mode)}`);
  }
  clear(): void {
    this.log.push('clear');
  }
}

describe('installDrawCounter', () => {
  it('counts every draw call, passes it through with the right `this`, ignores non-draw calls', () => {
    const gl = new FakeGl();
    const counter = installDrawCounter(gl);
    gl.drawElements(4);
    gl.drawArrays(5);
    gl.drawElementsInstanced(6);
    gl.clear();
    expect(counter.count()).toBe(3);
    expect(gl.log).toEqual(['elements:4', 'arrays:5', 'elementsInstanced:6', 'clear']);
  });

  it('reset starts a new frame; uninstall restores the original methods', () => {
    const gl = new FakeGl();
    const counter = installDrawCounter(gl);
    gl.drawArrays(1);
    counter.reset();
    expect(counter.count()).toBe(0);
    counter.uninstall();
    gl.drawArrays(1);
    expect(counter.count()).toBe(0);
    expect(Object.hasOwn(gl, 'drawArrays')).toBe(false);
  });
});
