# 亚马逊利润测算工具（LT-TOOL）

面向 Amazon 卖家的通用利润测算工具，覆盖多站点标准商品、多 SKU、广告费、仓储、单位换算和文件处理；并为家具、家居、床垫等高头程、高尾程商品提供多箱包装、海运 LCL/FCL、DDP 报价拆分、FBA 大件计费与退货期望损失模型。默认首页优先展示“通用详细计算”。

本项目提供的是“规则估算 + 实报覆盖 + 结算核对”能力，不是自动同步 Amazon Seller Central、货代报价或海关税则的全自动精确结算系统。

在线地址：<https://kris-2023.github.io/LT-TOOL/>

主程序：[`index.html`](./index.html)

## 贡献者与修改细节

### AJAX（原作者）

- 创建并维护原始 LT-TOOL 项目。
- 实现尺寸、重量、体积、温度等单位换算。
- 实现头程计费重、FBA 尺寸分级、美国站 FBA 配送费与仓储预测。
- 实现广告费换算、利润测算、保本 ACOS、最大 CPC 和目标采购价。
- 实现 PDF 聚合、图片格式转换、浏览器本地背景移除、实时汇率和汇率历史曲线。
- 实现美国月度仓储预测、库存利用率附加费、FIFO 库存消耗和补货建议。
- 实现页面交互、主题切换、响应式布局和结果输入定位。

### am-tmac（日本站功能贡献者）

来源：<https://github.com/am-tmac/amazon-tool>

- 增加日本站 2026 FBA 配送费、尺寸等级和低价 FBA 费率。
- 增加日本站月度仓储费、旺季费率、服装/鞋靴/箱包费率和消费税口径。
- 增加日本站商品类别佣金、最低佣金和售价阶梯计算。
- 增加快速测算与详细计算模式，原始分支默认提供日本站卖家流程。
- 增加日本站保本售价、利润测算、12 个月仓储预测和补货流程。
- 增加日元精确汇率位数，并修复日本站费用回退到美国 FBA 费率的问题。

### 艾因（美国低客单价 FBA 规则贡献者）

- 在美国 FBA 计算中加入标准件有效售价大于 `0` 且小于 `$10` 时的低价 FBA 配送费阶梯。
- 增加美国普通商品、服装类商品和危险品的 `< $10`、`$10-$50`、`> $50` 价格档。
- 增加可编辑的 FBA 费率设置，包括仓储费、配送费阶梯、旺季附加费、体积重系数和加拿大系数。
- 增加美国 3.5% 燃油和物流附加费口径。
- 增加多 SKU 变体、销量占比和加权利润计算。
- 增加产品项目保存、读取和本地费率持久化。

低价 FBA 已并入计算流程：原通用详细模式保留标准件 `< $10` 档；大家居精算的单箱规则估算也按官方费率表区分 bulky / extra-large 的 `< $10` 基价。只有有效售价为有限数字、且大于 `0` 并小于 `$10` 时才进入低价档；最终仍以 Amazon Fee Preview 为准。

当前合并版默认进入“通用详细计算”，并继续提供快速测算与美国站大家居精算；单位换算保持独立页面。这些调整不改变上述贡献者归属。

## 当前功能

- 导航：默认进入“亚马逊利润测算”的通用详细计算；快速测算与美国站大家居精算可在页面顶部切换，“单位换算”为独立标签页。
- 单位换算：长度、重量、体积、温度，支持 `x`、`*`、`×` 和简单分数尺寸输入。
- 大家居头程：支持多箱明细、整票 CBM/毛重汇总、LCL W/M 计费吨、FCL 整柜分摊和 DDP 已含项目去重。
- 头程与 FBA：厘米/英寸、千克/磅双向联动，头程体积重与 FBA 体积重分开计算；多箱不能通过简单相加长宽高模拟成一个虚拟箱。
- FBA 配送费：美国、加拿大、日本、英国和德国/CEP 欧元区自动估算；墨西哥保留手动费用。
- 仓储：美国 12 个月详细预测；日本、英国和欧洲官方月度费率；加拿大和墨西哥手动仓储单价。
- 广告：CPA、POS、ACOS、ACoAS、ROAS、混合广告费/件和变体销量分布。
- 利润：采购、退税/折扣、头程、佣金、FBA、入库配置费、仓储、广告、促销和退货成本；单独展示采购/件与总采购成本。
- 详细利润结果：每项一行显示同款数据条和占售价比例（保留 1 位小数），原有金额、人民币换算和总费用字段保持不变。
- 多 SKU：各变体售价、销量占比、独立规格、FBA 配送费、单件利润和月利润。
- 汇率：实时汇率、手动覆盖和历史趋势曲线。
- 文件工具：PDF 聚合、图片格式转换和浏览器本地背景移除。
- 金额展示：单件成本同时显示站点币种和人民币；总采购成本、月度和计划期总费用在人民币后附加对应美元金额。

