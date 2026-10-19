const test = require('node:test');
const assert = require('node:assert/strict');
const data = require('../src/fares.json');
const engine = require('../src/fare-engine.cjs');
const find = name => data.cities.find(city => city.name === name);

// 这些例子直接按原始 CSV 的票档和文字规则写，不从程序生成期望值。
const examples = [
  ['北京', 6, 3], ['北京', 6.01, 4], ['北京', 32, 6], ['北京', 32.01, 7],
  ['上海', 6, 3], ['上海', 16, 4], ['上海', 16.01, 5],
  ['广州', 12, 4], ['广州', 12.01, 5], ['深圳', 24, 6], ['深圳', 24.01, 7],
  ['成都', 50, 9], ['成都', 50.01, 10], ['重庆', 55, 9], ['重庆', 55.01, 10],
  ['南京', 61, 9], ['南京', 61.01, 10], ['南京', 76, 10], ['南京', 76.01, 11],
  ['南京', 91, 11], ['南京', 91.01, 12], ['南京', 106, 12], ['南京', 106.01, 13], ['南京', 500, 39], ['西安', 26, 6], ['西安', 26.01, 7], ['苏州', 30, 6],
  ['郑州', 21, 4], ['大连', 54, 8], ['大连', 54.01, 9],
  ['青岛', 38, 6], ['青岛', 38.01, 7], ['宁波', 20, 5], ['宁波', 20.01, 6],
  ['昆明', 43, 8], ['昆明', 43.01, 9], ['南宁', 34, 6], ['福州', 29, 6],
  ['厦门', 43, 7], ['济南', 29, 6], ['石家庄', 54, 8], ['乌鲁木齐', 25, 6],
  ['贵阳', 24, 6], ['南昌', 28, 5], ['长春', 35, 6],
  ['温州', 40, 10], ['温州', 40.01, 11], ['温州', 64, 14], ['温州', 64.01, 15],
  ['金华', 46, 10], ['金华', 46.01, 11], ['金华', 64, 13], ['金华', 64.01, 14],
  ['台州', 52, 11], ['台州', 52.01, 12], ['台州', 64, 13], ['台州', 64.01, 14],
  ['徐州', 59, 8], ['徐州', 59.01, 9], ['常州', 29, 6], ['洛阳', 22, 4],
  ['沈阳', 28, 6], ['沈阳', 28.01, 7], ['沈阳', 38, 7], ['沈阳', 38.01, 7], ['沈阳', 500, 7],
  ['徐州', 34.01, 7], ['徐州', 44, 7], ['徐州', 44.01, 8],
  ['石家庄', 54.01, 9], ['石家庄', 64, 9], ['石家庄', 64.01, 10],
  ['南通', 45.01, 8], ['南通', 65, 8], ['南通', 65.01, 9],
  ['兰州', 32.01, 8], ['兰州', 40, 8], ['兰州', 40.01, 9],
  ['绍兴', 24, 6], ['芜湖', 38, 6], ['芜湖', 38.01, 7],
];
for (const [name, km, fare] of examples) {
  test(name + ' ' + km + ' 公里 = ' + fare + ' 元', () => assert.equal(engine.calculate(find(name), km).fare, fare));
}

