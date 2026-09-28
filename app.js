(() => {
"use strict";

const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const AREA_MAP = {medical:"Médica",commercial:"Comercial",sac:"Sac",portfolio:"Cartera"};
const AREA_LABEL = {medical:"Área Médica",commercial:"Área Comercial",sac:"Área SAC",portfolio:"Área Cartera"};
const OP_CLASSES = new Set(["Peticiones","Quejas"]);

const COLORS = {
  navy:"#40536b", navy2:"#6d7f93", red:"#d43a2f", red2:"#e56a61",
  green:"#278a62", amber:"#d29b24", orange:"#df6d2f",
  light:"#dce4ee", slate:"#9aa7b6"
};

const state = {
  view:"summary",
  records:[],
  medical:null,
  meta:{},
  sourceMode:"snapshot",
  filters:{
    year:new Set(), month:new Set(), country:new Set(), city:new Set(), area:new Set(), classification:new Set(), situation:new Set(), b2b:new Set()
  },
  trackingFilters:{area:new Set()},
  charts:[],
  chartSelections:new Map(),
  trackingDetail:{
    open:false,
    criteria:null,
    search:"",
    sort:"days-desc",
    rows:[],
    trigger:null
  },
  kpiDetail:{
    open:false,type:null,rows:[],search:"",sort:"radicado-asc",page:1,pageSize:50,trigger:null
  },
  commercialSemanticSort:{key:"cases",direction:"desc"},
  motivesSort:"volume-desc",
  motivesMatrixSort:{key:"",direction:"desc"}
};

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const fmt = new Intl.NumberFormat("es-CO");

function percent(v, digits=1){
  return `${((Number.isFinite(v)?v:0)*100).toFixed(digits)}%`;
}
function n(v){ return fmt.format(Math.round(v||0)); }
function clean(v){ return (v ?? "").toString().trim(); }
function num(v){
  if(v === "" || v === null || v === undefined) return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}
function esc(v){
  return clean(v).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
}
function safeDiv(a,b){ return b ? a/b : 0; }

const COMMERCIAL_VERBATIM = window.PQRS_COMMERCIAL_VERBATIM || null;
const COMMERCIAL_VERBATIM_MAP = new Map((COMMERCIAL_VERBATIM?.records||[]).map(r=>[clean(r[0]),r]));

function enrichCommercialSemantic(record){
  record.semanticCountryEligible=record.area==="Comercial" && record.country===(COMMERCIAL_VERBATIM?.meta?.eligibleCountry||"Colombia");
  record.semanticAvailable=false;
  record.causeGroup="";
  record.submotive="";
  record.semanticConfidence="";
  record.requiresReview=false;
  record.semanticCauseState="";
  const semantic=COMMERCIAL_VERBATIM_MAP.get(`${record.country}|${record.radicado}`);
  if(semantic && record.area==="Comercial"){
    const dicts=COMMERCIAL_VERBATIM?.dicts||{};
    record.semanticAvailable=true;
    record.causeGroup=dicts.groupCause?.[semantic[1]]||"";
    record.submotive=dicts.submotive?.[semantic[2]]||"";
    record.semanticConfidence=dicts.confidence?.[semantic[3]]||"";
    record.requiresReview=Number(semantic[4])===1;
    record.semanticCauseState=dicts.causeState?.[semantic[5]]||"";
  }
  return record;
}

function decodeBootstrap(){
  const b = window.PQRS_BOOTSTRAP;
  if(!b) throw new Error("No se encontró el snapshot inicial.");
  const d = b.dicts;
  state.records = b.records.map(r => enrichCommercialSemantic({
    year:d.year[r[0]], month:d.month[r[1]], country:d.country[r[2]],
    classification:d.classification[r[3]], area:d.area[r[4]], state:d.state[r[5]],
    openDays:r[6], closedDays:r[7], openRange:d.openRange[r[8]], closedRange:d.closedRange[r[9]],
    flag05:r[10], flag015:r[11], motive:d.motive[r[12]], responsible:d.responsible[r[13]],
    city:d.city[r[14]], regional:d.regional[r[15]], b2b:d.b2b[r[16]],
    convenio:d.convenio[r[17]], situation:d.situation[r[18]],
    radicado:clean(r[19])
  }));
  state.medical = b.medical;
  state.meta = {...b.meta, commercialVerbatim:COMMERCIAL_VERBATIM?.meta||null, loadedAt:new Date().toLocaleString("es-CO")};
  initFilters(true);
}

function unique(field){
  const values = [...new Set(state.records.map(r => r[field]).filter(v => clean(v)!==""))];
  if(field==="month") return values.sort((a,b)=>MONTHS.indexOf(a)-MONTHS.indexOf(b));
  return values.sort((a,b)=>String(a).localeCompare(String(b),"es",{numeric:true}));
}

function initFilters(usePreset=false){
  const years=unique("year"), months=unique("month"), countries=unique("country"),
        cities=unique("city"), classes=unique("classification"), areas=unique("area"), situations=unique("situation"), b2b=unique("b2b");
  state.filters.year=new Set(years);
  const preset = (state.meta.defaultMonths || months.slice(-4)).filter(m=>months.includes(m));
  state.filters.month=new Set(usePreset ? preset : months);
  state.filters.country=new Set(countries);
  state.filters.city=new Set(cities);
  state.filters.classification=new Set(classes);
  state.filters.area=new Set(areas);
  state.trackingFilters.area=new Set(areas);
  state.filters.situation=new Set(situations);
  state.filters.b2b=new Set(b2b);
  renderFilters();
  updateSourceLabels();
}

const MONTH_SHORT = {
  Enero:"Ene", Febrero:"Feb", Marzo:"Mar", Abril:"Abr", Mayo:"May", Junio:"Jun",
  Julio:"Jul", Agosto:"Ago", Septiembre:"Sep", Octubre:"Oct", Noviembre:"Nov", Diciembre:"Dic"
};

function filterValues(field){ return unique(field); }

function getFilterSet(field){
  return state.view==="tracking"&&field==="area" ? state.trackingFilters.area : state.filters[field];
}

function setFilterSet(field,values){
  if(state.view==="tracking"&&field==="area") state.trackingFilters.area=values;
  else state.filters[field]=values;
}

function isAllSelected(field, values=filterValues(field)){
  return values.length > 0 && getFilterSet(field).size === values.length;
}

function filterSelectionLabel(field, values=filterValues(field)){
  const selected=[...getFilterSet(field)];
  if(selected.length===0) return ["classification","city","area","situation"].includes(field)?"Ninguna":"Ninguno";
  if(isAllSelected(field, values)){
    if(["classification","city","area","situation"].includes(field)) return "Todas";
    return "Todos";
  }
  if(field==="month"){
    const ordered=MONTHS.filter(m=>getFilterSet("month").has(m));
    const indexes=ordered.map(month=>MONTHS.indexOf(month));
    const contiguous=indexes.every((value,index)=>index===0||value===indexes[index-1]+1);
    if(ordered.length>1&&contiguous) return `${MONTH_SHORT[ordered[0]]||ordered[0]}–${MONTH_SHORT[ordered.at(-1)]||ordered.at(-1)}`;
    if(ordered.length<=3) return ordered.join(" · ");
    return `${ordered.length} meses`;
  }
  if(selected.length===1) return selected[0];
  if(selected.length===2) return `${selected[0]} + ${selected[1]}`;
  return `${selected.length} seleccionados`;
}

function selectedPeriodLabel(){
  const months=MONTHS.filter(m=>getFilterSet("month").has(m));
  const years=[...getFilterSet("year")].sort();
  const yearLabel=years.length===1?years[0]:years.join("/");
  if(!months.length) return `Sin periodo ${yearLabel}`.trim();
  const idx=months.map(m=>MONTHS.indexOf(m));
  const contiguous=idx.every((v,i)=>i===0 || v===idx[i-1]+1);
  const monthLabel=contiguous && months.length>1
    ? `${MONTH_SHORT[months[0]]||months[0]}–${MONTH_SHORT[months.at(-1)]||months.at(-1)}`
    : months.map(m=>MONTH_SHORT[m]||m).join(" · ");
  return `${monthLabel} ${yearLabel}`.trim();
}

function selectedDimensionLabel(field, allText="Todos"){
  const values=filterValues(field);
  if(isAllSelected(field, values)) return allText;
  const selected=[...getFilterSet(field)];
  if(selected.length===1) return selected[0];
  return `${selected.length} seleccionados`;
}

function activeFilterConfig(){
  if(state.view==="summary") return [
    ["year","Año"],
    ["month","Mes"],
    ["country","País"],
    ["classification","Clasificación"],
    ["area","Área"]
  ];
  if(state.view==="motives") return [
    ["year","Año"],
    ["month","Mes"],
    ["country","País"],
    ["city","Ciudad"],
    ["area","Área"],
    ["classification","Clasificación"],
    ["situation","Situación"]
  ];
  if(state.view==="tracking") return [
    ["month","Periodo"],
    ["year","Año"],
    ["country","País"],
    ["classification","Clasificación"],
    ["area","Área"],
    ["b2b","Segmentación"]
  ];
  return [
    ["month","Periodo"],
    ["year","Año"],
    ["country","País"],
    ["classification","Clasificación"],
    ["b2b","Segmentación"]
  ];
}

function activeFilterFields(){
  return activeFilterConfig().map(([field])=>field);
}

function defaultFilterValues(field){
  const values=filterValues(field);
  if(field==="month"){
    const preset=(state.meta.defaultMonths||values.slice(-4)).filter(value=>values.includes(value));
    return preset.length?preset:values;
  }
  return values;
}

function isFilterActive(field){
  const selected=getFilterSet(field);
  const defaults=defaultFilterValues(field);
  return selected.size!==defaults.length || defaults.some(value=>!selected.has(value));
}

function activeFilterDimensions(){
  return activeFilterFields().filter(isFilterActive).length;
}

function clearSingleFilter(field){
  setFilterSet(field,new Set(defaultFilterValues(field)));
  renderFilters();
  renderCurrentView();
  pulseFilteredContent();
}

function activeFilterLabel(field){
  if(field==="month") return filterSelectionLabel(field,filterValues(field));
  return filterSelectionLabel(field,filterValues(field));
}

function renderActiveFilterSummary(){
  const config=activeFilterConfig();
  const active=config.filter(([field])=>isFilterActive(field));
  const count=active.length;
  const badge=$("#filterActiveCount");
  if(badge){
    badge.hidden=count===0;
    badge.textContent=`${count} ${count===1?"filtro activo":"filtros activos"}`;
  }
  const motivesBadge=$("#motivesActiveCount");
  if(motivesBadge){motivesBadge.hidden=count===0;motivesBadge.textContent=`${count} ${count===1?"filtro activo":"filtros activos"}`;}
  const chips=$("#filterActiveChips");
  if(chips){
    chips.innerHTML=active.map(([field,label])=>`<button class="filter-chip" type="button" data-clear-filter="${field}" aria-label="Quitar filtro ${esc(label)}: ${esc(activeFilterLabel(field))}" title="Quitar ${esc(label)}"><span>${esc(label)}: ${esc(activeFilterLabel(field))}</span><b aria-hidden="true">Ã—</b></button>`).join("");
    chips.hidden=count===0;
  }
  const motivesChips=$("#motivesActiveChips");
  if(motivesChips){motivesChips.innerHTML=active.map(([field,label])=>`<button class="filter-chip" type="button" data-clear-filter="${field}" aria-label="Quitar filtro ${esc(label)}: ${esc(activeFilterLabel(field))}"><span>${esc(label)}: ${esc(activeFilterLabel(field))}</span><b aria-hidden="true">Ã—</b></button>`).join("");motivesChips.hidden=count===0;}
  const reset=$("#resetBtn");
  if(reset){reset.disabled=count===0;reset.setAttribute("aria-disabled",count===0?"true":"false");}
  const mobileReset=$("#filterMobileReset");
  if(mobileReset) mobileReset.disabled=count===0;
}

function updateMobileFilterToggle(){
  const count=activeFilterDimensions();
  const el=$("#mobileActiveFilters");
  if(el) el.textContent=String(count);
}

function closeAllFilterPopovers(except=null,returnFocus=false){
  $$(".filter-dropdown[open]").forEach(d=>{
    if(d!==except){
      const trigger=d.querySelector("summary");
      d.removeAttribute("open");
      trigger?.setAttribute("aria-expanded","false");
      if(returnFocus) trigger?.focus();
    }
  });
}

function refreshFilterLabels(){
  $$(".filter-dropdown").forEach(drop=>{
    const field=drop.dataset.field;
    const value=drop.querySelector(".filter-trigger-value");
    const label=filterSelectionLabel(field, filterValues(field));
    if(value){value.textContent=label;value.title=label;}
    drop.querySelector("summary")?.setAttribute("aria-label",`${drop.querySelector(".filter-trigger-label")?.textContent||field}: ${label}`);
    const active=isFilterActive(field);
    drop.classList.toggle("filter-control--active",active);
    drop.querySelector(".filter-clear")?.toggleAttribute("hidden",!active);
  });
  updateFilterContext();
  updateMobileFilterToggle();
  renderActiveFilterSummary();
}

function normalizeFilterSearch(value){
  return clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("es");
}

function pulseFilteredContent(){
  const view=$("#view");
  if(!view) return;
  view.classList.remove("filter-results-updated");
  requestAnimationFrame(()=>view.classList.add("filter-results-updated"));
  clearTimeout(pulseFilteredContent._timer);
  pulseFilteredContent._timer=setTimeout(()=>view.classList.remove("filter-results-updated"),180);
}

function restoreOpenFilter(field){
  if(!field) return;
  requestAnimationFrame(()=>{
    const drop=document.querySelector(`.filter-dropdown[data-field="${field}"]`);
    if(!drop) return;
    drop.open=true;
    drop.querySelector("summary")?.setAttribute("aria-expanded","true");
  });
}

function renderFilters(){
  const mobileTarget=$("#filterMobileDrawer")?.getAttribute("aria-hidden")==="false" ? $("#filterMobileContent") : null;
  const integratedTarget=!mobileTarget&&state.view==="motives" ? $("#motivesGlobalFilters") : null;
  const target=mobileTarget || integratedTarget || $("#filters");
  const topTarget=$("#filters");
  if(!target) return;
  if((integratedTarget||mobileTarget) && topTarget) topTarget.innerHTML="";

  const cfg=activeFilterConfig().map(([field,label])=>[field,label,unique(field)]);
  const prefix=mobileTarget?"mobile-filter":integratedTarget?"motives-global-filter":"filter";

  target.innerHTML=cfg.map(([field,label,vals])=>{
    const menuId=`${prefix}-menu-${field}`;
    const gridClass=field==="month"?"filter-options-grid month-grid":"filter-options-grid";
    const searchable=field==="city"&&vals.length>8;
    return `
      <details ${integratedTarget&&field==="area"?'id="motiveArea" ':""}class="filter-dropdown ${vals.length===1?"filter-control--single":""}" data-field="${field}">
        <summary aria-controls="${menuId}" aria-expanded="false" aria-label="${esc(label)}: ${esc(filterSelectionLabel(field,vals))}">
          <span class="filter-trigger-copy">
            <span class="filter-trigger-label">${esc(label)}</span>
            <span class="filter-trigger-value">${esc(filterSelectionLabel(field,vals))}</span>
          </span>
        </summary>
        <button class="filter-clear" type="button" data-clear-filter="${field}" aria-label="Limpiar filtro ${esc(label)}" title="Limpiar ${esc(label)}" hidden>Ã—</button>
        <div id="${menuId}" class="filter-menu ${field==="month"?"filter-menu-month":""}" role="group" aria-label="Opciones de ${esc(label)}">
          <div class="filter-menu-actions">
            <button type="button" data-filter-action="all" data-field="${field}">Seleccionar todo</button>
            <button type="button" data-filter-action="clear" data-field="${field}">Limpiar</button>
          </div>
          ${searchable?`<label class="filter-option-search"><span class="sr-only">Buscar ciudad</span><input type="search" data-filter-search="city" placeholder="Buscar ciudadâ€¦" autocomplete="off"></label>`:""}
          <div class="${gridClass}">
            ${vals.map(v=>`
              <label class="filter-option">
                <input type="checkbox" data-filter="${field}" value="${esc(v)}" ${getFilterSet(field).has(v)?"checked":""}>
                <span>${esc(v)}</span>
              </label>`).join("")}
          </div>
        </div>
      </details>`;
  }).join("")+(state.view==="motives"?`
    <label class="filter-sort-control">
      <span class="filter-trigger-copy">
        <span class="filter-trigger-label">Ordenar</span>
        <select class="filter-sort-select" data-motives-sort aria-label="Ordenar matriz de motivos">
          <option value="volume-desc" ${state.motivesSort==="volume-desc"?"selected":""}>Mayor volumen</option>
          <option value="alpha-asc" ${state.motivesSort==="alpha-asc"?"selected":""}>Motivo A–Z</option>
        </select>
      </span>
    </label>`:"");

  target.querySelectorAll(".filter-dropdown").forEach(drop=>{
    drop.addEventListener("toggle",()=>{
      const summary=drop.querySelector("summary");
      summary?.setAttribute("aria-expanded",drop.open?"true":"false");
      if(drop.open) closeAllFilterPopovers(drop);
    });
  });

  target.querySelectorAll('[data-filter]').forEach(el=>el.addEventListener("change",()=>{
    const f=el.dataset.filter, v=el.value;
    const selected=getFilterSet(f);
    el.checked ? selected.add(v) : selected.delete(v);
    refreshFilterLabels();
    renderCurrentView();
    restoreOpenFilter(f);
    pulseFilteredContent();
  }));

  target.querySelectorAll('[data-clear-filter]').forEach(button=>button.addEventListener("click",event=>{
    event.preventDefault();
    event.stopPropagation();
    clearSingleFilter(button.dataset.clearFilter);
  }));

  target.querySelectorAll('[data-filter-action]').forEach(button=>button.addEventListener("click",event=>{
    event.preventDefault();
    event.stopPropagation();
    const field=button.dataset.field;
    setFilterSet(field,new Set(button.dataset.filterAction==="all"?filterValues(field):[]));
    renderFilters();
    renderCurrentView();
    restoreOpenFilter(field);
    pulseFilteredContent();
  }));

  target.querySelectorAll('[data-filter-search]').forEach(input=>input.addEventListener("input",()=>{
    const query=normalizeFilterSearch(input.value);
    input.closest(".filter-menu").querySelectorAll(".filter-option").forEach(option=>{
      option.hidden=query!==""&&!normalizeFilterSearch(option.textContent).includes(query);
    });
  }));

  target.querySelector('[data-motives-sort]')?.addEventListener("change",event=>{
    state.motivesSort=event.target.value;
    renderCurrentView();
  });

  refreshFilterLabels();
}

function updateFilterContext(){
  const country=selectedDimensionLabel("country","Todos");
  const classification=selectedDimensionLabel("classification","Todas");
  const parts=[`Periodo: ${selectedPeriodLabel()}`,`País: ${country}`];
  if(state.view==="motives"){
    parts.push(`Ciudad: ${selectedDimensionLabel("city","Todas")}`);
    parts.push(`Área: ${selectedDimensionLabel("area","Todas")}`);
  }
  parts.push(`Clasificación: ${classification}`);
  if(state.view==="motives") parts.push(`Situación: ${selectedDimensionLabel("situation","Todas")}`);
  if(state.view==="summary") parts.push(`Área: ${selectedDimensionLabel("area","Todas")}`);
  else if(state.view==="tracking"){
    parts.push(`Área: ${selectedDimensionLabel("area","Todas")}`);
    parts.push(`Segmentación: ${selectedDimensionLabel("b2b","Todos")}`);
  }else if(state.view!=="motives") parts.push(`Segmentación: ${selectedDimensionLabel("b2b","Todos")}`);
  const label=parts.join(" · ");
  const el=$("#filterContext");
  if(el) el.textContent=label;
  const motivesContext=$("#motivesGlobalFilterContext");
  if(motivesContext) motivesContext.textContent=label;
}

function passes(r, ignore={}){
  const active=new Set(activeFilterFields());
  return (!active.has("year") || ignore.year || getFilterSet("year").has(r.year)) &&
         (!active.has("month") || ignore.month || getFilterSet("month").has(r.month)) &&
         (!active.has("country") || ignore.country || getFilterSet("country").has(r.country)) &&
         (!active.has("city") || ignore.city || getFilterSet("city").has(r.city)) &&
         (!active.has("classification") || ignore.classification || getFilterSet("classification").has(r.classification)) &&
         (!active.has("area") || ignore.area || getFilterSet("area").has(r.area)) &&
         (!active.has("situation") || ignore.situation || getFilterSet("situation").has(r.situation)) &&
         (!active.has("b2b") || ignore.b2b || getFilterSet("b2b").has(r.b2b));
}
function filtered(ignore={}){ return state.records.filter(r=>passes(r,ignore)); }

function destroyCharts(){
  state.charts.forEach(c=>{try{c.destroy()}catch{}});
  state.charts=[];
  state.chartSelections.clear();
}

const REDUCED_MOTION = typeof window!=="undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const CHART_THEME={
  grid:"#edf1f5", text:"#526174", muted:"#7a8797", tooltip:"#26384d",
  tooltipBorder:"rgba(255,255,255,.12)", surface:"#ffffff"
};

function formatNumber(v){ return n(v); }
function formatPercentage(v,digits=1){ return percent(v,digits); }

function colorWithAlpha(color,alpha){
  if(typeof color!=="string") return color;
  const a=Math.max(0,Math.min(1,alpha));
  if(color.startsWith("#")){
    const hex=color.slice(1);
    const full=hex.length===3?hex.split("").map(x=>x+x).join(""):hex.slice(0,6);
    const r=parseInt(full.slice(0,2),16), g=parseInt(full.slice(2,4),16), b=parseInt(full.slice(4,6),16);
    if([r,g,b].every(Number.isFinite)) return `rgba(${r},${g},${b},${a})`;
  }
  const rgba=color.match(/^rgba?\(([^)]+)\)$/i);
  if(rgba){
    const parts=rgba[1].split(",").slice(0,3).map(x=>x.trim());
    if(parts.length===3) return `rgba(${parts.join(",")},${a})`;
  }
  return color;
}

