import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const engine = require('../furniture-calculator.js');

const closeTo = (actual, expected, epsilon = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} is not within ${epsilon} of ${expected}`);
};

function baseInput(overrides = {}) {
  const input = {
    priceUsd: 500,
    buyerShippingUsd: 0,
    category: 'furniture',
    fxCnyPerUsd: 7.2,
    monthlyUnits: 100,
    purchaseCny: 720,
    cartons: [{ lengthCm: 100, widthCm: 50, heightCm: 40, weightKg: 30 }],
    headhaul: {
      mode: 'per_unit',
      shipmentUnits: 100,
      rateCny: 72,
      fixedOriginCny: 0,
      fixedDestinationUsd: 0,
      destinationPerUnitUsd: 0,
      quoteIncludesImportFees: true,
    },
    fulfillment: {
      mode: 'fbm',
      lastMileUsd: 80,
      pickPackUsd: 0,
    },
    storageUsd: 0,
    adRatePct: 0,
    promoRatePct: 0,
    returnRatePct: 0,
    otherVariableUsd: 0,
    monthlyFixedUsd: 0,
  };
  return Object.assign(input, overrides);
}

test('UMD module exports the complete FurnitureProfitEngine API', () => {
  for (const name of [
    'summarizeCartons',
    'calculateHeadhaul',
    'calculateUsReferralFee',
    'calculateWeightedLastMile',
    'calculateParcelLastMile',
    'estimateUsFba2026',
    'calculateFurnitureProfit',
    'solveTargetPrice',
  ]) assert.equal(typeof engine[name], 'function');
  assert.equal(globalThis.FurnitureProfitEngine, engine);
});

test('two furniture cartons aggregate CBM and gross weight without early rounding', () => {
  const result = engine.summarizeCartons([
    { lengthCm: 100, widthCm: 50, heightCm: 40, weightKg: 30 },
    { lengthCm: 80, widthCm: 40, heightCm: 30, weightKg: 20 },
  ]);
  assert.equal(result.complete, true);
  closeTo(result.totalCbm, 0.296);
  closeTo(result.totalWeightKg, 50);
  closeTo(result.metricTons, 0.05);
});

test('chargeable kilograms take the greater of actual and dimensional weight for each carton', () => {
  const result = engine.summarizeCartons([
    { lengthCm: 10, widthCm: 10, heightCm: 10, weightKg: 100 },
    { lengthCm: 100, widthCm: 100, heightCm: 60, weightKg: 1 },
  ]);
  assert.equal(result.complete, true);
  closeTo(result.totalWeightKg, 101);
  closeTo(result.totalAirDimWeightKg, 100 + (1 / 6));
  closeTo(result.airChargeableKg, 200);

  const headhaul = engine.calculateHeadhaul({
    fxCnyPerUsd: 7.2,
    headhaul: { mode: 'chargeable_kg', shipmentUnits: 2, rateCny: 3 },
  }, result);
  assert.equal(headhaul.complete, true);
  closeTo(headhaul.shipmentChargeableKg, 400);
  closeTo(headhaul.transportCny, 1200);
});

test('shipment quantities scale the multi-carton unit to 29.6 CBM and 5000 kg', () => {
  const summary = engine.summarizeCartons([
    { lengthCm: 100, widthCm: 50, heightCm: 40, weightKg: 30 },
    { lengthCm: 80, widthCm: 40, heightCm: 30, weightKg: 20 },
  ]);
  const result = engine.calculateHeadhaul({
    fxCnyPerUsd: 7.2,
    headhaul: { mode: 'lcl_wm', shipmentUnits: 100, rateCny: 120, minWm: 1 },
  }, summary);
  assert.equal(result.complete, true);
  closeTo(result.shipmentCbm, 29.6);
  closeTo(result.shipmentWeightKg, 5000);
  closeTo(result.wm, 29.6);
});

test('shipment units must be a positive whole number of sellable sets', () => {
  const summary = engine.summarizeCartons([
    { lengthCm: 100, widthCm: 50, heightCm: 40, weightKg: 30 },
  ]);
  const result = engine.calculateHeadhaul({
    fxCnyPerUsd: 7.2,
    headhaul: { mode: 'lcl_wm', shipmentUnits: 1.5, rateCny: 120, minWm: 1 },
  }, summary);
  assert.equal(result.complete, false);
  assert.ok(result.missing.includes('headhaul.shipmentUnits'));
  assert.equal(result.shipmentCbm, null);
  assert.equal(result.perUnitUsd, null);
});

test('LCL W/M uses the largest of shipment CBM, metric tons, and minimum', () => {
  const summary = {
    complete: true,
    totalCbm: 1.2,
    totalWeightKg: 1800,
    airChargeableKg: 1800,
  };
  const result = engine.calculateHeadhaul({
    fxCnyPerUsd: 7.2,
    headhaul: { mode: 'lcl_wm', shipmentUnits: 1, rateCny: 120, minWm: 1 },
  }, summary);
  assert.equal(result.complete, true);
  closeTo(result.wm, 1.8);
  closeTo(result.transportCny, 216);

  const minimum = engine.calculateHeadhaul({
    fxCnyPerUsd: 7.2,
    headhaul: { mode: 'lcl_wm', shipmentUnits: 1, rateCny: 120, minWm: 2 },
  }, { complete: true, totalCbm: 0.2, totalWeightKg: 100, airChargeableKg: 100 });
  closeTo(minimum.wm, 2);
  closeTo(minimum.transportCny, 240);
});

test('FCL total and fixed shipment charges allocate once across shipment units', () => {
  const summary = engine.summarizeCartons([
    { lengthCm: 100, widthCm: 50, heightCm: 40, weightKg: 30 },
  ]);
  const result = engine.calculateHeadhaul({
    fxCnyPerUsd: 7.2,
    headhaul: {
      mode: 'fcl_total', shipmentUnits: 100, rateCny: 72000,
      fixedOriginCny: 7200, fixedDestinationUsd: 1000, destinationPerUnitUsd: 2,
    },
  }, summary);
  closeTo(result.shipmentCny, 79200);
  closeTo(result.shipmentUsd, 12200);
  closeTo(result.perUnitUsd, 122);
});

test('DDP-style quote inclusion prevents duty and customs double counting', () => {
  const result = engine.calculateFurnitureProfit(baseInput({
    headhaul: {
      mode: 'fcl_total', shipmentUnits: 100, rateCny: 72000,
      quoteIncludesImportFees: true,
      declaredValueCny: 2880, dutyRatePct: 25, additionalTariffRatePct: 10,
      customsFixedUsd: 2000,
    },
  }));
  assert.equal(result.complete, true);
  assert.equal(result.customs.includedInQuote, true);
  assert.equal(result.costs.customsUsd, 0);
  closeTo(result.costs.headhaulUsd, 100);
});

test('non-included customs uses declared CNY value, duty plus tariff, and fixed shipment fee', () => {
  const result = engine.calculateFurnitureProfit(baseInput({
    fxCnyPerUsd: 7.2,
    purchaseCny: 0,
    headhaul: {
      mode: 'per_unit', shipmentUnits: 100, rateCny: 0,
      quoteIncludesImportFees: false,
      declaredValueCny: 2880,
      dutyRatePct: 25,
      additionalTariffRatePct: 0,
      customsFixedUsd: 188.56,
    },
  }));
  assert.equal(result.complete, true);
  closeTo(result.customs.declaredValueShipmentCny / 7.2, 40000);
  closeTo(result.customs.dutyAndTariffUsd, 10000);
  closeTo(result.customs.shipmentUsd, 10188.56);
  closeTo(result.costs.customsUsd, 101.8856);
});

test('Furniture referral uses the $200 kink, minimum, and explicit manual override', () => {
  assert.equal(engine.calculateUsReferralFee(210, 'furniture'), 31);
  assert.equal(engine.calculateUsReferralFee(200, 'Furniture'), 30);
  assert.equal(engine.calculateUsReferralFee(1, 'furniture'), 0.30);
  assert.equal(engine.calculateUsReferralFee(210, 'other', 12), 25.2);
  assert.equal(engine.calculateUsReferralFee(210, 'other'), null);
});

test('Home & Kitchen and Mattresses UI categories use a flat 15% referral with the minimum', () => {
  assert.equal(engine.calculateUsReferralFee(210, 'home-kitchen'), 31.5);
  assert.equal(engine.calculateUsReferralFee(210, 'home-and-kitchen'), 31.5);
  assert.equal(engine.calculateUsReferralFee(210, 'mattresses'), 31.5);
  assert.equal(engine.calculateUsReferralFee(1, 'home-kitchen'), 0.30);
});

test('FBA and FBM fees are mutually exclusive', () => {
  const result = engine.calculateFurnitureProfit(baseInput({
    fulfillment: {
      mode: 'fba', fbaFeeUsd: 190, placementFeeUsd: 5,
      lastMileUsd: 160, pickPackUsd: 20,
    },
  }));
  assert.equal(result.complete, true);
  assert.equal(result.costs.fulfillmentUsd, 195);
  assert.equal(result.costs.lastMileUsd, 0);
  assert.equal(result.costs.pickPackUsd, 0);
});

test('parcel DIM weight is rounded for each package before summing', () => {
  const result = engine.calculateParcelLastMile([
    { lengthIn: 48, widthIn: 30, heightIn: 20, weightLb: 60 },
    { lengthIn: 30, widthIn: 20, heightIn: 10, weightLb: 40 },
  ], { basePerCartonUsd: 0, rateUsdPerLb: 1 });
  assert.equal(result.complete, true);
  assert.equal(result.packages[0].parcelBillableWeightLb, 208);
  assert.equal(result.packages[1].parcelBillableWeightLb, 44);
  assert.equal(result.chargeableWeightLb, 252);
  assert.equal(result.lastMileUsd, 252);
});

test('parcel formula fails closed when the required per-carton base is blank', () => {
  const result = engine.calculateParcelLastMile([
    { lengthIn: 20, widthIn: 20, heightIn: 20, weightLb: 20 },
  ], { rateUsdPerLb: 1 });
  assert.equal(result.complete, false);
  assert.ok(result.missing.includes('input.basePerCartonUsd'));
  assert.equal(result.lastMileUsd, null);
});

test('2026 US FBA estimator applies the two-inch DIM floor and per-pound rounding', () => {
  const result = engine.estimateUsFba2026(
    { lengthIn: 36, widthIn: 10, heightIn: 1, weightLb: 1 },
    9.99,
  );
  assert.equal(result.complete, true);
  assert.equal(result.tier, 'small_bulky');
  closeTo(result.dimensionalWeightLb, 720 / 139);
  assert.equal(result.billableWeightLb, 6);
  closeTo(result.base, 6.78 + 5 * 0.38);
  closeTo(result.fuel, result.base * 0.035);
  closeTo(result.total, result.base + result.fuel);
  assert.equal(result.sourceDate, '2026-04-17');
});

test('2026 US FBA estimator distinguishes standard, small bulky, large bulky, and XL', () => {
  const standard = engine.estimateUsFba2026(
    { lengthIn: 18, widthIn: 14, heightIn: 8, weightLb: 20 },
    10,
  );
  assert.equal(standard.complete, false);
  assert.equal(standard.tier, 'standard');
  assert.ok(standard.missing.includes('standardRateTable'));

  const small = engine.estimateUsFba2026(
    { lengthIn: 30, widthIn: 20, heightIn: 10, weightLb: 20 },
    10,
  );
  assert.equal(small.tier, 'small_bulky');
  assert.equal(small.billableWeightLb, 44);

  const large = engine.estimateUsFba2026(
    { lengthIn: 40, widthIn: 15, heightIn: 10, weightLb: 20 },
    10,
  );
  assert.equal(large.tier, 'large_bulky');
  assert.equal(large.billableWeightLb, 44);

  const xl = engine.estimateUsFba2026(
    { lengthIn: 48, widthIn: 30, heightIn: 20, weightLb: 60 },
    10,
  );
  assert.equal(xl.tier, 'extra_large');
  assert.equal(xl.weightSegment, '150_plus');
  assert.equal(xl.billableWeightLb, 208);
  assert.equal(xl.feeWeightLb, 60);
  closeTo(xl.base, 194.95);

  const xlActualOver150 = engine.estimateUsFba2026(
    { lengthIn: 48, widthIn: 30, heightIn: 20, weightLb: 160 },
    10,
  );
  assert.equal(xlActualOver150.weightSegment, '150_plus');
  assert.equal(xlActualOver150.feeWeightLb, 160);
  closeTo(xlActualOver150.base, 194.95 + (160 - 151) * 0.19);
});

test('2026 US FBA fuel starts April 17 and never applies to overmax surcharge', () => {
  const beforeFuel = engine.estimateUsFba2026(
    { lengthIn: 100, widthIn: 2, heightIn: 2, weightLb: 60 },
    10,
    { effectiveDate: '2026-04-16' },
  );
  assert.equal(beforeFuel.complete, true);
  assert.equal(beforeFuel.weightSegment, '50_70');
  assert.equal(beforeFuel.overmax, 21);
  assert.equal(beforeFuel.fuel, 0);
  closeTo(beforeFuel.total, beforeFuel.base + 21);
  assert.equal(beforeFuel.sourceDate, '2026-01-15');

  const afterFuel = engine.estimateUsFba2026(
    { lengthIn: 100, widthIn: 2, heightIn: 2, weightLb: 60 },
    10,
    { effectiveDate: '2026-04-17' },
  );
  closeTo(afterFuel.fuel, afterFuel.base * 0.035);
  closeTo(afterFuel.total, afterFuel.base * 1.035 + 21);
  assert.equal(afterFuel.sourceDate, '2026-04-17');
});

test('2026 US FBA estimator guards single-carton and finite-input boundaries', () => {
  const quantity = engine.estimateUsFba2026(
    { lengthIn: 30, widthIn: 20, heightIn: 10, weightLb: 20, quantity: 2 },
    10,
  );
  assert.equal(quantity.complete, false);
  assert.ok(quantity.missing.includes('carton.quantity'));
  assert.equal(engine.estimateUsFba2026(
    { lengthIn: 30, widthIn: 20, heightIn: 10, weightLb: 20 },
    Number.NaN,
  ).complete, false);
  assert.equal(engine.estimateUsFba2026(
    { lengthIn: 30, widthIn: 20, heightIn: 10, weightLb: 20 },
    0,
  ).complete, false);
  for (const effectiveDate of ['2026-02-31', '2026-01-14', 'not-a-date']) {
    const invalidDate = engine.estimateUsFba2026(
      { lengthIn: 30, widthIn: 20, heightIn: 10, weightLb: 20 },
      10,
      { effectiveDate },
    );
    assert.equal(invalidDate.complete, false);
    assert.ok(invalidDate.missing.includes('options.effectiveDate'));
  }
});

test('weighted last mile honors zone shares and rejects incomplete percentage mixes', () => {
  const weighted = engine.calculateWeightedLastMile([
    { costUsd: 80, sharePct: 20 },
    { costUsd: 140, sharePct: 50 },
    { costUsd: 230, sharePct: 30 },
  ]);
  assert.equal(weighted, 155);
  assert.equal(engine.calculateWeightedLastMile([
    { costUsd: 80, sharePct: 20 },
    { costUsd: 140, sharePct: 50 },
  ]), null);
});

test('returns separately model net sales, referral refund, landed recovery, and return operations', () => {
  const result = engine.calculateFurnitureProfit(baseInput({
    purchaseCny: 1368,
    headhaul: {
      mode: 'per_unit', shipmentUnits: 100, rateCny: 72,
      quoteIncludesImportFees: true,
    },
    fulfillment: { mode: 'fbm', lastMileUsd: 80, pickPackUsd: 0 },
    returnRatePct: 10,
    recoveryRatePct: 76,
    reverseLogisticsUsd: 20,
    returnProcessingUsd: 10,
    otherVariableUsd: 10,
  }));
  assert.equal(result.complete, true);
  closeTo(result.costs.landedUsd, 200);
  closeTo(result.expectedNetSalesUsd, 450);
  closeTo(result.returns.refundAdminFeeUsd, 5);
  closeTo(result.returns.expectedReferralFeeUsd, 54.5);
  closeTo(result.returns.expectedLandedCostUsd, 184.8);
  closeTo(result.returns.expectedReturnOperationsUsd, 3);
  closeTo(result.profitUsd, 117.7);
});

test('positive monthly fixed cost cannot be silently allocated without monthly units', () => {
  const input = baseInput({ monthlyFixedUsd: 1000 });
  delete input.monthlyUnits;
  const result = engine.calculateFurnitureProfit(input);
  assert.equal(result.complete, false);
  assert.ok(result.missing.includes('monthlyUnits'));
  assert.equal(result.profitUsd, null);
});

test('target-price solver crosses the Furniture referral kink', () => {
  const input = baseInput({
    priceUsd: 1,
    purchaseCny: 0,
    headhaul: { mode: 'per_unit', shipmentUnits: 1, rateCny: 0, quoteIncludesImportFees: true },
    fulfillment: { mode: 'fbm', lastMileUsd: 0, pickPackUsd: 0 },
    otherVariableUsd: 250,
  });
  const result = engine.solveTargetPrice(input, 0);
  assert.equal(result.complete, true);
  assert.equal(result.priceUsd, 288.89);
  closeTo(result.rawPriceUsd, 288.8888888888889, 1e-8);
  assert.ok(result.calculation.profitUsd >= -1e-9);
});

test('internal precision is preserved instead of rounding every cost line to cents', () => {
  const result = engine.calculateFurnitureProfit(baseInput({
    priceUsd: 100,
    purchaseCny: 0,
    headhaul: { mode: 'per_unit', shipmentUnits: 3, rateCny: 240, quoteIncludesImportFees: true },
    fulfillment: { mode: 'fbm', lastMileUsd: 0, pickPackUsd: 0 },
  }));
  assert.equal(result.complete, true);
  closeTo(result.costs.headhaulUsd, 100 / 3, 1e-12);
});

test('missing selected logistics fees propagate incomplete instead of becoming zero', () => {
  const missingOcean = baseInput();
  delete missingOcean.headhaul.rateCny;
  const oceanResult = engine.calculateFurnitureProfit(missingOcean);
  assert.equal(oceanResult.complete, false);
  assert.ok(oceanResult.missing.includes('headhaul.rateCny'));

  const missingLastMile = baseInput({ fulfillment: { mode: 'fbm', pickPackUsd: 5 } });
  const lastMileResult = engine.calculateFurnitureProfit(missingLastMile);
  assert.equal(lastMileResult.complete, false);
  assert.ok(lastMileResult.missing.includes('fulfillment.lastMileUsd'));

  const missingDuty = baseInput({
    headhaul: { mode: 'per_unit', shipmentUnits: 100, rateCny: 72, quoteIncludesImportFees: false },
  });
  const dutyResult = engine.calculateFurnitureProfit(missingDuty);
  assert.equal(dutyResult.complete, false);
  assert.ok(dutyResult.missing.includes('headhaul.declaredValueCny'));
});

test('negative, non-finite, and invalid probability inputs fail closed', () => {
  for (const changed of [
    { purchaseCny: -1 },
    { fxCnyPerUsd: Number.NaN },
    { returnRatePct: 101 },
    { priceUsd: Number.POSITIVE_INFINITY },
  ]) {
    const result = engine.calculateFurnitureProfit(baseInput(changed));
    assert.equal(result.complete, false);
    assert.equal(result.profitUsd, null);
    assert.ok(result.missing.length > 0);
  }
});