## 站点费率支持

### 美国 / US

- 2026 FBA 普通商品、服装类商品和危险品费率。
- 有效售价大于 `0` 且小于 `$10` 时，标准件与大家居单箱规则估算分别使用官方对应的低价费率档。
- 3.5% 燃油和物流附加费。
- 美国月度仓储、库存利用率附加费和 12 个月补货预测。

### 加拿大 / CA

- 按美国 FBA 配送费乘加拿大系数估算，默认系数为 `1.34`。
- 3.5% 燃油附加费。
- 仓储单价和平均库存月数保留手动填写。

### 日本 / JP

- 2026 日本站 FBA 配送费、低价 FBA、月度仓储、旺季仓储和服装类费率。
- 日本站佣金类别、最低佣金和 10% 消费税口径。
- 12 个月仓储与补货预测。

### 英国 / UK

- Amazon Europe Fees Rate Card，生效日期：2026-07-01。
- 官方信封、包裹、小号大件、标准大件、大号大件、重型大件和特殊大件配送费。
- 一般商品售价不超过 `£20` 且符合尺寸重量限制时自动使用低价 FBA。
- 自 2026-04-17 起计入 1.5% 燃油和物流附加费。
- 官方月度仓储费（`£/ft³/月`），10-12 月自动切换旺季费率。
- 官方销售佣金类别、售价阶梯和最低佣金。

### 欧洲 / EU

- 当前采用 Amazon Europe Fees Rate Card 中的德国/CEP（DE/PL/CZ）欧元口径，生效日期：2026-07-01。
- 官方信封、包裹、小号大件、标准大件、大号大件、重型大件和特殊大件配送费。
- 一般商品售价不超过 `€20` 且符合尺寸重量限制时自动使用低价 FBA。
- 自 2026-04-17 起计入 1.5% 燃油和物流附加费。
- 官方月度仓储费（`€/m³/月`），10-12 月自动切换旺季费率。
- 官方销售佣金类别、售价阶梯和最低佣金。
- 法国、意大利、西班牙、瑞典、荷兰、波兰、比利时和爱尔兰与德国/CEP 费率并不完全相同；当前版本不自动区分这些国家的国别费率。

### 墨西哥 / MX

- 保留手动 FBA 配送费和仓储单价。
- 不自动套用美国费率，避免产生误导结果。

## 精度边界

- 本工具不自动连接 Seller Central、SP-API、Send to Amazon、货代、报关行或承运商；页面算出的费用默认属于规则估算，不应显示为“Amazon 已确认费用”或“最终利润”。
- Amazon 仓库实测包装尺寸、重量、fee category、SIPP 状态、危险品状态、入仓地区、分仓方案、实际收货数量和结算日期都可能改变最终费用。已有 ASIN/SKU 应优先回填 Fee Preview 或结算报表数据。
- 多箱商品只有在 Amazon 或承运商确实按每箱分别计费时，才能逐箱计算后求和；如果 Amazon 将整套商品作为一个 customer-ready packaged unit 测量，应使用 Amazon 实测尺寸和费用，不能擅自拆箱降低档位。
- LCL 的 W/M、最低计费吨、起运港/目的港杂费，FCL 的柜型与装载率，以及 DDP 的包含项都由真实报价决定。默认值只能用于方案比较，不能代替货代账单。
- 2026 Holiday Peak、Overmax、非 SIPP 包装费、入库配置费和部分退货处理费具有日期、SKU 或方案条件；页面可给预警，但最终金额应使用当期 Revenue Calculator、Fee Preview、Send to Amazon 报价或实际账单。不能把“旺季平均增加约 `$0.32/件`”套到每个 SKU。
- 关税、Section 301、反倾销/反补贴税、销售税和进口增值税取决于 HTS、原产国、进口主体和交易条款；本工具不是报关或税务意见。
- 费率会变化。本文及内置美国规则核对日期为 **2026-09-17**，以后使用必须重新核验生效日期。

## 数据来源层级

同一费用出现多个数值时，按以下优先级覆盖，且在结果中标注来源和日期：

1. **实际结算**：Amazon Settlement/Transaction、FBA 费用报告、货代或报关账单；这是复盘实际利润的最高优先级。
2. **SKU/货件实时报价**：Amazon Fee Preview、Revenue Calculator、Send to Amazon placement quote、承运商有效报价；适合下单和发货前决策，但仍是预估。
3. **Amazon 官方费率与规则**：按站点、类目、生效日期、售价档、尺寸档和旺淡季执行的版本化表格。
4. **用户输入的业务假设**：采购价、汇率、销量、广告、退货率、库存周转、LCL/FCL/DDP 报价及分摊方式。
5. **项目默认值**：只用于缺少数据时的情景演算，必须清楚标为“假设”，不得冒充实时费率或实际结算。

