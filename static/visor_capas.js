(() => {
  'use strict';

  const fileNotice = document.querySelector('.map-file-notice');
  if (location.protocol === 'file:') {
    fileNotice.hidden = false;
    console.warn('El visor se abrió como file://. Inícialo con python app.py para cargar los GeoJSON.');
    return;
  }

  const definitions = {
    municipios: {
      label: 'Municipios',
      count: '8.212 entidades',
      color: '#7894b2',
      style: () => ({ stroke: false, weight: 0, opacity: 0, fillColor: '#00a6d6', fillOpacity: 0.92 })
    },
    provincias: {
      label: 'Provincias',
      count: '52 entidades',
      color: '#d78334',
      style: () => ({ color: '#8da0b4', weight: 1.05, opacity: 0.85, fillColor: '#ffffff', fillOpacity: 0.16 })
    },
    comarcas: {
      label: 'Entidades supramunicipales',
      count: '34 IDs · 604 relaciones',
      color: '#df3983',
      style: () => ({ stroke: false, weight: 0, opacity: 0, fillColor: '#ed168d', fillOpacity: 0.92 })
    }
  };

  const map = L.map('map', {
    preferCanvas: true,
    zoomControl: false,
    minZoom: 3,
    maxZoom: 17,
    zoomSnap: 0.25,
    zoomDelta: 0.5
  }).setView([38, -1], 4.8);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    minZoom: 3,
    maxZoom: 19,
    className: 'base-map-tiles',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
  }).addTo(map);
  L.control.zoom({ position: 'bottomright' }).addTo(map);

  const home = L.control({ position: 'bottomright' });
  home.onAdd = () => {
    const button = L.DomUtil.create('button', 'leaflet-bar leaflet-control map-home-button');
    button.type = 'button';
    button.title = 'Encuadrar España';
    button.setAttribute('aria-label', 'Encuadrar España');
    button.innerHTML = '<span aria-hidden="true">⌂</span>';
    L.DomEvent.disableClickPropagation(button);
    L.DomEvent.on(button, 'click', () => {
      if (spainBounds) map.fitBounds(spainBounds, { padding: [24, 24] });
      else map.setView([40.15, -3.4], 5.5);
    });
    return button;
  };
  home.addTo(map);

  const layerInstances = new Map();
  const layerPromises = new Map();
  let spainBounds = null;
  let statsPromise = null;
  const $ = selector => document.querySelector(selector);
  const status = $('#map-status');
  const substatus = $('#map-substatus');
  const loading = $('#loading-indicator');
  const indicator = $('#status-indicator');
  const insights = $('#entity-insights');
  const levelLabels = { municipio: 'Municipios', provincia: 'Provincias', comarca: 'Entidades supramunicipales' };
  const geographicTotals = { municipio: 8212, provincia: 52, comarca: 34 };
  const themeDefinitions = {
    municipios: { level: 'municipio', label: 'Municipios', code: properties => properties.NATCODE },
    provincias: { level: 'provincia', label: 'Provincias', code: properties => properties.NATCODE },
    comarcas: { level: 'comarca', label: 'Entidades supramunicipales', code: properties => properties.ID_COMARCA }
  };
  const themeColors = ['#fff7bc', '#fee391', '#fec44f', '#fe9929', '#ec7014', '#cc4c02', '#8c2d04'];
  const themePalettes = {
    municipios: ['#b6f4ff', '#72e7ff', '#35d4fa', '#00b8ed', '#008fde', '#086ac5', '#1648a5'],
    provincias: themeColors,
    comarcas: ['#ffd1ec', '#ff9cdb', '#fb67c3', '#f13da9', '#dc218f', '#b80f70', '#87064f']
  };
  const thematicStates = new Map(Object.keys(themeDefinitions).map(key => [key, false]));
  const thematicScales = new Map();
  const cmsThematicStates = new Map(Object.keys(themeDefinitions).map(key => [key, false]));
  const cmsScales = new Map();
  const usageThematicStates = new Map(Object.keys(themeDefinitions).map(key => [key, false]));
  const usageScales = new Map();
  let currentStats = null;
  let cmsStats = null;
  let cmsPromise = null;
  let usageStats = null;
  let usagePromise = null;
  let usageLevel = 'municipio';
  let usageMapLevel = 'municipio';
  let usageMetric = 'destinations';
  let usageMetricEnabled = false;
  let usageModuleName = '';
  let cmsTimelineStats = null;
  let cmsTimelinePromise = null;
  let cmsMetric = 'weekly-load';
  let cmsMetricEnabled = true;
  let cmsTimelineIndex = 6;
  let cmsLevel = 'municipio';
  let cmsMapLevel = 'provincia';
  let cmsLoadLevel = 'provincia';
  let cmsLoadMapEnabled = true;
  let activeDashboard = 'cms';
  const cmsCategoryLabels = {
    'Eventos': 'Eventos',
    'Recursos turísticos': 'Recursos turísticos',
    'Instalaciones y servicios turísticos': 'Instalaciones y servicios turísticos',
    'Organizaciones turísticas': 'Organizaciones turísticas',
    'Servicios turísticos': 'Servicios turísticos',
    'Destinos turísticos': 'Destinos turísticos',
    'Servicios públicos': 'Servicios públicos',
    'Ofertas especiales': 'Ofertas especiales',
    'Infraestructura de transporte': 'Infraestructura de transporte',
    'Otras (valor original)': 'Otras (valor original)'
  };
  const hiddenCmsCategories = new Set(['Otras (valor original)']);
  const cmsLayerKeys = { municipio: 'municipios', provincia: 'provincias', supramunicipal: 'comarcas' };
  const cmsColorsPositive = ['#fff1a8', '#ffd166', '#ffad33', '#f47721', '#dc3b31', '#b51c70', '#70145c'];
  const cmsColorsNegative = ['#67000d', '#a50f15', '#cb181d', '#ef3b2c', '#fb6a4a', '#fc9272', '#fee0d2'];
  const cmsColorsDiverging = ['#a50026', '#d73027', '#f46d43', '#fdae61', '#abd9e9', '#2c7bb6', '#313695'];
  let selectedStatsLevel = 'municipio';
  let timelineMonth = 0;
  const monthLabels = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  function safe(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  function setStatus(title, detail, mode = 'ready') {
    // The compact PID header removed the old status card. Keep this helper
    // safe when those optional status elements are not present in the DOM.
    if (status) status.textContent = title;
    if (substatus) substatus.textContent = detail;
    if (indicator) {
      indicator.classList.toggle('is-loading', mode === 'loading');
      indicator.classList.toggle('is-error', mode === 'error');
    }
  }

  function activeLayerNames() {
    return [...document.querySelectorAll('[data-layer]:checked')].map(input => definitions[input.dataset.layer].label);
  }

  function updateStatus() {
    const names = activeLayerNames();
    if (!names.length) {
      setStatus('Mapa sin capas activas', 'Activa una o varias capas desde el panel.');
    } else {
      setStatus(`${names.length} ${names.length === 1 ? 'capa activa' : 'capas activas'}`, names.join(' · '));
    }
  }

  function featureDetails(key, properties) {
    const name = properties.NAMEUNIT || 'Territorio sin nombre';
    if (key === 'comarcas') {
      return `<strong>${safe(properties.COMARCA || 'Entidad supramunicipal')}</strong><span>Municipio miembro: ${safe(name)}</span><span>NATCODE municipio: ${safe(properties.NATCODE || '—')}</span><span>ID entidad: ${safe(properties.ID_COMARCA || '—')}</span>`;
    }
    const level = key === 'municipios' ? 'Municipio' : 'Provincia';
    return `<strong>${safe(name)}</strong><span>${level}</span><span>NATCODE: ${safe(properties.NATCODE || '—')}</span>`;
  }

  function loadStats() {
    if (!statsPromise) {
      statsPromise = fetch('Data/visor_estadisticas.json', { cache: 'no-cache' }).then(response => {
        if (!response.ok) throw new Error(`No se pudieron cargar las estadísticas (${response.status}).`);
        return response.json();
      }).catch(error => {
        statsPromise = null;
        throw error;
      });
    }
    return statsPromise;
  }

  function loadCmsStats() {
    if (!cmsPromise) {
      cmsPromise = fetch('Data/visor_cms_stats.json', { cache: 'no-cache' }).then(response => {
        if (!response.ok) throw new Error(`No se pudieron cargar los datos del CMS (${response.status}).`);
        return response.json();
      }).catch(error => {
        cmsPromise = null;
        throw error;
      });
    }
    return cmsPromise;
  }

  function loadCmsTimeline() {
    if (!cmsTimelinePromise) {
      cmsTimelinePromise = fetch('Data/visor_cms_timeline.json', { cache: 'no-cache' }).then(response => {
        if (!response.ok) throw new Error(`No se pudo cargar la serie semanal del CMS (${response.status}).`);
        return response.json();
      }).catch(error => {
        cmsTimelinePromise = null;
        throw error;
      });
    }
    return cmsTimelinePromise;
  }

  function loadUsageStats() {
    if (!usagePromise) {
      usagePromise = fetch('Data/visor_usage_stats.json', { cache: 'no-cache' }).then(response => {
        if (!response.ok) throw new Error(`No se pudieron cargar los datos de uso (${response.status}).`);
        return response.json();
      }).then(statistics => {
        usageStats = statistics;
        return statistics;
      }).catch(error => {
        usagePromise = null;
        throw error;
      });
    }
    return usagePromise;
  }

  function formatCount(value) {
    return new Intl.NumberFormat('es-ES', { useGrouping: 'always' }).format(value || 0);
  }

  function renderDashboard(statistics) {
    currentStats = statistics;
    timelineMonth = Math.max(0, ...monthLabels.map((_, index) => {
      const monthlyTotal = Object.keys(levelLabels).reduce((sum, level) => sum + (Number(statistics.monthly_2026?.[level]?.[index]?.count) || 0), 0);
      return monthlyTotal ? index : -1;
    }));
    const kpis = Object.entries(levelLabels).map(([level, label]) => {
      const data = statistics.levels?.[level] || { areas: {} };
      const records = statistics.totals?.[level] || 0;
      const covered = Object.values(data.areas || {}).filter(area => area.records > 0).length;
      const total = geographicTotals[level];
      const layerKey = level === 'municipio' ? 'municipios' : level === 'provincia' ? 'provincias' : 'comarcas';
      thematicScales.set(layerKey, buildThematicScale(level));
      return `<article class="dashboard-kpi"><span>${label}</span><strong>${formatCount(records)}</strong><small>registros · ${formatCount(covered)} de ${formatCount(total)} con datos</small><i><b style="width:${Math.min(100, covered / total * 100).toFixed(1)}%"></b></i><label class="theme-toggle"><input type="checkbox" data-theme="${layerKey}" aria-label="Mostrar mapa temático de ${label.toLowerCase()}" disabled><span>Mapa temático</span></label></article>`;
    }).join('');
    $('#dashboard-kpis').innerHTML = kpis;
    document.querySelectorAll('[data-theme]').forEach(input => {
      input.disabled = false;
      input.addEventListener('change', event => setThematicLayer(event.target.dataset.theme, event.target.checked));
    });
    renderTypologyChart();
    renderEvolutionChart();
    renderThematicLegend();
  }

  function cmsMetricValue(area, metric) {
    if (!area) return 0;
    return metric === 'total' ? Number(area.total) || 0 : Number(area.categories?.[metric]) || 0;
  }

  function cmsCurrentMetricValue(level, area) {
    if (cmsMetric === 'weekly-load') {
      const timelineArea = cmsTimelineStats?.levels?.[level]?.areas?.[String(area?.code)];
      const value = timelineArea?.percentages?.[cmsTimelineIndex];
      return value == null ? null : Number(value);
    }
    return cmsMetricValue(area, cmsMetric);
  }

  function cmsMetricFormat(value) {
    if (cmsMetric === 'weekly-load') {
      return new Intl.NumberFormat('es-ES', { style: 'percent', maximumFractionDigits: 1 }).format(value || 0);
    }
    return cmsFormat(value);
  }

  function cmsFormat(value) {
    const numeric = Number(value) || 0;
    return `${numeric < 0 ? '−' : ''}${formatCount(Math.abs(numeric))}`;
  }

  function renderCmsDashboard(statistics) {
    cmsStats = statistics;
    cmsTimelineIndex = Math.max(0, Math.min((cmsTimelineStats?.dates?.length || 1) - 1, cmsTimelineIndex));
    const levelConfig = [
      { key: 'municipio', layer: 'municipios' },
      { key: 'provincia', layer: 'provincias' },
      { key: 'supramunicipal', layer: 'comarcas' }
    ];
    const metricOptions = [
      { value: 'total', label: 'Total neto', color: '#d78334' },
      ...statistics.categories.filter(name => !hiddenCmsCategories.has(name)).map((name, index) => ({ value: name, label: cmsCategoryLabels[name] || name, color: ['#45a28b', '#8b78ae', '#7894b2'][index % 3] }))
    ];
    $('#cms-map-layers').innerHTML = metricOptions.map(option => `<label class="cms-theme-option"><input type="checkbox" data-cms-map-metric="${safe(option.value)}"><i style="--cms-theme-color:${option.color}"></i><span>${safe(option.label)}</span></label>`).join('');
    document.querySelectorAll('[data-cms-map-metric]').forEach(input => input.addEventListener('change', event => setCmsMetricLayer(event.target.dataset.cmsMapMetric, event.target.checked)));

    document.querySelectorAll('[data-cms-map-level]').forEach(button => button.addEventListener('click', async () => {
      cmsMapLevel = button.dataset.cmsMapLevel;
      document.querySelectorAll('[data-cms-map-level]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
      if (cmsMetric === 'weekly-load') {
        cmsLoadLevel = cmsMapLevel;
        document.querySelectorAll('[data-cms-evolution-level]').forEach(other => other.setAttribute('aria-pressed', String(other.dataset.cmsEvolutionLevel === cmsLoadLevel)));
        renderCmsLoadEvolution();
      }
      if (!cmsMetricEnabled) return;
      const selectedLayer = cmsLayerForMapLevel(cmsMapLevel);
      for (const key of cmsThematicStates.keys()) if (key !== selectedLayer && cmsThematicStates.get(key)) await setCmsThematicLayer(key, false);
      await setCmsThematicLayer(selectedLayer, true);
      cmsMetricEnabled = true;
      syncCmsMetricInputs();
    }));

    document.querySelectorAll('[data-cms-evolution-level]').forEach(button => button.addEventListener('click', async () => {
      cmsLoadLevel = button.dataset.cmsEvolutionLevel;
      document.querySelectorAll('[data-cms-evolution-level]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
      renderCmsLoadEvolution();
      if (!cmsLoadMapEnabled) return;
      cmsMapLevel = cmsLoadLevel;
      document.querySelectorAll('[data-cms-map-level]').forEach(other => other.setAttribute('aria-pressed', String(other.dataset.cmsMapLevel === cmsMapLevel)));
      const selectedLayer = cmsLayerForMapLevel(cmsMapLevel);
      for (const key of cmsThematicStates.keys()) if (key !== selectedLayer && cmsThematicStates.get(key)) await setCmsThematicLayer(key, false);
      await setCmsThematicLayer(selectedLayer, true);
      cmsMetric = 'weekly-load';
      cmsMetricEnabled = true;
      cmsLoadMapEnabled = true;
      $('#cms-load-map-toggle').checked = true;
    }));
    $('#cms-load-map-toggle').addEventListener('change', event => setCmsLoadMap(event.target.checked));

    document.querySelectorAll('[data-cms-level]').forEach(button => button.addEventListener('click', () => {
      cmsLevel = button.dataset.cmsLevel;
      document.querySelectorAll('[data-cms-level]').forEach(other => other.setAttribute('aria-selected', String(other === button)));
      renderCmsCategoryChart();
      renderCmsLoadEvolution();
    }));
    rebuildCmsScales();
    renderCmsCategoryChart();
    renderCmsLoadEvolution();
    renderCmsLegend();
  }

  const usageLevelLabels = {
    municipio: 'Municipios',
    provincia: 'Provincias',
    supramunicipal: 'Entidades supramunicipales'
  };

  function renderUsageDashboard(statistics) {
    usageStats = statistics;
    const summary = statistics.summary;
    $('#usage-kpis').innerHTML = [
      ['Destinos registrados', summary.destinations, `${formatCount(summary.matched_destinations)} con código territorial`],
      ['Usuarios asociados', summary.users, 'Suma por destino; no son usuarios únicos'],
      ['Soluciones digitales', summary.modules, `${formatCount(summary.module_associations)} asociaciones destino-solución`]
    ].map(([label, value, detail]) => `<article class="usage-kpi"><span>${safe(label)}</span><strong>${formatCount(value)}</strong><small>${safe(detail)}</small></article>`).join('');
    const modules = statistics.modules.filter(module => !module.base);
    const moduleSelect = $('#usage-module-select');
    moduleSelect.innerHTML = '<option value="">Selecciona una solución</option>' + modules.map(module => `<option value="${safe(module.name)}">${safe(module.name)}</option>`).join('');
    usageModuleName = modules[0]?.name || '';
    moduleSelect.value = usageModuleName;
    $('#usage-map-coverage').textContent = `${formatCount(summary.matched_destinations)} de ${formatCount(summary.destinations)} destinos asociados a un código territorial. Los demás se conservan en los totales y no se pintan en el mapa.`;
    renderUsageCharts();
    rebuildUsageScales();
    renderUsageLegend();
  }

  function renderUsageCharts() {
    if (!usageStats) return;
    const level = usageStats.level_summaries?.[usageLevel];
    if (!level) return;
    const total = Number(level.destinations) || 0;
    $('#usage-level-label').textContent = usageLevelLabels[usageLevel];
    $('#usage-module-level-label').textContent = usageLevelLabels[usageLevel];
    $('#usage-status-total').textContent = `${formatCount(total)} destinos con código`;
    document.querySelectorAll('[data-usage-level]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.usageLevel === usageLevel)));
    const statusRows = [
      { label: 'Publicados', value: level.published, className: 'is-published' },
      { label: 'No publicados', value: level.unpublished, className: 'is-unpublished' }
    ];
    $('#usage-status-chart').innerHTML = statusRows.map(item => usageBarMarkup(item.label, item.value, total, item.className)).join('');
    const userRows = level.user_distribution || [];
    const maxUsers = Math.max(1, ...userRows.map(item => item.destinations));
    $('#usage-user-chart').innerHTML = userRows.map(item => usageBarMarkup(
      item.label === '0 usuarios' ? item.label : `${item.label} usuarios`,
      item.destinations,
      maxUsers
    )).join('');
    const moduleRows = usageStats.modules.filter(module => !module.base)
      .map(module => ({ name: module.name, value: Number(level.module_destinations?.[module.name]) || 0 }))
      .filter(module => module.value > 0)
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'es'))
      .slice(0, 8);
    const moduleMax = Math.max(1, ...moduleRows.map(item => item.value));
    $('#usage-module-chart').innerHTML = moduleRows.length
      ? moduleRows.map(item => usageBarMarkup(item.name, item.value, moduleMax, '', `${formatCount(item.value)} destinos`)).join('')
      : '<p class="stats-empty">No hay soluciones con destino asociado en este ámbito.</p>';
    renderUsageEvolution();
  }

  function usageBarMarkup(label, value, maximum, className = '', title = '') {
    const width = maximum ? Math.max(value ? 1 : 0, value / maximum * 100) : 0;
    return `<div class="usage-bar-row ${className}" title="${safe(title || `${formatCount(value)} destinos`)}"><div class="usage-bar-label"><span>${safe(label)}</span><strong>${formatCount(value)}</strong></div><div class="usage-bar-track"><i style="width:${Math.min(100, width).toFixed(1)}%"></i></div></div>`;
  }

  function renderUsageEvolution() {
    if (!usageStats) return;
    const months = usageStats.months || [];
    if (!months.length) {
      $('#usage-evolution-chart').innerHTML = '<p class="stats-empty">No hay fechas para representar.</p>';
      return;
    }
    const destinations = usageStats.monthly_destinations || [];
    const contracts = usageStats.monthly_contracts || [];
    const max = Math.max(1, ...destinations, ...contracts);
    const width = 880, height = 250, left = 58, right = 18, top = 14, bottom = 38;
    const plotWidth = width - left - right, plotHeight = height - top - bottom;
    const x = index => left + plotWidth * (months.length < 2 ? 0.5 : index / (months.length - 1));
    const y = value => top + plotHeight * (1 - value / max);
    const grids = Array.from({ length: 5 }, (_, index) => {
      const value = max * (4 - index) / 4, gy = y(value);
      return `<line x1="${left}" y1="${gy}" x2="${width - right}" y2="${gy}" class="usage-evolution-grid"/><text x="${left - 8}" y="${gy + 4}" text-anchor="end" class="usage-evolution-axis">${formatCount(Math.round(value))}</text>`;
    }).join('');
    const line = values => values.map((value, index) => `${x(index)},${y(Number(value) || 0)}`).join(' ');
    const labels = months.map((month, index) => {
      if (index % 3 !== 0 && index !== months.length - 1) return '';
      const [year, number] = month.split('-');
      const monthName = monthLabels[Number(number) - 1] || number;
      return `<text x="${x(index)}" y="${height - 10}" text-anchor="middle" class="usage-evolution-axis">${monthName} ${year.slice(-2)}</text>`;
    }).join('');
    $('#usage-evolution-chart').innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Altas mensuales de destinos y soluciones con fecha de contratación">${grids}<polyline points="${line(destinations)}" class="usage-evolution-destinations"/><polyline points="${line(contracts)}" class="usage-evolution-contracts"/>${labels}</svg><div class="usage-evolution-legend"><span><i></i>Altas de destinos</span><span><i></i>Soluciones con fecha registrada</span></div>`;
  }

  function cmsLayerForMapLevel(level) {
    return level === 'municipio' ? 'municipios' : level === 'provincia' ? 'provincias' : 'comarcas';
  }

  function syncCmsMetricInputs() {
    document.querySelectorAll('[data-cms-map-metric]').forEach(input => {
      input.checked = cmsMetricEnabled && input.dataset.cmsMapMetric === cmsMetric;
    });
  }

  async function setCmsLoadMap(enabled) {
    const selectedLayer = cmsLayerForMapLevel(cmsLoadLevel);
    if (enabled) {
      cmsMapLevel = cmsLoadLevel;
      document.querySelectorAll('[data-cms-map-level]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.cmsMapLevel === cmsMapLevel)));
      cmsMetric = 'weekly-load';
      for (const key of cmsThematicStates.keys()) if (key !== selectedLayer && cmsThematicStates.get(key)) await setCmsThematicLayer(key, false);
      await setCmsThematicLayer(selectedLayer, true);
      cmsMetricEnabled = true;
      cmsLoadMapEnabled = true;
      $('#cms-load-map-toggle').checked = true;
    } else {
      cmsLoadMapEnabled = false;
      if (cmsMetric === 'weekly-load') {
        cmsMetricEnabled = false;
        await setCmsThematicLayer(selectedLayer, false);
      }
      $('#cms-load-map-toggle').checked = false;
    }
    syncCmsMetricInputs();
    rebuildCmsScales();
    refreshCmsThematicLayers();
  }

  async function setCmsMetricLayer(metric, enabled) {
    cmsMetric = metric;
    const selectedLayer = cmsLayerForMapLevel(cmsMapLevel);
    if (enabled) {
      cmsLoadMapEnabled = false;
      $('#cms-load-map-toggle').checked = false;
      for (const key of cmsThematicStates.keys()) if (key !== selectedLayer && cmsThematicStates.get(key)) await setCmsThematicLayer(key, false);
      await setCmsThematicLayer(selectedLayer, true);
    } else {
      await setCmsThematicLayer(selectedLayer, false);
    }
    cmsMetricEnabled = enabled;
    syncCmsMetricInputs();
    rebuildCmsScales();
    refreshCmsThematicLayers();
  }

  function renderCmsCategoryChart() {
    if (!cmsStats) return;
    const level = cmsStats.levels[cmsLevel];
    const categories = cmsStats.categories.filter(name => !hiddenCmsCategories.has(name)).map(name => ({ name, value: Number(level.totals.categories[name]) || 0 }));
    const maximum = Math.max(1, ...categories.map(item => Math.abs(item.value)));
    $('#cms-category-level-label').textContent = level.label;
    $('#cms-category-chart').innerHTML = categories.map(({ name, value }) => `<div class="cms-category-row${value < 0 ? ' is-negative' : ''}"><div class="cms-category-label"><span>${safe(cmsCategoryLabels[name] || name)}</span><strong>${cmsFormat(value)}</strong></div><div class="cms-category-track"><i style="width:${Math.max(1, Math.abs(value) / maximum * 100).toFixed(1)}%" title="${cmsFormat(value)}"></i></div></div>`).join('');
  }

  function renderCmsLoadEvolution() {
    const dates = cmsTimelineStats?.dates || [];
    const areas = Object.values(cmsTimelineStats?.levels?.[cmsLoadLevel]?.areas || {});
    $('#cms-evolution-level-label').textContent = cmsStats?.levels?.[cmsLoadLevel]?.label || '—';
    if (!dates.length || !areas.length) {
      $('#cms-evolution-chart').innerHTML = '<p class="stats-empty">No hay datos semanales para este ámbito.</p>';
      return;
    }
    const baselineTotal = areas.reduce((sum, area) => {
      const baseline = Number(area.baseline_triplets_2026_09_24);
      return Number.isFinite(baseline) && baseline > 0 ? sum + baseline : sum;
    }, 0);
    const values = dates.map((_, index) => {
      if (!baselineTotal) return null;
      const loaded = areas.reduce((sum, area) => {
        const baseline = Number(area.baseline_triplets_2026_09_24);
        const percentage = area.percentages?.[index];
        return Number.isFinite(baseline) && baseline > 0 && percentage != null && Number.isFinite(Number(percentage))
          ? sum + baseline * Number(percentage)
          : sum;
      }, 0);
      return loaded / baselineTotal;
    });
    const valid = values.filter(value => value != null);
    if (!valid.length) {
      $('#cms-evolution-chart').innerHTML = '<p class="stats-empty">No hay porcentajes semanales para este ámbito.</p>';
      return;
    }
    const max = Math.max(1, ...valid) * 1.08;
    const width = 600, height = 320, left = 70, right = 20, top = 24, bottom = 54;
    const plotWidth = width - left - right, plotHeight = height - top - bottom;
    const x = index => left + (dates.length < 2 ? plotWidth / 2 : plotWidth * index / (dates.length - 1));
    const y = value => top + plotHeight * (1 - value / max);
    const grids = Array.from({ length: 5 }, (_, index) => {
      const value = max * (4 - index) / 4, gy = y(value);
      return `<line x1="${left}" y1="${gy}" x2="${width - right}" y2="${gy}" class="cms-evolution-grid"/><text x="${left - 10}" y="${gy + 5}" text-anchor="end" class="cms-evolution-axis">${Math.round(value * 100)}%</text>`;
    }).join('');
    const points = values.map((value, index) => value == null ? null : `${x(index)},${y(value)}`).filter(Boolean);
    const line = points.length > 1 ? `<polyline points="${points.join(' ')}" class="cms-evolution-line"/>` : '';
    const first = values.findIndex(value => value != null), last = values.findLastIndex(value => value != null);
    const area = last > first ? `<polygon points="${x(first)},${y(0)} ${points.join(' ')} ${x(last)},${y(0)}" class="cms-evolution-area"/>` : '';
    const markers = values.map((value, index) => value == null ? '' : `<circle cx="${x(index)}" cy="${y(value)}" r="6" class="cms-evolution-marker"><title>${safe(dates[index].label)}: ${new Intl.NumberFormat('es-ES', { style: 'percent', maximumFractionDigits: 1 }).format(value)} del contenido total de referencia</title></circle>`).join('');
    const labels = dates.map((date, index) => `<text x="${x(index)}" y="${height - 15}" text-anchor="middle" class="cms-evolution-axis">${safe(date.label)}</text>`).join('');
    $('#cms-evolution-chart').innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Contenido registrado por semana como porcentaje del total de referencia para ${safe(cmsStats?.levels?.[cmsLoadLevel]?.label || 'el ámbito seleccionado')}">${grids}${area}${line}${markers}${labels}</svg>`;
  }

  function rebuildCmsScales() {
    if (!cmsStats) return;
    for (const key of Object.keys(themeDefinitions)) {
      const level = themeDefinitions[key].level === 'comarca' ? 'supramunicipal' : themeDefinitions[key].level;
      if (cmsMetric === 'weekly-load') {
        const limits = [0.1, 0.25, 0.5, 0.75, 1, 1.5, Infinity];
        const labels = ['>0–10%', '>10–25%', '>25–50%', '>50–75%', '>75–100%', '>100–150%', '>150%'];
        let previous = 0;
        const bins = limits.map((maximum, index) => {
          const bin = { minimum: previous, maximum, label: labels[index], paletteIndex: index };
          previous = maximum;
          return bin;
        });
        cmsScales.set(key, { palette: cmsColorsPositive, bins });
        continue;
      }
      const values = Object.values(cmsStats.levels[level].areas).map(area => cmsMetricValue(area, cmsMetric)).filter(value => Number.isFinite(value) && value !== 0).sort((a, b) => a - b);
      const hasNegative = values[0] < 0;
      const hasPositive = values.at(-1) > 0;
      const palette = hasNegative && hasPositive
        ? ['#a50026', '#f46d43', '#fee08b', '#91bfdb', '#313695']
        : hasNegative
          ? ['#67000d', '#a50f15', '#cb181d', '#fb6a4a', '#fee0d2']
          : ['#fff1a8', '#ffd166', '#ffad33', '#f47721', '#b51c70'];
      const splitQuantiles = (items, classCount) => {
        if (!items.length) return [];
        const cuts = [];
        for (let index = 1; index < classCount; index += 1) {
          const cut = items[Math.ceil(index * items.length / classCount) - 1];
          if (cut > (cuts.at(-1) ?? -Infinity) && cut < items.at(-1)) cuts.push(cut);
        }
        let previous = -Infinity;
        return [...cuts, Infinity].map(cut => {
          const members = items.filter(value => value > previous && value <= cut);
          previous = cut;
          return members;
        }).filter(group => group.length);
      };
      const frequencies = new Map();
      values.forEach(value => frequencies.set(value, (frequencies.get(value) || 0) + 1));
      const mode = [...frequencies].sort((a, b) => b[1] - a[1])[0];
      let groups;
      if (mode && mode[1] / values.length >= 0.2 && frequencies.size > 1) {
        groups = [
          ...splitQuantiles(values.filter(value => value < mode[0]), 2),
          values.filter(value => value === mode[0]),
          ...splitQuantiles(values.filter(value => value > mode[0]), 2)
        ].filter(group => group.length);
      } else {
        groups = splitQuantiles(values, palette.length);
      }
      const bins = groups.map((members, index) => ({
        minimum: members[0],
        maximum: members.at(-1),
        count: members.length,
        paletteIndex: groups.length < 2 ? 2 : Math.round(index / (groups.length - 1) * (palette.length - 1))
      }));
      cmsScales.set(key, { palette, bins });
    }
  }

  function cmsScaleIndex(key, value) {
    const scale = cmsScales.get(key);
    return scale?.bins.find(bin => value >= bin.minimum && value <= bin.maximum)?.paletteIndex ?? 0;
  }

  function cmsAreaForFeature(key, feature) {
    if (!cmsStats) return null;
    const level = themeDefinitions[key].level === 'comarca' ? 'supramunicipal' : themeDefinitions[key].level;
    const code = themeDefinitions[key].code(feature?.properties || {});
    return cmsStats.levels[level].areas[String(code)];
  }

  function cmsTimelineAreaForFeature(key, feature) {
    const level = themeDefinitions[key].level === 'comarca' ? 'supramunicipal' : themeDefinitions[key].level;
    const code = themeDefinitions[key].code(feature?.properties || {});
    return cmsTimelineStats?.levels?.[level]?.areas?.[String(code)] || null;
  }

  function cmsStyleForFeature(key, feature) {
    const value = cmsMetric === 'weekly-load'
      ? cmsTimelineAreaForFeature(key, feature)?.percentages?.[cmsTimelineIndex]
      : cmsMetricValue(cmsAreaForFeature(key, feature), cmsMetric);
    const scale = cmsScales.get(key);
    if (value == null || !Number.isFinite(value) || value === 0 || !scale) return key === 'provincias'
      ? { color: '#ffffff', weight: 0.55, opacity: 0.9, fillColor: '#e4e8ec', fillOpacity: 0.76 }
      : { stroke: false, weight: 0, opacity: 0, fillColor: '#e1e5e9', fillOpacity: 0.92 };
    const fillColor = scale.palette[cmsScaleIndex(key, value)];
    return key === 'provincias'
      ? { color: '#ffffff', weight: 0.55, opacity: 0.9, fillColor, fillOpacity: 0.84 }
      : { stroke: false, weight: 0, opacity: 0, fillColor, fillOpacity: 0.96 };
  }

  function refreshCmsThematicLayers() {
    for (const [key, visible] of cmsThematicStates) {
      const layer = layerInstances.get(key);
      if (visible && layer && map.hasLayer(layer)) layer.setStyle(feature => styleForFeature(key, feature));
    }
    renderCmsLoadEvolution();
    renderCmsLegend();
  }

  function renderCmsLegend() {
    if (!cmsStats || [...thematicStates.values()].some(Boolean) || [...usageThematicStates.values()].some(Boolean)) return;
    const active = [...cmsThematicStates].filter(([, visible]) => visible).map(([key]) => key);
    const legend = $('#thematic-legend');
    if (!active.length) {
      legend.hidden = true;
      legend.replaceChildren();
      return;
    }
    const isWeeklyLoad = cmsMetric === 'weekly-load';
    const metricLabel = isWeeklyLoad ? 'Evolución de carga de recursos · % del 24/09' : cmsMetric === 'total' ? 'Total neto' : (cmsCategoryLabels[cmsMetric] || cmsMetric);
    const dates = cmsTimelineStats?.dates || [];
    const selectedDate = dates[cmsTimelineIndex]?.label || '24/09/2026';
    const timelineControl = isWeeklyLoad ? `<section class="timeline-control cms-timeline-control" aria-label="Fecha de carga de recursos CMS"><div class="timeline-heading"><strong>Evolución de carga de recursos</strong><output id="cms-timeline-date" for="cms-timeline-slider">${safe(selectedDate)}</output></div><label class="timeline-slider-label" for="cms-timeline-slider"><span class="sr-only">Seleccionar semana del mapa temático</span><input id="cms-timeline-slider" type="range" min="0" max="${Math.max(0, dates.length - 1)}" step="1" value="${cmsTimelineIndex}" aria-label="Semana de referencia de la carga CMS"></label><div class="timeline-caption"><span>${safe(dates[0]?.label || '')}</span><span>${safe(dates.at(-1)?.label || '')}</span></div><p>El 24/09/2026 es el 100% del contenido de referencia. Las semanas anteriores muestran cuánto contenido se había registrado hasta esa fecha. Si supera el 100% o luego baja, había más contenido en ese corte que en el total final, posiblemente por bajas posteriores o cambios en los datos.</p></section>` : '';
    legend.hidden = false;
    legend.innerHTML = `${timelineControl}<section class="legend-theme"><h3>CMS · ${safe(metricLabel)}</h3><small>${isWeeklyLoad ? 'Escala común para todas las semanas y ámbitos' : 'Rangos por cuantiles · territorios con dato'}</small><div class="legend-entry"><i style="background:#e4e8ec"></i><span>0 o sin datos</span></div>${active.map(key => {
      const scale = cmsScales.get(key);
      const title = definitions[key].label;
      const levelKey = themeDefinitions[key].level === 'comarca' ? 'supramunicipal' : themeDefinitions[key].level;
      const timelineLevel = cmsTimelineStats?.levels?.[levelKey];
      const covered = timelineLevel?.coverage_by_date?.[cmsTimelineIndex] ?? timelineLevel?.coded_territories ?? 0;
      const coverageNote = isWeeklyLoad ? `<small class="legend-coverage">${formatCount(covered)} de ${formatCount(timelineLevel?.territories_total || 0)} territorios con dato a ${safe(selectedDate)}</small>` : '';
      const rows = (scale?.bins || []).map(bin => `<div class="legend-entry"><i style="background:${scale.palette[bin.paletteIndex]}"></i><span>${isWeeklyLoad ? bin.label : `${cmsFormat(bin.minimum)}${bin.minimum === bin.maximum ? '' : ` a ${cmsFormat(bin.maximum)}`} <small>(${formatCount(bin.count)})</small>`}</span></div>`).join('');
      return `<section class="legend-theme"><h3>${safe(title)}</h3>${coverageNote}${rows}</section>`;
    }).join('')}`;
    $('#cms-timeline-slider')?.addEventListener('input', event => setCmsTimelineIndex(Number(event.target.value)));
  }

  const usagePalette = ['#fff0b3', '#ffd166', '#ffac38', '#f47721', '#dc3b72', '#8c1d61'];
  const usageMetricLabels = {
    destinations: 'Destinos registrados',
    users: 'Usuarios asociados',
    published: 'Destinos publicados',
    module: 'Destinos con solución seleccionada'
  };

  function usageLayerForLevel(level) {
    return level === 'municipio' ? 'municipios' : level === 'provincia' ? 'provincias' : 'comarcas';
  }

  function usageAreaForFeature(key, feature) {
    if (!usageStats) return null;
    const properties = feature?.properties || {};
    const code = key === 'comarcas' ? properties.ID_COMARCA : properties.NATCODE;
    const level = key === 'comarcas' ? 'supramunicipal' : key === 'provincias' ? 'provincia' : 'municipio';
    return usageStats.levels?.[level]?.[String(code)] || null;
  }

  function usageMetricValue(area) {
    if (!area) return 0;
    if (usageMetric === 'module') return Number(area.module_destinations?.[usageModuleName]) || 0;
    return Number(area[usageMetric]) || 0;
  }

  function rebuildUsageScales() {
    if (!usageStats) return;
    for (const key of Object.keys(themeDefinitions)) {
      const values = Object.values(usageStats.levels?.[themeDefinitions[key].level === 'comarca' ? 'supramunicipal' : themeDefinitions[key].level] || {})
        .map(area => usageMetricValue(area)).filter(value => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
      const cuts = [];
      for (let index = 1; index < usagePalette.length; index += 1) {
        const cut = values[Math.ceil(index * values.length / usagePalette.length) - 1];
        if (cut != null && cut > (cuts.at(-1) ?? -Infinity) && cut < values.at(-1)) cuts.push(cut);
      }
      let previous = 0;
      const bins = [...cuts, Infinity].map((maximum, index) => {
        const members = values.filter(value => value > previous && value <= maximum);
        previous = maximum;
        return members.length ? {
          minimum: members[0],
          maximum: members.at(-1),
          count: members.length,
          paletteIndex: binsIndex(index, usagePalette.length, cuts.length + 1)
        } : null;
      }).filter(Boolean);
      usageScales.set(key, { palette: usagePalette, bins });
    }
  }

  function binsIndex(index, paletteLength, binCount) {
    return binCount < 2 ? Math.floor(paletteLength / 2) : Math.round(index / (binCount - 1) * (paletteLength - 1));
  }

  function usageScaleIndex(key, value) {
    return usageScales.get(key)?.bins.find(bin => value >= bin.minimum && value <= bin.maximum)?.paletteIndex ?? 0;
  }

  function usageStyleForFeature(key, feature) {
    const value = usageMetricValue(usageAreaForFeature(key, feature));
    const scale = usageScales.get(key);
    if (!value || !scale) return key === 'provincias'
      ? { color: '#ffffff', weight: 0.55, opacity: 0.9, fillColor: '#e4e8ec', fillOpacity: 0.76 }
      : { stroke: false, weight: 0, opacity: 0, fillColor: '#e1e5e9', fillOpacity: 0.92 };
    const fillColor = scale.palette[usageScaleIndex(key, value)];
    return key === 'provincias'
      ? { color: '#ffffff', weight: 0.55, opacity: 0.9, fillColor, fillOpacity: 0.84 }
      : { stroke: false, weight: 0, opacity: 0, fillColor, fillOpacity: 0.96 };
  }

  function refreshUsageLayers() {
    for (const [key, visible] of usageThematicStates) {
      const layer = layerInstances.get(key);
      if (visible && layer && map.hasLayer(layer)) layer.setStyle(feature => styleForFeature(key, feature));
    }
    renderUsageLegend();
  }

  function renderUsageLegend() {
    const active = [...usageThematicStates].filter(([, visible]) => visible).map(([key]) => key);
    const legend = $('#thematic-legend');
    if (!usageStats || !active.length) {
      if (![...cmsThematicStates.values()].some(Boolean) && ![...thematicStates.values()].some(Boolean)) {
        legend.hidden = true;
        legend.replaceChildren();
      }
      return;
    }
    const metricLabel = usageMetric === 'module' && usageModuleName
      ? `${usageMetricLabels.module}: ${usageModuleName}`
      : usageMetricLabels[usageMetric];
    legend.hidden = false;
    legend.innerHTML = `<section class="legend-theme"><h3>PID · ${safe(metricLabel)}</h3><small>Rangos por cuantiles · ámbito seleccionado</small><div class="legend-entry"><i style="background:#e4e8ec"></i><span>0 · sin datos</span></div>${active.map(key => {
      const scale = usageScales.get(key);
      const level = themeDefinitions[key].level === 'comarca' ? 'supramunicipal' : themeDefinitions[key].level;
      const totalAreas = geographicTotals[themeDefinitions[key].level] || 0;
      const covered = Object.values(usageStats.levels?.[level] || {}).filter(area => area.destinations > 0).length;
      const rows = (scale?.bins || []).map(bin => `<div class="legend-entry"><i style="background:${scale.palette[bin.paletteIndex]}"></i><span>${formatCount(bin.minimum)}${bin.minimum === bin.maximum ? '' : `–${formatCount(bin.maximum)}`} <small>(${formatCount(bin.count)})</small></span></div>`).join('');
      return `<section class="legend-theme"><h3>${safe(definitions[key].label)}</h3><small class="legend-coverage">${formatCount(covered)} de ${formatCount(totalAreas)} territorios con destinos</small>${rows || '<small>Sin valores para pintar.</small>'}</section>`;
    }).join('')}<p class="cms-source-note">Las relaciones supramunicipales agregan los destinos de sus municipios miembros.</p></section>`;
  }

  async function setUsageMetricLayer(metric, enabled) {
    usageMetric = metric;
    const selectedLayer = usageLayerForLevel(usageMapLevel);
    if (enabled) {
      if ([...thematicStates.values()].some(Boolean) || [...cmsThematicStates.values()].some(Boolean) || [...usageThematicStates.values()].some(Boolean)) {
        await clearAllThematicLayers();
      }
      usageMetricEnabled = true;
      usageThematicStates.set(selectedLayer, true);
      document.querySelectorAll('[data-usage-map-metric]').forEach(input => { input.checked = input.dataset.usageMapMetric === metric; });
      rebuildUsageScales();
      const baseInput = document.querySelector(`[data-layer="${selectedLayer}"]`);
      if (!baseInput.checked) {
        baseInput.checked = true;
        await toggleLayer(selectedLayer, true);
      }
      const layer = layerInstances.get(selectedLayer);
      if (layer) layer.setStyle(feature => styleForFeature(selectedLayer, feature));
    } else {
      usageMetricEnabled = false;
      usageThematicStates.set(selectedLayer, false);
      document.querySelectorAll('[data-usage-map-metric]').forEach(input => { input.checked = false; });
      const baseInput = document.querySelector(`[data-layer="${selectedLayer}"]`);
      if (baseInput.checked) {
        baseInput.checked = false;
        await toggleLayer(selectedLayer, false);
      }
    }
    rebuildUsageScales();
    renderThematicLegend();
  }

  function setCmsTimelineIndex(index) {
    const maxIndex = Math.max(0, (cmsTimelineStats?.dates?.length || 1) - 1);
    cmsTimelineIndex = Math.max(0, Math.min(maxIndex, index));
    rebuildCmsScales();
    for (const [key, visible] of cmsThematicStates) {
      const layer = layerInstances.get(key);
      if (visible && layer && map.hasLayer(layer)) layer.setStyle(feature => styleForFeature(key, feature));
    }
    const date = cmsTimelineStats?.dates?.[cmsTimelineIndex]?.label || '—';
    const output = $('#cms-timeline-date');
    if (output) output.textContent = date;
    renderCmsLoadEvolution();
  }

  function renderEvolutionChart() {
    if (!currentStats) return;
    const series = currentStats.monthly_2026 || {};
    const monthly = Array.from({ length: 12 }, (_, index) => Object.keys(levelLabels).reduce(
      (sum, level) => sum + (Number(series[level]?.[index]?.count) || 0), 0
    ));
    const cumulative = monthly.map((value, index) => monthly.slice(0, index + 1).reduce((sum, count) => sum + count, 0));
    const max = Math.max(1, ...cumulative);
    const width = 900, height = 330, left = 76, right = 24, top = 24, bottom = 44;
    const plotWidth = width - left - right;
    const fmtAxis = value => {
      if (value >= 1_000_000) return `${(value / 1_000_000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} M`;
      if (value >= 1_000) return `${(value / 1_000).toLocaleString('es-ES', { maximumFractionDigits: 0 })} mil`;
      return formatCount(value);
    };
    const plotHeight = height - top - bottom;
    const x = index => left + (plotWidth * index / 11);
    const y = value => top + plotHeight * (1 - value / max);
    const ticks = 5;
    const grids = Array.from({ length: ticks + 1 }, (_, index) => {
      const value = max * (ticks - index) / ticks;
      const gy = y(value);
      return `<line x1="${left}" y1="${gy}" x2="${width - right}" y2="${gy}" class="evolution-grid"/><text x="${left - 10}" y="${gy + 5}" text-anchor="end" class="evolution-axis-label">${fmtAxis(value)}</text>`;
    }).join('');
    const points = cumulative.map((value, index) => `${x(index)},${y(value)}`).join(' ');
    const area = `${left},${y(0)} ${points} ${x(11)},${y(0)}`;
    const markers = cumulative.map((value, index) => `<circle cx="${x(index)}" cy="${y(value)}" r="5" class="evolution-marker"><title>${monthLabels[index]} 2026: ${formatCount(value)} registros acumulados</title></circle>`).join('');
    const months = monthLabels.map((month, index) => `<text x="${x(index)}" y="${height - 12}" text-anchor="middle" class="evolution-axis-label">${month}</text>`).join('');
    const lastValue = cumulative.findLast(value => value > 0) || 0;
    const latestMonth = [...cumulative.keys()].reverse().find(index => cumulative[index] > 0);
    const finalLabel = latestMonth === undefined ? '' : `<text x="${Math.min(x(latestMonth) + 10, width - right - 2)}" y="${Math.max(16, y(lastValue) - 10)}" text-anchor="end" class="evolution-end-label">${formatCount(lastValue)}</text>`;
    $('#evolution-chart').innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Total acumulado mensual de registros en 2026">${grids}<polygon points="${area}" class="evolution-area"/><polyline points="${points}" class="evolution-line"/>${markers}${months}${finalLabel}</svg><p class="evolution-total">Total cargado en 2026: <strong>${formatCount(lastValue)}</strong></p>`;
  }

  function buildThematicScale(level) {
    const values = Object.values(currentStats.levels?.[level]?.areas || {})
      .map(area => Number(area.records) || 0).filter(value => value > 0).sort((a, b) => a - b);
    const bins = [];
    const maximumValue = values.at(-1) || 0;
    const maximumClass = maximumValue ? Math.floor(Math.log10(maximumValue)) : -1;
    for (let index = 0; index <= maximumClass; index += 1) {
      const minimum = 10 ** index;
      const maximum = index === maximumClass ? maximumValue : (10 ** (index + 1)) - 1;
      bins.push({ minimum, maximum });
    }
    return { maximumValue, bins };
  }

  function statsForFeature(key, feature) {
    const config = themeDefinitions[key];
    const props = feature?.properties || {};
    return currentStats?.levels?.[config.level]?.areas?.[String(config.code(props))];
  }

  function styleForFeature(key, feature) {
    if (usageThematicStates.get(key)) return usageStyleForFeature(key, feature);
    if (cmsThematicStates.get(key)) return cmsStyleForFeature(key, feature);
    if (!thematicStates.get(key)) return definitions[key].style();
    const records = Number(statsForFeature(key, feature)?.cumulative_2026?.[timelineMonth]) || 0;
    const hasOutline = key === 'provincias';
    if (!records) return hasOutline
      ? { color: '#ffffff', weight: 0.55, opacity: 0.9, fillColor: '#e4e8ec', fillOpacity: 0.76 }
      : { stroke: false, weight: 0, opacity: 0, fillColor: '#e1e5e9', fillOpacity: 0.92 };
    const classIndex = Math.max(0, Math.floor(Math.log10(records)));
    const fillColor = themePalettes[key][Math.min(themePalettes[key].length - 1, classIndex)];
    return hasOutline
      ? { color: '#ffffff', weight: 0.55, opacity: 0.9, fillColor, fillOpacity: 0.82 }
      : { stroke: false, weight: 0, opacity: 0, fillColor, fillOpacity: 0.96 };
  }

  async function setThematicLayer(key, visible) {
    if (visible && ([...cmsThematicStates.values()].some(Boolean) || [...usageThematicStates.values()].some(Boolean))) await clearAllThematicLayers();
    if (visible && activeDashboard === 'cms') {
      activeDashboard = 'infodestinos';
      dashboardTabs.forEach(({ tab, panel }) => {
        const selected = tab.id === 'tab-no-ont';
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
        panel.hidden = !selected;
      });
    }
    thematicStates.set(key, visible);
    renderThematicLegend();
    const baseInput = document.querySelector(`[data-layer="${key}"]`);
    if (visible && !baseInput.checked) {
      baseInput.checked = true;
      await toggleLayer(key, true);
    } else if (!visible && baseInput.checked) {
      baseInput.checked = false;
      await toggleLayer(key, false);
    }
    const layer = layerInstances.get(key);
    if (layer && visible) layer.setStyle(feature => styleForFeature(key, feature));
    renderThematicLegend();
  }

  function renderThematicLegend() {
    const legend = $('#thematic-legend');
    if ([...usageThematicStates.values()].some(Boolean)) {
      renderUsageLegend();
      return;
    }
    if ([...cmsThematicStates.values()].some(Boolean)) {
      renderCmsLegend();
      return;
    }
    const active = [...thematicStates].filter(([, visible]) => visible).map(([key]) => key);
    legend.hidden = active.length === 0;
    if (!active.length) {
      legend.replaceChildren();
      return;
    }
    const { monthText, monthStatus } = timelineSummary(active);
    const timelineControl = `<section class="timeline-control" aria-label="Evolución mensual del mapa temático"><div class="timeline-heading"><strong>Evolución · 2026</strong><output id="timeline-month-label" for="timeline-slider">Datos hasta ${monthText}</output></div><label class="timeline-slider-label" for="timeline-slider"><span class="sr-only">Seleccionar mes del mapa</span><input id="timeline-slider" type="range" min="0" max="11" step="1" value="${timelineMonth}" aria-label="Mes de referencia del mapa temático"></label><div class="timeline-months">${monthLabels.map((month, index) => `<button type="button" data-timeline-month="${index}" class="${index === timelineMonth ? 'is-selected' : ''}" aria-pressed="${index === timelineMonth}">${month}</button>`).join('')}</div><p id="timeline-status">${monthStatus}</p><p class="timeline-note">El mapa cuenta registros con fecha de carga; los registros sin fecha no se pueden situar en el tiempo.</p></section>`;
    legend.innerHTML = timelineControl + active.map(key => {
      const config = themeDefinitions[key];
      const scale = thematicScales.get(key) || { maximumValue: 0, bins: [] };
      const bins = scale.bins;
      const rangeLabel = bin => `${formatCount(bin.minimum)}–${formatCount(bin.maximum)}`;
      const palette = themePalettes[key];
      const rows = [
        '<div class="legend-entry"><i style="background:#e4e8ec"></i><span>0 · sin registros</span></div>',
        ...bins.map((bin, index) => `<div class="legend-entry"><i style="background:${palette[index]}"></i><span>${rangeLabel(bin)} registros</span></div>`)
      ].join('');
      return `<section class="legend-theme"><h3>${config.label}</h3><small>Escala logarítmica · máximo total ${formatCount(scale.maximumValue)} registros</small>${rows}</section>`;
    }).join('');
    const slider = $('#timeline-slider');
    slider?.addEventListener('input', event => setTimelineMonth(Number(event.target.value)));
    legend.querySelectorAll('[data-timeline-month]').forEach(button => button.addEventListener('click', () => setTimelineMonth(Number(button.dataset.timelineMonth))));
  }

  function timelineSummary(active) {
    const timeline = currentStats?.monthly_2026 || {};
    const activeLevels = [...new Set(active.map(key => themeDefinitions[key].level))];
    const thisMonthLoads = activeLevels.reduce((sum, level) => sum + (Number(timeline[level]?.[timelineMonth]?.count) || 0), 0);
    const accumulatedLoads = activeLevels.reduce((sum, level) => {
      const areas = currentStats?.levels?.[level]?.areas || {};
      return sum + Object.values(areas).reduce((levelTotal, area) => levelTotal + (Number(area.cumulative_2026?.[timelineMonth]) || 0), 0);
    }, 0);
    const monthText = `${monthLabels[timelineMonth]} 2026`;
    const monthStatus = thisMonthLoads
      ? `${formatCount(thisMonthLoads)} nuevas cargas en las capas activas · ${formatCount(accumulatedLoads)} acumuladas`
      : `Sin nuevas cargas en las capas activas durante ${monthText}; se mantiene el acumulado anterior (${formatCount(accumulatedLoads)}).`;
    return { monthText, monthStatus };
  }

  function updateTimelineDisplay() {
    const active = [...thematicStates].filter(([, visible]) => visible).map(([key]) => key);
    const { monthText, monthStatus } = timelineSummary(active);
    const label = $('#timeline-month-label');
    const statusText = $('#timeline-status');
    const slider = $('#timeline-slider');
    if (label) label.textContent = `Datos hasta ${monthText}`;
    if (statusText) statusText.textContent = monthStatus;
    if (slider && Number(slider.value) !== timelineMonth) slider.value = String(timelineMonth);
    document.querySelectorAll('[data-timeline-month]').forEach(button => {
      const selected = Number(button.dataset.timelineMonth) === timelineMonth;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  function setTimelineMonth(monthIndex) {
    timelineMonth = Math.max(0, Math.min(11, monthIndex));
    for (const [key, visible] of thematicStates) {
      const layer = layerInstances.get(key);
      if (visible && layer && map.hasLayer(layer)) layer.setStyle(feature => styleForFeature(key, feature));
    }
    updateTimelineDisplay();
  }

  async function clearAllThematicLayers() {
    for (const states of [thematicStates, cmsThematicStates, usageThematicStates]) {
      for (const key of states.keys()) states.set(key, false);
    }
    document.querySelectorAll('[data-theme], [data-cms-theme], [data-cms-map-metric], [data-usage-map-metric]').forEach(input => { input.checked = false; });
    cmsMetricEnabled = false;
    cmsLoadMapEnabled = false;
    usageMetricEnabled = false;
    const loadMapToggle = $('#cms-load-map-toggle');
    if (loadMapToggle) loadMapToggle.checked = false;
    for (const key of layerInstances.keys()) {
      const layer = layerInstances.get(key);
      const base = document.querySelector(`[data-layer="${key}"]`);
      if (base) base.checked = false;
      if (layer && map.hasLayer(layer)) map.removeLayer(layer);
      layer?.setStyle(() => definitions[key].style());
    }
    renderThematicLegend();
    renderCmsLegend();
    renderUsageLegend();
    updateStatus();
  }

  async function setCmsThematicLayer(key, visible) {
    if (visible && activeDashboard !== 'cms') {
      activeDashboard = 'cms';
      dashboardTabs.forEach(({ tab, panel }) => {
        const selected = tab.id === 'tab-dashboard-two';
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
        panel.hidden = !selected;
      });
    }
    if (visible && ([...thematicStates.values()].some(Boolean) || [...usageThematicStates.values()].some(Boolean))) await clearAllThematicLayers();
    cmsThematicStates.set(key, visible);
    const baseInput = document.querySelector(`[data-layer="${key}"]`);
    if (visible && !baseInput.checked) {
      baseInput.checked = true;
      await toggleLayer(key, true);
    } else if (!visible && baseInput.checked && !thematicStates.get(key)) {
      baseInput.checked = false;
      await toggleLayer(key, false);
    }
    const layer = layerInstances.get(key);
    if (layer && visible) layer.setStyle(feature => styleForFeature(key, feature));
    renderCmsLegend();
  }

  function renderTypologyChart() {
    if (!currentStats) return;
    const level = selectedStatsLevel;
    const label = levelLabels[level];
    const data = currentStats.levels?.[level] || {};
    const types = data.typologies || [];
    const top = types.slice(0, 5);
    const otherCount = types.slice(5).reduce((sum, item) => sum + item.count, 0);
    if (otherCount) top.push({ name: 'Otras tipologías', count: otherCount, other: true });
    const total = currentStats.totals?.[level] || 0;
    $('#dashboard-chart-subtitle').textContent = label;
    document.querySelectorAll('[data-stats-level]').forEach(button => {
      const active = button.dataset.statsLevel === level;
      button.setAttribute('aria-selected', String(active));
    });
    $('#typology-chart').innerHTML = top.length ? top.map(item => {
      const percent = total ? item.count / total * 100 : 0;
      return `<div class="typology-row${item.other ? ' is-other' : ''}"><div class="typology-label"><span>${safe(item.name)}</span><strong>${formatCount(item.count)}</strong></div><div class="typology-track"><i style="width:${Math.min(100, percent).toFixed(1)}%"></i></div></div>`;
    }).join('') : '<p class="stats-empty">No hay registros por tipología.</p>';
    const dates = Object.values(data.areas || {}).flatMap(area => area.dates || []).filter(Boolean).sort();
    $('#dashboard-period').textContent = dates.length ? `Periodo de los registros: ${dates[0]} – ${dates[dates.length - 1]}` : 'Sin fechas disponibles';
  }

  function statisticsMarkup(key, properties, statistics) {
    const level = key === 'municipios' ? 'municipio' : key === 'provincias' ? 'provincia' : 'comarca';
    const code = key === 'comarcas' ? properties.ID_COMARCA : properties.NATCODE;
    const area = statistics.levels?.[level]?.areas?.[String(code)];
    if (!area || !area.records) {
      return '<section class="territory-stats"><h3>Datos de Infodestinos</h3><p class="stats-empty">No hay registros asociados a este código territorial.</p></section>';
    }

    const dates = area.dates || [];
    const types = Object.entries(area.typologies || {}).sort((a, b) => b[1] - a[1]);
    const topTypes = types.slice(0, 4);
    const otherCount = types.slice(4).reduce((sum, [, count]) => sum + count, 0);
    const rows = topTypes.map(([name, count]) => {
      const share = Math.max(0, Math.min(100, count / area.records * 100));
      return `<li><span>${safe(name)}</span><strong>${formatCount(count)}</strong><i><b style="width:${share.toFixed(1)}%"></b></i></li>`;
    }).join('');
    const others = otherCount ? `<li class="stats-other"><span>Otras tipologías</span><strong>${formatCount(otherCount)}</strong><i><b style="width:${Math.max(0, Math.min(100, otherCount / area.records * 100)).toFixed(1)}%"></b></i></li>` : '';

    const selectedMonthRecords = Number(area.cumulative_2026?.[timelineMonth]) || 0;
    return `<section class="territory-stats"><h3>Datos de Infodestinos</h3><div class="stats-grid"><div><strong>${formatCount(selectedMonthRecords)}</strong><span>registros acumulados hasta ${monthLabels[timelineMonth]} 2026</span></div><div><strong>${formatCount(area.destinations)}</strong><span>destinos</span></div></div><p class="stats-dates">Fechas disponibles: ${safe(dates[0] || '—')} – ${safe(dates[1] || '—')} · ${formatCount(area.records)} registros en total</p><h4>Registros por tipología</h4><ul>${rows}${others}</ul></section>`;
  }

  function cmsStatisticsMarkup(key, properties) {
    if (cmsMetric === 'weekly-load') {
      const timelineArea = cmsTimelineAreaForFeature(key, { properties });
      const date = cmsTimelineStats?.dates?.[cmsTimelineIndex]?.label || 'la fecha seleccionada';
      const percentage = timelineArea?.percentages?.[cmsTimelineIndex];
      if (percentage == null) return `<section class="territory-stats"><h3>Evolución de carga de recursos</h3><p class="stats-empty">Sin dato semanal para ${safe(date)}.</p></section>`;
      const baseline = timelineArea.baseline_triplets_2026_09_24;
      const baseNote = baseline == null ? '' : `<p class="stats-dates">Tripletas base del 24/09: ${formatCount(baseline)} · código ${safe(timelineArea.code)}</p>`;
      const percent = new Intl.NumberFormat('es-ES', { style: 'percent', maximumFractionDigits: 1 }).format(percentage);
      return `<section class="territory-stats"><h3>Evolución de carga de recursos</h3><div class="stats-grid"><div><strong>${percent}</strong><span>de su contenido de referencia a ${safe(date)}</span></div><div><strong>100%</strong><span>contenido registrado el 24/09/2026</span></div></div>${baseNote}</section>`;
    }
    const area = cmsAreaForFeature(key, { properties });
    if (!area || !area.source_rows) return '<section class="territory-stats"><h3>Datos CMS Semántico</h3><p class="stats-empty">No hay recuentos asociados a este código.</p></section>';
    const categories = Object.entries(area.categories || {}).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 6);
    const list = categories.map(([name, value]) => `<li><span>${safe(cmsCategoryLabels[name] || name)}</span><strong>${cmsFormat(value)}</strong></li>`).join('');
    const names = area.destinations?.slice(0, 4).map(safe).join(', ') || '—';
    return `<section class="territory-stats"><h3>Datos CMS Semántico</h3><div class="stats-grid"><div><strong>${cmsFormat(area.total)}</strong><span>saldo neto</span></div><div><strong>${formatCount(area.source_rows)}</strong><span>destinos sumados</span></div></div><p class="stats-dates">Código territorial: ${safe(area.code)} · ${safe(names)}</p><h4>Recuentos por categoría</h4><ul>${list}</ul></section>`;
  }

  function usageStatisticsMarkup(key, properties) {
    const code = key === 'comarcas' ? properties.ID_COMARCA : properties.NATCODE;
    const area = usageAreaForFeature(key, { properties });
    const title = key === 'comarcas' ? properties.COMARCA || 'Entidad supramunicipal' : properties.NAMEUNIT || 'Territorio';
    if (!area?.destinations) {
      return `<section class="territory-stats"><h3>Uso de los Servicios de la PID</h3><p class="stats-empty">No hay destinos asociados a este código territorial.</p></section>`;
    }
    const modules = Object.entries(area.module_destinations || {}).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([name, count]) => `<li><span>${safe(name)}</span><strong>${formatCount(count)}</strong></li>`).join('');
    const selectedModule = usageMetric === 'module' && usageModuleName
      ? `<p class="stats-dates">Destinos con ${safe(usageModuleName)}: ${formatCount(area.module_destinations?.[usageModuleName] || 0)}</p>` : '';
    const territoryCode = key === 'comarcas' ? `ID entidad: ${safe(code)}` : `NATCODE: ${safe(code)}`;
    const memberNote = key === 'comarcas' ? '<p class="stats-dates">Incluye los municipios miembros de esta entidad.</p>' : '';
    return `<section class="territory-stats"><h3>Uso de los Servicios de la PID</h3><div class="stats-grid"><div><strong>${formatCount(area.destinations)}</strong><span>destinos asociados</span></div><div><strong>${formatCount(area.users)}</strong><span>usuarios asociados</span></div></div><p class="stats-dates">${safe(title)} · ${territoryCode}</p><p class="stats-dates">Publicados: ${formatCount(area.published)} · No publicados: ${formatCount(area.unpublished)}</p>${memberNote}${selectedModule}<h4>Soluciones con más destinos</h4><ul>${modules || '<li><span>Sin soluciones registradas</span></li>'}</ul></section>`;
  }

  async function identifyFeature(key, properties, event) {
    const popup = L.popup({ maxWidth: 310, closeButton: true, autoPan: true })
      .setLatLng(event.latlng)
      .setContent(`<div class="territory-popup">${featureDetails(key, properties)}<section class="territory-stats"><h3>${activeDashboard === 'usage' ? 'Uso de los Servicios de la PID' : 'Datos de Infodestinos'}</h3><p class="stats-empty">Cargando estadísticas…</p></section></div>`)
      .openOn(map);
    try {
      if (usageThematicStates.get(key)) {
        await loadUsageStats();
        if (map._popup === popup) popup.setContent(`<div class="territory-popup">${featureDetails(key, properties)}${usageStatisticsMarkup(key, properties)}</div>`);
      } else if (cmsThematicStates.get(key)) {
        await loadCmsStats();
        if (map._popup === popup) popup.setContent(`<div class="territory-popup">${featureDetails(key, properties)}${cmsStatisticsMarkup(key, properties)}</div>`);
      } else {
        const statistics = await loadStats();
        if (map._popup === popup) popup.setContent(`<div class="territory-popup">${featureDetails(key, properties)}${statisticsMarkup(key, properties, statistics)}</div>`);
      }
    } catch (error) {
      const title = activeDashboard === 'usage' ? 'Uso de los Servicios de la PID' : activeDashboard === 'cms' ? 'Datos del CMS Semántico' : 'Datos de Infodestinos';
      if (map._popup === popup) popup.setContent(`<div class="territory-popup">${featureDetails(key, properties)}<section class="territory-stats"><h3>${title}</h3><p class="stats-empty">No se pudieron cargar las estadísticas. ${safe(error.message)}</p></section></div>`);
    }
  }

  function activeVisiblePriority() {
    // If several polygons are stacked, identify the smallest/more specific area first.
    return ['municipios', 'comarcas', 'provincias'].find(key => {
      const layer = layerInstances.get(key);
      return layer && map.hasLayer(layer);
    });
  }

  function featureContainsPoint(feature, latlng) {
    const point = [latlng.lng, latlng.lat];
    const geometry = feature?.geometry;
    if (!geometry) return false;

    function inRing(ring) {
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        const crosses = (yi > point[1]) !== (yj > point[1]) &&
          point[0] < ((xj - xi) * (point[1] - yi)) / ((yj - yi) || Number.EPSILON) + xi;
        if (crosses) inside = !inside;
      }
      return inside;
    }

    function inPolygon(rings) {
      return !!rings?.length && inRing(rings[0]) && !rings.slice(1).some(inRing);
    }

    if (geometry.type === 'Polygon') return inPolygon(geometry.coordinates);
    if (geometry.type === 'MultiPolygon') return geometry.coordinates.some(inPolygon);
    return false;
  }

  function onEachFeature(key, feature, layer) {
    const properties = feature.properties || {};
    const tooltip = key === 'comarcas'
      ? `${safe(properties.COMARCA || 'Entidad supramunicipal')}<br>${safe(properties.NAMEUNIT || '')}`
      : `${safe(properties.NAMEUNIT || 'Territorio')}<br>${safe(properties.NATCODE || '')}`;
    layer.bindTooltip(tooltip, { sticky: true, direction: 'auto', opacity: 0.96 });
    layer.on({
      mouseover: event => {
        const target = event.target;
        if (key === 'provincias') {
          const themed = thematicStates.get(key) || cmsThematicStates.get(key) || usageThematicStates.get(key);
          target.setStyle(themed
            ? { weight: 1.5, color: '#284764', opacity: 1, fillOpacity: 0.94 }
            : { weight: 2, color: '#284764', opacity: 1, fillOpacity: 0.25 });
        } else {
          target.setStyle({ stroke: false, weight: 0, opacity: 0, fillOpacity: 1 });
        }
        if (target.bringToFront) target.bringToFront();
      },
      mouseout: event => {
        const instance = layerInstances.get(key);
        if (instance) instance.resetStyle(event.target);
      },
      click: event => {
        const topLayer = activeVisiblePriority();
        if (topLayer && topLayer !== key) {
          // Canvas can return the outer province even when the click is on an
          // overlaid municipality; prefer the most specific active feature.
          const specific = layerInstances.get(topLayer);
          let identified = false;
          specific?.eachLayer(candidate => {
            if (identified) return;
            const candidateFeature = candidate.feature;
            if (!candidateFeature || !candidate.getBounds?.().contains(event.latlng)) return;
            if (!featureContainsPoint(candidateFeature, event.latlng)) return;
            identified = true;
            identifyFeature(topLayer, candidateFeature.properties || {}, event);
          });
          if (identified) return;
        }
        identifyFeature(key, properties, event);
      }
    });
  }

  async function loadLayer(key) {
    if (layerInstances.has(key)) return layerInstances.get(key);
    if (layerPromises.has(key)) return layerPromises.get(key);

    const pending = (async () => {
      loading.classList.add('visible');
      try {
        setStatus(`Cargando ${definitions[key].label.toLowerCase()}`, `${definitions[key].count} · geometría local`, 'loading');
        const response = await fetch(`Data/visor_${key}.geojson.gz`, { cache: 'force-cache' });
        if (!response.ok) throw new Error(`No se pudo cargar la capa de ${definitions[key].label.toLowerCase()} (${response.status}).`);
        if (typeof DecompressionStream === 'undefined') {
          throw new Error('Este navegador no permite descomprimir las capas geográficas. Actualízalo para continuar.');
        }
        const decompressed = response.body.pipeThrough(new DecompressionStream('gzip'));
        const collection = await new Response(decompressed).json();
        const layer = L.geoJSON(collection, {
          renderer: L.canvas({ padding: 0.18 }),
          style: feature => styleForFeature(key, feature),
          onEachFeature: (feature, featureLayer) => onEachFeature(key, feature, featureLayer),
          smoothFactor: key === 'municipios' ? 1.2 : 0.6
        });
        layerInstances.set(key, layer);
        if (key === 'provincias') spainBounds = layer.getBounds();
        return layer;
      } finally {
        loading.classList.remove('visible');
        layerPromises.delete(key);
      }
    })();
    layerPromises.set(key, pending);
    return pending;
  }

  async function toggleLayer(key, visible) {
    const input = document.querySelector(`[data-layer="${key}"]`);
    input.disabled = true;
    try {
      if (visible) {
        const layer = await loadLayer(key);
        // The user may switch dashboards (which clears layers) while the large
        // GeoJSON is still loading. Respect the latest checkbox state.
        if (!input.checked) return;
        layer.setStyle(feature => styleForFeature(key, feature));
        if (!map.hasLayer(layer)) layer.addTo(map);
        if (key === 'provincias' && !spainBounds) spainBounds = layer.getBounds();
        if (key === 'provincias' && map.getZoom() < 5) map.fitBounds(layer.getBounds(), { padding: [24, 24] });
      } else {
        const layer = layerInstances.get(key);
        if (layer && map.hasLayer(layer)) map.removeLayer(layer);
        const themeInput = document.querySelector(`[data-theme="${key}"]`);
        const cmsThemeInput = document.querySelector(`[data-cms-theme="${key}"]`);
        const usageThemeInput = document.querySelector(`[data-usage-map-metric]:checked`);
        if (themeInput?.checked) {
          themeInput.checked = false;
          thematicStates.set(key, false);
        }
        if (cmsThemeInput?.checked) {
          cmsThemeInput.checked = false;
          cmsThematicStates.set(key, false);
        }
        if (usageThemeInput && usageThematicStates.get(key)) {
          usageThemeInput.checked = false;
          usageThematicStates.set(key, false);
          usageMetricEnabled = false;
        }
        layer?.setStyle(() => definitions[key].style());
        renderThematicLegend();
        renderCmsLegend();
        renderUsageLegend();
      }
      updateStatus();
    } catch (error) {
      console.error(error);
      input.checked = false;
      setStatus('No se pudo cargar la capa', error.message, 'error');
    } finally {
      input.disabled = false;
    }
  }

  document.querySelectorAll('[data-layer]').forEach(input => {
    input.addEventListener('change', event => toggleLayer(event.target.dataset.layer, event.target.checked));
  });

  document.querySelectorAll('[data-stats-level]').forEach(button => {
    button.addEventListener('click', () => {
      selectedStatsLevel = button.dataset.statsLevel;
      renderTypologyChart();
    });
  });

  const dashboardTabs = [
    { tab: $('#tab-no-ont'), panel: $('#entity-insights') },
    { tab: $('#tab-dashboard-two'), panel: $('#dashboard-two') },
    { tab: $('#tab-usage'), panel: $('#usage-dashboard') }
  ];
  dashboardTabs.forEach(({ tab, panel }) => {
    tab.addEventListener('click', async () => {
      activeDashboard = tab.id === 'tab-dashboard-two' ? 'cms' : tab.id === 'tab-usage' ? 'usage' : 'infodestinos';
      dashboardTabs.forEach(({ tab: otherTab, panel: otherPanel }) => {
        const selected = otherTab === tab;
        otherTab.setAttribute('aria-selected', String(selected));
        otherTab.tabIndex = selected ? 0 : -1;
        otherPanel.hidden = !selected;
      });
      await clearAllThematicLayers();
      if (activeDashboard === 'usage') {
        try {
          renderUsageDashboard(await loadUsageStats());
        } catch (error) {
          $('#usage-kpis').innerHTML = `<p class="stats-empty">No se pudieron cargar los datos de uso: ${safe(error.message)}</p>`;
        }
      }
    });
  });

  document.querySelectorAll('[data-usage-level]').forEach(button => button.addEventListener('click', () => {
    usageLevel = button.dataset.usageLevel;
    renderUsageCharts();
  }));
  document.querySelectorAll('[data-usage-map-level]').forEach(button => button.addEventListener('click', async () => {
    usageMapLevel = button.dataset.usageMapLevel;
    document.querySelectorAll('[data-usage-map-level]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
    if (usageMetricEnabled) await setUsageMetricLayer(usageMetric, true);
  }));
  document.querySelectorAll('[data-usage-map-metric]').forEach(input => input.addEventListener('change', event => {
    setUsageMetricLayer(event.target.dataset.usageMapMetric, event.target.checked);
  }));
  $('#usage-module-select').addEventListener('change', event => {
    usageModuleName = event.target.value;
    if (usageMetric !== 'module') return;
    rebuildUsageScales();
    refreshUsageLayers();
  });

  map.on('resize', () => map.invalidateSize());
  loadStats().then(renderDashboard).catch(error => {
    $('#typology-chart').innerHTML = `<p class="stats-empty">No se pudieron cargar las estadísticas: ${safe(error.message)}</p>`;
  });
  Promise.all([loadCmsStats(), loadCmsTimeline()]).then(async ([statistics, timeline]) => {
    cmsTimelineStats = timeline;
    renderCmsDashboard(statistics);
    await setCmsThematicLayer('provincias', true);
  }).catch(error => {
    $('#cms-map-layers').innerHTML = `<p class="stats-empty">No se pudieron cargar los datos del CMS: ${safe(error.message)}</p>`;
  });
})();
