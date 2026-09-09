import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('every inline script parses, including market configuration',()=>{
 for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) new vm.Script(m[1]);
});
test('Japan cannot fall through to US fulfillment fees',()=>{
 assert.match(html,/country === 'JP' \?/);\n assert.doesNotMatch(html,/country === 'JP' \|\| country === 'MX'/);
 assert.match(html,/<option value="JP">/);
 assert.match(html,/JP: \{/);
});
function extract(name) {
 const start=html.indexOf(`    function ${name}(`);
 const end=html.indexOf('\n    function ',start+1);
 return html.slice(start,end);
}
test('low price fee uses explicit valid prices and respects 9.90 boundary',()=>{
 const fee=vm.runInNewContext(extract('estimateFbaFee')+';estimateFbaFee');
 const standard='\u6807\u51c6\u4ef6';
 assert.equal(fee(standard,0.25,9.89),2.91);
 for(const p of [9.9,10,undefined,null,'',0,-1,NaN]) assert.equal(fee(standard,0.25,p),3.68);
 assert.equal(fee('\u5927\u53f7\u5927\u4ef6',2,9),9.99);
});
test('monthly totals execute safely and convert CNY-base exchange rates correctly',()=>{
 const el={textContent:''};
 const context={document:{getElementById:()=>el},liveRates:{CNY:1,USD:1/7.2},fmtNumber:String,rmbMoney:(v,fx)=>(v*fx).toFixed(2)};
 const render=vm.runInNewContext(extract('setProfitTotalMetric')+';setProfitTotalMetric',context);
 render('total',10,7.2,0); assert.doesNotMatch(el.textContent,/USD/);
 render('total',10,7.2,100); assert.match(el.textContent,/USD 1000.00/);
});

