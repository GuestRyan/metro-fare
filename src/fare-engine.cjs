(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FareEngine = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  function parseDistance(value) {
    const text = String(value ?? '').trim();
    if (!text) return { error: '请输入里程。' };
    if (!/^\d+(\.\d{1,2})?$/.test(text)) {
      return { error: '里程须为正数，最多两位小数。' };
    }
    const km = Number(text);
    if (km < 0.01 || km > 500) return { error: '可查询范围为 0.01～500 公里。' };
    return { km, hundredths: Math.round(km * 100) };
  }

  function validateCity(city) {
    if (!city.id || !city.name) throw new Error('城市缺少名称或编号');
    if (city.pricing === 'stations') return;
    if (!Array.isArray(city.tiers) || !city.tiers.length) throw new Error(city.name + ' 缺少票档');
    let lastKm = 0;
    let lastFare = 0;
    for (const tier of city.tiers) {
      if (!Number.isFinite(tier.upTo) || tier.upTo <= lastKm || !Number.isInteger(tier.fare) || tier.fare <= lastFare) {
        throw new Error(city.name + ' 的票档必须按里程和票价递增');
      }
      lastKm = tier.upTo;
      lastFare = tier.fare;
    }
    if (city.capFare != null && (!Number.isInteger(city.capFare) || city.capFare < lastFare)) {
      throw new Error(city.name + ' 的封顶价不能小于已列票价');
    }
    if (city.stepKm != null && (!Number.isFinite(city.stepKm) || city.stepKm <= 0)) {
      throw new Error(city.name + ' 的续程间隔无效');
    }
  }

  function calculate(city, input) {
    const parsed = parseDistance(input);
    if (parsed.error) return { kind: 'invalid', message: parsed.error };
    if (city.pricing === 'stations') {
      return { kind: 'unsupported', message: '按站数计价，不支持里程换算。' };
    }
    const distance = parsed.hundredths;
    let lower = 0;
    for (const tier of city.tiers) {
      const upper = Math.round(tier.upTo * 100);
      // 恰好到分界点时，仍用这一档；多出 0.01 公里才进入下一档。
      if (distance <= upper) return { kind: 'fare', fare: tier.fare, lower, upper: tier.upTo, extended: false };
      lower = tier.upTo;
    }
    const last = city.tiers[city.tiers.length - 1];
    if (city.capFare != null) {
      return { kind: 'fare', fare: city.capFare, lower: last.upTo, upper: null, capped: true, extended: true };
    }
    if (!city.stepKm) {
      return { kind: 'unsupported', message: '超出已收录规则的里程范围，暂不推算。' };
    }
    const step = Math.round(city.stepKm * 100);
    const count = Math.ceil((distance - Math.round(last.upTo * 100)) / step);
    return {
      kind: 'fare', fare: last.fare + count,
      lower: last.upTo + (count - 1) * city.stepKm,
      upper: last.upTo + count * city.stepKm, extended: true,
    };
  }

  function compare(cities, input, order = 'fare') {
    const rows = cities.map(city => ({ city, ...calculate(city, input) }));
    return rows.sort((a, b) => {
      if (order === 'name') return a.city.name.localeCompare(b.city.name, 'zh-CN');
      const aHasFare = a.kind === 'fare';
      const bHasFare = b.kind === 'fare';
      if (aHasFare !== bHasFare) return aHasFare ? -1 : 1;
      if (aHasFare && a.fare !== b.fare) return a.fare - b.fare;
      return a.city.name.localeCompare(b.city.name, 'zh-CN');
    });
  }

  function interval(result) {
    if (result.kind !== 'fare') return result.message;
    if (result.capped) return result.lower + ' 公里以上，按封顶规则';
    return result.lower === 0 ? '0 < 里程 ≤ ' + result.upper + ' 公里'
      : result.lower + ' < 里程 ≤ ' + result.upper + ' 公里';
  }

  function csvCell(value) {
    let text = String(value ?? '');
    // 导出的来源和备注也是文本，不让表格软件把它们当公式执行。
    if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }

  function toCsv(rows, km, checkedOn) {
    const data = [['城市', '输入里程(公里)', '规则测算票价(元)', '命中区间', '数据依据', '规则摘要', '来源', '来源网址', '整理日期', '适用说明']];
    for (const row of rows) {
      data.push([row.city.name, km, row.fare ?? '', interval(row), row.city.audit.label,
        row.city.rule, row.city.sources[0]?.type || '', row.city.sources.map(s => s.url).join(' ; '), checkedOn,
        '普通成人单程票规则测算；不代表可达线路或实时售票报价。' + row.city.scope]);
    }
    return '\uFEFF' + data.map(cells => cells.map(csvCell).join(',')).join('\r\n');
  }

  return { parseDistance, validateCity, calculate, compare, interval, toCsv };
});
