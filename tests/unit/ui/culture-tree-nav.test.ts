// Arrow keys along the culture tree (plan M4-13): focus moves to the node drawn in that direction — down a row (the
// same column, the left one from a centred node), across a row of two, from one branch's top to the next branch's root;
// Home/End go to the first and the last node. Nothing past an edge: the key keeps the node.
import { describe, expect, it } from 'vitest';
import { TREE_CELLS, treeStep, type TreeKey } from '../../../src/ui/cultureTree.ts';

const walk = (from: Parameters<typeof treeStep>[1], ...keys: TreeKey[]) =>
  keys.reduce((at, k) => treeStep(TREE_CELLS, at, k), from);

describe('culture tree keyboard steps (M4-13)', () => {
  it('lays both branches out: root, two, two, top — the second branch under the first', () => {
    expect(TREE_CELLS.map((c) => [c.id, c.row, c.col])).toEqual([
      ['music.dumy', 0, null],
      ['music.maidan', 1, 0],
      ['music.campaign', 1, 1],
      ['music.bandura', 2, 0],
      ['music.lirnyky', 2, 1],
      ['music.great', 3, null],
      ['customs.vechornytsi', 4, null],
      ['customs.toloka', 5, 0],
      ['customs.hostyna', 5, 1],
      ['customs.obzhynky', 6, 0],
      ['customs.kupala', 6, 1],
      ['customs.didukh', 7, null],
    ]);
  });

  it('down: from the root to the left node, in its column, to the top, then on to the next branch', () => {
    expect(walk('music.dumy', 'ArrowDown')).toBe('music.maidan');
    expect(walk('music.campaign', 'ArrowDown')).toBe('music.lirnyky');
    expect(walk('music.lirnyky', 'ArrowDown')).toBe('music.great');
    expect(walk('music.great', 'ArrowDown')).toBe('customs.vechornytsi');
    expect(walk('customs.didukh', 'ArrowDown')).toBe('customs.didukh');
  });

  it('up mirrors down; left and right stay in the row', () => {
    expect(walk('customs.vechornytsi', 'ArrowUp')).toBe('music.great');
    expect(walk('music.great', 'ArrowUp')).toBe('music.bandura');
    expect(walk('music.lirnyky', 'ArrowUp')).toBe('music.campaign');
    expect(walk('music.maidan', 'ArrowUp')).toBe('music.dumy');
    expect(walk('music.dumy', 'ArrowUp')).toBe('music.dumy');
    expect(walk('music.maidan', 'ArrowRight')).toBe('music.campaign');
    expect(walk('music.campaign', 'ArrowRight')).toBe('music.campaign');
    expect(walk('music.campaign', 'ArrowLeft')).toBe('music.maidan');
    expect(walk('music.maidan', 'ArrowLeft')).toBe('music.maidan');
    expect(walk('music.dumy', 'ArrowLeft', 'ArrowRight')).toBe('music.dumy');
  });

  it('Home and End: the first and the last node', () => {
    expect(walk('customs.kupala', 'Home')).toBe('music.dumy');
    expect(walk('music.maidan', 'End')).toBe('customs.didukh');
  });
});
