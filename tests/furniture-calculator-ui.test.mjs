import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const engine = readFileSync(new URL('../furniture-calculator.js', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../furniture-calculator-ui.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../furniture-calculator.css', import.meta.url), 'utf8');

function extractInlineAsset(name, indent) {
  const begin = `${indent}/* BEGIN INLINE ${name} */`;
  const end = `${indent}/* END INLINE ${name} */`;
  const startIndex = html.indexOf(begin);
  const endIndex = html.indexOf(end, startIndex + begin.length);
  assert.ok(startIndex >= 0 && endIndex > startIndex, `${name} inline markers should exist`);
  return html
    .slice(startIndex + begin.length, endIndex)
    .replace(/^\n/, '')
    .split('\n')
    .map((line) => line.startsWith(indent) ? line.slice(indent.length) : line)
    .join('\n')
    .trimEnd();
}

test('furniture precision workspace remains available behind the general default and inlines its assets before the legacy script', () => {
  assert.match(html, /id="professionalModeButton"[^>]*class="active"[^>]*aria-selected="true"/);
  assert.match(html, /id="furnitureModeButton"[^>]*aria-selected="false"/);
  assert.match(html, /setCalculatorMode\('professional'\)/);
  assert.match(html, /<style id="ltToolWorkspaceStyles">/);
  const engineIndex = html.indexOf('<script id="furnitureCalculatorEngine">');
  const uiIndex = html.indexOf('<script id="furnitureCalculatorUi">');
  const legacyIndex = html.indexOf('<script>\n    // 配置区域');
  assert.ok(engineIndex > 0 && uiIndex > engineIndex && legacyIndex > uiIndex);
  assert.doesNotMatch(html, /<(?:link|script)[^>]+(?:href|src)="furniture-calculator(?:-ui)?\.(?:css|js)"/);
  assert.equal(extractInlineAsset('furniture-calculator.css', '        '), css.trimEnd());
  assert.equal(extractInlineAsset('furniture-calculator.js', '    '), engine.trimEnd());
  assert.equal(extractInlineAsset('furniture-calculator-ui.js', '    '), ui.trimEnd());
});

test('precision workspace exposes multi-carton, shipment, customs, fulfillment, return and audit controls', () => {
  for (const id of [
    'fpCartonRows', 'fpHeadhaulMode', 'fpShipmentUnits', 'fpQuoteIncludesImportFees',
    'fpDeclaredValueCny', 'fpDutyRate', 'fpAdditionalTariffRate', 'fpFulfillmentMode',
    'fpFbaSource', 'fpPlacementFee', 'fpZonePanel', 'fpManualPanel', 'fpParcelPanel',
    'fpReturnRate', 'fpRecoveryRate', 'fpReverseLogistics', 'fpReturnProcessing',
    'fpCostRows', 'fpAuditList', 'fpBreakEvenPrice', 'fpTargetPrice',
  ]) {
    const matches = html.match(new RegExp(`id="${id}"`, 'g')) || [];
    assert.equal(matches.length, 1, `${id} should exist exactly once`);
  }
  assert.match(html, /LCL 海运 W\/M/);
  assert.match(html, /FCL 整柜总价/);
  assert.match(html, /LTL \/ 白手套/);
});

test('furniture UI script parses and keeps incomplete data fail-closed', () => {
  assert.doesNotThrow(() => new Function(ui));
  assert.match(ui, /空值没有按 0 处理/);
  assert.match(ui, /result\.complete/);
  assert.match(ui, /multiCartonFbaFee/);
  assert.match(ui, /Fee Preview/);
  assert.match(ui, /nonnegative\(extraTariffRate\) && nonnegative\(importRate\)/);
  assert.match(ui, /nonnegative\(actual\) && nonnegative\(extra\)/);
});

test('furniture CSS provides responsive and sticky results layouts', () => {
  assert.match(css, /\.fp-layout\s*\{/);
  assert.match(css, /position:\s*sticky/);
  assert.match(css, /@media \(max-width:\s*700px\)/);
  assert.match(css, /\.fp-toolbar\s*\{/);
  assert.match(css, /\.furniture-calculator\[hidden\]/);
});

test('public demo is explicitly synthetic and contains no internal product placeholder', () => {
  assert.match(html, /完全虚构的合成演示数据/);
  assert.match(ui, /Synthetic public demo only/);
  assert.match(ui, /SYNTHETIC-FURN-001/);
  assert.doesNotMatch(html + ui, /AR-03|DEMO-2BOX-FURNITURE/);
});