function normalizeColorList(value,count,fallback=COLORS.navy){
  if(Array.isArray(value)) return Array.from({length:count},(_,i)=>value[i%value.length]||fallback);
  return Array(count).fill(value||fallback);
}

function cloneColorValue(value){ return Array.isArray(value)?[...value]:value; }

function captureChartBaseColors(chartInstance){
  chartInstance.data.datasets.forEach(ds=>{
    if(ds._uxBaseCaptured) return;
    ds._uxBaseCaptured=true;
    ds._uxBaseBackgroundColor=cloneColorValue(ds.backgroundColor);
    ds._uxBaseBorderColor=cloneColorValue(ds.borderColor);
    ds._uxBasePointBackgroundColor=cloneColorValue(ds.pointBackgroundColor);
    ds._uxBasePointRadius=cloneColorValue(ds.pointRadius);
    ds._uxBasePointBorderColor=cloneColorValue(ds.pointBorderColor);
  });
}

function restoreChartBaseColors(chartInstance){
  chartInstance.data.datasets.forEach(ds=>{
    if(!ds._uxBaseCaptured) return;
    ds.backgroundColor=cloneColorValue(ds._uxBaseBackgroundColor);
    ds.borderColor=cloneColorValue(ds._uxBaseBorderColor);
    ds.pointBackgroundColor=cloneColorValue(ds._uxBasePointBackgroundColor);
    ds.pointRadius=cloneColorValue(ds._uxBasePointRadius);
    ds.pointBorderColor=cloneColorValue(ds._uxBasePointBorderColor);
  });
}

function applyChartFocus(chartInstance,focusIndex,opacity=.26){
  captureChartBaseColors(chartInstance);
  chartInstance.data.datasets.forEach(ds=>{
    const count=chartInstance.data.labels?.length || ds.data?.length || 0;
    const type=ds.type || chartInstance.config.type;
    if(type==="line"){
      const points=normalizeColorList(ds._uxBasePointBackgroundColor || ds._uxBaseBorderColor || COLORS.red,count,COLORS.red);
      ds.pointBackgroundColor=points.map((c,i)=>i===focusIndex?c:colorWithAlpha(c,.32));
      ds.pointBorderColor=points.map((c,i)=>i===focusIndex?c:colorWithAlpha(c,.32));
      ds.pointRadius=points.map((_,i)=>i===focusIndex?5:3);
      return;
    }
    const bases=normalizeColorList(ds._uxBaseBackgroundColor,count);
    ds.backgroundColor=bases.map((c,i)=>i===focusIndex?c:colorWithAlpha(c,opacity));
  });
}

function chartSelectionText(chartInstance,index,ux={}){
  if(typeof ux.selectionFormatter==="function") return ux.selectionFormatter(chartInstance,index);
  const label=chartInstance.data.labels?.[index] ?? "Selección";
  const parts=[];
  chartInstance.data.datasets.forEach(ds=>{
    const raw=Number(ds.data?.[index]);
    if(!Number.isFinite(raw)) return;
    const dsLabel=clean(ds.label);
    parts.push(dsLabel?`${dsLabel}: ${formatNumber(raw)}`:formatNumber(raw));
  });
  return `${label} · ${parts.join(" · ")}`;
}

function setChartSelectionNote(id,text=""){
  const note=document.querySelector(`[data-chart-selection-for="${id}"]`);
  if(!note) return;
  const label=note.querySelector(".chart-selection-text");
  if(label) label.textContent=text;
  note.hidden=!text;
}

function resetChartSelection(chartInstance,id){
  chartInstance.$uxSelectedIndex=null;
  chartInstance.$uxHoverIndex=null;
  state.chartSelections.delete(id);
  restoreChartBaseColors(chartInstance);
  chartInstance.update("none");
  setChartSelectionNote(id,"");
}

function getCorporateTooltipOptions(overrides={}){
  const base={
    enabled:true,
    backgroundColor:CHART_THEME.tooltip,
    titleColor:"#fff",
    bodyColor:"#f7f9fc",
    footerColor:"#d8e0ea",
    borderColor:CHART_THEME.tooltipBorder,
    borderWidth:1,
    cornerRadius:10,
    padding:11,
    caretPadding:7,
    displayColors:false,
    titleFont:{size:11,weight:"700"},
    bodyFont:{size:10},
    footerFont:{size:9,weight:"600"}
  };
  return {...base,...overrides,callbacks:{...(base.callbacks||{}),...(overrides.callbacks||{})}};
}

function getCorporateLegendOptions(overrides={}){
  return {
    position:"bottom",
    align:"center",
    labels:{boxWidth:8,boxHeight:8,usePointStyle:true,padding:15,color:CHART_THEME.text,font:{size:9,weight:"600"},...(overrides.labels||{})},
    ...overrides,
    labels:{boxWidth:8,boxHeight:8,usePointStyle:true,padding:15,color:CHART_THEME.text,font:{size:9,weight:"600"},...(overrides.labels||{})}
  };
}

function wrapChartLabel(value,max=28){
  const text=clean(value);
  if(text.length<=max) return text;
  const words=text.split(/\s+/);
  const lines=[];
  let line="";
  words.forEach(word=>{
    const next=line?`${line} ${word}`:word;
    if(next.length>max && line){ lines.push(line); line=word; }
    else line=next;
  });
  if(line) lines.push(line);
  return lines.slice(0,3);
}

function baseChartOptions({horizontal=false,legend=false,stacked=false}={}){
  const xTicks=horizontal
    ? {color:CHART_THEME.text,font:{size:9},callback:value=>formatNumber(value)}
    : {color:CHART_THEME.text,font:{size:9}};
  const yTicks=horizontal
    ? {color:CHART_THEME.text,font:{size:9},callback(value){return wrapChartLabel(this.getLabelForValue(value),30);}}
    : {color:CHART_THEME.text,font:{size:9},precision:0,callback:value=>formatNumber(value)};
  return {
    responsive:true,
    maintainAspectRatio:false,
    animation:{duration:REDUCED_MOTION?0:480,easing:"easeOutQuart"},
    interaction:{mode:"nearest",intersect:true},
    plugins:{
      legend:legend?getCorporateLegendOptions():{display:false},
      tooltip:getCorporateTooltipOptions({callbacks:{label(ctx){
        const label=clean(ctx.dataset?.label);
        const value=horizontal?ctx.parsed.x:ctx.parsed.y;
        return `${label?label+": ":""}${formatNumber(value)}`;
      }}})
    },
    scales:{
      x:{stacked,beginAtZero:horizontal,grid:{display:horizontal,color:CHART_THEME.grid,drawBorder:false},border:{display:false},ticks:xTicks},
      y:{stacked,beginAtZero:!horizontal,grid:{display:!horizontal,color:CHART_THEME.grid,drawBorder:false},border:{display:false},ticks:yTicks}
    }
  };
}

const corporateValueLabelsPlugin={
  id:"corporateValueLabels",
  afterDatasetsDraw(chartInstance,args,opts){
    if(!opts?.enabled) return;
    const horizontal=chartInstance.options.indexAxis==="y";
    const ctx=chartInstance.ctx;
    ctx.save();
    ctx.font=`700 ${opts?.fontSize||9}px Inter, Segoe UI, Arial, sans-serif`;
    ctx.fillStyle=CHART_THEME.text;
    chartInstance.data.datasets.forEach((ds,di)=>{
      if(opts.datasetIndex!==undefined && di!==opts.datasetIndex) return;
      const meta=chartInstance.getDatasetMeta(di);
      if(meta.hidden || (ds.type||chartInstance.config.type)==="line") return;
      meta.data.forEach((element,i)=>{
        const value=Number(ds.data?.[i]);
        if(!Number.isFinite(value) || (opts.hideZero!==false && value===0)) return;
        const text=typeof opts.formatter==="function"?opts.formatter(value,i,di):formatNumber(value);
        if(horizontal){
          const rightSpace=chartInstance.chartArea.right-element.x;
          ctx.textAlign=rightSpace<42?"right":"left";
          ctx.textBaseline="middle";
          ctx.fillText(text,rightSpace<42?element.x-5:element.x+6,element.y);
        }else{
          ctx.textAlign="center";
          ctx.textBaseline="bottom";
          ctx.fillText(text,element.x,Math.max(chartInstance.chartArea.top+10,element.y-6));
        }
      });
    });
    ctx.restore();
  }
};

const doughnutCenterPlugin={
  id:"doughnutCenter",
  afterDraw(chartInstance,args,opts){
    if(!opts?.enabled || chartInstance.config.type!=="doughnut") return;
    const meta=chartInstance.getDatasetMeta(0);
    if(!meta?.data?.length) return;
    const {x,y}=meta.data[0];
    const ctx=chartInstance.ctx;
    ctx.save();
    ctx.textAlign="center";
    ctx.textBaseline="middle";
    ctx.fillStyle="#718096";
    ctx.font="800 8px Inter, Segoe UI, Arial, sans-serif";
    ctx.fillText(clean(opts.label||"TOTAL").toUpperCase(),x,y-9);
    ctx.fillStyle="#1d3048";
    ctx.font="850 20px Inter, Segoe UI, Arial, sans-serif";
    ctx.fillText(formatNumber(opts.value||0),x,y+10);
    ctx.restore();
  }
};

function doughnutLegendOptions(values){
  const total=values.reduce((a,b)=>a+(Number(b)||0),0);
  return getCorporateLegendOptions({
    labels:{
      generateLabels(chartInstance){
        const ds=chartInstance.data.datasets[0];
        return chartInstance.data.labels.map((label,i)=>({
          text:`${label} · ${total?((Number(ds.data[i])||0)/total*100).toFixed(1).replace(".",","):"0,0"}%`,
          fillStyle:Array.isArray(ds.backgroundColor)?ds.backgroundColor[i]:ds.backgroundColor,
          strokeStyle:"transparent",
          lineWidth:0,
          hidden:false,
          index:i,
          pointStyle:"circle"
        }));
      }
    }
  });
}

function chartConfigHasData(config){
  return (config?.data?.datasets||[]).some(ds=>(ds.data||[]).some(v=>Number.isFinite(Number(v)) && Number(v)!==0));
}

function chart(id,config,ux={}){
  if(!window.Chart) return null;
  const el=document.getElementById(id);
  if(!el) return null;
  if(!chartConfigHasData(config)){
    const wrap=el.closest(".chart-wrap");
    if(wrap) wrap.innerHTML='<div class="chart-empty" role="status">No hay registros para los filtros seleccionados.</div>';
    setChartSelectionNote(id,"");
    return null;
  }
  config.options=config.options||{};
  const selectable=ux.selectable!==false;
  const priorHover=config.options.onHover;
  const priorClick=config.options.onClick;

  if(selectable){
    config.options.onHover=(event,elements,chartInstance)=>{
      el.style.cursor=elements.length?"pointer":"default";
      const hoverIndex=Number.isInteger(elements[0]?.index)?elements[0].index:null;
      const effectiveIndex=chartInstance.$uxSelectedIndex!==null && chartInstance.$uxSelectedIndex!==undefined?chartInstance.$uxSelectedIndex:hoverIndex;
      if(chartInstance.$uxHoverIndex!==effectiveIndex){
        chartInstance.$uxHoverIndex=effectiveIndex;
        if(Number.isInteger(effectiveIndex)){
          const opacity=(chartInstance.$uxSelectedIndex!==null && chartInstance.$uxSelectedIndex!==undefined)?0.22:0.38;
          applyChartFocus(chartInstance,effectiveIndex,opacity);
        }else restoreChartBaseColors(chartInstance);
        chartInstance.update("none");
      }
      if(typeof priorHover==="function") priorHover(event,elements,chartInstance);
    };
    config.options.onClick=(event,elements,chartInstance)=>{
      if(typeof priorClick==="function") priorClick(event,elements,chartInstance);
      if(!elements.length) return;
      const idx=elements[0].index;
      if(chartInstance.$uxSelectedIndex===idx){
        resetChartSelection(chartInstance,id);
        return;
      }
      chartInstance.$uxSelectedIndex=idx;
      state.chartSelections.set(id,idx);
      applyChartFocus(chartInstance,idx,.22);
      chartInstance.update("none");
      setChartSelectionNote(id,chartSelectionText(chartInstance,idx,ux));
      if(typeof ux.onSelect==="function") ux.onSelect(idx,chartInstance,el);
    };
  }

  const c=new Chart(el,config);
  c.$uxSelectedIndex=null;
  c.$uxHoverIndex=null;
  captureChartBaseColors(c);
  state.charts.push(c);

  const card=el.closest(".card");
  const chartTitle=card?.querySelector("h3")?.textContent || "Gráfica";
  el.setAttribute("role",selectable?"group":"img");
  el.setAttribute("aria-label",selectable?`${chartTitle}. Visualización interactiva. Usa mouse, toque o flechas para explorar; Enter o Espacio selecciona.`:`${chartTitle}. Visualización de datos.`);
  if(selectable){
    el.tabIndex=0;
    c.$uxKeyboardIndex=0;
    el.addEventListener("keydown",event=>{
      const count=c.data.labels?.length||0;
      if(!count) return;
      if(["ArrowRight","ArrowDown","ArrowLeft","ArrowUp"].includes(event.key)){
        event.preventDefault();
        const delta=(event.key==="ArrowRight"||event.key==="ArrowDown")?1:-1;
        const base=Number.isInteger(c.$uxSelectedIndex)?c.$uxSelectedIndex:c.$uxKeyboardIndex;
        const idx=(base+delta+count)%count;
        c.$uxKeyboardIndex=idx;
        c.$uxHoverIndex=idx;
        applyChartFocus(c,idx,.38);
        c.update("none");
      }else if(event.key==="Enter"||event.key===" "){
        event.preventDefault();
        const idx=Number.isInteger(c.$uxHoverIndex)?c.$uxHoverIndex:c.$uxKeyboardIndex;
        if(c.$uxSelectedIndex===idx) resetChartSelection(c,id);
        else{
          c.$uxSelectedIndex=idx;
          state.chartSelections.set(id,idx);
          applyChartFocus(c,idx,.22);
          c.update("none");
          setChartSelectionNote(id,chartSelectionText(c,idx,ux));
          if(typeof ux.onSelect==="function") ux.onSelect(idx,c,el);
        }
      }else if(event.key==="Escape" && c.$uxSelectedIndex!==null){
        resetChartSelection(c,id);
      }
    });
  }

  el.addEventListener("mouseleave",()=>{
    c.$uxHoverIndex=c.$uxSelectedIndex;
    if(c.$uxSelectedIndex!==null && c.$uxSelectedIndex!==undefined) applyChartFocus(c,c.$uxSelectedIndex,.22);
    else restoreChartBaseColors(c);
    c.update("none");
  });

  const clearBtn=document.querySelector(`[data-clear-chart="${id}"]`);
  clearBtn?.addEventListener("click",()=>resetChartSelection(c,id));
  return c;
}
function groupCount(rows,field){
  const m=new Map();
  rows.forEach(r=>m.set(r[field]||"Sin dato",(m.get(r[field]||"Sin dato")||0)+1));
  return [...m.entries()].sort((a,b)=>b[1]-a[1]);
}
function topValue(rows,field){ return groupCount(rows,field)[0] || ["Sin dato",0]; }

function getMonthlyTrend(rows){
  const selectedMonths=MONTHS.filter(m=>state.filters.month.has(m));
  const totals=new Map(selectedMonths.map(m=>[m,0]));
  rows.forEach(r=>{
    if(totals.has(r.month)) totals.set(r.month,(totals.get(r.month)||0)+1);
  });
  return selectedMonths.map((month,index)=>{
    const total=totals.get(month)||0;
    const previous=index>0 ? (totals.get(selectedMonths[index-1])||0) : null;
    const variation=index===0 || previous===0 ? null : (total-previous)/previous;
    return {month,total,variation};
  });
}

function formatVariation(v){
  if(!Number.isFinite(v)) return "";
  const sign=v>0?"+":v<0?"−":"";
  return `${sign}${Math.abs(v*100).toFixed(1).replace(".",",")}%`;
}

const monthlyValueLabelsPlugin={
  id:"monthlyValueLabels",
  afterDatasetsDraw(chart,args,pluginOptions){
    if(chart.config.type!=="bar" || !pluginOptions?.enabled) return;
    const meta=chart.getDatasetMeta(0);
    const values=chart.data.datasets[0]?.data||[];
    const variations=pluginOptions.variations||[];
    const ctx=chart.ctx;
    ctx.save();
    ctx.textAlign="center";
    ctx.textBaseline="bottom";
    meta.data.forEach((bar,i)=>{
      const value=Number(values[i]||0);
      const variation=variations[i];
      const y=Math.max(chart.chartArea.top+10,bar.y-20);
      ctx.font="700 11px Inter, Segoe UI, Arial, sans-serif";
      ctx.fillStyle=COLORS.navy;
      ctx.fillText(n(value),bar.x,y);
      if(Number.isFinite(variation)){
        ctx.font="700 9px Inter, Segoe UI, Arial, sans-serif";
        ctx.fillStyle=variation>0?COLORS.red:variation<0?COLORS.green:COLORS.slate;
        const arrow=variation>0?"▲ ":variation<0?"▼ ":"";
        ctx.fillText(`${arrow}${formatVariation(variation)}`,bar.x,y+14);
      }
    });
    ctx.restore();
  }
};

function summaryStats(rows){
  const total=rows.length;
  const closed=rows.filter(r=>r.state==="Cerrada").length;
  const open=total-closed;
  const overdue=rows.filter(r=>r.state==="Vencida").length;
  const within5=rows.reduce((s,r)=>s+(r.flag05||0),0);
  const within15=rows.reduce((s,r)=>s+(r.flag015||0),0);
  return {total,closed,open,overdue,within5,within15,ans:safeDiv(within5,total),ans15:safeDiv(within15,total)};
}
function kpi(label,value,sub="",cls=""){
  return `<article class="kpi ${cls}"><div class="label">${esc(label)}</div><div class="value">${value}</div><div class="sub">${esc(sub)}</div></article>`;
}
function summaryKpi(type,label,value,sub="",cls=""){
  return `<button type="button" class="kpi kpi-card--interactive ${cls}" data-kpi-detail="${type}" aria-haspopup="dialog" aria-label="Ver radicados de ${esc(label)}"><div class="label">${esc(label)}</div><div class="value">${value}</div><div class="sub">${esc(sub)}</div><span class="kpi-detail-hint" aria-hidden="true">Ver detalle ↗</span></button>`;
}
function trackingKpi(label,value,sub="",cls="",attrs=""){
  return `<button type="button" class="kpi tracking-kpi ${cls}" ${attrs}><div class="label">${esc(label)}</div><div class="value">${value}</div><div class="sub">${esc(sub)}</div><span class="tracking-kpi-hint">Ver detalle →</span></button>`;
}
function card(title,subtitle,body,extra=""){
  return `<article class="card ${extra}"><div class="card-head"><div><h3>${esc(title)}</h3><p>${esc(subtitle)}</p></div></div><div class="card-body">${body}</div></article>`;
}
function chartCard(title,subtitle,id,cls=""){
  return `<article class="card chart-card"><div class="card-head"><div><h3>${esc(title)}</h3><p>${esc(subtitle)}</p></div></div><div class="card-body"><div class="chart-selection-note" data-chart-selection-for="${id}" hidden><span class="chart-selection-text"></span><button type="button" data-clear-chart="${id}" aria-label="Limpiar selección de ${esc(title)}">Limpiar</button></div><div class="chart-wrap ${cls}"><canvas id="${id}"></canvas></div></div></article>`;
}

