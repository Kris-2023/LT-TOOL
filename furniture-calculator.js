(function (root, factory) {
    'use strict';

    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (typeof define === 'function' && define.amd) define([], function () { return api; });
    if (root) root.FurnitureProfitEngine = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const VERSION = '1.0.0';
    const CM_PER_IN = 2.54;
    const CM3_PER_IN3 = CM_PER_IN * CM_PER_IN * CM_PER_IN;
    const KG_PER_LB = 0.45359237;
    const DEFAULT_AIR_DIVISOR = 6000;
    const DEFAULT_PARCEL_DIVISOR = 139;
    const FURNITURE_FIRST_TIER_USD = 200;
    const FURNITURE_FIRST_TIER_RATE = 0.15;
    const FURNITURE_EXCESS_RATE = 0.10;
    const MINIMUM_REFERRAL_FEE_USD = 0.30;
    const MAX_REFUND_ADMIN_FEE_USD = 5;
    const REFUND_ADMIN_RATE = 0.20;
    const US_FBA_2026_BASE_DATE = '2026-01-15';
    const US_FBA_2026_FUEL_DATE = '2026-04-17';
    const US_FBA_2026_FUEL_RATE = 0.035;

    const hasOwn = function (value, key) {
        return Object.prototype.hasOwnProperty.call(value, key);
    };

    const isRecord = function (value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    };

    const isFiniteNumber = function (value) {
        return typeof value === 'number' && Number.isFinite(value);
    };

    const validNumber = function (value, minimum, maximum) {
        return isFiniteNumber(value)
            && (minimum === undefined || value >= minimum)
            && (maximum === undefined || value <= maximum);
    };

    const unique = function (items) {
        return Array.from(new Set(items));
    };

    const incomplete = function (missing, extra) {
        return Object.assign({
            complete: false,
            status: 'incomplete',
            missing: unique(missing),
            missingFields: unique(missing),
        }, extra || {});
    };

    const firstFinite = function (record, keys) {
        if (!isRecord(record)) return undefined;
        for (const key of keys) {
            if (hasOwn(record, key) && isFiniteNumber(record[key])) return record[key];
        }
        return undefined;
    };

    const optionalNonnegative = function (record, key, missing, path) {
        if (!isRecord(record) || !hasOwn(record, key) || record[key] === undefined || record[key] === null) return 0;
        if (!validNumber(record[key], 0)) {
            missing.push(path || key);
            return null;
        }
        return record[key];
    };

    const optionalPercent = function (record, key, missing, path) {
        if (!isRecord(record) || !hasOwn(record, key) || record[key] === undefined || record[key] === null) return 0;
        if (!validNumber(record[key], 0, 100)) {
            missing.push(path || key);
            return null;
        }
        return record[key];
    };

    function readDimensions(carton) {
        if (!isRecord(carton)) return null;

        let cm;
        if (Array.isArray(carton.dimensionsCm) && carton.dimensionsCm.length === 3) {
            cm = carton.dimensionsCm.slice();
        } else if ([carton.lengthCm, carton.widthCm, carton.heightCm].every(isFiniteNumber)) {
            cm = [carton.lengthCm, carton.widthCm, carton.heightCm];
        } else if (carton.dimensionUnit === 'cm' && [carton.length, carton.width, carton.height].every(isFiniteNumber)) {
            cm = [carton.length, carton.width, carton.height];
        }

        let inches;
        if (Array.isArray(carton.dimensionsIn) && carton.dimensionsIn.length === 3) {
            inches = carton.dimensionsIn.slice();
        } else if ([carton.lengthIn, carton.widthIn, carton.heightIn].every(isFiniteNumber)) {
            inches = [carton.lengthIn, carton.widthIn, carton.heightIn];
        } else if (carton.dimensionUnit === 'in' && [carton.length, carton.width, carton.height].every(isFiniteNumber)) {
            inches = [carton.length, carton.width, carton.height];
        }

        if (!cm && inches) cm = inches.map(function (value) { return value * CM_PER_IN; });
        if (!inches && cm) inches = cm.map(function (value) { return value / CM_PER_IN; });
        if (!cm || !inches || !cm.every(function (value) { return validNumber(value, Number.MIN_VALUE); })) return null;
        return { cm: cm, inches: inches };
    }

    function readWeight(carton) {
        if (!isRecord(carton)) return null;

        let kg = firstFinite(carton, ['weightKg', 'grossWeightKg']);
        let lb = firstFinite(carton, ['weightLb', 'actualWeightLb']);
        if (kg === undefined && carton.weightUnit === 'kg' && isFiniteNumber(carton.weight)) kg = carton.weight;
        if (lb === undefined && carton.weightUnit === 'lb' && isFiniteNumber(carton.weight)) lb = carton.weight;
        if (kg === undefined && lb !== undefined) kg = lb * KG_PER_LB;
        if (lb === undefined && kg !== undefined) lb = kg / KG_PER_LB;
        if (!validNumber(kg, Number.MIN_VALUE) || !validNumber(lb, Number.MIN_VALUE)) return null;
        return { kg: kg, lb: lb };
    }

    function summarizeCartons(cartons, options) {
        const settings = options || {};
        const missing = [];
        const airDivisorCm3Kg = settings.airDivisorCm3Kg === undefined
            ? DEFAULT_AIR_DIVISOR
            : settings.airDivisorCm3Kg;
        const parcelDivisorIn3Lb = settings.parcelDivisorIn3Lb === undefined
            ? DEFAULT_PARCEL_DIVISOR
            : settings.parcelDivisorIn3Lb;

        if (!validNumber(airDivisorCm3Kg, Number.MIN_VALUE)) missing.push('options.airDivisorCm3Kg');
        if (!validNumber(parcelDivisorIn3Lb, Number.MIN_VALUE)) missing.push('options.parcelDivisorIn3Lb');
        if (!Array.isArray(cartons) || cartons.length === 0) {
            missing.push('cartons');
            return incomplete(missing, { cartons: [] });
        }

        const normalized = [];
        cartons.forEach(function (carton, index) {
            const path = 'cartons[' + index + ']';
            if (!isRecord(carton)) {
                missing.push(path);
                return;
            }
            const quantity = hasOwn(carton, 'quantity') ? carton.quantity
                : hasOwn(carton, 'qty') ? carton.qty
                    : hasOwn(carton, 'count') ? carton.count
                        : 1;
            const dimensions = readDimensions(carton);
            const weight = readWeight(carton);
            if (!Number.isInteger(quantity) || quantity <= 0) missing.push(path + '.quantity');
            if (!dimensions) missing.push(path + '.dimensions');
            if (!weight) missing.push(path + '.weight');
            if (!dimensions || !weight || !Number.isInteger(quantity) || quantity <= 0) return;

            const volumeCm3 = dimensions.cm[0] * dimensions.cm[1] * dimensions.cm[2];
            const volumeIn3 = dimensions.inches[0] * dimensions.inches[1] * dimensions.inches[2];
            const airDimWeightKg = volumeCm3 / airDivisorCm3Kg;
            const parcelDimWeightLb = volumeIn3 / parcelDivisorIn3Lb;
            const parcelBillableWeightLb = Math.ceil(Math.max(weight.lb, parcelDimWeightLb));
            normalized.push({
                index: index,
                quantity: quantity,
                lengthCm: dimensions.cm[0],
                widthCm: dimensions.cm[1],
                heightCm: dimensions.cm[2],
                lengthIn: dimensions.inches[0],
                widthIn: dimensions.inches[1],
                heightIn: dimensions.inches[2],
                weightKg: weight.kg,
                weightLb: weight.lb,
                volumeCm3: volumeCm3,
                volumeIn3: volumeIn3,
                volumeCbm: volumeCm3 / 1000000,
                airDimWeightKg: airDimWeightKg,
                parcelDimWeightLb: parcelDimWeightLb,
                parcelBillableWeightLb: parcelBillableWeightLb,
            });
        });

        if (missing.length) {
            return incomplete(missing, {
                cartons: normalized,
                airDivisorCm3Kg: validNumber(airDivisorCm3Kg, Number.MIN_VALUE) ? airDivisorCm3Kg : null,
                parcelDivisorIn3Lb: validNumber(parcelDivisorIn3Lb, Number.MIN_VALUE) ? parcelDivisorIn3Lb : null,
                totalCbm: null,
                totalWeightKg: null,
                airChargeableKg: null,
                parcelChargeableWeightLb: null,
            });
        }

        const totals = normalized.reduce(function (accumulator, carton) {
            accumulator.totalCartons += carton.quantity;
            accumulator.totalVolumeCm3 += carton.volumeCm3 * carton.quantity;
            accumulator.totalWeightKg += carton.weightKg * carton.quantity;
            accumulator.totalAirDimWeightKg += carton.airDimWeightKg * carton.quantity;
            accumulator.airChargeableKg += Math.max(carton.weightKg, carton.airDimWeightKg) * carton.quantity;
            accumulator.totalParcelDimWeightLb += carton.parcelDimWeightLb * carton.quantity;
            accumulator.totalActualWeightLb += carton.weightLb * carton.quantity;
            accumulator.parcelChargeableWeightLb += carton.parcelBillableWeightLb * carton.quantity;
            return accumulator;
        }, {
            totalCartons: 0,
            totalVolumeCm3: 0,
            totalWeightKg: 0,
            totalAirDimWeightKg: 0,
            airChargeableKg: 0,
            totalParcelDimWeightLb: 0,
            totalActualWeightLb: 0,
            parcelChargeableWeightLb: 0,
        });

        totals.totalCbm = totals.totalVolumeCm3 / 1000000;
        totals.metricTons = totals.totalWeightKg / 1000;

        return Object.assign({
            complete: true,
            status: 'complete',
            missing: [],
            missingFields: [],
            cartons: normalized,
            airDivisorCm3Kg: airDivisorCm3Kg,
            parcelDivisorIn3Lb: parcelDivisorIn3Lb,
            cbm: totals.totalCbm,
            grossWeightKg: totals.totalWeightKg,
        }, totals);
    }

    function calculateHeadhaul(input, summary) {
        const fullInput = isRecord(input) ? input : {};
        const headhaul = isRecord(fullInput.headhaul) ? fullInput.headhaul : fullInput;
        const missing = [];
        const shipmentUnits = headhaul.shipmentUnits;
        const shipmentUnitsAreValid = Number.isInteger(shipmentUnits) && shipmentUnits > 0;
        const fxCnyPerUsd = firstFinite(fullInput, ['fxCnyPerUsd']) !== undefined
            ? fullInput.fxCnyPerUsd
            : headhaul.fxCnyPerUsd;
        const mode = headhaul.mode;

        if (!isRecord(summary) || summary.complete === false) missing.push('cartons');
        const unitCbm = isRecord(summary) ? firstFinite(summary, ['totalCbm', 'cbm']) : undefined;
        const unitWeightKg = isRecord(summary) ? firstFinite(summary, ['totalWeightKg', 'grossWeightKg']) : undefined;
        const unitChargeableKg = isRecord(summary) ? firstFinite(summary, ['airChargeableKg']) : undefined;
        if (!validNumber(unitCbm, 0)) missing.push('summary.totalCbm');
        if (!validNumber(unitWeightKg, 0)) missing.push('summary.totalWeightKg');
        if (!shipmentUnitsAreValid) missing.push('headhaul.shipmentUnits');
        if (!validNumber(fxCnyPerUsd, Number.MIN_VALUE)) missing.push('fxCnyPerUsd');
        if (!['lcl_wm', 'fcl_total', 'chargeable_kg', 'per_unit'].includes(mode)) missing.push('headhaul.mode');

        const fixedOriginCny = optionalNonnegative(headhaul, 'fixedOriginCny', missing, 'headhaul.fixedOriginCny');
        const fixedDestinationUsd = optionalNonnegative(headhaul, 'fixedDestinationUsd', missing, 'headhaul.fixedDestinationUsd');
        const destinationPerUnitUsd = optionalNonnegative(headhaul, 'destinationPerUnitUsd', missing, 'headhaul.destinationPerUnitUsd');
        let rateCny = headhaul.rateCny;
        if (mode === 'fcl_total' && !isFiniteNumber(rateCny) && isFiniteNumber(headhaul.totalCny)) rateCny = headhaul.totalCny;
        if (['lcl_wm', 'fcl_total', 'chargeable_kg', 'per_unit'].includes(mode) && !validNumber(rateCny, 0)) {
            missing.push(mode === 'fcl_total' ? 'headhaul.rateCny|totalCny' : 'headhaul.rateCny');
        }

        let minimumWm = null;
        if (mode === 'lcl_wm') {
            minimumWm = headhaul.minWm;
            if (!validNumber(minimumWm, 0)) missing.push('headhaul.minWm');
        }
        if (mode === 'chargeable_kg' && !validNumber(unitChargeableKg, 0)) missing.push('summary.airChargeableKg');

        const canCalculateBasis = validNumber(unitCbm, 0)
            && validNumber(unitWeightKg, 0)
            && shipmentUnitsAreValid;
        const shipmentCbm = canCalculateBasis ? unitCbm * shipmentUnits : null;
        const shipmentWeightKg = canCalculateBasis ? unitWeightKg * shipmentUnits : null;
        const shipmentMetricTons = shipmentWeightKg === null ? null : shipmentWeightKg / 1000;
        const shipmentChargeableKg = validNumber(unitChargeableKg, 0) && shipmentUnitsAreValid
            ? unitChargeableKg * shipmentUnits
            : null;
        const wm = mode === 'lcl_wm' && shipmentCbm !== null && shipmentMetricTons !== null && validNumber(minimumWm, 0)
            ? Math.max(shipmentCbm, shipmentMetricTons, minimumWm)
            : null;

        let transportCny = null;
        if (validNumber(rateCny, 0) && shipmentUnitsAreValid) {
            if (mode === 'lcl_wm' && wm !== null) transportCny = wm * rateCny;
            if (mode === 'fcl_total') transportCny = rateCny;
            if (mode === 'chargeable_kg' && shipmentChargeableKg !== null) transportCny = shipmentChargeableKg * rateCny;
            if (mode === 'per_unit') transportCny = shipmentUnits * rateCny;
        }

        const shipmentCny = transportCny !== null && fixedOriginCny !== null ? transportCny + fixedOriginCny : null;
        const destinationShipmentUsd = fixedDestinationUsd !== null
            && destinationPerUnitUsd !== null
            && shipmentUnitsAreValid
            ? fixedDestinationUsd + destinationPerUnitUsd * shipmentUnits
            : null;
        const shipmentUsd = shipmentCny !== null
            && destinationShipmentUsd !== null
            && validNumber(fxCnyPerUsd, Number.MIN_VALUE)
            ? shipmentCny / fxCnyPerUsd + destinationShipmentUsd
            : null;
        const perUnitCny = shipmentCny !== null && shipmentUnitsAreValid
            ? shipmentCny / shipmentUnits
            : null;
        const perUnitUsd = shipmentUsd !== null && shipmentUnitsAreValid
            ? shipmentUsd / shipmentUnits
            : null;

        const result = {
            mode: mode || null,
            shipmentUnits: shipmentUnitsAreValid ? shipmentUnits : null,
            rateCny: validNumber(rateCny, 0) ? rateCny : null,
            shipmentCbm: shipmentCbm,
            shipmentWeightKg: shipmentWeightKg,
            shipmentMetricTons: shipmentMetricTons,
            shipmentChargeableKg: shipmentChargeableKg,
            wm: wm,
            transportCny: transportCny,
            fixedOriginCny: fixedOriginCny,
            shipmentCny: shipmentCny,
            destinationShipmentUsd: destinationShipmentUsd,
            shipmentUsd: shipmentUsd,
            perUnitCny: perUnitCny,
            perUnitUsd: perUnitUsd,
            totalPerUnitUsd: perUnitUsd,
        };
        if (missing.length) return incomplete(missing, result);
        return Object.assign({ complete: true, status: 'complete', missing: [], missingFields: [] }, result);
    }

    function normalizeCategory(category) {
        return typeof category === 'string'
            ? category.trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/&/g, 'and')
            : '';
    }

    function calculateUsReferralFee(totalSalesPrice, category, manualRatePct) {
        if (!validNumber(totalSalesPrice, 0)) return null;
        if (totalSalesPrice === 0) return 0;
        if (manualRatePct !== undefined && manualRatePct !== null) {
            if (!validNumber(manualRatePct, 0, 100)) return null;
            return Math.max(MINIMUM_REFERRAL_FEE_USD, totalSalesPrice * manualRatePct / 100);
        }

        const normalized = normalizeCategory(category);
        const isFurniture = normalized === 'furniture'
            || normalized === 'furniture-and-home-furnishings'
            || normalized === 'furniture-and-decor';
        const isFlatFifteenCategory = normalized === 'home-kitchen'
            || normalized === 'home-and-kitchen'
            || normalized === 'mattresses';
        if (isFlatFifteenCategory) {
            return Math.max(MINIMUM_REFERRAL_FEE_USD, totalSalesPrice * FURNITURE_FIRST_TIER_RATE);
        }
        if (!isFurniture) return null;
        const tieredFee = Math.min(totalSalesPrice, FURNITURE_FIRST_TIER_USD) * FURNITURE_FIRST_TIER_RATE
            + Math.max(0, totalSalesPrice - FURNITURE_FIRST_TIER_USD) * FURNITURE_EXCESS_RATE;
        return Math.max(MINIMUM_REFERRAL_FEE_USD, tieredFee);
    }

    function rowCost(row) {
        return firstFinite(row, ['costUsd', 'lastMileUsd', 'zoneCostUsd', 'quoteUsd', 'amountUsd']);
    }

    function rowWeight(row) {
        return firstFinite(row, ['sharePct', 'weightPct', 'orderSharePct', 'share', 'weight']);
    }

    function calculateWeightedLastMile(rows) {
        if (!Array.isArray(rows) || rows.length === 0) return null;
        let totalWeight = 0;
        let weightedCost = 0;
        let hasExplicitPercent = false;
        for (const row of rows) {
            if (!isRecord(row)) return null;
            const cost = rowCost(row);
            const weight = rowWeight(row);
            if (!validNumber(cost, 0) || !validNumber(weight, 0)) return null;
            if (hasOwn(row, 'sharePct') || hasOwn(row, 'weightPct') || hasOwn(row, 'orderSharePct')) hasExplicitPercent = true;
            totalWeight += weight;
            weightedCost += cost * weight;
        }
        if (!(totalWeight > 0) || !Number.isFinite(totalWeight) || !Number.isFinite(weightedCost)) return null;
        if (hasExplicitPercent && Math.abs(totalWeight - 100) > 1e-7) return null;
        return weightedCost / totalWeight;
    }

    function readParcelRate(config) {
        return firstFinite(config, ['rateUsdPerLb', 'ratePerLbUsd', 'perLbUsd']);
    }

    function parcelCostForConfig(cartonSummary, config, missing, path) {
        const quoteUsd = firstFinite(config, ['allInUsd', 'quoteUsd', 'zoneCostUsd']);
        if (quoteUsd !== undefined) {
            if (!validNumber(quoteUsd, 0)) missing.push(path + '.allInUsd');
            return validNumber(quoteUsd, 0) ? quoteUsd : null;
        }

        const rateUsdPerLb = readParcelRate(config);
        if (!validNumber(rateUsdPerLb, 0)) missing.push(path + '.rateUsdPerLb');
        const basePerCartonUsd = firstFinite(config, ['basePerCartonUsd', 'baseUsd']);
        if (!validNumber(basePerCartonUsd, 0)) missing.push(path + '.basePerCartonUsd');
        const minimumPerCartonUsd = firstFinite(config, ['minimumPerCartonUsd', 'minimumUsd']);
        const perCartonSurchargeUsd = firstFinite(config, ['perCartonSurchargeUsd', 'surchargePerCartonUsd']);
        const fuelSurchargePct = firstFinite(config, ['fuelSurchargePct', 'fuelPct']);
        const residentialUsd = firstFinite(config, ['residentialUsd', 'residentialSurchargeUsd']);
        const deliveryAreaUsd = firstFinite(config, ['deliveryAreaUsd', 'dasUsd']);
        const additionalHandlingUsd = firstFinite(config, ['additionalHandlingUsd', 'ahsUsd']);
        const largePackageUsd = firstFinite(config, ['largePackageUsd', 'largePackageSurchargeUsd']);
        const peakUsd = firstFinite(config, ['peakUsd', 'peakSurchargeUsd']);
        const orderAccessorialUsd = firstFinite(config, ['orderAccessorialUsd', 'fixedShipmentUsd']);

        const values = {
            basePerCartonUsd: basePerCartonUsd === undefined ? 0 : basePerCartonUsd,
            minimumPerCartonUsd: minimumPerCartonUsd === undefined ? 0 : minimumPerCartonUsd,
            perCartonSurchargeUsd: perCartonSurchargeUsd === undefined ? 0 : perCartonSurchargeUsd,
            fuelSurchargePct: fuelSurchargePct === undefined ? 0 : fuelSurchargePct,
            residentialUsd: residentialUsd === undefined ? 0 : residentialUsd,
            deliveryAreaUsd: deliveryAreaUsd === undefined ? 0 : deliveryAreaUsd,
            additionalHandlingUsd: additionalHandlingUsd === undefined ? 0 : additionalHandlingUsd,
            largePackageUsd: largePackageUsd === undefined ? 0 : largePackageUsd,
            peakUsd: peakUsd === undefined ? 0 : peakUsd,
            orderAccessorialUsd: orderAccessorialUsd === undefined ? 0 : orderAccessorialUsd,
        };
        Object.keys(values).forEach(function (key) {
            const maximum = key === 'fuelSurchargePct' ? 100 : undefined;
            if (!validNumber(values[key], 0, maximum)) missing.push(path + '.' + key);
        });
        if (missing.length || !validNumber(rateUsdPerLb, 0)) return null;

        const total = cartonSummary.cartons.reduce(function (sum, carton) {
            const transport = Math.max(
                values.minimumPerCartonUsd,
                values.basePerCartonUsd + carton.parcelBillableWeightLb * rateUsdPerLb
            );
            const withFuel = transport * (1 + values.fuelSurchargePct / 100);
            const cartonTotal = withFuel
                + values.perCartonSurchargeUsd
                + values.residentialUsd
                + values.deliveryAreaUsd
                + values.additionalHandlingUsd
                + values.largePackageUsd
                + values.peakUsd;
            return sum + cartonTotal * carton.quantity;
        }, 0);
        return total + values.orderAccessorialUsd;
    }

    function calculateParcelLastMile(cartons, input) {
        const config = isRecord(input) ? input : {};
        const summary = summarizeCartons(cartons, {
            airDivisorCm3Kg: config.airDivisorCm3Kg === undefined ? DEFAULT_AIR_DIVISOR : config.airDivisorCm3Kg,
            parcelDivisorIn3Lb: config.parcelDivisorIn3Lb === undefined ? DEFAULT_PARCEL_DIVISOR : config.parcelDivisorIn3Lb,
        });
        if (!summary.complete) {
            return incomplete(summary.missing, {
                summary: summary,
                packages: summary.cartons,
                chargeableWeightLb: null,
                parcelChargeableWeightLb: null,
                lastMileUsd: null,
            });
        }

        const missing = [];
        const zoneRows = Array.isArray(config.zoneRows) ? config.zoneRows
            : Array.isArray(config.rows) ? config.rows
                : null;
        let lastMileUsd = null;
        const zoneCosts = [];
        if (zoneRows) {
            zoneRows.forEach(function (row, index) {
                if (!isRecord(row)) {
                    missing.push('input.zoneRows[' + index + ']');
                    return;
                }
                const share = rowWeight(row);
                if (!validNumber(share, 0)) missing.push('input.zoneRows[' + index + '].sharePct');
                const rowMissing = [];
                const costUsd = parcelCostForConfig(summary, row, rowMissing, 'input.zoneRows[' + index + ']');
                missing.push.apply(missing, rowMissing);
                zoneCosts.push({
                    zone: row.zone === undefined ? null : row.zone,
                    sharePct: validNumber(share, 0) ? share : null,
                    costUsd: costUsd,
                });
            });
            if (!missing.length) lastMileUsd = calculateWeightedLastMile(zoneCosts);
            if (lastMileUsd === null) missing.push('input.zoneRows.sharePctTotal');
        } else {
            lastMileUsd = parcelCostForConfig(summary, config, missing, 'input');
        }

        const result = {
            summary: summary,
            packages: summary.cartons,
            zoneCosts: zoneCosts,
            chargeableWeightLb: summary.parcelChargeableWeightLb,
            parcelChargeableWeightLb: summary.parcelChargeableWeightLb,
            lastMileUsd: lastMileUsd,
            totalUsd: lastMileUsd,
        };
        if (missing.length || !validNumber(lastMileUsd, 0)) return incomplete(missing, result);
        return Object.assign({ complete: true, status: 'complete', missing: [], missingFields: [] }, result);
    }

    function estimateUsFba2026(carton, priceUsd, options) {
        const settings = isRecord(options) ? options : {};
        const missing = [];
        const dimensions = readDimensions(carton);
        const weight = readWeight(carton);
        const quantity = isRecord(carton) && hasOwn(carton, 'quantity') ? carton.quantity
            : isRecord(carton) && hasOwn(carton, 'qty') ? carton.qty
                : 1;

        if (!dimensions) missing.push('carton.dimensions');
        if (!weight) missing.push('carton.weight');
        if (quantity !== 1) missing.push('carton.quantity');
        if (!validNumber(priceUsd, Number.MIN_VALUE)) missing.push('priceUsd');

        const requestedDate = settings.effectiveDate === undefined
            ? settings.date === undefined ? US_FBA_2026_FUEL_DATE : settings.date
            : settings.effectiveDate;
        const parsedDate = typeof requestedDate === 'string' && /^2026-\d{2}-\d{2}$/.test(requestedDate)
            ? new Date(requestedDate + 'T00:00:00Z')
            : null;
        const dateIsValid = parsedDate !== null
            && !Number.isNaN(parsedDate.getTime())
            && parsedDate.toISOString().slice(0, 10) === requestedDate
            && requestedDate >= US_FBA_2026_BASE_DATE;
        if (!dateIsValid) missing.push('options.effectiveDate');
        if (hasOwn(settings, 'applyFuelSurcharge') && typeof settings.applyFuelSurcharge !== 'boolean') {
            missing.push('options.applyFuelSurcharge');
        }

        if (missing.length) {
            return incomplete(missing, {
                tier: null,
                base: null,
                fuel: null,
                overmax: null,
                total: null,
                sourceDate: null,
            });
        }

        const sortedInches = dimensions.inches.slice().sort(function (a, b) { return b - a; });
        const longestIn = sortedInches[0];
        const medianIn = sortedInches[1];
        const shortestIn = sortedInches[2];
        const dimensionalWeightLb = longestIn
            * Math.max(medianIn, 2)
            * Math.max(shortestIn, 2)
            / DEFAULT_PARCEL_DIVISOR;
        const rawShippingWeightLb = Math.max(weight.lb, dimensionalWeightLb);
        const billableWeightLb = Math.ceil(rawShippingWeightLb);
        const lengthPlusGirthIn = longestIn + 2 * (medianIn + shortestIn);
        const underTen = priceUsd < 10;

        const isStandard = longestIn <= 18
            && medianIn <= 14
            && shortestIn <= 8
            && weight.lb <= 20;
        if (isStandard) {
            return incomplete(['standardRateTable'], {
                tier: 'standard',
                priceBand: underTen ? 'under_10' : 'standard_price',
                dimensionsIn: [longestIn, medianIn, shortestIn],
                actualWeightLb: weight.lb,
                dimensionalWeightLb: dimensionalWeightLb,
                rawShippingWeightLb: rawShippingWeightLb,
                billableWeightLb: billableWeightLb,
                lengthPlusGirthIn: lengthPlusGirthIn,
                base: null,
                fuel: null,
                overmax: null,
                total: null,
                sourceDate: US_FBA_2026_BASE_DATE,
            });
        }

        let tier;
        let weightSegment = null;
        let publishedBase;
        let excessStartLb;
        let incrementPerLb;
        if (longestIn <= 37
            && medianIn <= 28
            && shortestIn <= 20
            && billableWeightLb <= 50
            && lengthPlusGirthIn <= 130) {
            tier = 'small_bulky';
            publishedBase = underTen ? 6.78 : 7.55;
            excessStartLb = 1;
            incrementPerLb = 0.38;
        } else if (longestIn <= 59
            && medianIn <= 33
            && shortestIn <= 33
            && billableWeightLb <= 50
            && lengthPlusGirthIn <= 130) {
            tier = 'large_bulky';
            publishedBase = underTen ? 8.58 : 9.35;
            excessStartLb = 1;
            incrementPerLb = 0.38;
        } else {
            tier = 'extra_large';
            if (billableWeightLb <= 50) {
                weightSegment = '0_50';
                publishedBase = underTen ? 25.56 : 26.33;
                excessStartLb = 1;
                incrementPerLb = 0.38;
            } else if (billableWeightLb <= 70) {
                weightSegment = '50_70';
                publishedBase = underTen ? 36.55 : 37.32;
                excessStartLb = 51;
                incrementPerLb = 0.75;
            } else if (billableWeightLb <= 150) {
                weightSegment = '70_150';
                publishedBase = underTen ? 50.55 : 51.32;
                excessStartLb = 71;
                incrementPerLb = 0.75;
            } else {
                weightSegment = '150_plus';
                publishedBase = underTen ? 194.18 : 194.95;
                excessStartLb = 151;
                incrementPerLb = 0.19;
            }
        }

        // Amazon uses shipping weight to select XL 150+, but actual unit weight for
        // that tier's $0.19/lb increment. Other bulky tiers use shipping weight.
        const feeWeightLb = tier === 'extra_large' && weightSegment === '150_plus'
            ? Math.ceil(weight.lb)
            : billableWeightLb;
        const excessPounds = Math.max(0, feeWeightLb - excessStartLb);
        const weightIncrement = excessPounds * incrementPerLb;
        const base = publishedBase + weightIncrement;
        const applyFuelSurcharge = hasOwn(settings, 'applyFuelSurcharge')
            ? settings.applyFuelSurcharge
            : requestedDate >= US_FBA_2026_FUEL_DATE;
        const fuel = applyFuelSurcharge ? base * US_FBA_2026_FUEL_RATE : 0;

        let overmax = 0;
        const exceedsOvermaxDimensions = longestIn > 96 || lengthPlusGirthIn > 130;
        if (exceedsOvermaxDimensions && billableWeightLb <= 150) {
            overmax = billableWeightLb <= 50 ? 17
                : billableWeightLb <= 70 ? 21
                    : 25;
        }
        const total = base + fuel + overmax;
        const sourceDate = applyFuelSurcharge ? US_FBA_2026_FUEL_DATE : US_FBA_2026_BASE_DATE;

        return {
            complete: true,
            status: 'complete',
            missing: [],
            missingFields: [],
            tier: tier,
            weightSegment: weightSegment,
            priceBand: underTen ? 'under_10' : 'standard_price',
            dimensionsIn: [longestIn, medianIn, shortestIn],
            actualWeightLb: weight.lb,
            dimensionalWeightLb: dimensionalWeightLb,
            rawShippingWeightLb: rawShippingWeightLb,
            billableWeightLb: billableWeightLb,
            feeWeightLb: feeWeightLb,
            lengthPlusGirthIn: lengthPlusGirthIn,
            publishedBase: publishedBase,
            excessStartLb: excessStartLb,
            excessPounds: excessPounds,
            incrementPerLb: incrementPerLb,
            weightIncrement: weightIncrement,
            base: base,
            baseFeeUsd: base,
            fuel: fuel,
            fuelUsd: fuel,
            fuelRatePct: applyFuelSurcharge ? US_FBA_2026_FUEL_RATE * 100 : 0,
            overmax: overmax,
            overmaxUsd: overmax,
            total: total,
            totalUsd: total,
            sourceDate: sourceDate,
        };
    }

    function calculateCustoms(input, headhaulResult) {
        const fullInput = isRecord(input) ? input : {};
        const headhaul = isRecord(fullInput.headhaul) ? fullInput.headhaul : {};
        const missing = [];
        const shipmentUnits = headhaulResult && validNumber(headhaulResult.shipmentUnits, Number.MIN_VALUE)
            ? headhaulResult.shipmentUnits
            : headhaul.shipmentUnits;
        const fxCnyPerUsd = fullInput.fxCnyPerUsd;

        if (typeof headhaul.quoteIncludesImportFees !== 'boolean') missing.push('headhaul.quoteIncludesImportFees');
        if (!Number.isInteger(shipmentUnits) || shipmentUnits <= 0) missing.push('headhaul.shipmentUnits');
        if (!validNumber(fxCnyPerUsd, Number.MIN_VALUE)) missing.push('fxCnyPerUsd');
        if (headhaul.quoteIncludesImportFees === true) {
            if (missing.length) return incomplete(missing, { includedInQuote: true, shipmentUsd: null, perUnitUsd: null });
            return {
                complete: true,
                status: 'complete',
                missing: [],
                missingFields: [],
                includedInQuote: true,
                declaredValueShipmentCny: 0,
                dutyAndTariffUsd: 0,
                fixedUsd: 0,
                shipmentUsd: 0,
                perUnitUsd: 0,
            };
        }

        const declaredValueCny = headhaul.declaredValueCny;
        const dutyRatePct = headhaul.dutyRatePct;
        const additionalTariffRatePct = headhaul.additionalTariffRatePct;
        const customsFixedUsd = optionalNonnegative(headhaul, 'customsFixedUsd', missing, 'headhaul.customsFixedUsd');
        if (!validNumber(declaredValueCny, 0)) missing.push('headhaul.declaredValueCny');
        if (!validNumber(dutyRatePct, 0)) missing.push('headhaul.dutyRatePct');
        if (!validNumber(additionalTariffRatePct, 0)) missing.push('headhaul.additionalTariffRatePct');
        if (missing.length) return incomplete(missing, { includedInQuote: false, shipmentUsd: null, perUnitUsd: null });

        const declaredValueShipmentCny = declaredValueCny * shipmentUnits;
        const dutyAndTariffUsd = declaredValueShipmentCny
            * (dutyRatePct + additionalTariffRatePct) / 100
            / fxCnyPerUsd;
        const shipmentUsd = dutyAndTariffUsd + customsFixedUsd;
        return {
            complete: true,
            status: 'complete',
            missing: [],
            missingFields: [],
            includedInQuote: false,
            declaredValueShipmentCny: declaredValueShipmentCny,
            dutyAndTariffUsd: dutyAndTariffUsd,
            fixedUsd: customsFixedUsd,
            shipmentUsd: shipmentUsd,
            perUnitUsd: shipmentUsd / shipmentUnits,
        };
    }

    function readRequiredNonnegative(record, key, missing, path) {
        if (!isRecord(record) || !hasOwn(record, key) || !validNumber(record[key], 0)) {
            missing.push(path || key);
            return null;
        }
        return record[key];
    }

    function calculateFurnitureProfit(input) {
        if (!isRecord(input)) return incomplete(['input'], { profitUsd: null, marginPct: null });
        const missing = [];
        const priceUsd = readRequiredNonnegative(input, 'priceUsd', missing, 'priceUsd');
        const buyerShippingUsd = readRequiredNonnegative(input, 'buyerShippingUsd', missing, 'buyerShippingUsd');
        const fxCnyPerUsd = input.fxCnyPerUsd;
        const purchaseCny = readRequiredNonnegative(input, 'purchaseCny', missing, 'purchaseCny');
        if (!validNumber(fxCnyPerUsd, Number.MIN_VALUE)) missing.push('fxCnyPerUsd');
        if (typeof input.category !== 'string' || input.category.trim() === '') missing.push('category');

        const summary = summarizeCartons(input.cartons, input.cartonOptions);
        if (!summary.complete) missing.push.apply(missing, summary.missing);
        const headhaul = calculateHeadhaul(input, summary);
        if (!headhaul.complete) missing.push.apply(missing, headhaul.missing);
        const customs = calculateCustoms(input, headhaul);
        if (!customs.complete) missing.push.apply(missing, customs.missing);

        const fulfillment = isRecord(input.fulfillment) ? input.fulfillment : {};
        const fulfillmentMode = fulfillment.mode;
        let fbaFeeUsd = 0;
        let placementFeeUsd = 0;
        let lastMileUsd = 0;
        let pickPackUsd = 0;
        let parcelLastMile = null;
        if (fulfillmentMode === 'fba') {
            fbaFeeUsd = readRequiredNonnegative(fulfillment, 'fbaFeeUsd', missing, 'fulfillment.fbaFeeUsd');
            placementFeeUsd = readRequiredNonnegative(fulfillment, 'placementFeeUsd', missing, 'fulfillment.placementFeeUsd');
        } else if (fulfillmentMode === 'fbm') {
            if (hasOwn(fulfillment, 'lastMileUsd')) {
                lastMileUsd = readRequiredNonnegative(fulfillment, 'lastMileUsd', missing, 'fulfillment.lastMileUsd');
            } else if (Array.isArray(fulfillment.lastMileRows)) {
                lastMileUsd = calculateWeightedLastMile(fulfillment.lastMileRows);
                if (!validNumber(lastMileUsd, 0)) missing.push('fulfillment.lastMileRows');
            } else if (isRecord(fulfillment.parcel)) {
                parcelLastMile = calculateParcelLastMile(input.cartons, fulfillment.parcel);
                if (!parcelLastMile.complete) missing.push.apply(missing, parcelLastMile.missing.map(function (path) {
                    return 'fulfillment.parcel.' + path.replace(/^input\.?/, '');
                }));
                lastMileUsd = parcelLastMile.lastMileUsd;
            } else {
                missing.push('fulfillment.lastMileUsd');
                lastMileUsd = null;
            }
            pickPackUsd = readRequiredNonnegative(fulfillment, 'pickPackUsd', missing, 'fulfillment.pickPackUsd');
        } else {
            missing.push('fulfillment.mode');
        }

        const storageUsd = optionalNonnegative(input, 'storageUsd', missing, 'storageUsd');
        const adRatePct = optionalPercent(input, 'adRatePct', missing, 'adRatePct');
        const promoRatePct = optionalPercent(input, 'promoRatePct', missing, 'promoRatePct');
        const returnRatePct = optionalPercent(input, 'returnRatePct', missing, 'returnRatePct');
        const otherVariableUsd = optionalNonnegative(input, 'otherVariableUsd', missing, 'otherVariableUsd');
        const monthlyFixedUsd = optionalNonnegative(input, 'monthlyFixedUsd', missing, 'monthlyFixedUsd');

        let monthlyUnits = null;
        if (hasOwn(input, 'monthlyUnits') && input.monthlyUnits !== undefined && input.monthlyUnits !== null) {
            if (!validNumber(input.monthlyUnits, 0)) missing.push('monthlyUnits');
            else monthlyUnits = input.monthlyUnits;
        }
        if (validNumber(monthlyFixedUsd, Number.MIN_VALUE) && !(monthlyUnits > 0)) missing.push('monthlyUnits');

        let recoveryRatePct = 0;
        let reverseLogisticsUsd = 0;
        let returnProcessingUsd = 0;
        if (validNumber(returnRatePct, Number.MIN_VALUE)) {
            recoveryRatePct = readRequiredNonnegative(input, 'recoveryRatePct', missing, 'recoveryRatePct');
            if (validNumber(recoveryRatePct, 0) && recoveryRatePct > 100) missing.push('recoveryRatePct');
            reverseLogisticsUsd = readRequiredNonnegative(input, 'reverseLogisticsUsd', missing, 'reverseLogisticsUsd');
            returnProcessingUsd = readRequiredNonnegative(input, 'returnProcessingUsd', missing, 'returnProcessingUsd');
        }

        const totalSalesPrice = priceUsd !== null && buyerShippingUsd !== null ? priceUsd + buyerShippingUsd : null;
        if (totalSalesPrice !== null && !(totalSalesPrice > 0)) missing.push('priceUsd|buyerShippingUsd');
        let manualReferralRatePct = input.manualReferralRatePct;
        if (manualReferralRatePct !== undefined && manualReferralRatePct !== null
            && !validNumber(manualReferralRatePct, 0, 100)) {
            missing.push('manualReferralRatePct');
            manualReferralRatePct = null;
        }
        const referralFeeUsd = totalSalesPrice !== null
            ? calculateUsReferralFee(totalSalesPrice, input.category, manualReferralRatePct)
            : null;
        if (!validNumber(referralFeeUsd, 0)) missing.push('manualReferralRatePct|category');

        if (missing.length) {
            return incomplete(missing, {
                summary: summary,
                headhaul: headhaul,
                customs: customs,
                parcelLastMile: parcelLastMile,
                fulfillmentMode: fulfillmentMode || null,
                totalSalesPriceUsd: totalSalesPrice,
                profitUsd: null,
                marginPct: null,
                costs: null,
            });
        }

        const purchaseUsd = purchaseCny / fxCnyPerUsd;
        const headhaulUsd = headhaul.perUnitUsd;
        const customsUsd = customs.perUnitUsd;
        const landedUsd = purchaseUsd + headhaulUsd + customsUsd;
        const fulfillmentUsd = fulfillmentMode === 'fba'
            ? fbaFeeUsd + placementFeeUsd
            : lastMileUsd + pickPackUsd;
        const adsUsd = totalSalesPrice * adRatePct / 100;
        const promoUsd = totalSalesPrice * promoRatePct / 100;
        const monthlyFixedAllocatedUsd = monthlyFixedUsd > 0 ? monthlyFixedUsd / monthlyUnits : 0;
        const returnRate = returnRatePct / 100;
        const recoveryRate = recoveryRatePct / 100;
        const refundAdminFeeUsd = Math.min(MAX_REFUND_ADMIN_FEE_USD, referralFeeUsd * REFUND_ADMIN_RATE);
        const referralRefundPerReturnUsd = referralFeeUsd - refundAdminFeeUsd;
        const landedRecoveryPerReturnUsd = landedUsd * recoveryRate;
        const returnOperationsPerReturnUsd = reverseLogisticsUsd + returnProcessingUsd;
        const expectedRevenueLossUsd = totalSalesPrice * returnRate;
        const expectedReferralRefundUsd = referralRefundPerReturnUsd * returnRate;
        const expectedLandedRecoveryUsd = landedRecoveryPerReturnUsd * returnRate;
        const expectedReturnOperationsUsd = returnOperationsPerReturnUsd * returnRate;
        const expectedReturnAdjustmentUsd = -expectedRevenueLossUsd
            + expectedReferralRefundUsd
            + expectedLandedRecoveryUsd
            - expectedReturnOperationsUsd;
        const expectedNetSalesUsd = totalSalesPrice - expectedRevenueLossUsd;
        const expectedReferralFeeUsd = referralFeeUsd - expectedReferralRefundUsd;
        const expectedLandedCostUsd = landedUsd - expectedLandedRecoveryUsd;
        const baseCostsUsd = landedUsd
            + fulfillmentUsd
            + storageUsd
            + referralFeeUsd
            + adsUsd
            + promoUsd
            + otherVariableUsd
            + monthlyFixedAllocatedUsd;
        const profitBeforeReturnsUsd = totalSalesPrice - baseCostsUsd;
        const profitUsd = profitBeforeReturnsUsd + expectedReturnAdjustmentUsd;
        const economicCostUsd = totalSalesPrice - profitUsd;
        const marginPct = profitUsd / totalSalesPrice * 100;
        const monthlyProfitUsd = monthlyUnits === null ? null : profitUsd * monthlyUnits - monthlyFixedUsd + monthlyFixedAllocatedUsd * monthlyUnits;

        const finiteOutputs = [
            purchaseUsd, headhaulUsd, customsUsd, landedUsd, fulfillmentUsd, adsUsd, promoUsd,
            referralFeeUsd, expectedReturnAdjustmentUsd, profitUsd, economicCostUsd, marginPct,
        ].every(Number.isFinite);
        if (!finiteOutputs) {
            return incomplete(['calculation.nonFinite'], {
                summary: summary,
                headhaul: headhaul,
                customs: customs,
                profitUsd: null,
                marginPct: null,
            });
        }

        const costs = {
            purchaseUsd: purchaseUsd,
            headhaulUsd: headhaulUsd,
            customsUsd: customsUsd,
            landedUsd: landedUsd,
            expectedLandedCostUsd: expectedLandedCostUsd,
            fbaFeeUsd: fulfillmentMode === 'fba' ? fbaFeeUsd : 0,
            placementFeeUsd: fulfillmentMode === 'fba' ? placementFeeUsd : 0,
            lastMileUsd: fulfillmentMode === 'fbm' ? lastMileUsd : 0,
            pickPackUsd: fulfillmentMode === 'fbm' ? pickPackUsd : 0,
            fulfillmentUsd: fulfillmentUsd,
            storageUsd: storageUsd,
            referralFeeUsd: referralFeeUsd,
            expectedReferralFeeUsd: expectedReferralFeeUsd,
            adsUsd: adsUsd,
            promoUsd: promoUsd,
            otherVariableUsd: otherVariableUsd,
            monthlyFixedAllocatedUsd: monthlyFixedAllocatedUsd,
            expectedReturnOperationsUsd: expectedReturnOperationsUsd,
            baseCostsUsd: baseCostsUsd,
            economicCostUsd: economicCostUsd,
        };
        const returns = {
            ratePct: returnRatePct,
            recoveryRatePct: recoveryRatePct,
            refundAdminFeeUsd: refundAdminFeeUsd,
            referralRefundPerReturnUsd: referralRefundPerReturnUsd,
            landedRecoveryPerReturnUsd: landedRecoveryPerReturnUsd,
            returnOperationsPerReturnUsd: returnOperationsPerReturnUsd,
            expectedRevenueLossUsd: expectedRevenueLossUsd,
            expectedReferralRefundUsd: expectedReferralRefundUsd,
            expectedLandedRecoveryUsd: expectedLandedRecoveryUsd,
            expectedReturnOperationsUsd: expectedReturnOperationsUsd,
            expectedReturnAdjustmentUsd: expectedReturnAdjustmentUsd,
            expectedNetSalesUsd: expectedNetSalesUsd,
            expectedReferralFeeUsd: expectedReferralFeeUsd,
            expectedLandedCostUsd: expectedLandedCostUsd,
        };

        return {
            complete: true,
            status: 'complete',
            missing: [],
            missingFields: [],
            version: VERSION,
            summary: summary,
            headhaul: headhaul,
            customs: customs,
            parcelLastMile: parcelLastMile,
            fulfillmentMode: fulfillmentMode,
            totalSalesPriceUsd: totalSalesPrice,
            expectedNetSalesUsd: expectedNetSalesUsd,
            costs: costs,
            returns: returns,
            profitBeforeReturnsUsd: profitBeforeReturnsUsd,
            profitUsd: profitUsd,
            marginPct: marginPct,
            profitMarginPct: marginPct,
            monthlyProfitUsd: monthlyProfitUsd,
        };
    }

    function solveTargetPrice(input, targetMarginPct) {
        if (!isRecord(input)) return incomplete(['input'], { priceUsd: null });
        if (!validNumber(targetMarginPct, -100, 99.999999)) {
            return incomplete(['targetMarginPct'], { priceUsd: null });
        }

        const evaluate = function (priceUsd) {
            return calculateFurnitureProfit(Object.assign({}, input, { priceUsd: priceUsd }));
        };
        let lower = 0;
        let lowerResult = evaluate(lower);
        if (!lowerResult.complete && lowerResult.missing.some(function (path) { return path !== 'priceUsd|buyerShippingUsd'; })) {
            return incomplete(lowerResult.missing, { priceUsd: null, calculation: lowerResult });
        }
        if (!lowerResult.complete) {
            lower = 0.000001;
            lowerResult = evaluate(lower);
        }
        if (!lowerResult.complete) return incomplete(lowerResult.missing, { priceUsd: null, calculation: lowerResult });

        const target = targetMarginPct;
        if (lowerResult.marginPct >= target) {
            return {
                complete: true,
                status: 'complete',
                missing: [],
                missingFields: [],
                targetMarginPct: target,
                rawPriceUsd: lower,
                priceUsd: Math.ceil(lower * 100) / 100,
                achievedMarginPct: lowerResult.marginPct,
                calculation: lowerResult,
            };
        }

        let upper = validNumber(input.priceUsd, Number.MIN_VALUE) ? input.priceUsd : 1;
        if (upper <= lower) upper = 1;
        let upperResult = evaluate(upper);
        if (!upperResult.complete) return incomplete(upperResult.missing, { priceUsd: null, calculation: upperResult });
        while (upperResult.marginPct < target && upper < 1000000000) {
            upper *= 2;
            upperResult = evaluate(upper);
            if (!upperResult.complete) return incomplete(upperResult.missing, { priceUsd: null, calculation: upperResult });
        }
        if (upperResult.marginPct < target) {
            return incomplete(['targetPrice.solution'], { priceUsd: null, calculation: upperResult });
        }

        for (let iteration = 0; iteration < 160; iteration += 1) {
            const midpoint = (lower + upper) / 2;
            const midpointResult = evaluate(midpoint);
            if (!midpointResult.complete) return incomplete(midpointResult.missing, { priceUsd: null, calculation: midpointResult });
            if (midpointResult.marginPct >= target) upper = midpoint;
            else lower = midpoint;
        }

        const rawPriceUsd = upper;
        let priceUsd = Math.ceil((rawPriceUsd - 1e-12) * 100) / 100;
        let calculation = evaluate(priceUsd);
        while (calculation.complete && calculation.marginPct + 1e-10 < target) {
            priceUsd = Math.round((priceUsd + 0.01) * 100) / 100;
            calculation = evaluate(priceUsd);
        }
        if (!calculation.complete) return incomplete(calculation.missing, { priceUsd: null, calculation: calculation });
        return {
            complete: true,
            status: 'complete',
            missing: [],
            missingFields: [],
            targetMarginPct: target,
            rawPriceUsd: rawPriceUsd,
            priceUsd: priceUsd,
            achievedMarginPct: calculation.marginPct,
            calculation: calculation,
        };
    }

    return Object.freeze({
        version: VERSION,
        constants: Object.freeze({
            CM_PER_IN: CM_PER_IN,
            CM3_PER_IN3: CM3_PER_IN3,
            KG_PER_LB: KG_PER_LB,
            AIR_DIVISOR_CM3_KG: DEFAULT_AIR_DIVISOR,
            PARCEL_DIVISOR_IN3_LB: DEFAULT_PARCEL_DIVISOR,
        }),
        summarizeCartons: summarizeCartons,
        calculateHeadhaul: calculateHeadhaul,
        calculateUsReferralFee: calculateUsReferralFee,
        calculateWeightedLastMile: calculateWeightedLastMile,
        calculateParcelLastMile: calculateParcelLastMile,
        estimateUsFba2026: estimateUsFba2026,
        calculateFurnitureProfit: calculateFurnitureProfit,
        solveTargetPrice: solveTargetPrice,
    });
}));
