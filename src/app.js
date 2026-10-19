(() => {
  'use strict';
  const { parseDistance, calculate, compare, interval, toCsv } = FareEngine;
  const $ = selector => document.querySelector(selector);
  const cities = [
    ...FARE_DATA.cities.filter(city => city.name !== '天津'),
    ...FARE_DATA.cities.filter(city => city.name === '天津'),
  ];
  const byId = new Map(cities.map(city => [city.id, city]));
  const state = {
    selected: new Set(), mode: 'multiple', distance: '', sort: 'fare', detail: null,
  };
  let rows = [];

  function escapeHtml(value) {
    const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(value ?? '').replace(/[&<>"']/g, char => entities[char]);
  }

  function visibleCities() {
    const term = $('#city-search').value.trim();
    return cities.filter(city => city.name.includes(term));
  }

  function renderCities() {
    const list = visibleCities();
    const type = state.mode === 'single' ? 'radio' : 'checkbox';
    $('#city-list').innerHTML = list.map(city => 
      `<label class="city-option${city.name === '天津' ? ' station-city' : ''}">
        <input type="${type}" name="city" value="${escapeHtml(city.id)}"
          ${(state.selected.has(city.id) ? 'checked' : '')}>
        <span>${escapeHtml(city.name)}${city.name === '天津' ? '（站数计价）' : ''}</span>
      </label>`
    ).join('') || '<p>无匹配城市</p>';
    $('#selected-count').textContent = '已选 ' + state.selected.size + ' 城';
    $('#select-all').hidden = state.mode === 'single';
  }

  function resultRow(row, lowest) {
    const hasFare = row.kind === 'fare';
    const isLowest = hasFare && row.fare === lowest;
    const fare = hasFare ? row.fare : '不适用';
    const difference = hasFare ? row.fare - lowest : '—';
    return `<tr class="${(isLowest ? 'cheapest' : '')}">
      <td>${escapeHtml(row.city.name)}</td>
      <td class="fare-number">${fare}</td>
      <td>${difference}</td>
      <td><button class="detail-button" data-detail="${escapeHtml(row.city.id)}">规则</button></td>
    </tr>`;
  }

  function renderResults() {
    const parsed = parseDistance(state.distance);
    const missingDistance = state.distance.trim() === '';
    const showTutorial = missingDistance || state.selected.size === 0;
    const error = missingDistance ? '' : parsed.error || '';
    $('#distance-error').textContent = error;
    $('#distance-error').hidden = !error;
    $('#distance').setAttribute('aria-invalid', String(Boolean(error)));
    $('#query-tutorial').hidden = !showTutorial;
    $('.result-actions').hidden = showTutorial;
    $('#results-title').textContent = showTutorial ? '使用方法' : parsed.error ? '票价查询' : parsed.km + ' 公里票价';
    rows = parsed.error ? [] : compare([...state.selected].map(id => byId.get(id)), state.distance, state.sort);
    $('#export-csv').disabled = rows.length === 0;
    const empty = !showTutorial && parsed.error ? '里程无效' : '';
    $('#empty-state').hidden = !empty;
    $('#empty-state').textContent = empty;
    $('#fare-table').hidden = showTutorial || Boolean(empty);
    const validRows = rows.filter(row => row.kind === 'fare');
    const lowest = validRows.length ? Math.min(...validRows.map(row => row.fare)) : null;
    $('#fare-rows').innerHTML = rows.map(row => resultRow(row, lowest)).join('');
    if (!state.selected.has(state.detail)) state.detail = rows[0]?.city.id;
    renderDetail();
  }

  function renderDetail() {
    const city = byId.get(state.detail);
    $('#rule-detail').hidden = !city || rows.length === 0;
    if (!city || !rows.length) return;
    const result = calculate(city, state.distance);
    const tiers = city.tiers.map(tier => {
      const active = result.kind === 'fare' && result.fare === tier.fare;
      return '<span class="tier ' + (active ? 'active' : '') + '"><strong>'
        + tier.fare + ' 元</strong>≤ ' + tier.upTo + ' 公里</span>';
    });
    if (city.pricing === 'distance') {
      let continuation = '';
      if (city.capFare != null) continuation = city.capFare + ' 元封顶';
      else if (city.stepKm) continuation = '后续每 ' + city.stepKm + ' 公里加 1 元';
      if (continuation) {
        tiers.push('<span class="tier ' + (result.extended ? 'active' : '') + '">' + continuation + '</span>');
      }
    }
    $('#rule-detail').innerHTML = `<div class="rule-heading">
      <h3 id="rule-title">${escapeHtml(city.name)}计价规则</h3>
      <button class="detail-button" data-source="${escapeHtml(city.id)}">来源详情</button>
    </div>
    <p class="rule-description">${escapeHtml(interval(result))}</p>
    <p>${escapeHtml(city.rule)}</p>
    <div class="tier-list">${tiers.join('')}</div>`;
  }

  function sourceText(source) {
    return escapeHtml(source.type || source.title || '');
  }

  function renderSources() {
    const term = $('#source-search').value.trim().toLowerCase();
    const matches = cities.filter(city => {
      const fields = [city.name, ...city.sources.flatMap(source => [source.title, source.type])];
      return fields.some(value => String(value ?? '').toLowerCase().includes(term));
    });
    $('#source-rows').innerHTML = matches.map(city => `<tr>
      <td>${escapeHtml(city.name)}</td>
      <td>${escapeHtml(city.rule)}</td>
      <td>${escapeHtml(city.original.effective)}</td>
      <td>${city.sources.map(sourceText).join('<br>')}
        <button class="detail-button" data-source="${escapeHtml(city.id)}">详情</button>
      </td>
    </tr>`).join('') || '<tr><td colspan="4">无匹配记录</td></tr>';
  }

  function openSource(id) {
    const city = byId.get(id);
    if (!city) return;
    $('#dialog-title').textContent = city.name + '数据来源';
    $('#dialog-body').innerHTML = `<dl class="source-fields">
      <dt>计价规则</dt><dd>${escapeHtml(city.rule)}</dd>
      <dt>规则生效</dt><dd>${escapeHtml(city.original.effective)}</dd>
      <dt>备注</dt><dd>${escapeHtml(city.scope)}</dd>
      <dt>来源</dt><dd>${city.sources.map(sourceText).join('<br>')}</dd>
    </dl>`;
    $('#source-dialog').showModal();
  }

  $('#version').textContent = 'V' + FARE_DATA.meta.version;
  $('#source-date').textContent = '整理日期：' + FARE_DATA.meta.checkedOn;
  $('#distance').value = state.distance;
  $('#sort').value = state.sort;
  document.querySelector('input[name="mode"][value="' + state.mode + '"]').checked = true;
  renderCities();
  renderResults();
  renderSources();

  $('#distance').addEventListener('input', event => {
    state.distance = event.target.value;
    renderResults();
  });
  $('#query-form').addEventListener('submit', event => {
    event.preventDefault();
    renderResults();
    if (parseDistance(state.distance).error) $('#distance').focus();
    else if (window.innerWidth <= 720) $('.results').scrollIntoView({ block: 'start' });
  });
  document.querySelectorAll('input[name="mode"]').forEach(input => input.addEventListener('change', () => {
    state.mode = input.value;
    if (state.mode === 'single') state.selected = new Set([...state.selected].slice(0, 1));
    renderCities();
    renderResults();
  }));
  $('#city-list').addEventListener('change', event => {
    const input = event.target;
    if (!byId.has(input.value)) return;
    if (state.mode === 'single') state.selected = new Set([input.value]);
    else if (input.checked) state.selected.add(input.value);
    else state.selected.delete(input.value);
    $('#selected-count').textContent = '已选 ' + state.selected.size + ' 城';
    renderResults();
  });
  $('#city-search').addEventListener('input', renderCities);
  $('#select-all').addEventListener('click', () => {
    visibleCities().forEach(city => state.selected.add(city.id));
    renderCities();
    renderResults();
  });
  $('#clear-selection').addEventListener('click', () => {
    state.selected.clear();
    renderCities();
    renderResults();
  });
  $('#sort').addEventListener('change', event => {
    state.sort = event.target.value;
    renderResults();
  });
  document.addEventListener('click', event => {
    const detail = event.target.closest('[data-detail]');
    if (detail) {
      state.detail = detail.dataset.detail;
      renderDetail();
    }
    const source = event.target.closest('[data-source]');
    if (source) openSource(source.dataset.source);
  });
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
    const sources = button.dataset.view === 'sources';
    $('#query-view').hidden = sources;
    $('#sources-view').hidden = !sources;
    document.querySelectorAll('[data-view]').forEach(tab => {
      const active = tab === button;
      tab.classList.toggle('active', active);
      if (active) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    });
  }));
  $('#source-search').addEventListener('input', renderSources);
  $('#close-dialog').addEventListener('click', () => $('#source-dialog').close());
  $('#source-dialog').addEventListener('click', event => {
    if (event.target === $('#source-dialog')) $('#source-dialog').close();
  });
  $('#export-csv').addEventListener('click', () => {
    if (!rows.length) return;
    const km = parseDistance(state.distance).km;
    const csv = toCsv(rows, km, FARE_DATA.meta.checkedOn);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = '里程票价对比-' + km + '公里.csv';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
})();