function renderSummary(){
  const rows=filtered(), st=summaryStats(rows);
  const monthlyTrend=getMonthlyTrend(rows);
  const hasMonthlyData=monthlyTrend.some(x=>x.total>0);
  const areaTop=topValue(rows,"area");
  const closeRate=safeDiv(st.closed,st.total);
  const area=groupCount(rows,"area"),cls=groupCount(rows,"classification"),clsValues=cls.map(x=>x[1]);
  const ranges=["0 - 5 Días","6 - 10 Días","10 - 15 Días","+ 16 Días"];
  const agingLabels=["0–5","6–10","10–15","16+"];
  const agingValues=ranges.map(range=>rows.filter(r=>r.state!=="Cerrada"&&clean(r.openRange).replace(/^\+\s/,"+ ")===range).length);
  const agingTop=agingValues.reduce((best,value,index)=>value>best.value?{value,index}:best,{value:0,index:0});
  const monthTop=monthlyTrend.reduce((best,item)=>item.total>best.total?item:best,{month:"Sin dato",total:0});
  $("#pageTitle").textContent="Resumen General";
  $("#view").innerHTML=`
    <section class="kpi-grid">
      ${summaryKpi("total","Total PQRS",n(st.total),"Registros del periodo")}
      ${summaryKpi("closed","Cerradas",n(st.closed),percent(closeRate)+" del total","green")}
      ${summaryKpi("open","Abiertas",n(st.open),percent(safeDiv(st.open,st.total))+" del total","amber")}
      ${summaryKpi("overdue","Vencidas",n(st.overdue),"Dentro de las abiertas","red")}
      ${summaryKpi("ans05","ANS 0–5",percent(st.ans),"Cerradas 0–5 / total","green")}
      ${summaryKpi("management015","Gestión 0–15",percent(st.ans15),"Cerradas 0–15 / total")}
    </section>
    <section class="grid-3 summary-primary-grid">
      ${hasMonthlyData ? chartCard("Evolución mensual","Volumen de PQRS y variación mensual","summaryMonthly","monthly") : card("Evolución mensual","Volumen de PQRS y variación mensual",`<div class="chart-empty" role="status">No hay registros para los filtros seleccionados.</div>`)}
      ${chartCard("Distribución por área","Participación de las PQRS por área responsable","summaryArea")}
      ${chartCard("Clasificación","Distribución por tipo de PQRS","summaryClass")}
    </section>
    <section class="grid-2 summary-secondary-grid">
      ${chartCard("Antigüedad de abiertas","Distribución de casos abiertos por días en gestión","summaryAging")}
      ${card("Hallazgos rápidos","Lecturas determinísticas del universo filtrado",rows.length?`
        <div class="insight-list summary-insight-grid">
          <div class="insight"><span class="insight-label">Mayor área</span><strong>${esc(areaTop[0])}</strong><span>${n(areaTop[1])} registros · ${percent(safeDiv(areaTop[1],st.total))}</span></div>
          <div class="insight"><span class="insight-label">Mes con mayor volumen</span><strong>${esc(monthTop.month)}</strong><span>${n(monthTop.total)} registros</span></div>
          <div class="insight"><span class="insight-label">Oportunidad 0–5</span><strong>${percent(st.ans)}</strong><span>${n(st.within5)} cierres en el rango</span></div>
          <div class="insight"><span class="insight-label">Antigüedad abierta dominante</span><strong>${esc(agingLabels[agingTop.index])} días</strong><span>${n(agingTop.value)} casos abiertos</span></div>
        </div>`:`<div class="chart-empty" role="status">No hay datos para los filtros seleccionados.</div>`,"summary-findings-card")}
    </section>`;

  if(hasMonthlyData){
    const years=[...state.filters.year].sort();
    const yearLabel=years.length===1?years[0]:years.join("/");
    chart("summaryMonthly",{
      type:"bar",
      data:{
        labels:monthlyTrend.map(x=>x.month),
        datasets:[{
          label:"PQRS",
          data:monthlyTrend.map(x=>x.total),
          backgroundColor:"rgba(64,83,107,.88)",
          hoverBackgroundColor:COLORS.navy,
          borderRadius:6,
          borderSkipped:false,
          maxBarThickness:56,
          categoryPercentage:.68,
          barPercentage:.82
        }]
      },
      plugins:[monthlyValueLabelsPlugin],
      options:{
        ...baseChartOptions(),
        animation:{duration:REDUCED_MOTION?0:420,easing:"easeOutQuart"},
        layout:{padding:{top:38,right:10,left:4}},
        interaction:{mode:"index",intersect:false},
        plugins:{
          legend:{display:false},
          monthlyValueLabels:{enabled:true,variations:monthlyTrend.map(x=>x.variation)},
          tooltip:getCorporateTooltipOptions({
            callbacks:{
              title(items){
                const item=items[0];
                return `${monthlyTrend[item.dataIndex].month} ${yearLabel}`;
              },
              label(ctx){ return `PQRS: ${n(ctx.raw)}`; },
              afterLabel(ctx){
                const i=ctx.dataIndex, v=monthlyTrend[i].variation;
                if(!Number.isFinite(v) || i===0) return "";
                return `Variación vs ${monthlyTrend[i-1].month.toLowerCase()}: ${formatVariation(v)}`;
              }
            }
          })
        },
        scales:{
          x:{
            grid:{display:false},
            border:{display:false},
            ticks:{font:{size:10},color:CHART_THEME.text}
          },
          y:{
            beginAtZero:true,
            suggestedMax:Math.ceil(Math.max(...monthlyTrend.map(x=>x.total),1)*1.18),
            grid:{color:CHART_THEME.grid},
            border:{display:false},
            ticks:{
              precision:0,
              font:{size:9},
              color:CHART_THEME.muted,
              callback:value=>n(value)
            }
          }
        }
      }
    },{
      selectionFormatter(chartInstance,index){
        const item=monthlyTrend[index];
        const variation=Number.isFinite(item.variation)?` · ${item.variation>0?"▲":"▼"} ${formatVariation(item.variation)}`:"";
        return `${item.month} · ${formatNumber(item.total)} PQRS${variation}`;
      }
    });
  }

  chart("summaryArea",{
    type:"bar",
    data:{labels:area.map(x=>x[0]),datasets:[{label:"PQRS",data:area.map(x=>x[1]),backgroundColor:COLORS.navy,borderRadius:6,borderSkipped:false,maxBarThickness:34}]},
    plugins:[corporateValueLabelsPlugin],
    options:{...baseChartOptions({horizontal:true}),indexAxis:"y",layout:{padding:{right:72}},plugins:{...baseChartOptions({horizontal:true}).plugins,corporateValueLabels:{enabled:true,formatter:(value,index)=>`${formatNumber(value)} · ${percent(safeDiv(value,st.total))}`},tooltip:getCorporateTooltipOptions({callbacks:{label(ctx){const value=Number(ctx.raw)||0;return `${formatNumber(value)} PQRS · ${percent(safeDiv(value,st.total))}`;}}})}}
  },{selectionFormatter(chartInstance,index){return `${area[index][0]} · ${formatNumber(area[index][1])} PQRS`;}});

  chart("summaryClass",{
    type:"doughnut",
    data:{labels:cls.map(x=>x[0]),datasets:[{data:clsValues,backgroundColor:[COLORS.navy,COLORS.red,COLORS.amber,COLORS.green],borderColor:"transparent",borderWidth:2,hoverOffset:6}]},
    plugins:[doughnutCenterPlugin],
    options:{responsive:true,maintainAspectRatio:false,animation:{duration:REDUCED_MOTION?0:480},cutout:"70%",plugins:{legend:doughnutLegendOptions(clsValues),tooltip:getCorporateTooltipOptions({callbacks:{label(ctx){const value=Number(ctx.raw)||0;return `${ctx.label}: ${formatNumber(value)} · ${percent(safeDiv(value,st.total))}`;}}}),doughnutCenter:{enabled:true,label:"Total",value:st.total}}}
  },{selectionFormatter(chartInstance,index){const value=clsValues[index]||0;return `${cls[index][0]} · ${formatNumber(value)} · ${percent(safeDiv(value,st.total))}`;}});

  chart("summaryAging",{
    type:"bar",
    data:{labels:agingLabels,datasets:[{label:"Abiertas",data:agingValues,backgroundColor:[COLORS.navy,COLORS.navy2,COLORS.slate,COLORS.red],borderRadius:7,borderSkipped:false,maxBarThickness:54}]},
    plugins:[corporateValueLabelsPlugin],
    options:{...baseChartOptions(),layout:{padding:{top:18}},plugins:{...baseChartOptions().plugins,corporateValueLabels:{enabled:true}}}
  },{selectionFormatter(chartInstance,index){return `${chartInstance.data.labels[index]} días · ${formatNumber(agingValues[index])} casos abiertos`;}});
}

function areaStats(rows){
  const base=rows.filter(r=>OP_CLASSES.has(r.classification));
  const within5=base.reduce((s,r)=>s+(r.flag05||0),0);
  const within15=base.reduce((s,r)=>s+(r.flag015||0),0);
  const open=base.filter(r=>r.state!=="Cerrada").length;
  return {base, total:base.length,within5,within15,open,op:safeDiv(within5,base.length),op15:safeDiv(within15,base.length)};
}

function commercialSemanticStats(rows){
  const eligible=rows.filter(r=>r.semanticCountryEligible);
  const semantic=eligible.filter(r=>r.semanticAvailable);
  const high=semantic.filter(r=>r.semanticConfidence==="ALTA");
  const review=semantic.filter(r=>r.requiresReview);
  const confirmed=semantic.filter(r=>r.semanticCauseState==="CONFIRMADA");
  return {
    eligible,semantic,high,review,confirmed,
    coverage:safeDiv(semantic.length,eligible.length),
    highRate:safeDiv(high.length,semantic.length),
    reviewRate:safeDiv(review.length,semantic.length),
    confirmedRate:safeDiv(confirmed.length,semantic.length)
  };
}

function semanticCategoryStats(rows,field){
  const groups=new Map();
  rows.forEach(r=>{
    const key=clean(r[field])||"Sin causa identificada";
    if(!groups.has(key)) groups.set(key,{category:key,group:field==="submotive"?(clean(r.causeGroup)||"Sin grupo"):key,cases:0,confirmed:0,review:0,high:0});
    const item=groups.get(key);
    item.cases++;
    if(r.semanticCauseState==="CONFIRMADA") item.confirmed++;
    if(r.requiresReview) item.review++;
    if(r.semanticConfidence==="ALTA") item.high++;
  });
  return [...groups.values()].map(item=>({...item,share:safeDiv(item.cases,rows.length),confirmRate:safeDiv(item.confirmed,item.cases),highRate:safeDiv(item.high,item.cases)})).sort((a,b)=>b.cases-a.cases || a.category.localeCompare(b.category,"es"));
}

function buildCommercialSemanticModel(rows){
  const stats=commercialSemanticStats(rows);
  return {stats,groups:semanticCategoryStats(stats.semantic,"causeGroup"),submotives:semanticCategoryStats(stats.semantic,"submotive")};
}

function commercialSemanticKpi(label,value,detail){
  return `<section class="commercial-semantic-kpi" aria-label="${esc(label)}"><span class="semantic-kpi-label">${esc(label)}</span><div class="commercial-main-group-row"><strong>${esc(value)}</strong><small>${esc(detail)}</small></div></section>`;
}

function sortedCommercialSubmotives(model){
  const {key,direction}=state.commercialSemanticSort;
  const sign=direction==="asc"?1:-1;
  return [...model.submotives].sort((a,b)=>{
    const av=a[key],bv=b[key];
    if(typeof av==="string") return sign*av.localeCompare(bv,"es",{sensitivity:"base"});
    return sign*((av||0)-(bv||0)) || b.cases-a.cases;
  }).slice(0,10);
}

function renderCommercialCauseBlock(rows,model=buildCommercialSemanticModel(rows)){
  const s=model.stats;
  const groupStats=model.groups;
  const subStats=sortedCommercialSubmotives(model);
  const principal=groupStats[0];
  const outside=rows.filter(r=>!r.semanticCountryEligible).length;
  const noSemantic=s.eligible.length===0
    ? `<div class="commercial-semantic-empty"><strong>Sin clasificación semántica individual disponible.</strong><span>Uruguay y Panamá se muestran como no disponibles; no se interpretan como cero causas. Los KPI operativos superiores continúan siendo válidos.</span></div>`
    : "";
  const action=(item,kind,label,rowsFilter)=>`<button type="button" class="semantic-audit-action" data-semantic-sub="${esc(item.category)}" data-semantic-kind="${kind}" aria-label="Auditar ${esc(label)}">${label}</button>`;
  const tableRows=subStats.length?subStats.map(item=>`<tr><td class="semantic-name">${action(item,"all",esc(item.category))}<small>${esc(item.group)}</small></td><td>${action(item,"all",n(item.cases))}</td><td><div class="semantic-share"><span><i style="width:${(item.share*100).toFixed(2)}%"></i></span>${percent(item.share)}</div></td><td>${action(item,"confirmed",n(item.confirmed))}</td><td>${percent(item.confirmRate)}</td><td>${action(item,"review",n(item.review))}</td></tr>`).join(""):`<tr><td colspan="6"><div class="commercial-semantic-empty compact"><span>No hay causas individuales para los filtros seleccionados.</span></div></td></tr>`;

  return `
    <section class="commercial-semantic-section" aria-labelledby="commercialSemanticTitle">
      <div class="commercial-semantic-heading">
        <div><span class="commercial-semantic-kicker">Análisis complementario</span><h2 id="commercialSemanticTitle">Causa raíz comercial</h2></div>
        <div class="commercial-semantic-chips"><span class="commercial-semantic-badge">Corte ${esc(state.meta.commercialVerbatim?.cutoff||state.meta.cutoff||"—")}</span><span class="commercial-semantic-badge available">Colombia · disponible</span>${outside?`<span class="commercial-semantic-badge unavailable">${n(outside)} fuera de cobertura</span>`:""}</div>
      </div>
      ${noSemantic}
      ${commercialSemanticKpi("Principal grupo",principal?principal.category:"N/D",principal?`${n(principal.cases)} casos · ${percent(principal.share)}`:"Sin causa raíz")}
      <section class="grid-2 commercial-semantic-grid">
        ${chartCard("Grupos de causa","Distribución de casos con causa raíz disponible","commercialCauseGroups","tall")}
        ${chartCard("Top 10 submotivos","Causas específicas de mayor volumen","commercialSubmotives","tall")}
      </section>
      ${chartCard("Evolución mensual de causas","Principales grupos de causa dentro del periodo visible","commercialCauseMonthly","commercial-semantic-monthly")}
      <section class="card commercial-semantic-table-card">
        <div class="card-head"><div><h3>Detalle semántico</h3><p>Top 10 de submotivos · universo único conciliado con filtros globales</p></div><div class="semantic-table-meta"><span class="semantic-table-count">Top 10</span><span class="semantic-table-count">${n(s.semantic.length)} casos</span></div></div>
        <div class="table-wrap commercial-semantic-table-wrap"><table class="data-table commercial-semantic-table"><thead><tr>${[["category","Submotivo"],["cases","Casos"],["share","Participación"],["confirmed","Confirmadas"],["confirmRate","Tasa confirmación"],["review","Revisión"]].map(([key,label])=>`<th><button type="button" class="semantic-sort" data-semantic-sort="${key}">${label}${state.commercialSemanticSort.key===key?` <span aria-hidden="true">${state.commercialSemanticSort.direction==="desc"?"↓":"↑"}</span>`:""}</button></th>`).join("")}</tr></thead><tbody>${tableRows}</tbody></table></div>
      </section>
    </section>`;
}

function renderCommercialCauseCharts(rows,model=buildCommercialSemanticModel(rows)){
  const s=model.stats;
  if(!s.semantic.length) return;
  const groups=model.groups;
  const subs=model.submotives.slice(0,10);

  chart("commercialCauseGroups",{
    type:"bar",
    data:{
      labels:groups.map(x=>x.category),
      datasets:[{label:"Casos",data:groups.map(x=>x.cases),backgroundColor:COLORS.navy,borderRadius:6,borderSkipped:false,maxBarThickness:26}]
    },
    plugins:[corporateValueLabelsPlugin],
    options:{
      ...baseChartOptions({horizontal:true}),
      indexAxis:"y",
      layout:{padding:{right:68}},
      plugins:{
        ...baseChartOptions({horizontal:true}).plugins,
        corporateValueLabels:{enabled:true,fontSize:9,formatter(value,index){return `${formatNumber(value)} · ${percent(groups[index].share)}`;}},
        tooltip:getCorporateTooltipOptions({callbacks:{
          label(ctx){const item=groups[ctx.dataIndex];return `Casos: ${formatNumber(item.cases)} · ${percent(item.share)}`;},
          afterLabel(ctx){const item=groups[ctx.dataIndex];return `Confirmadas: ${formatNumber(item.confirmed)} · Revisión: ${formatNumber(item.review)}`;}
        }})
      },
      scales:{
        x:{beginAtZero:true,grid:{color:CHART_THEME.grid},border:{display:false},ticks:{color:CHART_THEME.text,font:{size:9},callback:v=>formatNumber(v)}},
        y:{grid:{display:false},border:{display:false},ticks:{color:CHART_THEME.text,font:{size:10,weight:"600"},callback(value){return wrapChartLabel(this.getLabelForValue(value),34);}}}
      }
    }
  },{selectionFormatter(chartInstance,index){const item=groups[index];return `${item.category} · ${formatNumber(item.cases)} · ${percent(item.share)}`;},onSelect(index,chartInstance,canvas){const item=groups[index];openCommercialSemanticAudit(s.semantic.filter(r=>r.causeGroup===item.category),`Grupo de causa · ${item.category}`,item.category,"",s.semantic.length,canvas);}});

  chart("commercialSubmotives",{
    type:"bar",
    data:{
      labels:subs.map(x=>x.category),
      datasets:[{label:"Casos",data:subs.map(x=>x.cases),backgroundColor:COLORS.red,borderRadius:6,borderSkipped:false,maxBarThickness:24}]
    },
    plugins:[corporateValueLabelsPlugin],
    options:{
      ...baseChartOptions({horizontal:true}),
      indexAxis:"y",
      layout:{padding:{right:68}},
      plugins:{
        ...baseChartOptions({horizontal:true}).plugins,
        corporateValueLabels:{enabled:true,fontSize:9,formatter(value,index){return `${formatNumber(value)} · ${percent(subs[index].share)}`;}},
        tooltip:getCorporateTooltipOptions({callbacks:{
          label(ctx){const item=subs[ctx.dataIndex];return `Casos: ${formatNumber(item.cases)} · ${percent(item.share)}`;},
          afterLabel(ctx){const item=subs[ctx.dataIndex];return `Tasa confirmación: ${percent(item.confirmRate)} · Revisión: ${formatNumber(item.review)}`;}
        }})
      },
      scales:{
        x:{beginAtZero:true,grid:{color:CHART_THEME.grid},border:{display:false},ticks:{color:CHART_THEME.text,font:{size:9},callback:v=>formatNumber(v)}},
        y:{grid:{display:false},border:{display:false},ticks:{color:CHART_THEME.text,font:{size:9.5,weight:"600"},callback(value){return wrapChartLabel(this.getLabelForValue(value),38);}}}
      }
    }
  },{selectionFormatter(chartInstance,index){const item=subs[index];return `${item.category} · ${formatNumber(item.cases)} · ${percent(item.share)}`;},onSelect(index,chartInstance,canvas){const item=subs[index];openCommercialSemanticAudit(s.semantic.filter(r=>r.submotive===item.category),`Submotivo · ${item.category}`,item.group,item.category,s.semantic.length,canvas);}});

  const months=MONTHS.filter(month=>s.semantic.some(r=>r.month===month));
  const topGroups=groups.slice(0,4).map(x=>x.category);
  const palette=[COLORS.navy,COLORS.red,COLORS.amber,COLORS.green,COLORS.slate];
  const datasets=topGroups.map((name,index)=>({
    label:name,
    data:months.map(month=>s.semantic.filter(r=>r.month===month&&r.causeGroup===name).length),
    backgroundColor:palette[index],borderRadius:4,borderSkipped:false,maxBarThickness:34,stack:"cause"
  }));
  const remainder=months.map(month=>s.semantic.filter(r=>r.month===month&&!topGroups.includes(r.causeGroup)).length);
  if(remainder.some(Boolean)) datasets.push({label:"Otras causas",data:remainder,backgroundColor:palette[4],borderRadius:4,borderSkipped:false,maxBarThickness:34,stack:"cause"});

  chart("commercialCauseMonthly",{
    type:"bar",
    data:{labels:months,datasets},
    options:{
      responsive:true,maintainAspectRatio:false,animation:{duration:REDUCED_MOTION?0:480},
      plugins:{
        legend:getCorporateLegendOptions(),
        tooltip:getCorporateTooltipOptions({displayColors:true,callbacks:{
          label(ctx){return `${ctx.dataset.label}: ${formatNumber(ctx.raw)}`;},
          footer(items){const month=months[items?.[0]?.dataIndex]||"";const total=s.semantic.filter(r=>r.month===month).length;return `Total mes: ${formatNumber(total)}`;}
        }})
      },
      scales:{
        x:{stacked:true,grid:{display:false},border:{display:false},ticks:{color:CHART_THEME.text,font:{size:9}}},
        y:{stacked:true,beginAtZero:true,grid:{color:CHART_THEME.grid},border:{display:false},ticks:{color:CHART_THEME.text,font:{size:9},callback:v=>formatNumber(v)}}
      }
    }
  },{selectionFormatter(chartInstance,index){const month=months[index];return `${month} · ${formatNumber(s.semantic.filter(r=>r.month===month).length)} casos con causa raíz`;}});
}