规则估算、Amazon 实时报价与实际结算应分别保存，不能用后一次静态重算覆盖历史账单。

## 核心公式

### 有效售价与家具销售佣金

美国 `< $10` 档只在以下条件同时满足时触发：

```text
isFinite(effective_price) && effective_price > 0 && effective_price < 10
```

Furniture 的 referral fee 按总销售价格 `T` 分段，而不是对全额统一乘一个比例：

```text
T = 商品价 + 买家支付的运费
furniture_referral_fee = max(
  0.30,
  0.15 × min(T, 200) + 0.10 × max(T - 200, 0)
)
```

Home & Kitchen、Mattresses 通常为 `max(0.30, 15% × T)`；实际 fee category 可能与前台浏览类目不同，应允许用户按 Fee Preview 覆盖。Amazon 的完整 total sales price 还可包含礼品包装费；当前大家居工作台未单列该输入，默认其为 `0`。

### 多箱、体积重与 FBA 尾程

每个箱件先把三边排序为 `L ≥ M ≥ S`：

```text
length_plus_girth = L + 2 × (M + S)
dim_weight_lb = L × max(M, 2) × max(S, 2) / 139
shipping_weight_lb = max(unit_weight, dim_weight)
billable_weight_lb = ceil(shipping_weight_lb)
```

Small standard 和 XL 150+ lb 等官方例外按其规则使用实际重量。每磅或每 4 oz 增量应向上进入下一个计费区间。

```text
shipment_cbm = Σ(quantity_i × L_i_cm × M_i_cm × S_i_cm / 1,000,000)
chargeable_kg = Σ(quantity_i × max(actual_weight_i_kg, dim_weight_i_kg))
```

当前大家居规则估算器只接受“单箱、单件” FBA；多箱 SKU 会 fail closed，必须回填 Seller Central / Fee Preview 对该 SKU 的实报配送费。只有确认 Amazon 实际按每箱独立结算时，才能在外部逐箱计算后求和；Amazon 将整套商品按一个包装单元测量时，应以 Amazon 数据覆盖。

自 2026-04-17 起，美国 FBA 燃油和物流附加费只作用于 fulfillment fee：

```text
current_fba_fulfillment = base_fba_fulfillment × 1.035
```

不要把 3.5% 乘到 referral fee、仓储、广告、头程或所有 Amazon 费用总和上。

### LCL、FCL 与 DDP 去重

LCL 常见 W/M 口径为 `1 CBM` 对 `1,000 kg` 取大：

```text
weight_ton = total_gross_weight_kg / 1000
revenue_ton = max(total_cbm, weight_ton, carrier_minimum_wm)
lcl_total = revenue_ton × rate_per_wm
          + origin_charges + destination_charges
          + documentation + customs + drayage + insurance
```

FCL 先按整柜报价计算，再按明确规则分摊到可售件数或 SKU：

```text
fcl_unit_cost = (container_all_in_cost + nonincluded_costs) / sellable_units
```

多 SKU 混柜应选择并记录按 CBM、毛重、件数或货值的分摊方式。当前工作台只提供一个“报价已含上述进口关税、MPF/HMF 和报关固定费”总开关；勾选后这一组进口费用整体置零。海运、中国端杂费、美国端杂费与派送仍分别录入；请在货代报价备注中保留逐项 `included_components`，不要把同一费用重复录入。

### 仓储与退货期望值

```text
unit_volume_ft3 = L_in × M_in × S_in / 1728
monthly_storage = average_daily_units × unit_volume_ft3 × monthly_rate
```

退货不能简单按 `退货率 × 售价` 扣减。建议拆成可回收与不可回收路径：

```text
expected_return_loss = return_rate × (
  未退回的出库配送费
  + refund_admin_fee
  + expected_return_processing_fee
  + reverse_logistics
  + unsellable_probability × (landed_cogs + removal_or_disposal - salvage)
  - resellable_probability × resale_recovery
)

refund_admin_fee = min(5, 20% × original_referral_fee)
```

退货处理费是否触发还取决于品类阈值、观察窗口、发货量和豁免；应优先使用 Return Insights/Fee Preview，而不是用统一退货费率。

## Amazon 官方来源（截至 2026-09-17）

### 美国 / US

