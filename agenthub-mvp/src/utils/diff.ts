import type { DiffHunk } from '../types';

/**
 * Tiny line-based diff. Not as smart as a real LCS-based diff,
 * but good enough for an MVP visual.
 * Algorithm: split by line; for each line, mark add/remove if not equal,
 * else context. Uses a basic two-pointer walk with lookahead.
 */
export function diffLines(oldText: string, newText: string): DiffHunk[] {
  const oldLines = oldText.split(/\r?\n/);
  const newLines = newText.split(/\r?\n/);
  const hunks: DiffHunk[] = [];

  let i = 0; // old
  let j = 0; // new
  const LOOKAHEAD = 6;

  while (i < oldLines.length || j < newLines.length) {
    const oldLine = oldLines[i];
    const newLine = newLines[j];

    if (i >= oldLines.length) {
      hunks.push({ type: 'add', line: newLine, newLineNo: j + 1 });
      j++;
      continue;
    }
    if (j >= newLines.length) {
      hunks.push({ type: 'remove', line: oldLine, oldLineNo: i + 1 });
      i++;
      continue;
    }
    if (oldLine === newLine) {
      hunks.push({ type: 'context', line: oldLine, oldLineNo: i + 1, newLineNo: j + 1 });
      i++;
      j++;
      continue;
    }

    // 在 new 的 lookahead 区找 oldLine 看是否是插入
    const addIdx = newLines.slice(j, j + LOOKAHEAD).indexOf(oldLine);
    // 在 old 的 lookahead 区找 newLine 看是否是删除
    const remIdx = oldLines.slice(i, i + LOOKAHEAD).indexOf(newLine);

    if (addIdx !== -1 && (remIdx === -1 || addIdx < remIdx)) {
      // 这是插入
      for (let k = 0; k < addIdx; k++) {
        hunks.push({ type: 'add', line: newLines[j + k], newLineNo: j + k + 1 });
      }
      j += addIdx;
    } else if (remIdx !== -1) {
      // 这是删除
      for (let k = 0; k < remIdx; k++) {
        hunks.push({ type: 'remove', line: oldLines[i + k], oldLineNo: i + k + 1 });
      }
      i += remIdx;
    } else {
      // 真正的修改：1 行 remove + 1 行 add
      hunks.push({ type: 'remove', line: oldLine, oldLineNo: i + 1 });
      hunks.push({ type: 'add', line: newLine, newLineNo: j + 1 });
      i++;
      j++;
    }
  }
  return hunks;
}