function openCommercialSemanticAudit(rows,title,group="",submotive="",universe=rows.length,trigger=null){
  openAuditDetail({mode:"commercial-semantic",rows,title,subtitle:"Auditoría semántica segura",group,submotive,area:"Comercial",universe,chartId:trigger?.id||""},trigger);
}

function bindCommercialAnalytics(rows,model){
  document.querySelectorAll("[data-commercial-month]").forEach(button=>button.addEventListener("click",()=>{
    const month=button.dataset.commercialMonth,range=button.dataset.commercialRange;
    let detail=rows.filter(r=>(month==="__all__"||r.month===month)&&OP_CLASSES.has(r.classification));
    if(range==="05") detail=detail.filter(r=>Number(r.flag05)===1);
    if(range==="015") detail=detail.filter(r=>Number(r.flag015)===1);
    openAuditDetail({rows:detail,title:month==="__all__"?"Detalle mensual · Total":`Detalle mensual · ${month}`,subtitle:range==="05"?"Cierres 0–5 días":range==="015"?"Cierres 0–15 días":"Registros P+Q",area:"Comercial",universe:month==="__all__"?areaStats(rows).total:areaStats(rows.filter(r=>r.month===month)).total},button);
  }));
  document.querySelectorAll("[data-semantic-sort]").forEach(button=>button.addEventListener("click",()=>{
    const key=button.dataset.semanticSort,current=state.commercialSemanticSort;
    state.commercialSemanticSort={key,direction:current.key===key&&current.direction==="desc"?"asc":"desc"};
    renderArea("commercial");
  }));
  document.querySelectorAll("[data-semantic-sub]").forEach(button=>button.addEventListener("click",()=>{
    const sub=button.dataset.semanticSub,kind=button.dataset.semanticKind;
    let detail=model.stats.semantic.filter(r=>r.submotive===sub);
    if(kind==="confirmed") detail=detail.filter(r=>r.semanticCauseState==="CONFIRMADA");
    if(kind==="review") detail=detail.filter(r=>r.requiresReview);
    openCommercialSemanticAudit(detail,`Submotivo · ${sub}`,detail[0]?.causeGroup||"",sub,model.stats.semantic.length,button);
  }));
}

function renderArea(view){
  const area=AREA_MAP[view], label=AREA_LABEL[view];
  $("#pageTitle").textContent=label;
  const rows=filtered().filter(r=>r.area===area), st=areaStats(rows);
  const legal=rows.filter(r=>r.classification==="Solicitud legal").length;
  const thanks=rows.filter(r=>r.classification==="Agradecimiento").length;
  const topM=topValue(rows,"motive");
  const monthly=MONTHS.map(m=>{
    const mr=rows.filter(r=>r.month===m), ms=areaStats(mr);
    return {month:m,total:ms.total,w5:ms.within5,op:ms.op,w15:ms.within15,op15:ms.op15};
  }).filter(x=>x.total>0);

  const isMedical=view==="medical";
  const isCommercial=view==="commercial";
  const medicalBlock = isMedical && state.medical && state.medical.doctors?.length ? renderMedicalTrackingBlock(rows) : "";
  const commercialModel = isCommercial ? buildCommercialSemanticModel(rows) : null;
  const commercialBlock = isCommercial ? renderCommercialCauseBlock(rows,commercialModel) : "";

  $("#view").innerHTML=`
    <section class="kpi-grid ${isMedical?"medical-primary-kpis":""}">
      ${kpi("Registros P+Q",n(st.total),"Base operativa")}
      ${kpi("Oportunidad 0–5",percent(st.op),`${n(st.within5)} cierres 0–5`,"green")}
      ${kpi("Gestión 0–15",percent(st.op15),`${n(st.within15)} cierres 0–15`)}
      ${kpi("Abiertas",n(st.open),"Peticiones + Quejas","amber")}
      ${kpi("Solicitud legal",n(legal),"Clasificación independiente")}
      ${kpi("Agradecimientos",n(thanks),"Clasificación independiente")}
    </section>
    <section class="grid-2 ${isMedical?"medical-overview-grid":""}">
      ${chartCard("Volumen y oportunidad",isMedical?"Registros P+Q y oportunidad 0–5 por mes":"Volumen mensual y nivel de oportunidad del área","areaTrend",isMedical?"medical-volume-chart":"tall")}
      ${chartCard(isMedical?"Principales motivos del Área Médica":"Principales motivos",isMedical?"Área Médica · ranking por volumen":"Ranking de motivos con mayor volumen en el área","areaMotives",isMedical?"medical-reasons-chart":"tall")}
    </section>
    <section class="card ${isMedical?"medical-monthly-details":""}">
      ${isMedical?`<button class="medical-monthly-trigger" type="button" aria-expanded="false" aria-controls="medicalMonthlyPanel"><span><strong>Detalle mensual</strong><small>Consulta la evolución por mes</small></span><i aria-hidden="true">⌄</i></button>`:`<div class="card-head"><div><h3>Detalle mensual</h3><p>Registros, cierres por rango y porcentaje de oportunidad</p></div></div>`}
      <div id="${isMedical?"medicalMonthlyPanel":"areaMonthlyPanel"}" class="table-wrap ${isMedical?"medical-monthly-panel":""}" ${isMedical?'hidden aria-hidden="true"':""}>
        <table class="data-table">
          <thead><tr><th>Mes</th><th>Registros</th><th>0–5 días</th><th>% Oportunidad</th><th>0–15 días</th><th>% 0–15</th></tr></thead>
          <tbody>
            ${monthly.map(x=>`<tr><td class="commercial-month">${esc(x.month)}</td><td>${isCommercial?`<button class="commercial-month-action" data-commercial-month="${esc(x.month)}" data-commercial-range="all">${n(x.total)}</button>`:n(x.total)}</td><td>${isCommercial?`<button class="commercial-month-action" data-commercial-month="${esc(x.month)}" data-commercial-range="05">${n(x.w5)}</button>`:n(x.w5)}</td><td>${isCommercial?`<div class="commercial-opportunity"><span><i style="width:${(x.op*100).toFixed(2)}%"></i></span><b>${percent(x.op)}</b></div>`:percent(x.op)}</td><td>${isCommercial?`<button class="commercial-month-action" data-commercial-month="${esc(x.month)}" data-commercial-range="015">${n(x.w15)}</button>`:n(x.w15)}</td><td>${isCommercial?`<div class="commercial-opportunity secondary"><span><i style="width:${(x.op15*100).toFixed(2)}%"></i></span><b>${percent(x.op15)}</b></div>`:percent(x.op15)}</td></tr>`).join("")}
            <tr class="total-row"><td>Total</td><td>${isCommercial?`<button class="commercial-month-action" data-commercial-month="__all__" data-commercial-range="all">${n(st.total)}</button>`:n(st.total)}</td><td>${n(st.within5)}</td><td>${percent(st.op)}</td><td>${n(st.within15)}</td><td>${percent(st.op15)}</td></tr>
          </tbody>
        </table>
      </div>
    </section>
    ${medicalBlock}
    ${commercialBlock}`;

  const medicalTrendOptions={
    ...baseChartOptions({horizontal:true}),indexAxis:"y",layout:{padding:{right:74}},
    plugins:{...baseChartOptions({horizontal:true}).plugins,corporateValueLabels:{enabled:true,fontSize:10,formatter(value,index){return `${formatNumber(value)} · ${formatPercentage(monthly[index].op)}`;}},tooltip:getCorporateTooltipOptions({callbacks:{label(ctx){const item=monthly[ctx.dataIndex];return `Registros P+Q: ${formatNumber(item.total)}`;},afterLabel(ctx){return `Oportunidad 0–5: ${formatPercentage(monthly[ctx.dataIndex].op)}`;}}})},
    scales:{x:{beginAtZero:true,grid:{color:CHART_THEME.grid},border:{display:false},ticks:{color:CHART_THEME.text,font:{size:9},callback:v=>formatNumber(v)}},y:{grid:{display:false},border:{display:false},ticks:{color:CHART_THEME.text,font:{size:11,weight:"600"}}}}
  };
  chart("areaTrend",isMedical?{
    type:"bar",data:{labels:monthly.map(x=>x.month),datasets:[{label:"Registros P+Q",data:monthly.map(x=>x.total),backgroundColor:"rgba(64,83,107,.86)",hoverBackgroundColor:COLORS.navy,borderRadius:7,borderSkipped:false,maxBarThickness:34}]},plugins:[corporateValueLabelsPlugin],options:medicalTrendOptions
  }:{
    data:{labels:monthly.map(x=>x.month),datasets:[
      {type:"bar",label:"Registros",data:monthly.map(x=>x.total),backgroundColor:"rgba(64,83,107,.82)",borderRadius:6,borderSkipped:false,maxBarThickness:46,yAxisID:"y"},
      {type:"line",label:"% Oportunidad",data:monthly.map(x=>x.op*100),borderColor:COLORS.red,backgroundColor:COLORS.red,tension:.12,pointRadius:3,pointHoverRadius:6,borderWidth:2,yAxisID:"y1"}
    ]},options:{responsive:true,maintainAspectRatio:false,animation:{duration:REDUCED_MOTION?0:480},plugins:{legend:getCorporateLegendOptions(),tooltip:getCorporateTooltipOptions({displayColors:true,callbacks:{label(ctx){return ctx.dataset.label==="% Oportunidad"?`% Oportunidad: ${Number(ctx.raw).toFixed(1).replace(".",",")}%`:`Registros: ${formatNumber(ctx.raw)}`;}}})},scales:{x:{grid:{display:false},border:{display:false},ticks:{font:{size:9},color:CHART_THEME.text}},y:{beginAtZero:true,grid:{color:CHART_THEME.grid},border:{display:false},ticks:{font:{size:9},color:CHART_THEME.text,callback:v=>formatNumber(v)}},y1:{position:"right",min:0,max:100,grid:{display:false},border:{display:false},ticks:{callback:v=>v+"%",font:{size:9},color:CHART_THEME.text}}}}
  },{selectionFormatter(chartInstance,index){return `${monthly[index].month} · ${formatNumber(monthly[index].total)} registros · ${formatPercentage(monthly[index].op)}`;}});
  const motives=groupCount(rows,"motive").slice(0,10);
  chart("areaMotives",{
    type:"bar",data:{labels:motives.map(x=>x[0]),datasets:[{label:"PQRS",data:motives.map(x=>x[1]),backgroundColor:COLORS.navy,borderRadius:5,borderSkipped:false,maxBarThickness:24}]},
    plugins:[corporateValueLabelsPlugin],
    options:{...baseChartOptions({horizontal:true}),indexAxis:"y",layout:{padding:{left:isMedical?12:0,right:isMedical?78:42}},plugins:{...baseChartOptions({horizontal:true}).plugins,corporateValueLabels:{enabled:true,fontSize:isMedical?10:9,formatter(value){return isMedical?`${formatNumber(value)} · ${percent(safeDiv(value,rows.length))}`:formatNumber(value);}},tooltip:getCorporateTooltipOptions({callbacks:{label(ctx){const value=Number(ctx.raw)||0;return `PQRS: ${formatNumber(value)} · ${percent(safeDiv(value,rows.length))}`;}}})},scales:{x:{beginAtZero:true,grid:{color:CHART_THEME.grid},border:{display:false},ticks:{color:CHART_THEME.text,font:{size:9},callback:v=>formatNumber(v)}},y:{grid:{display:false},border:{display:false},ticks:{color:CHART_THEME.text,font:{size:isMedical?10.5:9,weight:isMedical?"600":"normal"},callback(value){return wrapChartLabel(this.getLabelForValue(value),isMedical?42:30);}}}}}
  },{selectionFormatter(chartInstance,index){return `${motives[index][0]} · ${formatNumber(motives[index][1])} PQRS · ${percent(safeDiv(motives[index][1],rows.length))}`;}});
  if(view==="medical") renderMedicalCharts();
  if(view==="commercial"){
    renderCommercialCauseCharts(rows,commercialModel);
    bindCommercialAnalytics(rows,commercialModel);
  }
}

const KPI_DETAIL_CONFIG={
  total:{title:"Total PQRS",noun:"registros"},
  closed:{title:"Cerradas",noun:"registros"},
  open:{title:"Abiertas",noun:"registros"},
  overdue:{title:"Vencidas",noun:"registros"},
  ans05:{title:"ANS 0–5",noun:"casos"},
  management015:{title:"Gestión 0–15",noun:"casos"}
};

function getKpiDetailRows(type){
  const rows=filtered();
  if(type==="closed") return rows.filter(r=>r.state==="Cerrada");
  if(type==="open") return rows.filter(r=>r.state!=="Cerrada");
  if(type==="overdue") return rows.filter(r=>r.state==="Vencida");
  if(type==="ans05") return rows.filter(r=>Number(r.flag05)===1);
  if(type==="management015") return rows.filter(r=>Number(r.flag015)===1);
  return rows;
}

function normalizeKpiSearch(value){
  return clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("es");
}

function kpiDetailContextText(){
  return `${selectedPeriodLabel()} · País: ${selectedDimensionLabel("country","Todos")} · Clasificación: ${selectedDimensionLabel("classification","Todas")} · Área: ${selectedDimensionLabel("area","Todas")}`;
}

function visibleKpiDetailRows(){
  const query=normalizeKpiSearch(state.kpiDetail.search);
  let rows=query?state.kpiDetail.rows.filter(r=>normalizeKpiSearch(`${r.radicado} ${r.motive} ${r.classification} ${r.causeGroup||""} ${r.submotive||""}`).includes(query)):[...state.kpiDetail.rows];
  const key={"radicado-asc":"radicado","state-asc":"state","motive-asc":"motive","area-asc":"area"}[state.kpiDetail.sort]||"radicado";
  return rows.sort((a,b)=>clean(a[key]).localeCompare(clean(b[key]),"es",{numeric:true,sensitivity:"base"}));
}

function renderKpiDetailTable(){
  const body=$("#kpiDetailBody"), head=$("#kpiDetailHead"), wrap=$("#kpiDetailTableWrap"), empty=$("#kpiDetailEmpty");
  if(!body||!wrap||!empty) return;
  const visible=visibleKpiDetailRows();
  const total=state.kpiDetail.rows.length;
  const pages=Math.max(1,Math.ceil(visible.length/state.kpiDetail.pageSize));
  state.kpiDetail.page=Math.min(Math.max(1,state.kpiDetail.page),pages);
  const start=(state.kpiDetail.page-1)*state.kpiDetail.pageSize;
  const pageRows=visible.slice(start,start+state.kpiDetail.pageSize);
  $("#kpiDetailCount").textContent=state.kpiDetail.search?`${n(visible.length)} de ${n(total)} registros`:`${n(total)} registros`;
  $("#kpiDetailPageStatus").textContent=`Página ${state.kpiDetail.page} de ${pages}`;
  $("#kpiDetailPrev").disabled=state.kpiDetail.page<=1;
  $("#kpiDetailNext").disabled=state.kpiDetail.page>=pages;
  const semantic=state.kpiDetail.mode==="commercial-semantic";
  head.innerHTML=semantic?`<tr><th>Radicado</th><th>Periodo</th><th>País</th><th>Ciudad</th><th>Clasificación oficial</th><th>Estado</th><th>Situación</th><th>Motivo oficial</th><th>Grupo de causa</th><th>Submotivo</th><th>Confianza</th><th>Estado metodológico</th></tr>`:`<tr><th>Radicado</th><th>Periodo</th><th>Clasificación</th><th>Área</th><th>Estado</th><th>Motivo</th><th>País</th><th>Ciudad</th><th>Situación</th><th>Responsable</th></tr>`;
  if(!pageRows.length){
    empty.hidden=false;wrap.hidden=true;body.innerHTML="";return;
  }
  empty.hidden=true;wrap.hidden=false;
  body.innerHTML=semantic?pageRows.map(r=>`<tr>
    <td><span class="kpi-detail-radicado">${esc(r.radicado||"Sin radicado")}</span></td><td>${esc([r.month,r.year].filter(Boolean).join(" ")||"Sin dato")}</td>
    <td>${esc(r.country||"Sin dato")}</td><td>${esc(r.city||"Sin dato")}</td><td>${esc(r.classification||"Sin dato")}</td>
    <td><span class="kpi-detail-badge ${r.state==="Vencida"?"overdue":r.state==="Cerrada"?"closed":"open"}">${esc(r.state||"Sin dato")}</span></td><td>${esc(r.situation||"Sin dato")}</td>
    <td class="kpi-detail-motive">${esc(r.motive||"Sin dato")}</td><td>${esc(r.causeGroup||"No disponible")}</td><td>${esc(r.submotive||"No disponible")}</td><td>${esc(r.semanticConfidence||"N/D")}</td><td>${esc(r.semanticCauseState||"N/D")}</td>
  </tr>`).join(""):pageRows.map(r=>`<tr>
    <td><span class="kpi-detail-radicado">${esc(r.radicado||"Sin radicado")}</span></td>
    <td>${esc([r.month,r.year].filter(Boolean).join(" ")||"Sin dato")}</td>
    <td>${esc(r.classification||"Sin dato")}</td><td>${esc(r.area||"Sin dato")}</td>
    <td><span class="kpi-detail-badge ${r.state==="Vencida"?"overdue":r.state==="Cerrada"?"closed":"open"}">${esc(r.state||"Sin dato")}</span></td>
    <td class="kpi-detail-motive">${esc(r.motive||"Sin dato")}</td><td>${esc(r.country||"Sin dato")}</td>
    <td>${esc(r.city||"Sin dato")}</td><td>${esc(r.situation||"Sin dato")}</td><td>${esc(r.responsible||"Sin dato")}</td>
  </tr>`).join("");
}