- 销售计划与各类目 referral fee：<https://sell.amazon.com/pricing>
- 2026 美国 referral/FBA 费用更新公告：<https://sellingpartners.aboutamazon.com/update-to-u-s-referral-and-fulfillment-by-amazon-fees-for-2026>
- 2026 美国费用更新明细：<https://sellercentral.amazon.com/help/hub/reference/external/G201411300?locale=en-US>
- FBA fulfillment fee rates：<https://sellercentral.amazon.com/help/hub/reference/external/GABBX6GZPA8MSZGW?locale=en-US>
- Product size tiers：<https://sellercentral.amazon.com/help/hub/reference/external/GG5KW835AHDJCH8W?locale=en-US>
- 2026-04-17 起 3.5% 燃油和物流附加费：<https://sellercentral.amazon.com/seller-forums/discussions/t/7cbc0233-ee5b-4359-978a-dee7cad5c6f4>
- 2026 Holiday Peak 公告：<https://sellercentral.amazon.com/seller-forums/discussions/t/3e31fbb7-04e0-4ed4-873e-f74b1052e2ff>
- 月度仓储费与尺寸档参考：<https://supplychain.amazon.com/docs/2026-rate-card>
- 2026 aged inventory surcharge：<https://sellercentral.amazon.com/seller-forums/discussions/t/85f60e98-f93c-48fe-bee7-07917616f827>
- FBA inbound placement service：<https://sellercentral.amazon.com/help/hub/reference/GC3Q44PBK8BXQW3Z>
- Overmax handling fee：<https://sellercentral.amazon.com/help/hub/reference/external/GGCGMQHGX95C5CB8?locale=en-US>
- Refund administration fee：<https://sellercentral.amazon.com/help/hub/reference/DC3U6FWF4JJJJC7>
- Returns processing fee：<https://sellercentral.amazon.com/help/hub/reference/GZGEQLTM3RZXUV6T>
- Amazon 费用估算工具说明：<https://sell.amazon.com/pricing/estimate>
- SP-API Product Fees：<https://developer-docs.amazon.com/sp-api/docs/get-product-fee-estimates-asin>
- SP-API inbound `listPackingOptions`：<https://developer-docs.amazon.com/sp-api/reference/listpackingoptions>

### 其他站点

- 英国定价入口：<https://sell.amazon.co.uk/pricing#download-rate-cards>
- 德国定价入口：<https://sell.amazon.de/preisgestaltung#download-rate-cards>
- Amazon Europe Fees Rate Card 2026-07-01：<https://m.media-amazon.com/images/G/02/sell/images/260630-FBA-Rate-Card-EN1.pdf>
- Amazon 日本站定价：<https://sell.amazon.co.jp/pricing>

汇率不是 Amazon 费用来源：实时汇率使用 ExchangeRate-API（`open.er-api.com`），历史汇率使用 Frankfurter（`api.frankfurter.dev`）。

## 公开发布与隐私

- 本项目是独立第三方工具，与 Amazon.com, Inc. 及其关联公司无隶属、赞助或认可关系；Amazon 及相关标识归其权利人所有。
- 页面内的演示 SKU、箱规、售价、采购价、运费、销量、税率与退货率均为完全虚构的合成数据，不对应任何卖家、客户、产品、订单或报价。
- 大家居精算的输入与 CSV 导出都在当前浏览器内完成；通用详细计算中保存的产品和自定义费率只写入访问者设备上的 `localStorage`。
- 更新汇率会请求 ExchangeRate-API / Frankfurter。首次使用背景移除功能会联网下载第三方代码与模型；所选图片在浏览器内处理且不会被本工具主动上传，但第三方服务仍会收到 IP、User-Agent、Referrer 等常规网络元数据。
- 提交 Issue、Pull Request 或截图前，仍应检查并移除自己填入的真实 SKU、Seller Central 数据、货代报价和客户信息。
- 仓库目前未附带 `LICENSE`。公开可见不等于自动授权复用；如需允许开源使用，请由仓库所有者明确选择并添加许可证。

## 文件

- `index.html`：当前主程序，已内联发布所需的工作台 CSS 与大家居脚本，可直接双击预览或部署到 GitHub Pages。
- `furniture-calculator.js`：大家居精算核心引擎（纯函数 / UMD）。
- `furniture-calculator-ui.js`：大家居表单、审计、导出与交互逻辑。
- `furniture-calculator.css`：全站工作台与大家居精算的桌面端、移动端响应式样式。
- `scripts/sync-inline-assets.mjs`：修改以上 CSS / JS 后运行，用于把公开源码同步进 `index.html`；测试会检查两份内容完全一致。
- `LT-TOOL-低客单价运费修改版.html`：艾因的低客单价历史参考版本，不再维护，不应作为当前费率或经营决策依据。
- `tests/`：费率、计算、页面结构和回归测试。

最后更新：2026-09-17
