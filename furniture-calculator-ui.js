(function (root) {
    'use strict';

    const state = {
        initialized: false,
        loading: false,
        nextCartonId: 1,
        latest: null,
        latestInput: null,
        latestCostRows: [],
        fbaEstimate: null,
    };

    const $ = function (id) { return document.getElementById(id); };
    const engine = function () { return root.FurnitureProfitEngine; };
    const finite = function (value) { return typeof value === 'number' && Number.isFinite(value); };
    const nonnegative = function (value) { return finite(value) && value >= 0; };

    function readNumber(id) {
        const element = $(id);
        if (!element || element.value === '') return undefined;
        const value = Number(element.value);
        return Number.isFinite(value) ? value : NaN;
    }

    function setValue(id, value) {
        const element = $(id);
        if (element) element.value = value === undefined || value === null ? '' : String(value);
    }

    function setText(id, value) {
        const element = $(id);
        if (element) element.textContent = value;
    }

    function money(value) {
        return finite(value)
            ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
            : '-';
    }

    function number(value, digits) {
        if (!finite(value)) return '-';
        return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: digits === undefined ? 3 : digits }).format(value);
    }

    function percent(value) {
        return finite(value) ? number(value, 1) + '%' : '-';
    }

    function escapeHtml(value) {
        return String(value === undefined || value === null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function cartonRowMarkup(carton) {
        const data = carton || {};
        const rowId = state.nextCartonId++;
        return '<tr data-carton-id="' + rowId + '">'
            + '<td><input class="fp-carton-name" type="text" aria-label="箱名" value="' + escapeHtml(data.name || ('箱 ' + rowId)) + '"></td>'
            + '<td><input class="fp-carton-length" type="number" min="0" step="0.1" aria-label="长度厘米" value="' + escapeHtml(data.lengthCm ?? '') + '"></td>'
            + '<td><input class="fp-carton-width" type="number" min="0" step="0.1" aria-label="宽度厘米" value="' + escapeHtml(data.widthCm ?? '') + '"></td>'
            + '<td><input class="fp-carton-height" type="number" min="0" step="0.1" aria-label="高度厘米" value="' + escapeHtml(data.heightCm ?? '') + '"></td>'
            + '<td><input class="fp-carton-weight" type="number" min="0" step="0.01" aria-label="实重千克" value="' + escapeHtml(data.weightKg ?? '') + '"></td>'
            + '<td><input class="fp-carton-quantity" type="number" min="1" step="1" aria-label="每套箱数" value="' + escapeHtml(data.quantity ?? 1) + '"></td>'
            + '<td><button class="fp-table-action fp-remove-carton" type="button" aria-label="删除该箱">删除</button></td>'
            + '</tr>';
    }

    function addCarton(carton, skipUpdate) {
        const tbody = $('fpCartonRows');
        if (!tbody) return;
        tbody.insertAdjacentHTML('beforeend', cartonRowMarkup(carton));
        if (!skipUpdate) update();
    }

    function readCartons() {
        return Array.from(document.querySelectorAll('#fpCartonRows tr')).map(function (row) {
            return {
                name: row.querySelector('.fp-carton-name')?.value.trim() || '',
                lengthCm: row.querySelector('.fp-carton-length')?.value === '' ? undefined : Number(row.querySelector('.fp-carton-length').value),
                widthCm: row.querySelector('.fp-carton-width')?.value === '' ? undefined : Number(row.querySelector('.fp-carton-width').value),
                heightCm: row.querySelector('.fp-carton-height')?.value === '' ? undefined : Number(row.querySelector('.fp-carton-height').value),
                weightKg: row.querySelector('.fp-carton-weight')?.value === '' ? undefined : Number(row.querySelector('.fp-carton-weight').value),
                quantity: row.querySelector('.fp-carton-quantity')?.value === '' ? undefined : Number(row.querySelector('.fp-carton-quantity').value),
            };
        });
    }

    function readZoneRows() {
        return Array.from(document.querySelectorAll('#fpZonePanel tbody tr')).map(function (row) {
            const share = row.querySelector('.fp-zone-share');
            const cost = row.querySelector('.fp-zone-cost');
            return {
                label: row.dataset.zone || '',
                sharePct: share?.value === '' ? undefined : Number(share.value),
                costUsd: cost?.value === '' ? undefined : Number(cost.value),
            };
        });
    }

    function updateModePanels() {
        const fulfillmentMode = $('fpFulfillmentMode')?.value || 'fba';
        if ($('fpFbaPanel')) $('fpFbaPanel').hidden = fulfillmentMode !== 'fba';
        if ($('fpZonePanel')) $('fpZonePanel').hidden = fulfillmentMode !== 'fbm_zones';
        if ($('fpManualPanel')) $('fpManualPanel').hidden = fulfillmentMode !== 'fbm_manual';
        if ($('fpParcelPanel')) $('fpParcelPanel').hidden = fulfillmentMode !== 'fbm_parcel';

        const fbaEstimate = $('fpFbaSource')?.value === 'estimate';
        const feeInput = $('fpFbaActualFee');
        if (feeInput) {
            feeInput.disabled = fulfillmentMode === 'fba' && fbaEstimate;
            feeInput.placeholder = fbaEstimate ? '由单箱规格自动估算' : '实报模式必填';
        }
        setText('fpFbaExtraLabel', fbaEstimate
            ? '未包含的旺季 / 包装附加（USD）'
            : '旺季 / Overmax / 包装附加（USD）');
        setText('fpFbaExtraHelp', fbaEstimate
            ? 'Overmax 已由规则估算自动纳入；这里只填未包含的旺季或包装附加。'
            : '按 Fee Preview 填写实际增量，不要套用全站平均值。');

        const headhaulMode = $('fpHeadhaulMode')?.value || 'lcl_wm';
        document.querySelectorAll('.fp-lcl-only').forEach(function (node) { node.hidden = headhaulMode !== 'lcl_wm'; });
        const labels = {
            lcl_wm: '海运费（CNY / W/M）*',
            fcl_total: '整柜总报价（CNY / 柜）*',
            chargeable_kg: '运费（CNY / 计费 kg）*',
            per_unit: '头程报价（CNY / 套）*',
        };
        setText('fpHeadhaulRateLabel', labels[headhaulMode] || '头程报价（CNY）*');

        const manualCategory = $('fpCategory')?.value === 'manual';
        const manualRate = $('fpManualReferralRate');
        if (manualRate) manualRate.disabled = !manualCategory;

        const quoteIncludesImportFees = Boolean($('fpQuoteIncludesImportFees')?.checked);
        setText('fpDeclaredValueLabel', quoteIncludesImportFees ? '申报货值/套（CNY）' : '申报货值/套（CNY）*');
    }

    function fbaEstimateFor(cartons, priceUsd) {
        state.fbaEstimate = null;
        if (!engine() || typeof engine().estimateUsFba2026 !== 'function') {
            return { complete: false, missing: ['fulfillment.fbaEstimator'] };
        }
        if (cartons.length !== 1 || cartons[0].quantity !== 1) {
            return { complete: false, missing: ['fulfillment.multiCartonFbaFee'] };
        }
        const estimate = engine().estimateUsFba2026(cartons[0], priceUsd);
        state.fbaEstimate = estimate;
        return estimate;
    }

    function buildInput() {
        const cartons = readCartons();
        const category = $('fpCategory')?.value || 'furniture';
        const quoteIncludesImportFees = Boolean($('fpQuoteIncludesImportFees')?.checked);
        const dutyRate = readNumber('fpDutyRate');
        const extraTariffRate = readNumber('fpAdditionalTariffRate');
        const importRate = readNumber('fpImportRate');
        const input = {
            priceUsd: readNumber('fpPrice'),
            buyerShippingUsd: readNumber('fpBuyerShipping'),
            category: category,
            fxCnyPerUsd: readNumber('fpFx'),
            monthlyUnits: readNumber('fpMonthlyUnits'),
            purchaseCny: readNumber('fpPurchaseCny'),
            cartons: cartons,
            cartonOptions: { parcelDivisorIn3Lb: readNumber('fpParcelDivisor') || 139 },
            headhaul: {
                mode: $('fpHeadhaulMode')?.value,
                shipmentUnits: readNumber('fpShipmentUnits'),
                rateCny: readNumber('fpHeadhaulRateCny'),
                minWm: readNumber('fpMinWm'),
                fixedOriginCny: readNumber('fpOriginFixedCny'),
                fixedDestinationUsd: readNumber('fpDestinationFixedUsd'),
                destinationPerUnitUsd: readNumber('fpDestinationPerUnitUsd'),
                quoteIncludesImportFees: quoteIncludesImportFees,
                declaredValueCny: readNumber('fpDeclaredValueCny'),
                dutyRatePct: dutyRate,
                additionalTariffRatePct: nonnegative(extraTariffRate) && nonnegative(importRate)
                    ? extraTariffRate + importRate
                    : undefined,
                customsFixedUsd: readNumber('fpCustomsFixedUsd'),
            },
            storageUsd: readNumber('fpStorageUsd'),
            adRatePct: readNumber('fpAdRate'),
            promoRatePct: readNumber('fpPromoRate'),
            returnRatePct: readNumber('fpReturnRate'),
            recoveryRatePct: readNumber('fpRecoveryRate'),
            reverseLogisticsUsd: readNumber('fpReverseLogistics'),
            returnProcessingUsd: readNumber('fpReturnProcessing'),
            otherVariableUsd: readNumber('fpOtherVariable'),
            monthlyFixedUsd: readNumber('fpMonthlyFixed'),
        };
        if (category === 'manual') input.manualReferralRatePct = readNumber('fpManualReferralRate');

        const fulfillmentMode = $('fpFulfillmentMode')?.value || 'fba';
        if (fulfillmentMode === 'fba') {
            const source = $('fpFbaSource')?.value || 'actual';
            const rawExtra = readNumber('fpFbaExtraFee');
            const extra = rawExtra === undefined ? 0 : rawExtra;
            const rawPlacement = readNumber('fpPlacementFee');
            const placement = rawPlacement === undefined ? 0 : rawPlacement;
            let fbaFee;
            if (source === 'actual') {
                const actual = readNumber('fpFbaActualFee');
                fbaFee = nonnegative(actual) && nonnegative(extra) ? actual + extra : undefined;
            } else {
                const estimate = fbaEstimateFor(cartons, input.priceUsd);
                fbaFee = estimate && estimate.complete && nonnegative(estimate.total) && nonnegative(extra)
                    ? estimate.total + extra
                    : undefined;
            }
            input.fulfillment = {
                mode: 'fba',
                fbaFeeUsd: fbaFee,
                placementFeeUsd: placement,
            };
        } else if (fulfillmentMode === 'fbm_zones') {
            input.fulfillment = {
                mode: 'fbm',
                lastMileRows: readZoneRows(),
                pickPackUsd: readNumber('fpZonePickPack'),
            };
        } else if (fulfillmentMode === 'fbm_manual') {
            input.fulfillment = {
                mode: 'fbm',
                lastMileUsd: readNumber('fpManualLastMile'),
                pickPackUsd: readNumber('fpManualPickPack'),
            };
        } else {
            input.fulfillment = {
                mode: 'fbm',
                parcel: {
                    basePerCartonUsd: readNumber('fpParcelBase'),
                    rateUsdPerLb: readNumber('fpParcelPerLb'),
                    fuelSurchargePct: readNumber('fpParcelFuel'),
                    perCartonSurchargeUsd: readNumber('fpParcelSurcharge'),
                    orderAccessorialUsd: readNumber('fpParcelOrderFee'),
                    parcelDivisorIn3Lb: readNumber('fpParcelDivisor'),
                },
                pickPackUsd: readNumber('fpParcelPickPack'),
            };
        }
        return input;
    }

    const missingLabels = {
        priceUsd: '商品售价',
        buyerShippingUsd: '买家支付运费',
        'priceUsd|buyerShippingUsd': '有效销售收入',
        category: 'Amazon 费率类目',
        'manualReferralRatePct|category': '手动佣金率或有效费率类目',
        manualReferralRatePct: '手动佣金率',
        fxCnyPerUsd: '人民币/美元汇率',
        purchaseCny: '采购成本',
        cartons: '完整装箱数据',
        'headhaul.shipmentUnits': '本票装载套数',
        'headhaul.mode': '头程计价方式',
        'headhaul.rateCny': '头程报价',
        'headhaul.rateCny|totalCny': 'FCL 整柜总报价',
        'headhaul.minWm': 'LCL 最低计费 W/M',
        'headhaul.fixedOriginCny': '中国端整票杂费',
        'headhaul.fixedDestinationUsd': '美国端整票杂费',
        'headhaul.destinationPerUnitUsd': '美国端每套费用',
        'headhaul.declaredValueCny': '申报货值',
        'headhaul.dutyRatePct': '基础关税率',
        'headhaul.additionalTariffRatePct': '附加税及进口费率',
        'headhaul.customsFixedUsd': '报关/查验等整票固定费',
        'headhaul.quoteIncludesImportFees': '报价是否已含进口费用',
        'summary.airChargeableKg': '每箱实重与体积重数据',
        'fulfillment.fbaFeeUsd': 'FBA 配送费（多箱请用 Fee Preview）',
        'fulfillment.placementFeeUsd': 'Inbound placement fee',
        'fulfillment.lastMileUsd': '尾程配送费',
        'fulfillment.lastMileRows': '完整且合计 100% 的分区配送报价',
        'fulfillment.multiCartonFbaFee': '多箱 FBA 的 Fee Preview 实报',
        'fulfillment.fbaEstimator': '可用的 2026 FBA 规则估算器',
        'fulfillment.pickPackUsd': '仓内拣配费',
        'fulfillment.mode': '履约方式',
        storageUsd: '仓储费',
        adRatePct: '广告费率',
        promoRatePct: '促销/优惠费率',
        returnRatePct: '退货率',
        monthlyUnits: '预计月销量（有固定月费时必填）',
        recoveryRatePct: '退回库存可回收率',
        reverseLogisticsUsd: '逆向物流费',
        returnProcessingUsd: '退货处理费',
        otherVariableUsd: '其他变动费',
        monthlyFixedUsd: '每月固定费用',
        'options.airDivisorCm3Kg': '空运体积重除数',
        'options.parcelDivisorIn3Lb': '包裹 DIM 除数',
        'calculation.nonFinite': '计算结果超出有效数值范围',
    };

    function localizeMissing(path) {
        if (missingLabels[path]) return missingLabels[path];
        if (/^cartons\[\d+\]\.dimensions$/.test(path)) return '每箱完整长宽高';
        if (/^cartons\[\d+\]\.weight$/.test(path)) return '每箱实重';
        if (/^cartons\[\d+\]\.quantity$/.test(path)) return '每套箱数（正整数）';
        if (path.indexOf('fulfillment.parcel') === 0) return '包裹计费公式所需报价';
        if (path.indexOf('headhaul.') === 0) return '头程/清关输入值';
        if (path.indexOf('fulfillment.') === 0) return '尾程配送输入值';
        return '请检查数值范围';
    }

    function visibleMissingLabels(result, input) {
        const hidden = new Set(['summary.totalCbm', 'summary.totalWeightKg']);
        let paths = (result.missing || []).filter(function (path) { return !hidden.has(path); });
        if (!finite(input.priceUsd)) {
            paths = paths.filter(function (path) { return path !== 'manualReferralRatePct|category'; });
        }
        return Array.from(new Set(paths.map(localizeMissing)));
    }

    function renderMiniSummary(summary, headhaul) {
        setText('fpUnitCbm', summary?.complete ? number(summary.totalCbm, 4) + ' CBM' : '-');
        setText('fpUnitKg', summary?.complete ? number(summary.totalWeightKg, 2) + ' kg' : '-');
        setText('fpAirChargeKg', summary?.complete ? number(summary.airChargeableKg, 2) + ' kg' : '-');
        setText('fpParcelChargeLb', summary?.complete ? number(summary.parcelChargeableWeightLb, 0) + ' lb' : '-');
        setText('fpShipmentCbm', finite(headhaul?.shipmentCbm) ? number(headhaul.shipmentCbm, 3) + ' CBM' : '-');
        setText('fpShipmentKg', finite(headhaul?.shipmentWeightKg) ? number(headhaul.shipmentWeightKg, 1) + ' kg' : '-');
        setText('fpChargeableWm', finite(headhaul?.wm) ? number(headhaul.wm, 3) + ' W/M' : '-');
        setText('fpHeadhaulUnit', finite(headhaul?.perUnitUsd) ? money(headhaul.perUnitUsd) : '-');
    }

    function auditItem(kind, title, body) {
        return '<li class="is-' + kind + '"><strong>' + escapeHtml(title) + '</strong><span>' + escapeHtml(body) + '</span></li>';
    }

    function renderAudit(result, input) {
        const list = $('fpAuditList');
        if (!list) return;
        const items = [];
        if (!result.complete) {
            const labels = visibleMissingLabels(result, input);
            items.push(auditItem('missing', '缺少数据', labels.join('；') || '请检查必填字段。'));
        }

        const headhaulMode = input.headhaul?.mode;
        const headhaulLabels = { lcl_wm: 'LCL W/M 整票分摊', fcl_total: 'FCL 整柜总价分摊', chargeable_kg: '计费公斤报价', per_unit: '每套头程报价' };
        const headhaulReady = result.headhaul?.complete === true;
        items.push(auditItem(headhaulReady ? 'good' : 'missing', '头程', headhaulReady
            ? (headhaulLabels[headhaulMode] || '待选择') + ' · 卖家/货代输入'
            : '待补齐装箱、整票数量与货代报价。'));
        const customsReady = result.customs?.complete === true;
        if (!customsReady) {
            items.push(auditItem('missing', '进口费用', '待补齐申报价值、税率或 DDP 包含状态。'));
        } else if (input.headhaul?.quoteIncludesImportFees) {
            items.push(auditItem('good', '进口费用', '已按“报价包含”去重，关税与报关固定费不再重复叠加。'));
        } else {
            items.push(auditItem('estimate', '进口费用', '按申报货值与用户录入税率估算；HTS、Section 301、MPF/HMF 请由报关行确认。'));
        }

        const mode = $('fpFulfillmentMode')?.value;
        if (mode === 'fba') {
            const source = $('fpFbaSource')?.value;
            if (source === 'actual') {
                const ready = nonnegative(input.fulfillment?.fbaFeeUsd) && nonnegative(input.fulfillment?.placementFeeUsd);
                items.push(auditItem(ready ? 'good' : 'missing', 'FBA 尾程', ready
                    ? '使用 Seller Central / Fee Preview 手动回填；请确认报价日期、SIPP、Overmax 和旺季条件。'
                    : '待回填 Seller Central / Fee Preview 的配送费。'));
            } else if (state.fbaEstimate?.complete
                && nonnegative(input.fulfillment?.fbaFeeUsd)
                && nonnegative(input.fulfillment?.placementFeeUsd)) {
                const estimate = state.fbaEstimate;
                const tierLabels = { small_bulky: 'Small bulky', large_bulky: 'Large bulky', extra_large: 'Extra-large' };
                items.push(auditItem('estimate', 'FBA 尾程', '2026-04-17 规则估算 · ' + (tierLabels[estimate.tier] || estimate.tier || '尺寸档') + ' · 含 3.5% fulfillment 附加费。'));
            } else {
                items.push(auditItem('missing', 'FBA 尾程', '规则估算仅支持单箱；多箱或无法匹配时必须回填 Fee Preview。'));
            }
        } else if (mode === 'fbm_zones') {
            const zoneCost = engine().calculateWeightedLastMile(input.fulfillment?.lastMileRows);
            const ready = nonnegative(zoneCost) && nonnegative(input.fulfillment?.pickPackUsd);
            items.push(auditItem(ready ? 'good' : 'missing', 'FBM 尾程', ready
                ? '按订单区域占比加权；准确度取决于真实邮编分布和有效承运商报价。'
                : '待填写合计 100% 的区域占比和配送成本。'));
        } else if (mode === 'fbm_manual') {
            const ready = nonnegative(input.fulfillment?.lastMileUsd) && nonnegative(input.fulfillment?.pickPackUsd);
            items.push(auditItem(ready ? 'good' : 'missing', 'LTL / 白手套', ready
                ? '使用每套实报；住宅、偏远、预约、楼层和二人搬运是否包含需在报价中核对。'
                : '待填写每套 LTL / 白手套实际报价。'));
        } else {
            const ready = result.parcelLastMile?.complete === true && nonnegative(input.fulfillment?.pickPackUsd);
            const divisor = input.fulfillment?.parcel?.parcelDivisorIn3Lb;
            items.push(auditItem(ready ? 'estimate' : 'missing', '包裹尾程', ready
                ? '逐箱按 DIM ÷' + number(divisor, 0) + ' 与实重取大并向上取整，再套用合同费率。'
                : '待填写每箱基础费、每磅费率与有效 DIM 除数。'));
        }

        const returnRate = input.returnRatePct;
        const returnRateIsValid = finite(returnRate) && returnRate >= 0 && returnRate <= 100;
        items.push(auditItem(!returnRateIsValid ? 'missing' : returnRate > 0 ? 'estimate' : 'good', '退货', !returnRateIsValid
            ? '退货率必须为 0% 至 100% 的有效数值。'
            : returnRate > 0
                ? '按退货率、可回收率、退款管理费上限和逆向费用计算期望损失；高退货率处理费仍需按账单补充。'
                : '当前按 0% 退货率；请确认这是否符合历史实际。'));
        items.push(auditItem('estimate', '费率日期', '美国官方规则核对至 2026-09-17；结算复盘应以 Amazon 与承运商实际账单覆盖。'));
        list.innerHTML = items.join('');
    }

    function buildCostRows(result) {
        if (!result.complete) return [];
        const c = result.costs;
        const r = result.returns;
        const recoveryFactor = c.landedUsd > 0 ? c.expectedLandedCostUsd / c.landedUsd : 1;
        const fulfillmentMode = result.fulfillmentMode;
        const rows = [
            ['采购成本（退货回收后期望）', '采购输入 + 汇率', c.purchaseUsd * recoveryFactor],
            ['头程（退货回收后期望）', '货代报价分摊', c.headhaulUsd * recoveryFactor],
            ['进口税费（退货回收后期望）', result.customs?.includedInQuote ? 'DDP 已含，已去重' : '申报货值 × 税率', c.customsUsd * recoveryFactor],
            [fulfillmentMode === 'fba' ? 'FBA 配送 + placement' : 'FBM 尾程 + 拣配', fulfillmentMode === 'fba' && $('fpFbaSource')?.value === 'actual' ? 'Fee Preview / 卖家实报' : '规则或报价', c.fulfillmentUsd],
            ['仓储', '卖家输入', c.storageUsd],
            ['Amazon 推荐费（退款后期望）', '官方类目规则', c.expectedReferralFeeUsd],
            ['广告', '销售额 × 广告费率', c.adsUsd],
            ['促销', '销售额 × 促销费率', c.promoUsd],
            ['退货导致的收入损失', '售价 × 退货率', r.expectedRevenueLossUsd],
            ['退货逆向与处理', '每退件费用 × 退货率', c.expectedReturnOperationsUsd],
            ['其他变动费', '卖家输入', c.otherVariableUsd],
            ['固定费用分摊', '月固定费 ÷ 月销量', c.monthlyFixedAllocatedUsd],
        ];
        return rows.filter(function (row) { return finite(row[2]) && Math.abs(row[2]) > 1e-12; });
    }

    function renderResult(result, input) {
        const pill = $('fpStatusPill');
        const formError = $('fpFormError');
        const isEstimatedFba = $('fpFulfillmentMode')?.value === 'fba' && $('fpFbaSource')?.value === 'estimate';
        if (!result.complete) {
            if (pill) { pill.className = 'fp-status-pill incomplete'; pill.textContent = '输入不完整'; }
            if (formError) {
                const labels = visibleMissingLabels(result, input);
                formError.hidden = false;
                formError.textContent = labels.length ? '请补充：' + labels.join('；') : '请检查输入。';
            }
            ['fpProfit', 'fpMargin', 'fpMonthlyProfit', 'fpBreakEvenPrice', 'fpTargetPrice', 'fpLandedCost', 'fpLogisticsCost'].forEach(function (id) { setText(id, '-'); });
            setText('fpTotalCost', '-');
            if ($('fpCostRows')) $('fpCostRows').innerHTML = '<tr><td colspan="3">补齐关键数据后生成；空值没有按 0 处理。</td></tr>';
            $('fpProfitKpi')?.classList.remove('negative');
            state.latestCostRows = [];
            renderAudit(result, input);
            return;
        }

        if (pill) {
            pill.className = 'fp-status-pill ' + (isEstimatedFba ? 'estimate' : 'complete');
            pill.textContent = isEstimatedFba ? '规则估算' : '已完成测算';
        }
        if (formError) formError.hidden = true;
        setText('fpProfit', money(result.profitUsd));
        setText('fpMargin', percent(result.marginPct));
        setText('fpMonthlyProfit', finite(result.monthlyProfitUsd) ? money(result.monthlyProfitUsd) : '未填月销量');
        setText('fpLandedCost', money(result.costs.landedUsd));
        setText('fpLogisticsCost', money(result.costs.headhaulUsd + result.costs.fulfillmentUsd));
        $('fpProfitKpi')?.classList.toggle('negative', result.profitUsd < 0);

        const breakEven = engine().solveTargetPrice(input, 0);
        const target = engine().solveTargetPrice(input, readNumber('fpTargetMargin'));
        setText('fpBreakEvenPrice', breakEven.complete ? money(breakEven.priceUsd) : '-');
        setText('fpTargetPrice', target.complete ? money(target.priceUsd) : '-');

        const rows = buildCostRows(result);
        state.latestCostRows = rows;
        if ($('fpCostRows')) $('fpCostRows').innerHTML = rows.map(function (row) {
            return '<tr><td>' + escapeHtml(row[0]) + '</td><td>' + escapeHtml(row[1]) + '</td><td>' + money(row[2]) + '</td></tr>';
        }).join('') || '<tr><td colspan="3">无成本项</td></tr>';
        setText('fpTotalCost', money(result.costs.economicCostUsd));
        renderAudit(result, input);
    }

    function update() {
        updateModePanels();
        if (!engine()) return;
        const input = buildInput();
        const result = engine().calculateFurnitureProfit(input);
        const estimateNote = $('fpFbaEstimateNote');
        if (estimateNote && $('fpFbaSource')?.value === 'estimate') {
            if (state.fbaEstimate?.complete) {
                const tierLabels = { small_bulky: 'Small bulky', large_bulky: 'Large bulky', extra_large: 'Extra-large' };
                estimateNote.textContent = '规则估算：' + (tierLabels[state.fbaEstimate.tier] || state.fbaEstimate.tier)
                    + '，计费重 ' + number(state.fbaEstimate.billableWeightLb, 0) + ' lb，基础配送 ' + money(state.fbaEstimate.base)
                    + '，3.5% 附加 ' + money(state.fbaEstimate.fuel) + (state.fbaEstimate.overmax > 0 ? '，Overmax ' + money(state.fbaEstimate.overmax) : '')
                    + '，合计 ' + money(state.fbaEstimate.total) + '。';
            } else {
                estimateNote.textContent = '规则估算仅支持单箱 bulky / extra-large。标准件、多箱或缺少规格时，请改用 Seller Central / Fee Preview 实报。';
            }
        } else if (estimateNote) {
            estimateNote.textContent = '多箱商品可能分别贴 FNSKU、套装或按单箱商品售卖；请填写 Seller Central Fee Preview 对该 SKU 的实际配送费。';
        }
        state.latest = result;
        state.latestInput = input;
        renderMiniSummary(result.summary, result.headhaul);
        renderResult(result, input);
    }

    function reset() {
        state.loading = true;
        const defaults = {
            fpSku: '', fpCategory: 'furniture', fpPrice: '', fpBuyerShipping: 0,
            fpManualReferralRate: '', fpPurchaseCny: '', fpFx: 7.2, fpMonthlyUnits: '',
            fpHeadhaulMode: 'lcl_wm', fpShipmentUnits: '', fpHeadhaulRateCny: '', fpMinWm: 1,
            fpOriginFixedCny: 0, fpDestinationFixedUsd: 0, fpDestinationPerUnitUsd: 0,
            fpDeclaredValueCny: '', fpDutyRate: 0, fpAdditionalTariffRate: 0, fpImportRate: 0,
            fpCustomsFixedUsd: 0, fpFulfillmentMode: 'fba', fpStorageUsd: 0,
            fpFbaSource: 'actual', fpFbaActualFee: '', fpPlacementFee: 0, fpFbaExtraFee: 0,
            fpZonePickPack: 0, fpManualLastMile: '', fpManualPickPack: 0,
            fpParcelBase: '', fpParcelPerLb: '', fpParcelFuel: 0, fpParcelSurcharge: 0, fpParcelOrderFee: 0,
            fpParcelPickPack: 0, fpParcelDivisor: 139, fpAdRate: 0, fpPromoRate: 0,
            fpReturnRate: 0, fpRecoveryRate: 0, fpReverseLogistics: 0, fpReturnProcessing: 0,
            fpOtherVariable: 0, fpMonthlyFixed: 0, fpTargetMargin: 20,
        };
        Object.keys(defaults).forEach(function (id) { setValue(id, defaults[id]); });
        if ($('fpQuoteIncludesImportFees')) $('fpQuoteIncludesImportFees').checked = false;
        document.querySelectorAll('.fp-zone-share, .fp-zone-cost').forEach(function (element) { element.value = ''; });
        if ($('fpCartonRows')) $('fpCartonRows').innerHTML = '';
        state.nextCartonId = 1;
        addCarton(null, true);
        if ($('fpDemoNotice')) $('fpDemoNotice').hidden = true;
        state.loading = false;
        update();
    }

    function loadDemo() {
        state.loading = true;
        // Synthetic public demo only; not derived from any seller, SKU, order, quote, or product.
        const values = {
            fpSku: 'SYNTHETIC-FURN-001', fpCategory: 'furniture', fpPrice: 1000,
            fpBuyerShipping: 0, fpPurchaseCny: 1800, fpFx: 7.2, fpMonthlyUnits: 60,
            fpHeadhaulMode: 'lcl_wm', fpShipmentUnits: 80, fpHeadhaulRateCny: 900, fpMinWm: 1,
            fpOriginFixedCny: 3600, fpDestinationFixedUsd: 1600, fpDestinationPerUnitUsd: 6,
            fpDeclaredValueCny: 1800, fpDutyRate: 0, fpAdditionalTariffRate: 25,
            fpImportRate: 0.5, fpCustomsFixedUsd: 200, fpFulfillmentMode: 'fbm_zones',
            fpStorageUsd: 10, fpZonePickPack: 14, fpAdRate: 15, fpPromoRate: 2,
            fpReturnRate: 10, fpRecoveryRate: 60, fpReverseLogistics: 40,
            fpReturnProcessing: 20, fpOtherVariable: 8, fpMonthlyFixed: 900, fpTargetMargin: 20,
        };
        Object.keys(values).forEach(function (id) { setValue(id, values[id]); });
        if ($('fpQuoteIncludesImportFees')) $('fpQuoteIncludesImportFees').checked = false;
        if ($('fpCartonRows')) $('fpCartonRows').innerHTML = '';
        state.nextCartonId = 1;
        addCarton({ name: '示例箱 A', lengthCm: 120, widthCm: 60, heightCm: 30, weightKg: 36, quantity: 1 }, true);
        addCarton({ name: '示例箱 B', lengthCm: 90, widthCm: 45, heightCm: 25, weightKg: 24, quantity: 1 }, true);
        const zoneValues = [[25, 100], [50, 160], [25, 240]];
        document.querySelectorAll('#fpZonePanel tbody tr').forEach(function (row, index) {
            row.querySelector('.fp-zone-share').value = zoneValues[index][0];
            row.querySelector('.fp-zone-cost').value = zoneValues[index][1];
        });
        if ($('fpDemoNotice')) $('fpDemoNotice').hidden = false;
        state.loading = false;
        update();
    }

    function csvCell(value) {
        return '"' + String(value === undefined || value === null ? '' : value).replace(/"/g, '""') + '"';
    }

    function exportCsv() {
        if (!state.latest?.complete) {
            const error = $('fpFormError');
            if (error) { error.hidden = false; error.textContent = '请先补齐关键数据，再导出结果。'; }
            return;
        }
        const rows = [
            ['大家居利润精算', '数值', '说明'],
            ['导出时间', new Date().toISOString(), '浏览器本地生成'],
            ['SKU', $('fpSku')?.value || '', ''],
            ['售价', state.latest.totalSalesPriceUsd, 'USD，含买家支付运费'],
            ['利润/套', state.latest.profitUsd, 'USD'],
            ['利润率', state.latest.marginPct, '%'],
            ['月利润', state.latest.monthlyProfitUsd ?? '', 'USD'],
            [],
            ['成本项', '金额 USD', '来源'],
        ];
        state.latestCostRows.forEach(function (row) { rows.push([row[0], row[2], row[1]]); });
        rows.push(['总成本', state.latest.costs.economicCostUsd, '期望值口径']);
        rows.push([], ['提示', '', '最终以 Amazon、货代、报关行与承运商实际账单为准']);
        const csv = '\ufeff' + rows.map(function (row) { return row.map(csvCell).join(','); }).join('\r\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const sku = ($('fpSku')?.value || 'furniture-profit').replace(/[^a-zA-Z0-9_-]+/g, '-');
        link.href = url;
        link.download = sku + '-profit.csv';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    function init() {
        if (state.initialized || !$('furnitureCalculator')) return;
        state.initialized = true;
        const calculator = $('furnitureCalculator');
        calculator.addEventListener('input', function () {
            if (!state.loading) {
                if ($('fpDemoNotice')) $('fpDemoNotice').hidden = true;
                update();
            }
        });
        calculator.addEventListener('change', function () {
            if (!state.loading) {
                if ($('fpDemoNotice')) $('fpDemoNotice').hidden = true;
                update();
            }
        });
        calculator.addEventListener('click', function (event) {
            const button = event.target.closest('.fp-remove-carton');
            if (!button) return;
            button.closest('tr')?.remove();
            if (!document.querySelector('#fpCartonRows tr')) addCarton(null, true);
            update();
        });
        reset();
    }

    root.FurnitureProfitUI = Object.freeze({
        init: init,
        update: update,
        addCarton: addCarton,
        reset: reset,
        loadDemo: loadDemo,
        exportCsv: exportCsv,
    });
}(typeof globalThis !== 'undefined' ? globalThis : window));