function auditContextText(config,rows){
  const parts=[`Corte: ${state.meta.cutoff||"Sin dato"}`,`Periodo: ${selectedPeriodLabel()}`,`País: ${selectedDimensionLabel("country","Todos")}`,`Ciudad: ${selectedDimensionLabel("city","Todas")}`,`Área: ${config.area||selectedDimensionLabel("area","Todas")}`,`Clasificación: ${selectedDimensionLabel("classification","Todas")}`,`Situación: ${selectedDimensionLabel("situation","Todas")}`];
  if(config.motive) parts.push(`Motivo: ${config.motive}`);
  if(config.group) parts.push(`Grupo de causa: ${config.group}`);
  if(config.submotive) parts.push(`Submotivo: ${config.submotive}`);
  parts.push(`Registros: ${n(rows.length)}`);
  return parts.join(" · ");
}

function openAuditDetail(config,trigger=null){
  const rows=[...(config.rows||[])];
  closeMobileSidebar(false);
  if(state.trackingDetail.open) closeTrackingDrawer(false);
  state.kpiDetail={open:true,mode:config.mode||"audit",type:"audit",rows,search:"",sort:"radicado-asc",page:1,pageSize:50,trigger:trigger||document.activeElement,auditChartId:config.chartId||"",title:config.title||"Detalle de auditoría"};
  $("#kpiDetailTitle").textContent=config.title||"Detalle de motivo";
  $("#kpiDetailSummary").textContent=`${config.subtitle||"Evidencia"} · ${n(rows.length)} registros · ${percent(safeDiv(rows.length,config.universe||rows.length))}`;
  $("#kpiDetailContext").textContent=auditContextText(config,rows);
  $("#kpiDetailSearch").value="";$("#kpiDetailSort").value="radicado-asc";$("#kpiDetailPageSize").value="50";
  renderKpiDetailTable();
  $("#kpiDetailBackdrop").hidden=false;
  const modal=$("#kpiDetailModal");modal.hidden=false;modal.setAttribute("aria-hidden","false");modal.classList.add("audit-detail-mode");modal.classList.toggle("commercial-semantic-mode",state.kpiDetail.mode==="commercial-semantic");
  document.body.classList.add("kpi-detail-open");
  requestAnimationFrame(()=>$("#kpiDetailClose")?.focus());
}

function openKpiDetail(type,trigger=null){
  const config=KPI_DETAIL_CONFIG[type];
  if(!config||state.view!=="summary") return;
  closeMobileSidebar(false);
  if(state.trackingDetail.open) closeTrackingDrawer(false);
  const rows=getKpiDetailRows(type);
  const universe=filtered().length;
  state.kpiDetail={open:true,mode:"kpi",type,rows,search:"",sort:"radicado-asc",page:1,pageSize:50,trigger:trigger||document.activeElement,title:config.title};
  $("#kpiDetailTitle").textContent=config.title;
  $("#kpiDetailSummary").textContent=(type==="ans05"||type==="management015")
    ? `${n(rows.length)} ${config.noun} · ${percent(safeDiv(rows.length,universe))} del universo filtrado`
    : `${n(rows.length)} ${config.noun}`;
  $("#kpiDetailContext").textContent=kpiDetailContextText();
  $("#kpiDetailSearch").value="";$("#kpiDetailSort").value="radicado-asc";$("#kpiDetailPageSize").value="50";
  renderKpiDetailTable();
  $("#kpiDetailBackdrop").hidden=false;
  const modal=$("#kpiDetailModal");modal.hidden=false;modal.setAttribute("aria-hidden","false");
  document.body.classList.add("kpi-detail-open");
  requestAnimationFrame(()=>$("#kpiDetailClose")?.focus());
}

function closeKpiDetail(returnFocus=true){
  if(!state.kpiDetail.open) return;
  const trigger=state.kpiDetail.trigger;
  const auditChartId=state.kpiDetail.auditChartId;
  state.kpiDetail.open=false;
  if(returnFocus&&trigger&&typeof trigger.focus==="function") trigger.focus();
  $("#kpiDetailBackdrop").hidden=true;
  const modal=$("#kpiDetailModal");modal.setAttribute("aria-hidden","true");modal.hidden=true;modal.classList.remove("audit-detail-mode","commercial-semantic-mode");
  document.body.classList.remove("kpi-detail-open");
  if(auditChartId){const chartInstance=state.charts.find(item=>item.canvas?.id===auditChartId);if(chartInstance)resetChartSelection(chartInstance,auditChartId);}
}

function exportKpiDetailCsv(){
  const rows=(state.kpiDetail.mode==="audit"||state.kpiDetail.mode==="commercial-semantic")?[...state.kpiDetail.rows]:visibleKpiDetailRows();
  if(!rows.length){toast("No hay registros visibles para exportar.");return;}
  const semantic=state.kpiDetail.mode==="commercial-semantic";
  const headers=semantic?["Radicado","Periodo","País","Ciudad","Clasificación oficial","Estado","Situación","Motivo oficial","Grupo de causa","Submotivo de causa raíz","Confianza","Estado metodológico"]:["Radicado","Periodo","Clasificación","Área","Estado","Motivo","País","Ciudad","Situación","Responsable"];
  const body=semantic?rows.map(r=>[r.radicado,[r.month,r.year].filter(Boolean).join(" "),r.country,r.city,r.classification,r.state,r.situation,r.motive,r.causeGroup,r.submotive,r.semanticConfidence,r.semanticCauseState]):rows.map(r=>[r.radicado,[r.month,r.year].filter(Boolean).join(" "),r.classification,r.area,r.state,r.motive,r.country,r.city,r.situation,r.responsible]);
  const csv=[headers,...body].map(row=>row.map(v=>`"${clean(v).replace(/"/g,'""')}"`).join(";")).join("\n");
  const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"});
  const link=document.createElement("a");link.href=URL.createObjectURL(blob);
  link.download=`PQRS_${sanitizeFilenamePart(state.kpiDetail.title||KPI_DETAIL_CONFIG[state.kpiDetail.type]?.title||"Detalle")}_${clean(state.meta.cutoff).split("/").reverse().join("")}.csv`;
  link.click();URL.revokeObjectURL(link.href);
}

function handleKpiDetailClick(event){
  const trigger=event.target.closest("[data-kpi-detail]");
  if(trigger) openKpiDetail(trigger.dataset.kpiDetail,trigger);
}

function trapKpiDetailFocus(event){
  if(!state.kpiDetail.open||event.key!=="Tab") return;
  const modal=$("#kpiDetailModal");
  const focusable=[...modal.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(el=>el.offsetParent!==null);
  if(!focusable.length) return;
  const first=focusable[0],last=focusable.at(-1);
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
}

function medicalNameKey(name){
  return clean(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .toLocaleLowerCase("es")
    .replace(/\s+/g," ")
    .trim();
}
function isMedicalUnassigned(name){
  const key=medicalNameKey(name).replace(/[()]/g,"").trim();
  return !key || key==="en blanco";
}
function getMedicalDoctorMetrics(){
  const m=state.medical||{};
  const grouped=new Map();
  const ensure=name=>{
    const key=medicalNameKey(name);
    if(!grouped.has(key)) grouped.set(key,{
      key,name:clean(name)||"Sin médico asignado",total:0,open:0,closed:0,
      age05:0,age510:0,age1015:0,age16:0,ageTotal:0
    });
    return grouped.get(key);
  };

  (m.doctors||[]).forEach(d=>{
    const row=ensure(d.name);
    row.total+=Number(d.total)||0;
    row.open+=Number(d.open)||0;
    row.closed+=Number(d.closed)||0;
  });
  (m.openAging||[]).forEach(a=>{
    const row=ensure(a.name);
    row.age05+=Number(a["0-5"])||0;
    row.age510+=Number(a["5-10"])||0;
    row.age1015+=Number(a["10-15"])||0;
    row.age16+=Number(a["+16"])||0;
    row.ageTotal+=Number(a.total)||0;
  });

  const rows=[...grouped.values()].map(r=>({
    ...r,
    openPct:safeDiv(r.open,r.total),
    closedPct:safeDiv(r.closed,r.total),
    criticalPct:safeDiv(r.age16,r.open),
    recentPct:safeDiv(r.age05,r.open)
  }));
  const unassigned=rows.find(r=>isMedicalUnassigned(r.name))||{total:0,open:0,closed:0,age16:0,criticalPct:0};
  const doctors=rows.filter(r=>!isMedicalUnassigned(r.name)).sort((a,b)=>b.total-a.total || a.name.localeCompare(b.name,"es"));
  const assignedTotal=doctors.reduce((s,r)=>s+r.total,0);
  const assignedOpen=doctors.reduce((s,r)=>s+r.open,0);
  const assignedClosed=doctors.reduce((s,r)=>s+r.closed,0);
  const assignedCritical=doctors.reduce((s,r)=>s+r.age16,0);
  doctors.forEach(r=>{ r.loadPct=safeDiv(r.total,assignedTotal); });
  return {doctors,unassigned,assignedTotal,assignedOpen,assignedClosed,assignedCritical};
}
function medicalPercentCell(value,kind="neutral"){
  const pct=Math.max(0,Math.min(1,Number(value)||0));
  return `<div class="medical-percent ${kind}">
    <div class="medical-percent-top"><strong>${percent(pct)}</strong></div>
    <div class="medical-percent-track" aria-hidden="true"><span style="width:${(pct*100).toFixed(1)}%"></span></div>
  </div>`;
}
function renderMedicalTrackingBlock(filteredMedicalRows=[]){
  const m=state.medical;
  const md=getMedicalDoctorMetrics();
  const syncedTotal=filteredMedicalRows.length;
  const syncedOpen=filteredMedicalRows.filter(r=>r.state!=="Cerrada").length;
  const syncedClosed=filteredMedicalRows.filter(r=>r.state==="Cerrada").length;
  const syncedCritical=filteredMedicalRows.filter(r=>r.state!=="Cerrada"&&Number(r.openDays)>=16).length;
  const doctorRows=md.doctors.map(d=>`
    <tr>
      <td class="medical-doctor-name"><strong>${esc(d.name)}</strong><span>${percent(d.loadPct)} · Participación de carga</span></td>
      <td><strong>${n(d.total)}</strong></td>
      <td><strong class="medical-open-value">${n(d.open)}</strong></td>
      <td>${medicalPercentCell(d.openPct,"open")}</td>
      <td><strong class="medical-closed-value">${n(d.closed)}</strong></td>
      <td>${medicalPercentCell(d.closedPct,"closed")}</td>
      <td><strong>${n(d.age16)}</strong><span class="medical-cell-sub">de ${n(d.open)} abiertas</span></td>
      <td>${medicalPercentCell(d.criticalPct,"critical")}</td>
    </tr>`).join("");

  return `
    <div class="section-title medical-section-title"><div><h2>Seguimiento PQRS Área Médica</h2><p>Estado y antigüedad actualizados con los filtros activos.</p></div><span class="badge">${esc(selectedPeriodLabel())}</span></div>
    ${syncedTotal?`<section class="kpi-grid medical-kpi-grid medical-tracking-section">
      ${kpi("PQRS filtradas",n(syncedTotal),"Registros del Área Médica")}
      ${kpi("PQRS abiertas",n(syncedOpen),percent(safeDiv(syncedOpen,syncedTotal)),"amber")}
      ${kpi("PQRS cerradas",n(syncedClosed),percent(safeDiv(syncedClosed,syncedTotal)),"green")}
      ${kpi("Abiertas 16+ días",n(syncedCritical),`${percent(safeDiv(syncedCritical,syncedOpen))} del backlog filtrado`,"red")}
      ${kpi("Con médico asignado",n(md.assignedTotal),"Snapshot médico al corte","green")}
      ${kpi("Sin médico asignado",n(md.unassigned.total),"Snapshot médico al corte","amber")}
    </section>`:`<div class="medical-tracking-empty" role="status">No hay casos de seguimiento para los filtros seleccionados.</div>`}
    <section class="grid-2">
      ${chartCard("Carga por médico","Abiertas y cerradas por médico identificado; se excluye el grupo sin asignación","medicalDoctors","tall")}
      ${chartCard("Antigüedad abierta","Distribución del backlog médico por días en gestión","medicalAging")}
    </section>
    <section class="card medical-detail-card">
      <div class="card-head medical-detail-head"><div><h3>Detalle por médico</h3><p>Snapshot médico al corte: carga, estado y backlog de 16+ días.</p></div><span class="medical-detail-count">${n(md.assignedTotal)} PQRS con médico</span></div>
      <div class="medical-table-legend" aria-label="Leyenda de indicadores">
        <span><i class="medical-dot open"></i> Abiertas</span>
        <span><i class="medical-dot closed"></i> Cerradas</span>
        <span><i class="medical-dot critical"></i> 16+ días sobre abiertas</span>
      </div>
      <div class="table-wrap"><table class="data-table medical-doctor-table">
        <thead><tr><th>Médico</th><th>Total</th><th>PQRS abiertas</th><th>% abiertas</th><th>PQRS cerradas</th><th>% cerradas</th><th>Abiertas 16+</th><th>% 16+ / abiertas</th></tr></thead>
        <tbody>
          ${doctorRows || `<tr><td colspan="8" class="empty">No hay médicos identificados en la fuente.</td></tr>`}
          <tr class="total-row"><td>Total médicos identificados</td><td>${n(md.assignedTotal)}</td><td>${n(md.assignedOpen)}</td><td>${percent(safeDiv(md.assignedOpen,md.assignedTotal))}</td><td>${n(md.assignedClosed)}</td><td>${percent(safeDiv(md.assignedClosed,md.assignedTotal))}</td><td>${n(md.assignedCritical)}</td><td>${percent(safeDiv(md.assignedCritical,md.assignedOpen))}</td></tr>
        </tbody>
      </table></div>
    </section>`;
}
function renderMedicalCharts(){
  const m=state.medical;
  const md=getMedicalDoctorMetrics();
  const docs=md.doctors;
  chart("medicalDoctors",{type:"bar",data:{labels:docs.map(d=>d.name),datasets:[
    {label:"Abiertas",data:docs.map(d=>d.open),backgroundColor:COLORS.red,borderRadius:4,borderSkipped:false},
    {label:"Cerradas",data:docs.map(d=>d.closed),backgroundColor:COLORS.green,borderRadius:4,borderSkipped:false}
  ]},options:{...baseChartOptions({horizontal:true,legend:true,stacked:true}),indexAxis:"y",plugins:{legend:getCorporateLegendOptions(),tooltip:getCorporateTooltipOptions({displayColors:true,callbacks:{label(ctx){const d=docs[ctx.dataIndex];const value=Number(ctx.parsed.x)||0;const share=ctx.dataset.label==="Abiertas"?d.openPct:d.closedPct;return `${ctx.dataset.label}: ${formatNumber(value)} · ${percent(share)}`;},afterBody(items){const d=docs[items?.[0]?.dataIndex];return d?`Carga total: ${formatNumber(d.total)} · 16+ abiertas: ${formatNumber(d.age16)}`:"";}}})},scales:{x:{stacked:true,grid:{color:CHART_THEME.grid},border:{display:false},ticks:{color:CHART_THEME.text,font:{size:9},callback:v=>formatNumber(v)}},y:{stacked:true,grid:{display:false},border:{display:false},ticks:{color:CHART_THEME.text,font:{size:8}}}}}},
    {selectionFormatter(chartInstance,index){const d=docs[index];return `${d.name} · ${formatNumber(d.open)} abiertas (${percent(d.openPct)}) · ${formatNumber(d.closed)} cerradas (${percent(d.closedPct)})`;}});
  const a=m.openAgingTotals||{};
  const agingValues=[a["0-5"]||0,a["5-10"]||0,a["10-15"]||0,a["+16"]||0];
  const agingTotal=agingValues.reduce((x,y)=>x+(Number(y)||0),0);
  chart("medicalAging",{type:"doughnut",data:{labels:["0–5","6–10","10–15","16+"],datasets:[{data:agingValues,backgroundColor:[COLORS.green,COLORS.amber,COLORS.orange,COLORS.red],borderColor:"#fff",borderWidth:3,hoverOffset:7}]},plugins:[doughnutCenterPlugin],options:{responsive:true,maintainAspectRatio:false,animation:{duration:REDUCED_MOTION?0:480},cutout:"70%",plugins:{legend:doughnutLegendOptions(agingValues),tooltip:getCorporateTooltipOptions({callbacks:{label(ctx){const value=Number(ctx.raw)||0;return `${ctx.label}: ${formatNumber(value)} · ${percent(safeDiv(value,agingTotal))}`;}}}),doughnutCenter:{enabled:true,label:"Abiertas",value:agingTotal}}}},
    {selectionFormatter(chartInstance,index){const value=agingValues[index]||0;return `${chartInstance.data.labels[index]} días · ${formatNumber(value)} abiertas`;}});
}

function ageClass(day){
  return day<=5?"g1":day<=10?"g2":day<=15?"g3":"g4";
}

function getTrackingRows(){
  return filtered().filter(r=>
    r.state!=="Cerrada" &&
    Number(r.openDays)>0 &&
    clean(r.responsible)!==""
  );
}

function trackingRangeMatch(day,range){
  const d=Number(day);
  if(!Number.isFinite(d)) return false;
  if(range==="1-5") return d>=1 && d<=5;
  if(range==="6-10") return d>=6 && d<=10;
  if(range==="11-15") return d>=11 && d<=15;
  if(range==="16+") return d>=16;
  return true;
}

function getTrackingDetail(criteria={}){
  let rows=getTrackingRows();
  if(criteria.responsible) rows=rows.filter(r=>r.responsible===criteria.responsible);
  if(criteria.day!==undefined && criteria.day!==null) rows=rows.filter(r=>Number(r.openDays)===Number(criteria.day));
  if(criteria.range) rows=rows.filter(r=>trackingRangeMatch(r.openDays,criteria.range));
  return rows;
}

function getTrackingCriteriaCopy(criteria={}){
  return {
    responsible:criteria.responsible||null,
    day:criteria.day!==undefined && criteria.day!==null ? Number(criteria.day) : null,
    range:criteria.range||null,
    all:criteria.all===true
  };
}

function trackingCriteriaTitle(criteria,count){
  if(criteria.responsible && criteria.day!==null){
    return {title:criteria.responsible,subtitle:`Día en gestión: ${criteria.day} · ${n(count)} registros`};
  }
  if(criteria.responsible){
    return {title:criteria.responsible,subtitle:`${n(count)} casos abiertos`};
  }
  if(criteria.range){
    return {title:`PQRS de ${criteria.range} días`,subtitle:`${n(count)} registros abiertos`};
  }
  return {title:"Seguimiento completo",subtitle:`${n(count)} casos abiertos con ≥1 día`};
}

function trackingContextText(){
  const country=selectedDimensionLabel("country","Todos");
  const classification=selectedDimensionLabel("classification","Todas");
  const area=selectedDimensionLabel("area","Todas");
  const segment=selectedDimensionLabel("b2b","Todos");
  return `${selectedPeriodLabel()} · País: ${country} · Clasificación: ${classification} · Área: ${area} · Segmentación: ${segment}`;
}

function sortTrackingRows(rows,sortKey){
  const out=[...rows];
  const textCmp=(a,b)=>clean(a).localeCompare(clean(b),"es",{numeric:true,sensitivity:"base"});
  if(sortKey==="days-asc") return out.sort((a,b)=>Number(a.openDays)-Number(b.openDays)||textCmp(a.radicado,b.radicado));
  if(sortKey==="radicado-asc") return out.sort((a,b)=>textCmp(a.radicado,b.radicado));
  if(sortKey==="classification-asc") return out.sort((a,b)=>textCmp(a.classification,b.classification)||Number(b.openDays)-Number(a.openDays));
  if(sortKey==="area-asc") return out.sort((a,b)=>textCmp(a.area,b.area)||Number(b.openDays)-Number(a.openDays));
  return out.sort((a,b)=>Number(b.openDays)-Number(a.openDays)||textCmp(a.radicado,b.radicado));
}

function visibleTrackingDetailRows(){
  const search=clean(state.trackingDetail.search).toLowerCase();
  const base=search
    ? state.trackingDetail.rows.filter(r=>clean(r.radicado).toLowerCase().includes(search))
    : state.trackingDetail.rows;
  return sortTrackingRows(base,state.trackingDetail.sort);
}

function renderTrackingDetailRows(){
  const body=$("#trackingDetailBody"), count=$("#trackingDetailCount"), empty=$("#trackingDetailEmpty"), wrap=$("#trackingDetailTableWrap");
  if(!body || !count || !empty || !wrap) return;
  const visible=visibleTrackingDetailRows();
  const total=state.trackingDetail.rows.length;
  const hasSearch=clean(state.trackingDetail.search)!=="";
  count.textContent=hasSearch ? `${n(visible.length)} de ${n(total)} registros` : `${n(total)} registros`;
  if(!visible.length){
    empty.hidden=false;
    empty.textContent=hasSearch ? "No se encontraron radicados que coincidan con la búsqueda." : "No se encontraron registros para este criterio.";
    wrap.hidden=true;
    body.innerHTML="";
    return;
  }
  empty.hidden=true;
  wrap.hidden=false;
  body.innerHTML=visible.map(r=>`<tr>
    <td data-label="Radicado"><span class="radicado-value">${esc(r.radicado||"Sin radicado")}</span></td>
    <td data-label="Tipo PQRS">${esc(r.classification||"Sin dato")}</td>
    <td data-label="Área">${esc(r.area||"Sin dato")}</td>
    <td data-label="Días"><strong>${n(r.openDays)}</strong></td>
    <td data-label="Estado"><span class="badge ${r.state==="Vencida"?"red":"amber"}">${esc(r.state||"Abierta")}</span></td>
    <td data-label="Motivo" class="tracking-motive">${esc(r.motive||"Sin dato")}</td>
  </tr>`).join("");
}

function openTrackingDrawer(criteria={},trigger=null){
  if(state.kpiDetail.open) closeKpiDetail(false);
  closeMobileSidebar(false);
  const normalized=getTrackingCriteriaCopy(criteria);
  const rows=getTrackingDetail(normalized);
  state.trackingDetail={open:true,criteria:normalized,search:"",sort:"days-desc",rows,trigger:trigger||document.activeElement};
  const title=trackingCriteriaTitle(normalized,rows.length);
  $("#trackingDrawerTitle").textContent=title.title;
  $("#trackingDrawerSubtitle").textContent=title.subtitle;
  $("#trackingDrawerContext").textContent=trackingContextText();
  $("#trackingDetailSearch").value="";
  $("#trackingDetailSort").value="days-desc";
  $("#trackingDetailCutoff").textContent=state.meta.cutoff?`Corte: ${state.meta.cutoff}`:"";
  renderTrackingDetailRows();
  const drawer=$("#trackingDrawer"), overlay=$("#trackingDrawerOverlay");
  overlay.hidden=false;
  drawer.classList.add("open");
  drawer.setAttribute("aria-hidden","false");
  document.body.classList.add("tracking-drawer-open");
  requestAnimationFrame(()=>$("#trackingDrawerClose")?.focus());
}

function closeTrackingDrawer(returnFocus=true){
  if(!state.trackingDetail.open) return;
  const trigger=state.trackingDetail.trigger;
  state.trackingDetail.open=false;
  const drawer=$("#trackingDrawer"), overlay=$("#trackingDrawerOverlay");
  drawer?.classList.remove("open");
  drawer?.setAttribute("aria-hidden","true");
  if(overlay) overlay.hidden=true;
  document.body.classList.remove("tracking-drawer-open");
  if(returnFocus && trigger && typeof trigger.focus==="function") requestAnimationFrame(()=>trigger.focus());
}

function sanitizeFilenamePart(value){
  return clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9]+/g,"_").replace(/^_+|_+$/g,"").slice(0,70)||"Seguimiento";
}

