import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLrc, findActiveLine } from '../src/shared/lrc.ts';

const SAMPLE = `[ti:Test Song]
[ar:Test Artist]
[00:01.50]First line
[00:05.00]Second line
[00:10.00]
[00:20.00]<00:20.00>Hello <00:20.50>world
[00:25.00]Last`;

test('parses timestamped lines and skips metadata tags', () => {
  const lines = parseLrc(SAMPLE, 30000);
  assert.equal(lines.length, 5);
  assert.deepEqual(
    lines.map((l) => l.text),
    ['First line', 'Second line', '', 'Hello world', 'Last']
  );
  assert.equal(lines[0].startMs, 1500);
});

test('computes endMs from the next line start and track duration', () => {
  const lines = parseLrc(SAMPLE, 30000);
  assert.equal(lines[0].endMs, 5000);
  assert.equal(lines[1].endMs, 10000);
  assert.equal(lines[4].endMs, 30000);
});

test('extracts enhanced-LRC word timings', () => {
  const lines = parseLrc(SAMPLE, 30000);
  const karaoke = lines[3];
  assert.deepEqual(karaoke.words, [
    { startMs: 20000, text: 'Hello' },
    { startMs: 20500, text: 'world' }
  ]);
});

test('supports multiple timestamps on a single line', () => {
  const lines = parseLrc('[00:01.00][00:09.00]Repeated chorus');
  assert.equal(lines.length, 2);
  assert.equal(lines[0].startMs, 1000);
  assert.equal(lines[1].startMs, 9000);
  assert.equal(lines[0].text, 'Repeated chorus');
});

test('findActiveLine returns -1 before the first line and tracks position', () => {
  const lines = parseLrc(SAMPLE, 30000);
  assert.equal(findActiveLine(lines, 0), -1);
  assert.equal(findActiveLine(lines, 1600), 0);
  assert.equal(findActiveLine(lines, 6000), 1);
  assert.equal(findActiveLine(lines, 12000), 2);
  assert.equal(findActiveLine(lines, 29000), 4);
});

test('handles empty and malformed input gracefully', () => {
  assert.deepEqual(parseLrc(''), []);
  assert.deepEqual(parseLrc('no timestamps here\njust text'), []);
  assert.equal(findActiveLine([], 5000), -1);
});