test('输入约束：拒绝空值、负数、科学计数法、非有限数与超范围数值', () => {
  for (const input of ['', ' ', null, undefined, 0, -1, '1e2', 'Infinity', NaN, '12km', '.5', '1.234', '500.01']) {
    assert.ok(engine.parseDistance(input).error, String(input));
  }
  for (const input of ['0.01', '12.50', '500', ' 5 ']) assert.ok(!engine.parseDistance(input).error);
});
test('天津不以公里数给出价格', () => assert.equal(engine.calculate(find('天津'), 5).kind, 'unsupported'));
test('南京按15公里续程，不把末个已列票档当封顶价', () => {
  const city = find('南京');
  assert.equal(city.stepKm, 15);
  assert.equal(city.capFare, undefined);
  assert.equal(engine.interval(engine.calculate(city, 76.01)), '76 < 里程 ≤ 91 公里');
});
test('来源来自原始CSV，不再用附图或历史网页覆盖', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { createHash } = require('node:crypto');
  const bytes = fs.readFileSync(path.join(__dirname, '../地铁票价对比.csv'));
  assert.equal(data.meta.inputSha256, createHash('sha256').update(bytes).digest('hex'));
  for (const city of data.cities) {
    assert.equal(city.sources.length, 1);
    assert.equal(city.sources[0].type, '从发改委或地铁公司官网获取');
    assert.equal(city.sources[0].sha256, data.meta.inputSha256);
    assert.equal(city.audit.status, 'csv');
  }
});
test('沈阳按CSV明确的政策封顶计算并参与价差比较', () => {
  const result = engine.calculate(find('沈阳'), 38.01);
  assert.equal(result.fare, 7);
  assert.equal(result.capped, true);
  assert.equal(engine.compare([find('北京'), find('沈阳')], 500)[0].city.name, '沈阳');
});
test('不能用既有线网最高票价截断里程测算', () => assert.equal(engine.calculate(find('洛阳'), 100).fare, 13));
test('全量数据结构和每个票档端点', () => {
  for (const city of data.cities) {
    engine.validateCity(city);
    city.tiers.forEach((tier, index) => {
      assert.equal(engine.calculate(city, tier.upTo).fare, tier.fare, city.name);
      if (index + 1 < city.tiers.length) assert.equal(engine.calculate(city, tier.upTo + 0.01).fare, city.tiers[index + 1].fare);
    });
  }
});
test('可计算范围内票价随里程不减', () => {
  for (const city of data.cities) {
    let last = 0;
    for (let km = 1; km <= 500; km += 1) {
      const result = engine.calculate(city, km);
      if (result.kind !== 'fare') continue;
      assert.ok(result.fare >= last, city.name + ' ' + km);
      last = result.fare;
    }
  }
});
test('排序不改变原城市顺序；不适用城市放在价格表最后', () => {
  const cities = [find('天津'), find('上海'), find('北京')];
  const result = engine.compare(cities, 20);
  assert.deepEqual(result.map(row => row.city.name), ['北京', '上海', '天津']);
  assert.equal(cities[0].name, '天津');
  assert.deepEqual(engine.compare([], 20), []);
});
test('45城的原表票档均保留，只有明确政策封顶才启用上限', () => {
  assert.equal(data.cities.length, 45);
  assert.deepEqual(data.cities.filter(city => city.capFare != null).map(city => city.name), ['天津', '沈阳']);
  for (const city of data.cities) {
    if (city.pricing === 'stations') continue;
    for (const tier of city.original.listedTiers) {
      assert.equal(engine.calculate(city, tier.upTo).fare, tier.fare, city.name);
      const next = engine.calculate(city, tier.upTo + 0.01);
      assert.equal(next.fare, city.capFare ? Math.min(tier.fare + 1, city.capFare) : tier.fare + 1, city.name);
    }
  }
});
test('导出保留里程、统一来源、原表网址和按站计价提示', () => {
  const csv = engine.toCsv(engine.compare([find('北京'), find('天津')], 20), 20, '2026-10-07');
  assert.ok(csv.startsWith('\uFEFF'));
  assert.match(csv, /从发改委或地铁公司官网获取/);
  assert.match(csv, /按原表数据/);
  assert.match(csv, /https:\/\//);
  assert.match(csv, /按站数计价/);
  assert.match(csv, /"20"/);
});
test('文本导出防止来源或城市名被表格当成公式执行', () => {
  const city = { ...find('北京'), name: '=1+1' };
  assert.match(engine.toCsv(engine.compare([city], 20), 20, '2026-10-07'), /"'=1\+1"/);
});
test('坏的票档数据不能混入构建', () => {
  assert.throws(() => engine.validateCity({ id: 'bad', name: '坏数据', tiers: [{ fare: 7, upTo: 38 }], capFare: 6 }));
  assert.throws(() => engine.validateCity({ id: 'bad', name: '坏数据', tiers: [{ fare: 2, upTo: 5 }, { fare: 3, upTo: 4 }] }));
  assert.throws(() => engine.validateCity({ id: 'bad', name: '坏数据', tiers: [{ fare: 2, upTo: 5 }], stepKm: -1 }));
});