function trackingExportFilename(){
  const c=state.trackingDetail.criteria||{};
  let context="Seguimiento_Completo";
  if(c.responsible && c.day!==null) context=`${c.responsible}_Dia_${c.day}`;
  else if(c.responsible) context=c.responsible;
  else if(c.range) context=`${c.range.replace("+","_Mas")}_Dias`;
  const cutoff=clean(state.meta.cutoff).split("/").reverse().join("")||"corte";
  return `PQRS_${sanitizeFilenamePart(context)}_${cutoff}.csv`;
}

function exportTrackingDetailCSV(){
  const rows=visibleTrackingDetailRows();
  if(!rows.length){ toast("No hay registros visibles para exportar."); return; }
  const headers=["Radicado","Tipo PQRS","Área","Días","Estado","Motivo"];
  const body=rows.map(r=>[r.radicado,r.classification,r.area,r.openDays??"",r.state,r.motive]);
  const csv=[headers,...body].map(row=>row.map(v=>`"${clean(v).replace(/"/g,'""')}"`).join(";")).join("\n");
  const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=trackingExportFilename();
  a.click();
  URL.revokeObjectURL(a.href);
}

function handleTrackingDrilldownClick(event){
  const trigger=event.target.closest("[data-tracking-drilldown]");
  if(!trigger || state.view!=="tracking") return;
  const type=trigger.dataset.trackingDrilldown;
  if(type==="all") return openTrackingDrawer({all:true},trigger);
  if(type==="range") return openTrackingDrawer({range:trigger.dataset.range},trigger);
  if(type==="responsible") return openTrackingDrawer({responsible:trigger.dataset.responsible},trigger);
  if(type==="cell") return openTrackingDrawer({responsible:trigger.dataset.responsible,day:Number(trigger.dataset.day)},trigger);
}

function trapTrackingDrawerFocus(event){
  if(!state.trackingDetail.open || event.key!=="Tab") return;
  const drawer=$("#trackingDrawer");
  if(!drawer) return;
  const focusable=[...drawer.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(el=>el.offsetParent!==null);
  if(!focusable.length) return;
  const first=focusable[0], last=focusable[focusable.length-1];
  if(event.shiftKey && document.activeElement===first){ event.preventDefault(); last.focus(); }
  else if(!event.shiftKey && document.activeElement===last){ event.preventDefault(); first.focus(); }
}

function renderTracking(){
  $("#pageTitle").textContent="Seguimiento PQRS";
  const rows=getTrackingRows();
  const days=[...new Set(rows.map(r=>Number(r.openDays)).filter(Number.isFinite))].sort((a,b)=>a-b);
  const map=new Map();
  rows.forEach(r=>{
    const name=r.responsible, day=Number(r.openDays);
    if(!map.has(name)) map.set(name,new Map());
    map.get(name).set(day,(map.get(name).get(day)||0)+1);
  });
  const people=[...map.entries()].map(([name,m])=>({name,m,total:[...m.values()].reduce((a,b)=>a+b,0)})).sort((a,b)=>b.total-a.total);
  const maxCell=Math.max(1,...people.flatMap(p=>[...p.m.values()]));
  const totalsByDay=days.map(d=>people.reduce((s,p)=>s+(p.m.get(d)||0),0));
  const r15=rows.filter(r=>Number(r.openDays)>=1&&Number(r.openDays)<=5).length;
  const r610=rows.filter(r=>Number(r.openDays)>=6&&Number(r.openDays)<=10).length;
  const r1115=rows.filter(r=>Number(r.openDays)>=11&&Number(r.openDays)<=15).length;
  const r16=rows.filter(r=>Number(r.openDays)>=16).length;
  const trackingKpis=`<section class="kpi-grid">
    ${trackingKpi("Casos seguimiento",n(rows.length),"Abiertas con ≥1 día","",'data-tracking-drilldown="all" aria-label="Ver todos los casos de seguimiento"')}
    ${kpi("Responsables",n(people.length),"Con casos abiertos")}
    ${trackingKpi("1–5 días",n(r15),"Rango inicial","green",'data-tracking-drilldown="range" data-range="1-5" aria-label="Ver PQRS de 1 a 5 días"')}
    ${trackingKpi("6–10 días",n(r610),"Rango medio","amber",'data-tracking-drilldown="range" data-range="6-10" aria-label="Ver PQRS de 6 a 10 días"')}
    ${trackingKpi("11–15 días",n(r1115),"Rango alto","",'data-tracking-drilldown="range" data-range="11-15" aria-label="Ver PQRS de 11 a 15 días"')}
    ${trackingKpi("16+ días",n(r16),"Rango crítico","red",'data-tracking-drilldown="range" data-range="16+" aria-label="Ver PQRS de 16 días o más"')}
  </section>`;

  if(!rows.length){
    $("#view").innerHTML=`${trackingKpis}<section class="card tracking-empty-state" role="status">No hay casos de seguimiento para los filtros seleccionados.</section>`;
    return;
  }

  $("#view").innerHTML=`
    ${trackingKpis}
    <section class="card">
      <div class="card-head">
        <div><h3>Seguimiento por responsable</h3><p>Selecciona una cantidad para ver los registros asociados. Desplaza horizontalmente para revisar todos los días.</p></div>
        <div class="legend">
          <span><i class="age-dot g1"></i>1–5</span><span><i class="age-dot g2"></i>6–10</span><span><i class="age-dot g3"></i>11–15</span><span><i class="age-dot g4"></i>16+</span>
        </div>
      </div>
      <div class="card-body">
        <div class="heatmap-wrap">
          <table class="heatmap" aria-label="Seguimiento de PQRS abiertas por responsable y días en gestión">
            <thead><tr><th>Usuario Responsable</th>${days.map(d=>`<th><span class="day-head"><i class="age-dot ${ageClass(d)}"></i>${d}</span></th>`).join("")}<th class="total">Total</th></tr></thead>
            <tbody>
              ${people.map(p=>`<tr><td>${esc(p.name)}</td>${days.map(d=>{
                const v=p.m.get(d)||0, alpha=v?(.10+.62*(v/maxCell)):0;
                return `<td class="hm-cell" style="${v?`background:rgba(212,58,47,${alpha.toFixed(2)});color:${alpha>.46?"#fff":"#612b27"}`:""}">${v?`<button type="button" class="tracking-cell-btn" data-tracking-drilldown="cell" data-responsible="${esc(p.name)}" data-day="${d}" aria-label="Ver ${v} PQRS de ${esc(p.name)} con ${d} días en gestión" title="Ver ${v} registros">${v}</button>`:""}</td>`;
              }).join("")}<td class="total"><button type="button" class="tracking-total-btn" data-tracking-drilldown="responsible" data-responsible="${esc(p.name)}" aria-label="Ver ${p.total} PQRS de ${esc(p.name)}">${n(p.total)} <span aria-hidden="true">→</span></button></td></tr>`).join("")}
              <tr class="total-row"><td><strong>Total general</strong></td>${totalsByDay.map(v=>`<td><strong>${n(v)}</strong></td>`).join("")}<td class="total"><strong>${n(rows.length)}</strong></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>`;
}

function renderMotives(){
  $("#pageTitle").textContent="Motivos";
  const rows=filtered();
  const areas=["Cartera","Comercial","Médica","Sac"];
  const areaDisplay={Cartera:"Cartera",Comercial:"Comercial","Médica":"Médica",Sac:"SAC"};
  const areaColors={Cartera:COLORS.navy,Comercial:COLORS.red,"Médica":COLORS.navy2,Sac:COLORS.slate};
  const groupsMap=new Map();
  rows.forEach(r=>{
    const motive=clean(r.motive)||"Sin dato";
    if(!groupsMap.has(motive)) groupsMap.set(motive,{motive,total:0,byArea:Object.fromEntries(areas.map(a=>[a,0]))});
    const item=groupsMap.get(motive);
    item.total+=1;
    if(areas.includes(r.area)) item.byArea[r.area]+=1;
  });
  const allGroups=[...groupsMap.values()];
  const rowsByMotive=new Map();
  rows.forEach(row=>{const key=clean(row.motive)||"Sin dato";if(!rowsByMotive.has(key))rowsByMotive.set(key,[]);rowsByMotive.get(key).push(row);});
  const local={area:state.filters.area.size===1?[...state.filters.area][0]:"",sort:state.motivesSort};
  let currentMatrixGroups=[];

  $("#view").innerHTML=`
    <section class="card motives-filter-card motives-integrated-card" aria-labelledby="motivesFilterTitle">
      <div class="card-head motives-filter-head motives-integrated-head">
        <div><h3 id="motivesFilterTitle">Explorar motivos</h3><p>Filtra el contexto del dashboard y ordena la matriz desde un solo lugar.</p></div>
        <button type="button" id="motivesMobileFilterToggle" class="mobile-filter-toggle motives-mobile-filter-toggle" aria-expanded="false" aria-controls="filterMobileDrawer">Filtros <span class="mobile-filter-count">${activeFilterDimensions()}</span></button>
        <div class="motives-global-actions" aria-label="Acciones de filtros del dashboard">
          <button type="button" class="motives-inline-action" id="motivePresetBtn">Periodo libro</button>
          <button type="button" class="motives-inline-action" id="motiveAllYearBtn">Todo el año</button>
          <button type="button" class="motives-inline-action danger" id="motiveGlobalResetBtn">Restablecer filtros</button>
        </div>
      </div>
      <div class="card-body motives-integrated-body">
        <section class="motives-filter-zone motives-global-zone" aria-label="Filtros del dashboard para Motivos">
          <span id="motivesActiveCount" class="filter-active-count" hidden></span>
          <div id="motivesGlobalFilters" class="filters motives-global-filters"></div>
          <div id="motivesActiveChips" class="filter-active-chips" aria-label="Filtros activos de Motivos" aria-live="polite"></div>
          <div id="motivesGlobalFilterContext" class="sr-only" aria-live="polite"></div>
          <div class="motives-filter-summary" id="motiveFilterSummary" aria-live="polite"></div>
        </section>
      </div>
    </section>

    <section class="grid-2 motives-grid">
      <article class="card chart-card motives-chart-card">
        <div class="card-head"><div><h3>Top 15 motivos</h3><p id="motiveTopSubtitle">Ranking de motivos por volumen de PQRS.</p></div></div>
        <div class="card-body">
          <div class="chart-selection-note" data-chart-selection-for="motivesTop" hidden><span class="chart-selection-text"></span><button type="button" data-clear-chart="motivesTop" aria-label="Limpiar selección de Top 15 motivos">Limpiar</button></div>
          <div class="chart-wrap motives-top-wrap" id="motivesTopWrap"><canvas id="motivesTop"></canvas></div>
          <ul id="motivesTopAccessible" class="sr-only"></ul>
        </div>
      </article>
      <article class="card chart-card motives-chart-card">
        <div class="card-head"><div><h3>Participación por área</h3><p id="motiveAreaSubtitle">Comparativo de volumen y participación entre áreas.</p></div></div>
        <div class="card-body">
          <div class="chart-selection-note" data-chart-selection-for="motivesArea" hidden><span class="chart-selection-text"></span><button type="button" data-clear-chart="motivesArea" aria-label="Limpiar selección de Participación por área">Limpiar</button></div>
          <div class="chart-wrap motives-area-wrap" id="motivesAreaWrap"><canvas id="motivesArea"></canvas></div>
          <ul id="motivesAreaAccessible" class="sr-only"></ul>
        </div>
      </article>
    </section>

    <section class="card motives-matrix-card">
      <div class="card-head motives-matrix-head">
        <div><h3>Matriz de motivos</h3><p id="motiveMatrixSubtitle">Comparativo por área con participación dentro del universo visible.</p></div>
        <div class="motives-matrix-actions"><span class="motives-result-count" id="motiveResultCount"></span><button type="button" id="exportMotivesMatrix" class="motives-export-matrix">Exportar matriz CSV</button></div>
      </div>
      <div class="table-wrap motives-table-wrap">
        <table class="data-table motives-table" aria-label="Matriz de motivos por área">
          <thead id="motivesHead"></thead>
          <tbody id="motivesBody"></tbody>
          <tfoot id="motivesFoot"></tfoot>
        </table>
      </div>
    </section>`;

  renderFilters();

  const restoreCanvas=(wrapId,canvasId)=>{
    const wrap=document.getElementById(wrapId);
    if(wrap) wrap.innerHTML=`<canvas id="${canvasId}"></canvas>`;
  };

  const updateLocalView=(refreshCharts=true)=>{
    let visibleGroups=local.area?allGroups.filter(g=>(g.byArea[local.area]||0)>0):allGroups.slice();

    const metric=g=>local.area?(g.byArea[local.area]||0):g.total;
    if(local.sort==="alpha-asc") visibleGroups.sort((a,b)=>a.motive.localeCompare(b.motive,"es",{sensitivity:"base"}));
    else visibleGroups.sort((a,b)=>metric(b)-metric(a) || a.motive.localeCompare(b.motive,"es",{sensitivity:"base"}));
    const matrixGroups=[...visibleGroups];
    const matrixSort=state.motivesMatrixSort;
    if(matrixSort.key){
      const value=group=>matrixSort.key==="motive"?group.motive:matrixSort.key==="total"?group.total:matrixSort.key==="share"?safeDiv(group.total,rows.length):(group.byArea[matrixSort.key]||0);
      matrixGroups.sort((a,b)=>{const av=value(a),bv=value(b);const result=typeof av==="string"?av.localeCompare(bv,"es",{sensitivity:"base"}):av-bv;return matrixSort.direction==="asc"?result:-result;});
    }
    currentMatrixGroups=matrixGroups;

    const scopeTotal=visibleGroups.reduce((sum,g)=>sum+metric(g),0);
    const totalGroups=allGroups.length;
    const areaLabel=local.area?(areaDisplay[local.area]||local.area):"Todas las áreas";

    $("#motiveResultCount").textContent=`${n(visibleGroups.length)} motivos · ${n(scopeTotal)} PQRS · ${local.area?1:areas.length} ${local.area?"área":"áreas"}`;
    $("#motiveTopSubtitle").textContent=local.area
      ? `Ranking por volumen de PQRS en ${areaDisplay[local.area]||local.area}.`
      : "Ranking de motivos por volumen total de PQRS.";
    $("#motiveAreaSubtitle").textContent=local.area
      ? `Comparativo entre áreas; ${areaDisplay[local.area]||local.area} queda resaltada.`
      : "Comparativo de volumen y participación entre áreas.";
    $("#motiveMatrixSubtitle").textContent=local.area
      ? `Vista enfocada en ${areaDisplay[local.area]||local.area}; el total general permite conservar contexto del motivo.`
      : "Comparativo por área con participación dentro del universo visible.";

    const filterParts=[`Área: ${areaLabel}`];
    filterParts.push(`${n(visibleGroups.length)} motivos visibles`);
    filterParts.push(`${n(scopeTotal)} PQRS en el alcance`);
    $("#motiveFilterSummary").innerHTML=`<span>${filterParts.map(esc).join(" · ")}</span>${local.area?`<small>La participación por área conserva el comparativo completo y resalta ${esc(areaDisplay[local.area]||local.area)}.</small>`:""}`;

    const sortIndicator=key=>state.motivesMatrixSort.key===key?(state.motivesMatrixSort.direction==="asc"?" ▲":" ▼"):"";
    const sortHead=(label,key)=>`<button type="button" class="matrix-sort-button" data-matrix-sort="${esc(key)}">${esc(label)}<span aria-hidden="true">${sortIndicator(key)}</span></button>`;
    const maxMatrixValue=Math.max(1,...matrixGroups.flatMap(group=>areas.map(area=>group.byArea[area]||0)));
    const auditButton=(group,value,area="")=>value>0?`<button type="button" class="matrix-cell-action" data-audit-motive="${esc(group.motive)}" data-audit-area="${esc(area)}" title="${esc(group.motive)} · ${esc(areaDisplay[area]||area||"Todas las áreas")} · ${n(value)} registros" style="--audit-intensity:${(.07+.20*(value/maxMatrixValue)).toFixed(3)}">${n(value)}</button>`:"0";

    // Matriz
    if(local.area){
      $("#motivesHead").innerHTML=`<tr><th>${sortHead("Motivo","motive")}</th><th>${sortHead(areaDisplay[local.area]||local.area,local.area)}</th><th>${sortHead("% del área","share")}</th><th>${sortHead("Total general","total")}</th></tr>`;
    }else{
      $("#motivesHead").innerHTML=`<tr><th>${sortHead("Motivo","motive")}</th>${areas.map(a=>`<th>${sortHead(areaDisplay[a]||a,a)}</th>`).join("")}<th>${sortHead("Total","total")}</th><th>${sortHead("Participación","share")}</th></tr>`;
    }

    if(!visibleGroups.length){
      $("#motivesBody").innerHTML=`<tr><td colspan="${local.area?4:7}"><div class="motives-empty">No se encontraron motivos con los filtros locales seleccionados.</div></td></tr>`;
      $("#motivesFoot").innerHTML="";
    }else if(local.area){
      const totalGeneralVisible=visibleGroups.reduce((s,g)=>s+g.total,0);
      $("#motivesBody").innerHTML=matrixGroups.map(g=>{
        const value=g.byArea[local.area]||0;
        const share=safeDiv(value,scopeTotal);
        return `<tr><td class="motives-name"><button type="button" class="matrix-motive-action" data-audit-motive="${esc(g.motive)}">${esc(g.motive)}</button></td><td class="motives-area-value">${auditButton(g,value,local.area)}</td><td><button type="button" class="matrix-share-action" data-audit-motive="${esc(g.motive)}">${renderMotiveShare(share)}</button></td><td>${auditButton(g,g.total)}</td></tr>`;
      }).join("");
      $("#motivesFoot").innerHTML=`<tr><td><strong>Total visible</strong></td><td><strong>${n(scopeTotal)}</strong></td><td><strong>${scopeTotal?"100,0%":"0,0%"}</strong></td><td><strong>${n(totalGeneralVisible)}</strong></td></tr>`;
    }else{
      const areaTotals=Object.fromEntries(areas.map(a=>[a,visibleGroups.reduce((s,g)=>s+(g.byArea[a]||0),0)]));
      $("#motivesBody").innerHTML=matrixGroups.map(g=>{
        const share=safeDiv(g.total,scopeTotal);
        return `<tr><td class="motives-name"><button type="button" class="matrix-motive-action" data-audit-motive="${esc(g.motive)}">${esc(g.motive)}</button></td>${areas.map(a=>`<td>${auditButton(g,g.byArea[a]||0,a)}</td>`).join("")}<td>${auditButton(g,g.total)}</td><td><button type="button" class="matrix-share-action" data-audit-motive="${esc(g.motive)}">${renderMotiveShare(share)}</button></td></tr>`;
      }).join("");
      $("#motivesFoot").innerHTML=`<tr><td><strong>Total visible</strong></td>${areas.map(a=>`<td><strong>${n(areaTotals[a])}</strong></td>`).join("")}<td><strong>${n(scopeTotal)}</strong></td><td><strong>${scopeTotal?"100,0%":"0,0%"}</strong></td></tr>`;
    }

    $("#motivesHead").querySelectorAll("[data-matrix-sort]").forEach(button=>button.addEventListener("click",()=>{
      const key=button.dataset.matrixSort;
      state.motivesMatrixSort=state.motivesMatrixSort.key===key?{key,direction:state.motivesMatrixSort.direction==="asc"?"desc":"asc"}:{key,direction:key==="motive"?"asc":"desc"};
      updateLocalView(false);
    }));

    if(!refreshCharts) return;
    // Gráficos locales
    destroyCharts();
    restoreCanvas("motivesTopWrap","motivesTop");
    restoreCanvas("motivesAreaWrap","motivesArea");
    if(!visibleGroups.length){
      const empty='<div class="motives-chart-empty" role="status">No hay PQRS para los filtros seleccionados.</div>';
      $("#motivesTopWrap").innerHTML=empty;
      $("#motivesAreaWrap").innerHTML=empty;
      return;
    }

    const top=visibleGroups.slice(0,15);
    const topValues=top.map(metric);
    const topColor=local.area?(areaColors[local.area]||COLORS.navy):COLORS.navy;
    $("#motivesTopWrap").style.height=`${Math.min(560,Math.max(320,top.length*34))}px`;
    $("#motivesTopAccessible").innerHTML=top.map((group,index)=>`<li>${esc(group.motive)}: ${n(topValues[index])} registros, ${percent(safeDiv(topValues[index],scopeTotal))}</li>`).join("");
    chart("motivesTop",{
      type:"bar",
      data:{labels:top.map(g=>g.motive),datasets:[{data:topValues,backgroundColor:topColor,borderRadius:6,borderSkipped:false,maxBarThickness:24}]},
      plugins:[corporateValueLabelsPlugin],
      options:{
        ...baseChartOptions({horizontal:true}),
        indexAxis:"y",
        layout:{padding:{right:54,left:4}},
        plugins:{
          ...baseChartOptions({horizontal:true}).plugins,
          corporateValueLabels:{enabled:true,fontSize:10,formatter:value=>`${formatNumber(value)} · ${percent(safeDiv(value,scopeTotal))}`},
          tooltip:getCorporateTooltipOptions({callbacks:{
            label(ctx){const value=Number(ctx.parsed.x)||0;return `${local.area?(areaDisplay[local.area]||local.area):"PQRS"}: ${formatNumber(value)} · ${percent(safeDiv(value,scopeTotal))}`;},
            afterBody(items){
              if(local.area || !items?.length) return "";
              const g=top[items[0].dataIndex];
              return areas.map(a=>`${areaDisplay[a]||a}: ${formatNumber(g.byArea[a]||0)}`).join(" · ");
            }
          }})
        },
        scales:{
          x:{grid:{color:CHART_THEME.grid},border:{display:false},ticks:{color:CHART_THEME.text,font:{size:10},callback:v=>formatNumber(v)}},
          y:{grid:{display:false},border:{display:false},ticks:{color:"#42536a",font:{size:10.5,weight:"600"},callback(value){return wrapChartLabel(this.getLabelForValue(value),36);}}}
        }
      }
    },{selectionFormatter(chartInstance,index){const value=topValues[index]||0;return `${top[index].motive} · ${formatNumber(value)} · ${percent(safeDiv(value,scopeTotal))}`;},onSelect(index,chartInstance,canvas){openMotiveAudit(top[index].motive,local.area,canvas,"motivesTop");}});

    const areaGroups=allGroups;
    const areaValues=areas.map(a=>areaGroups.reduce((s,g)=>s+(g.byArea[a]||0),0));
    const areaTotal=areaValues.reduce((a,b)=>a+b,0);
    const areaBackground=areas.map(a=>local.area?(a===local.area?areaColors[a]:colorWithAlpha(areaColors[a],.22)):areaColors[a]);
    $("#motivesAreaAccessible").innerHTML=areas.map((area,index)=>`<li>${esc(areaDisplay[area]||area)}: ${n(areaValues[index])} registros, ${percent(safeDiv(areaValues[index],areaTotal))}</li>`).join("");
    chart("motivesArea",{
      type:"bar",
      data:{labels:areas.map(a=>areaDisplay[a]||a),datasets:[{data:areaValues,backgroundColor:areaBackground,borderRadius:7,borderSkipped:false,maxBarThickness:34}]},
      plugins:[corporateValueLabelsPlugin],
      options:{
        ...baseChartOptions({horizontal:true}),
        indexAxis:"y",
        layout:{padding:{right:86,left:4}},
        plugins:{
          ...baseChartOptions({horizontal:true}).plugins,
          corporateValueLabels:{enabled:true,fontSize:10,formatter:(value)=>`${formatNumber(value)} · ${percent(safeDiv(value,areaTotal))}`},
          tooltip:getCorporateTooltipOptions({callbacks:{label(ctx){const value=Number(ctx.parsed.x)||0;return `${ctx.label}: ${formatNumber(value)} · ${percent(safeDiv(value,areaTotal))}`;}}})
        },
        scales:{
          x:{grid:{color:CHART_THEME.grid},border:{display:false},ticks:{color:CHART_THEME.text,font:{size:10},callback:v=>formatNumber(v)}},
          y:{grid:{display:false},border:{display:false},ticks:{color:"#42536a",font:{size:11,weight:"700"}}}
        }
      }
    },{selectionFormatter(chartInstance,index){const value=areaValues[index]||0;return `${areaDisplay[areas[index]]||areas[index]} · ${formatNumber(value)} · ${percent(safeDiv(value,areaTotal))}`;},onSelect(index,chartInstance,canvas){openAreaAudit(areas[index],canvas,"motivesArea");}});
  };

  function renderMotiveShare(value){
    const pct=Math.max(0,Math.min(100,(Number(value)||0)*100));
    return `<span class="motives-share"><span class="motives-share-track"><i style="width:${pct.toFixed(1)}%"></i></span><strong>${percent(value)}</strong></span>`;
  }

  function motiveAuditRows(motive,area=""){
    const motiveRows=rowsByMotive.get(motive)||[];
    return area?motiveRows.filter(row=>row.area===area):[...motiveRows];
  }

  function openMotiveAudit(motive,area="",trigger=null,chartId=""){
    const detailRows=motiveAuditRows(motive,area);
    openAuditDetail({title:"Detalle de motivo",subtitle:motive,motive,area:areaDisplay[area]||area,rows:detailRows,universe:rows.length,chartId},trigger);
  }

  function openAreaAudit(area,trigger=null,chartId=""){
    const detailRows=rows.filter(row=>row.area===area);
    openAuditDetail({title:"Detalle por área",subtitle:areaDisplay[area]||area,area:areaDisplay[area]||area,rows:detailRows,universe:rows.length,chartId},trigger);
  }

  function exportMotivesMatrixCsv(){
    if(!currentMatrixGroups.length){toast("No hay matriz visible para exportar.");return;}
    const headers=local.area?["Motivo",areaDisplay[local.area]||local.area,"% del área","Total general"]:["Motivo",...areas.map(area=>areaDisplay[area]||area),"Total","Participación"];
    const total=currentMatrixGroups.reduce((sum,group)=>sum+(local.area?(group.byArea[local.area]||0):group.total),0);
    const body=currentMatrixGroups.map(group=>local.area?[group.motive,group.byArea[local.area]||0,percent(safeDiv(group.byArea[local.area]||0,total)),group.total]:[group.motive,...areas.map(area=>group.byArea[area]||0),group.total,percent(safeDiv(group.total,total))]);
    const csv=[headers,...body].map(row=>row.map(value=>`"${clean(value).replace(/"/g,'""')}"`).join(";")).join("\n");
    const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"});
    const link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download=`Matriz_Motivos_${clean(state.meta.cutoff).split("/").reverse().join("")}.csv`;link.click();URL.revokeObjectURL(link.href);
  }

  $("#motivesBody")?.addEventListener("click",event=>{
    const trigger=event.target.closest("[data-audit-motive]");
    if(!trigger) return;
    openMotiveAudit(trigger.dataset.auditMotive,trigger.dataset.auditArea||"",trigger);
  });
  $("#exportMotivesMatrix")?.addEventListener("click",exportMotivesMatrixCsv);

  $("#motivePresetBtn")?.addEventListener("click",()=>setPreset(true));
  $("#motivesMobileFilterToggle")?.addEventListener("click",event=>openMobileFilters(event.currentTarget));
  $("#motiveAllYearBtn")?.addEventListener("click",()=>{state.filters.month=new Set(unique("month"));renderFilters();renderCurrentView();});
  $("#motiveGlobalResetBtn")?.addEventListener("click",()=>setPreset(true));

  updateLocalView();
}

function renderB2B(){
  $("#pageTitle").textContent="B2B";
  const rows=filtered({b2b:true});
  const b=rows.filter(r=>r.b2b==="B2B"), c=rows.filter(r=>r.b2b==="B2C");
  const bs=summaryStats(b);
  const topConv=groupCount(b.filter(r=>clean(r.convenio)!==""),"convenio").slice(0,12);
  const topMot=groupCount(b,"motive").slice(0,10);

  $("#view").innerHTML=`
    <section class="hero-note">
      <div><h2>Segmentación B2B</h2><p>Vista basada en el campo SEGMENTACIÓN B2B y el convenio registrado en la BBDD. El filtro global de segmentación se ignora aquí para permitir la comparación B2B vs B2C.</p></div>
      <span class="hero-badge">B2B: ${n(b.length)}</span>
    </section>
    <section class="kpi-grid">
      ${kpi("PQRS B2B",n(b.length),percent(safeDiv(b.length,rows.length))+" del universo")}
      ${kpi("PQRS B2C",n(c.length),percent(safeDiv(c.length,rows.length))+" del universo")}
      ${kpi("B2B abiertas",n(bs.open),"Backlog","amber")}
      ${kpi("B2B cerradas",n(bs.closed),percent(safeDiv(bs.closed,bs.total)),"green")}
      ${kpi("B2B ANS 0–5",percent(bs.ans),"Cierres 0–5 / total")}
      ${kpi("Convenios",n(new Set(b.map(r=>r.convenio).filter(Boolean)).size),"Con registros B2B")}
    </section>
    <section class="grid-2">
      ${chartCard("Principales convenios","Ranking de convenios por volumen B2B","b2bConvenios","tall")}
      ${chartCard("Motivos B2B","Ranking de motivos del segmento","b2bMotives","tall")}
    </section>
    ${chartCard("Evolución B2B vs B2C","Comparación mensual del volumen por segmentación","b2bMonthly","tall")}`;

  chart("b2bConvenios",{type:"bar",data:{labels:topConv.map(x=>x[0]),datasets:[{data:topConv.map(x=>x[1]),backgroundColor:COLORS.navy,borderRadius:5,borderSkipped:false,maxBarThickness:22}]},plugins:[corporateValueLabelsPlugin],options:{...baseChartOptions({horizontal:true}),indexAxis:"y",layout:{padding:{right:42}},plugins:{...baseChartOptions({horizontal:true}).plugins,corporateValueLabels:{enabled:true}}}},
    {selectionFormatter(chartInstance,index){return `${topConv[index][0]} · ${formatNumber(topConv[index][1])} PQRS B2B`;}});
  chart("b2bMotives",{type:"bar",data:{labels:topMot.map(x=>x[0]),datasets:[{data:topMot.map(x=>x[1]),backgroundColor:COLORS.navy,borderRadius:5,borderSkipped:false,maxBarThickness:22}]},plugins:[corporateValueLabelsPlugin],options:{...baseChartOptions({horizontal:true}),indexAxis:"y",layout:{padding:{right:42}},plugins:{...baseChartOptions({horizontal:true}).plugins,corporateValueLabels:{enabled:true}}}},
    {selectionFormatter(chartInstance,index){return `${topMot[index][0]} · ${formatNumber(topMot[index][1])} PQRS B2B`;}});
  const months=MONTHS.filter(m=>rows.some(r=>r.month===m));
  const b2bMonthlyValues=months.map(m=>b.filter(r=>r.month===m).length);
  const b2cMonthlyValues=months.map(m=>c.filter(r=>r.month===m).length);
  chart("b2bMonthly",{type:"bar",data:{labels:months,datasets:[
    {label:"B2B",data:b2bMonthlyValues,backgroundColor:COLORS.red,borderRadius:5,borderSkipped:false},
    {label:"B2C",data:b2cMonthlyValues,backgroundColor:COLORS.navy,borderRadius:5,borderSkipped:false}
  ]},options:{...baseChartOptions({legend:true,stacked:true}),plugins:{legend:getCorporateLegendOptions(),tooltip:getCorporateTooltipOptions({displayColors:true,callbacks:{label(ctx){return `${ctx.dataset.label}: ${formatNumber(ctx.raw)}`;}}})},scales:{x:{stacked:true,grid:{display:false},border:{display:false},ticks:{color:CHART_THEME.text,font:{size:9}}},y:{stacked:true,beginAtZero:true,grid:{color:CHART_THEME.grid},border:{display:false},ticks:{color:CHART_THEME.text,font:{size:9},callback:v=>formatNumber(v)}}}}},
    {selectionFormatter(chartInstance,index){return `${months[index]} · B2B: ${formatNumber(b2bMonthlyValues[index])} · B2C: ${formatNumber(b2cMonthlyValues[index])}`;}});
}

function renderLoad(){
  $("#pageTitle").textContent="Fuente local";
  $("#view").innerHTML=`
    <section class="source-grid">
      <div class="source-box"><span>Fuente activa</span><strong>${esc(state.meta.source||"Snapshot")}</strong></div>
      <div class="source-box"><span>Registros</span><strong>${n(state.records.length)}</strong></div>
      <div class="source-box"><span>Modo</span><strong>${state.sourceMode==="snapshot"?"Snapshot incorporado":"Libro cargado localmente"}</strong></div>
      <div class="source-box"><span>Corte de datos</span><strong>${esc(state.meta.cutoff||"—")}</strong></div>
    </section>
    <section id="dropZone" class="drop-zone">
      <div class="file-icon">▣</div>
      <h2>Seleccionar archivo PQRS</h2>
      <p>Admite <strong>.xlsb, .xlsx y .xls</strong>. La lectura se realiza en el navegador y el archivo no se envía a un servidor.<br>
      Para replicar toda la lógica se requiere la hoja <strong>00_BBDD</strong>. Si existe <strong>SEGUIMIENTO_PQRS</strong> (o su nombre histórico), también se incorporará el seguimiento médico.</p>
      <button id="dropButton" class="btn secondary">Seleccionar archivo</button>
      <hr class="soft">
      <p class="note">${esc(state.meta.privacy||"El dashboard utiliza únicamente campos necesarios para análisis.")}</p>
    </section>`;
  const dz=$("#dropZone");
  $("#dropButton").addEventListener("click",()=>$("#fileInput").click());
  ["dragenter","dragover"].forEach(e=>dz.addEventListener(e,ev=>{ev.preventDefault();dz.classList.add("drag")}));
  ["dragleave","drop"].forEach(e=>dz.addEventListener(e,ev=>{ev.preventDefault();dz.classList.remove("drag")}));
  dz.addEventListener("drop",ev=>{const f=ev.dataTransfer.files[0];if(f)loadWorkbook(f)});
}

function renderCurrentView(){
  if(state.view==="b2b" || !document.querySelector(`.nav-item[data-view="${state.view}"]`)) state.view="summary";
  document.body.dataset.view=state.view;
  if(state.kpiDetail.open) closeKpiDetail(false);
  if(state.trackingDetail.open) closeTrackingDrawer(false);
  destroyCharts();
  const filterStrip=document.querySelector(".filter-strip");
  filterStrip?.classList.toggle("filters-integrated-in-view",state.view==="motives");
  $$(".nav-item[data-view]").forEach(b=>{
    const active=b.dataset.view===state.view;
    b.classList.toggle("active",active);
    if(active) b.setAttribute("aria-current","page");
    else b.removeAttribute("aria-current");
  });
  switch(state.view){
    case "summary": renderSummary(); break;
    case "medical":
    case "commercial":
    case "sac":
    case "portfolio": renderArea(state.view); break;
    case "tracking": renderTracking(); break;
    case "motives": renderMotives(); break;
    case "load": renderLoad(); break;
  }
  const descriptions={
    summary:"Visión ejecutiva general de la operación.",
    medical:"Carga, estado y oportunidad del seguimiento médico.",
    commercial:"Lectura ejecutiva de volumen, gestión y causa raíz comercial.",
    sac:"Indicadores operativos de volumen, oportunidad y estado.",
    portfolio:"Comportamiento y distribución de la gestión de cartera.",
    tracking:"Antigüedad y detalle interactivo de casos abiertos.",
    motives:"Analítica de causas y distribución de PQRS."
  };
  const description=$("#pageDescription");
  if(description) description.textContent=descriptions[state.view]||"";
  const eyebrow=$("#pageEyebrow");
  if(eyebrow) eyebrow.hidden=state.view==="summary";
  const view=$("#view");
  view?.classList.remove("view-enter");
  requestAnimationFrame(()=>view?.classList.add("view-enter"));
}

function normalizeHeader(s){
  return clean(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/\s+/g," ");
}
function normalizeCountry(v){
  const s=clean(v);
  return normalizeHeader(s)==="COLOMIA" ? "Colombia" : s;
}
function parseYmdCutoff(v){
  const digits=clean(v).replace(/\.0$/,"").replace(/\D/g,"");
  if(!/^20\d{6}$/.test(digits)) return "";
  return digits;
}
function formatYmdCutoff(v){
  if(!/^20\d{6}$/.test(v||"")) return "";
  return `${v.slice(6,8)}/${v.slice(4,6)}/${v.slice(0,4)}`;
}
function findHeaderIndex(headers, aliases){
  const hs=headers.map(normalizeHeader);
  for(const a of aliases){
    const i=hs.indexOf(normalizeHeader(a));
    if(i>=0) return i;
  }
  return -1;
}
function rowPick(row,headers,aliases){
  const i=findHeaderIndex(headers,aliases);
  return i>=0 ? row[i] : "";
}

function parseMedicalSheet(wb){
  const aliases=["SEGUIMIENTO PQRS AREA MEDICA","SEGUIMIENTO_PQRS"];
  const name=wb.SheetNames.find(n=>aliases.some(a=>normalizeHeader(n)===normalizeHeader(a)));
  if(!name) return null;
  const a=XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,raw:true,defval:""});
  const out={doctors:[],openAging:[],closedAging:[],totals:{}};
  const headerRow=a.findIndex(r=>normalizeHeader(r?.[5])==="NOMBRE MEDICO");
  const startRow=headerRow>=0?headerRow+1:14;
  for(let i=startRow;i<a.length;i++){
    const r=a[i], name=clean(r[5]); if(!name) continue;
    const d={name,total:num(r[6])||0,open:num(r[7])||0,openPct:num(r[8])||0,closed:num(r[9])||0,closedPct:num(r[10])||0};
    if(name.toLowerCase()==="total general"){out.totals=d;break;} out.doctors.push(d);
  }
  for(let i=startRow;i<a.length;i++){
    const r=a[i], name=clean(r[13]); if(!name) continue;
    const d={name,"0-5":num(r[14])||0,"5-10":num(r[15])||0,"10-15":num(r[16])||0,"+16":num(r[17])||0,total:num(r[18])||0};
    if(name.toLowerCase()==="total general"){out.openAgingTotals=d;break;} out.openAging.push(d);
  }
  const closedHeader=a[headerRow>=0?headerRow:13]||[];
  const closedHas05=normalizeHeader(closedHeader[25])==="0-5";
  for(let i=startRow;i<a.length;i++){
    const r=a[i], name=clean(r[21]); if(!name) continue;
    const d={
      name,
      "10-15":num(r[22])||0,
      "+16":num(r[23])||0,
      "5-10":num(r[24])||0,
      "0-5":closedHas05?(num(r[25])||0):0,
      total:closedHas05?(num(r[26])||0):(num(r[25])||0)
    };
    if(name.toLowerCase()==="total general"){out.closedAgingTotals=d;break;} out.closedAging.push(d);
  }
  return out;
}

async function loadWorkbook(file){
  if(!window.XLSX){toast("No se pudo cargar SheetJS. Verifica la conexión a internet.");return;}
  $("#loading").classList.remove("hidden");
  try{
    const ab=await file.arrayBuffer();
    const wb=XLSX.read(ab,{type:"array",dense:true,cellDates:false});
    const bbName=wb.SheetNames.find(n=>normalizeHeader(n)===normalizeHeader("00_BBDD")) ||
                 wb.SheetNames.find(n=>normalizeHeader(n).includes("BBDD"));
    if(!bbName) throw new Error("No se encontró la hoja 00_BBDD.");
    const rows=XLSX.utils.sheet_to_json(wb.Sheets[bbName],{header:1,raw:true,defval:""});
    let hrow=rows.findIndex(r=>r.some(v=>normalizeHeader(v)==="N° RADICADO" || normalizeHeader(v)==="N RADICADO"));
    if(hrow<0) hrow=0;
    const headers=rows[hrow];
    const out=[];
    let maxCutoff="";
    for(let i=hrow+1;i<rows.length;i++){
      const r=rows[i];
      const rad=rowPick(r,headers,["N° RADICADO","N RADICADO"]);
      if(clean(rad)==="") continue;
      const year=clean(rowPick(r,headers,["Año","ANO"]));
      const month=clean(rowPick(r,headers,["Mes2","MES"]));
      const rowCutoff=parseYmdCutoff(rowPick(r,headers,["F_RECEPCION"]));
      if(rowCutoff && rowCutoff>maxCutoff) maxCutoff=rowCutoff;
      const rec={
        radicado:clean(rad),
        year,month,
        country:normalizeCountry(rowPick(r,headers,["Pais","País"])),
        classification:clean(rowPick(r,headers,["Clasificacion","Clasificación"])),
        area:clean(rowPick(r,headers,["Dep Destino","DEP_DESTINO"])),
        state:clean(rowPick(r,headers,["Estado"])),
        openDays:num(rowPick(r,headers,["Días en Gestion Abiertas","Dias en Gestion Abiertas"])),
        closedDays:num(rowPick(r,headers,["Días en Gestion Cerradas","Dias en Gestion Cerradas"])),
        openRange:clean(rowPick(r,headers,["Rango Tiempo Gestion Abiertas"])),
        closedRange:clean(rowPick(r,headers,["Rango Tiempo Gestion Cerradas"])),
        flag05:num(rowPick(r,headers,["0 - 5 Días","0 - 5 Dias"]))===1?1:0,
        flag015:num(rowPick(r,headers,["0-15"]))===1?1:0,
        motive:clean(rowPick(r,headers,["Motivo","MOTIVO QUEJA"])),
        responsible:clean(rowPick(r,headers,["Usuario Responsable2","USUARIO RESPONSABLE"])),
        city:clean(rowPick(r,headers,["Ciudad"])),
        regional:clean(rowPick(r,headers,["Regional"])),
        b2b:clean(rowPick(r,headers,["SEGMENTACIÓN B2B","SEGMENTACION B2B"])),
        convenio:clean(rowPick(r,headers,["CONVENIOS"])),
        situation:clean(rowPick(r,headers,["SITUACIÓN","SITUACION"]))
      };
      out.push(enrichCommercialSemantic(rec));
    }
    if(!out.length) throw new Error("La hoja 00_BBDD no contiene registros utilizables.");
    state.records=out;
    state.medical=parseMedicalSheet(wb);
    state.meta={
      source:file.name,
      rows:out.length,
      availableMonths:uniqueFrom(out,"month"),
      defaultMonths:uniqueFrom(out,"month").slice(-4),
      cutoff:formatYmdCutoff(maxCutoff),
      loadedAt:new Date().toLocaleString("es-CO"),
      privacy:"Archivo procesado localmente; no se envió a un servidor.",
      commercialVerbatim:COMMERCIAL_VERBATIM?.meta||null
    };
    state.sourceMode="uploaded";
    initFilters(true);
    state.view="summary";
    renderCurrentView();
    toast(`Libro cargado: ${fmt.format(out.length)} registros`);
  }catch(err){
    console.error(err);
    toast(err.message || "No fue posible procesar el archivo.");
  }finally{
    $("#loading").classList.add("hidden");
  }
}
function uniqueFrom(rows,field){
  const vals=[...new Set(rows.map(r=>r[field]).filter(Boolean))];
  return field==="month"?vals.sort((a,b)=>MONTHS.indexOf(a)-MONTHS.indexOf(b)):vals.sort();
}

function exportCSV(){
  const rows=filtered();
  const headers=["Año","Mes","País","Clasificación","Área","Estado","Días abiertas","Días cerradas","Motivo","Responsable","Ciudad","Regional","Segmentación B2B","Convenio"];
  const body=rows.map(r=>[r.year,r.month,r.country,r.classification,r.area,r.state,r.openDays??"",r.closedDays??"",r.motive,r.responsible,r.city,r.regional,r.b2b,r.convenio]);
  const csv=[headers,...body].map(row=>row.map(v=>`"${clean(v).replace(/"/g,'""')}"`).join(";")).join("\n");
  const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="PQRS_filtrado.csv"; a.click(); URL.revokeObjectURL(a.href);
}

function toast(msg){
  const t=$("#toast");t.textContent=msg;t.classList.add("show");clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.remove("show"),3200);
}
function updateSourceLabels(){
  // Metadata de fuente disponible únicamente en state.meta para QA; sin salida visual.
}
function setPreset(last4=true){
  state.motivesSort="volume-desc";
  const months=unique("month");
  state.filters.month=new Set(last4 ? (state.meta.defaultMonths||months.slice(-4)) : months);
  state.filters.year=new Set(unique("year"));
  state.filters.country=new Set(unique("country"));
  state.filters.city=new Set(unique("city"));
  state.filters.classification=new Set(unique("classification"));
  state.filters.area=new Set(unique("area"));
  state.trackingFilters.area=new Set(unique("area"));
  state.filters.situation=new Set(unique("situation"));
  state.filters.b2b=new Set(unique("b2b"));
  renderFilters();renderCurrentView();
}

const SIDEBAR_STORAGE_KEY="pqrs.sidebar.collapsed";
const mobileSidebarQuery=window.matchMedia("(max-width: 850px)");
let sidebarTrigger=null;

function getSidebarPreference(){
  try{return localStorage.getItem(SIDEBAR_STORAGE_KEY)==="true";}catch{return false;}
}

function saveSidebarPreference(collapsed){
  try{localStorage.setItem(SIDEBAR_STORAGE_KEY,String(collapsed));}catch{}
}

function resizeChartsAfterSidebar(){
  const resize=()=>state.charts.forEach(chartInstance=>{
    try{ chartInstance.resize(); }catch{}
  });
  const sidebar=$("#sidebar");
  if(REDUCED_MOTION || !sidebar){resize();return;}
  const onTransitionEnd=event=>{
    if(event.propertyName!=="width") return;
    sidebar.removeEventListener("transitionend",onTransitionEnd);
    resize();
  };
  sidebar.addEventListener("transitionend",onTransitionEnd);
}

function syncSidebarState(){
  const sidebar=$("#sidebar"), toggle=$("#sidebarToggleBtn"), menu=$("#menuBtn");
  if(!sidebar) return;
  if(mobileSidebarQuery.matches){
    document.body.classList.remove("sidebar-collapsed");
    const open=sidebar.classList.contains("open");
    if(open){
      sidebar.inert=false;
      sidebar.setAttribute("aria-hidden","false");
    }else{
      if(sidebar.contains(document.activeElement)) menu?.focus();
      sidebar.inert=true;
      sidebar.setAttribute("aria-hidden","true");
      sidebar.classList.remove("open");
    }
    menu?.setAttribute("aria-expanded",open?"true":"false");
    return;
  }
  sidebar.classList.remove("open");
  sidebar.inert=false;
  document.body.classList.remove("mobile-sidebar-open");
  const overlay=$("#sidebarOverlay");
  if(overlay) overlay.hidden=true;
  sidebar.setAttribute("aria-hidden","false");
  menu?.setAttribute("aria-expanded","false");
  const collapsed=getSidebarPreference();
  document.body.classList.toggle("sidebar-collapsed",collapsed);
  toggle?.setAttribute("aria-expanded",collapsed?"false":"true");
  toggle?.setAttribute("aria-label",collapsed?"Expandir menú":"Contraer menú");
  const label=toggle?.querySelector(".nav-label");
  if(label) label.textContent=collapsed?"Expandir menú":"Contraer menú";
}

function openMobileSidebar(trigger=$("#menuBtn")){
  if(!mobileSidebarQuery.matches) return;
  if($("#filterMobileDrawer")?.getAttribute("aria-hidden")==="false") closeMobileFilters(false);
  if(state.kpiDetail.open) closeKpiDetail(false);
  if(state.trackingDetail.open) closeTrackingDrawer(false);
  sidebarTrigger=trigger;
  const sidebar=$("#sidebar"), overlay=$("#sidebarOverlay");
  if(sidebar){
    sidebar.inert=false;
    sidebar.setAttribute("aria-hidden","false");
    sidebar.classList.add("open");
  }
  if(overlay) overlay.hidden=false;
  document.body.classList.add("mobile-sidebar-open");
  $("#menuBtn")?.setAttribute("aria-expanded","true");
  requestAnimationFrame(()=>$("#sidebarCloseBtn")?.focus());
}

function closeMobileSidebar(returnFocus=true){
  const sidebar=$("#sidebar"), overlay=$("#sidebarOverlay");
  const wasOpen=sidebar?.classList.contains("open");
  const focusTarget=sidebarTrigger&&document.contains(sidebarTrigger)?sidebarTrigger:$("#menuBtn");
  if(sidebar&&(sidebar.contains(document.activeElement)||(returnFocus&&wasOpen))) focusTarget?.focus();
  if(sidebar&&mobileSidebarQuery.matches){
    sidebar.inert=true;
    sidebar.setAttribute("aria-hidden","true");
  }
  sidebar?.classList.remove("open");
  if(overlay) overlay.hidden=true;
  document.body.classList.remove("mobile-sidebar-open");
  $("#menuBtn")?.setAttribute("aria-expanded","false");
}

function toggleDesktopSidebar(){
  if(mobileSidebarQuery.matches) return;
  const collapsed=!document.body.classList.contains("sidebar-collapsed");
  saveSidebarPreference(collapsed);
  syncSidebarState();
  resizeChartsAfterSidebar();
}

function trapMobileSidebarFocus(event){
  if(!mobileSidebarQuery.matches || !$("#sidebar")?.classList.contains("open") || event.key!=="Tab") return;
  const items=[...$("#sidebar").querySelectorAll('button:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')].filter(el=>el.offsetParent!==null);
  if(!items.length) return;
  const first=items[0], last=items.at(-1);
  if(event.shiftKey && document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}
}

let mobileFilterTrigger=null;

function openMobileFilters(trigger=$("#mobileFilterToggle")){
  if(innerWidth>560) return;
  if($("#sidebar")?.classList.contains("open")) closeMobileSidebar(false);
  if(state.kpiDetail.open) closeKpiDetail(false);
  if(state.trackingDetail.open) closeTrackingDrawer(false);
  mobileFilterTrigger=trigger;
  const drawer=$("#filterMobileDrawer"), overlay=$("#filterMobileOverlay");
  if(drawer){
    drawer.inert=false;
    drawer.setAttribute("aria-hidden","false");
    drawer.classList.add("open");
  }
  if(overlay) overlay.hidden=false;
  document.body.classList.add("filter-mobile-open");
  trigger?.setAttribute("aria-expanded","true");
  renderFilters();
  requestAnimationFrame(()=>$("#filterMobileClose")?.focus());
}

function closeMobileFilters(returnFocus=true){
  const drawer=$("#filterMobileDrawer"), overlay=$("#filterMobileOverlay");
  const wasOpen=drawer?.classList.contains("open");
  const focusTarget=mobileFilterTrigger&&document.contains(mobileFilterTrigger)?mobileFilterTrigger:$("#motivesMobileFilterToggle")||$("#mobileFilterToggle");
  if(drawer&&(drawer.contains(document.activeElement)||(returnFocus&&wasOpen))) focusTarget?.focus();
  if(drawer){
    drawer.inert=true;
    drawer.setAttribute("aria-hidden","true");
    drawer.classList.remove("open");
  }
  if(overlay) overlay.hidden=true;
  document.body.classList.remove("filter-mobile-open");
  $("#mobileFilterToggle")?.setAttribute("aria-expanded","false");
  $("#motivesMobileFilterToggle")?.setAttribute("aria-expanded","false");
  renderFilters();
}

function trapMobileFilterFocus(event){
  const drawer=$("#filterMobileDrawer");
  if(event.key!=="Tab"||drawer?.getAttribute("aria-hidden")!=="false") return;
  const items=[...drawer.querySelectorAll('button:not([disabled]),input:not([disabled]),summary,[tabindex]:not([tabindex="-1"])')].filter(el=>el.offsetParent!==null);
  if(!items.length) return;
  const first=items[0],last=items.at(-1);
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
}

function handleMedicalMonthlyToggle(event){
  const trigger=event.target.closest(".medical-monthly-trigger");
  if(!trigger) return;
  const panel=$("#medicalMonthlyPanel");
  if(!panel) return;
  const open=trigger.getAttribute("aria-expanded")!=="true";
  trigger.setAttribute("aria-expanded",open?"true":"false");
  panel.hidden=!open;
  panel.setAttribute("aria-hidden",open?"false":"true");
}

function bind(){
  $$(".nav-item[data-view]").forEach(b=>b.addEventListener("click",()=>{
    state.view=b.dataset.view;
    renderFilters();
    renderCurrentView();
    if(mobileSidebarQuery.matches) closeMobileSidebar(false);
  }));
  $("#menuBtn").addEventListener("click",()=>$("#sidebar").classList.contains("open")?closeMobileSidebar(true):openMobileSidebar($("#menuBtn")));
  $("#sidebarCloseBtn")?.addEventListener("click",()=>closeMobileSidebar(true));
  $("#sidebarOverlay")?.addEventListener("click",()=>closeMobileSidebar(true));
  $("#sidebarToggleBtn")?.addEventListener("click",toggleDesktopSidebar);
  mobileSidebarQuery.addEventListener?.("change",syncSidebarState);
  window.addEventListener("resize",syncSidebarState,{passive:true});
  $("#mobileFilterToggle")?.addEventListener("click",event=>openMobileFilters(event.currentTarget));
  $("#filterMobileClose")?.addEventListener("click",()=>closeMobileFilters(true));
  $("#filterMobileDone")?.addEventListener("click",()=>closeMobileFilters(true));
  $("#filterMobileOverlay")?.addEventListener("click",()=>closeMobileFilters(true));
  $("#filterMobileReset")?.addEventListener("click",()=>setPreset(true));
  $("#filterActiveChips")?.addEventListener("click",event=>{
    const chip=event.target.closest("[data-clear-filter]");
    if(chip) clearSingleFilter(chip.dataset.clearFilter);
  });
  document.addEventListener("click",event=>{
    if(!event.target.closest(".filter-dropdown")) closeAllFilterPopovers();
  });
  document.addEventListener("keydown",event=>{
    trapKpiDetailFocus(event);
    trapMobileSidebarFocus(event);
    trapMobileFilterFocus(event);
    if(event.key==="Tab") trapTrackingDrawerFocus(event);
    if(event.key!=="Escape") return;
    if(state.kpiDetail.open){ closeKpiDetail(true); return; }
    if(state.trackingDetail.open){ closeTrackingDrawer(true); return; }
    if($("#filterMobileDrawer")?.getAttribute("aria-hidden")==="false"){closeMobileFilters(true);return;}
    if($("#sidebar")?.classList.contains("open")){ closeMobileSidebar(true); return; }
    closeAllFilterPopovers(null,true);
  });
  $("#loadFileBtn")?.addEventListener("click",()=>$("#fileInput")?.click());
  $("#fileInput")?.addEventListener("change",e=>{const f=e.target.files[0];if(f)loadWorkbook(f);e.target.value="";});
  $("#view").addEventListener("click",event=>{
    const clearFilter=event.target.closest("[data-clear-filter]");
    if(clearFilter){clearSingleFilter(clearFilter.dataset.clearFilter);return;}
    handleTrackingDrilldownClick(event);
    handleMedicalMonthlyToggle(event);
    handleKpiDetailClick(event);
  });
  $("#kpiDetailClose")?.addEventListener("click",()=>closeKpiDetail(true));
  $("#kpiDetailBackdrop")?.addEventListener("click",()=>closeKpiDetail(true));
  $("#kpiDetailSearch")?.addEventListener("input",event=>{state.kpiDetail.search=event.target.value;state.kpiDetail.page=1;renderKpiDetailTable();});
  $("#kpiDetailSort")?.addEventListener("change",event=>{state.kpiDetail.sort=event.target.value;state.kpiDetail.page=1;renderKpiDetailTable();});
  $("#kpiDetailPageSize")?.addEventListener("change",event=>{state.kpiDetail.pageSize=Number(event.target.value)||50;state.kpiDetail.page=1;renderKpiDetailTable();});
  $("#kpiDetailPrev")?.addEventListener("click",()=>{state.kpiDetail.page=Math.max(1,state.kpiDetail.page-1);renderKpiDetailTable();});
  $("#kpiDetailNext")?.addEventListener("click",()=>{state.kpiDetail.page+=1;renderKpiDetailTable();});
  $("#kpiDetailExport")?.addEventListener("click",exportKpiDetailCsv);
  $("#trackingDrawerClose")?.addEventListener("click",()=>closeTrackingDrawer(true));
  $("#trackingDrawerOverlay")?.addEventListener("click",()=>closeTrackingDrawer(true));
  $("#trackingDetailSearch")?.addEventListener("input",event=>{
    state.trackingDetail.search=event.target.value;
    renderTrackingDetailRows();
  });
  $("#trackingDetailSort")?.addEventListener("change",event=>{
    state.trackingDetail.sort=event.target.value;
    renderTrackingDetailRows();
  });
  $("#trackingDetailExport")?.addEventListener("click",exportTrackingDetailCSV);
  $("#exportBtn").addEventListener("click",exportCSV);
  $("#presetBtn").addEventListener("click",()=>setPreset(true));
  $("#allYearBtn").addEventListener("click",()=>{state.filters.month=new Set(unique("month"));renderFilters();renderCurrentView();});
  $("#resetBtn").addEventListener("click",()=>setPreset(true));
  syncSidebarState();
}

try{
  decodeBootstrap();
  bind();
  renderCurrentView();
}catch(err){
  console.error(err);
  document.querySelector("#view").innerHTML=`<div class="empty">No fue posible iniciar el dashboard: ${esc(err.message)}</div>`;
}
})();
