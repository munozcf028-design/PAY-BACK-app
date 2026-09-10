/* ==========================================================
   Sistema PAY BACK - F. Muñoz
   Lógica de cálculo del Período de Recuperación de la Inversión
   ========================================================== */

const STORAGE_KEY = "payback_fmunoz_historial";

/* ---------------- Utilidades generales ---------------- */

function fmtMoney(n) {
  if (n === null || n === undefined || isNaN(n)) return "-";
  return "$" + Number(n).toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtNum(n, dec = 4) {
  if (n === null || n === undefined || isNaN(n)) return "-";
  return Number(n).toLocaleString("es-CO", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function todayStr() {
  const d = new Date();
  return d.toLocaleDateString("es-CO", { year: "numeric", month: "2-digit", day: "2-digit" }) +
    " " + d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.remove("show"), 2400);
}

function uid() {
  return "p_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
}

function escAttr(s) {
  return String(s).replace(/"/g, "&quot;");
}

/* ---------------- Tabs ---------------- */

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("panel-" + btn.dataset.tab).classList.add("active");
    if (btn.dataset.tab === "hist") renderHistorial();
    if (btn.dataset.tab === "m4") { populateHistSelectM4(); renderComparacion(); }
  });
});

/* ==========================================================
   MOTOR DE CÁLCULO
   ========================================================== */

// Núcleo compartido: dado Io y un arreglo de flujos, determina en qué
// período se recupera la inversión y calcula el PRI exacto (años + meses)
// usando: PRI = a + (Io - D) / F   (a = períodos completos previos,
// D = flujo acumulado hasta "a", F = flujo del período de recuperación)
function motorFlujosVariados(io, flujos) {
  const acumulado = [];
  let s = 0;
  for (const f of flujos) {
    s += f;
    acumulado.push(s);
  }

  const idx = acumulado.findIndex((c) => c >= io);

  if (idx === -1) {
    return {
      recuperado: false,
      acumulado,
      totalRecuperado: s,
      faltante: io - s
    };
  }

  const a = idx; // número de períodos que preceden la recuperación
  const D = idx === 0 ? 0 : acumulado[idx - 1];
  const F = flujos[idx];
  const diferencia = io - D;
  const fraccion = F !== 0 ? diferencia / F : 0;

  let meses = Math.round(fraccion * 12);
  let anios = a;
  if (meses >= 12) { anios += 1; meses -= 12; }

  return {
    recuperado: true,
    acumulado,
    periodoRecuperacion: idx + 1, // 1-based
    a,
    D,
    F,
    diferencia,
    fraccion,
    anios,
    meses,
    aniosExactos: a + fraccion
  };
}

function motorFlujoConstante(io, f) {
  if (!f || f <= 0) return { recuperado: false };
  const aniosExactos = io / f;
  let anios = Math.floor(aniosExactos);
  let fraccion = aniosExactos - anios;
  let meses = Math.round(fraccion * 12);
  if (meses >= 12) { anios += 1; meses -= 12; }
  return { recuperado: true, aniosExactos, anios, meses, fraccion };
}

function textoAnalisis(anios, meses, nombre) {
  const partes = [];
  if (anios > 0) partes.push(`${anios} ${anios === 1 ? "año" : "años"}`);
  if (meses > 0) partes.push(`${meses} ${meses === 1 ? "mes" : "meses"}`);
  const tiempo = partes.length ? partes.join(" y ") : "menos de un mes";
  return `Se necesitan ${tiempo} para recuperar la inversión inicial${nombre ? ` del proyecto "${nombre}"` : ""}.`;
}

/* ==========================================================
   MÓDULO 1 · Flujos variados (fórmula)
   ========================================================== */

let m1Flujos = [];

document.getElementById("m1-gen").addEventListener("click", () => {
  const n = parseInt(document.getElementById("m1-n").value, 10);
  if (!n || n < 1 || n > 20) { showToast("Ingresa un número de períodos válido (1-20)"); return; }
  buildFlowTable("m1", n);
});

function buildFlowTable(prefix, n) {
  const theadRow = document.getElementById(prefix + "-thead-row");
  const tbodyRow = document.getElementById(prefix + "-tbody-row");
  theadRow.innerHTML = "";
  tbodyRow.innerHTML = "";
  for (let i = 1; i <= n; i++) {
    const th = document.createElement("th");
    th.textContent = "Año " + i;
    theadRow.appendChild(th);

    const td = document.createElement("td");
    const input = document.createElement("input");
    input.type = "number";
    input.step = "0.01";
    input.id = prefix + "-flow-" + i;
    input.placeholder = "0.00";
    td.appendChild(input);
    tbodyRow.appendChild(td);
  }
  document.getElementById(prefix + "-table-wrap").style.display = "block";
}

function readFlowTable(prefix, n) {
  const flujos = [];
  for (let i = 1; i <= n; i++) {
    const v = parseFloat(document.getElementById(prefix + "-flow-" + i).value);
    flujos.push(isNaN(v) ? 0 : v);
  }
  return flujos;
}

document.getElementById("m1-calc").addEventListener("click", () => {
  const io = parseFloat(document.getElementById("m1-io").value);
  const n = parseInt(document.getElementById("m1-n").value, 10);
  const box = document.getElementById("m1-result");

  if (!io || io <= 0 || !n || n < 1) {
    box.style.display = "block";
    box.innerHTML = `<div class="error-msg">Completa la inversión inicial y el número de períodos, y genera la tabla de flujo de caja.</div>`;
    return;
  }
  const flujos = readFlowTable("m1", n);
  if (flujos.some((f) => f === 0) === false && flujos.length === 0) { /* no-op */ }

  const r = motorFlujosVariados(io, flujos);
  m1Flujos = flujos;
  renderM1Result(io, flujos, r);
});

function renderM1Result(io, flujos, r) {
  const box = document.getElementById("m1-result");
  box.style.display = "block";

  const acumStr = r.acumulado.map((v, i) => `Año ${i + 1}: ${fmtMoney(v)}`).join("   ");

  let stepsHtml = "";
  let badgeHtml = "";
  let analysisHtml = "";

  if (!r.recuperado) {
    stepsHtml = `
<div class="step-line">Flujo acumulado por período:</div>
<div class="step-line">${acumStr}</div>
<div class="step-line">Total acumulado en ${flujos.length} períodos: <span class="step-highlight">${fmtMoney(r.totalRecuperado)}</span></div>
<div class="step-line">Inversión inicial (Io): ${fmtMoney(io)}</div>
<div class="step-line">Saldo sin recuperar: <span class="step-highlight">${fmtMoney(r.faltante)}</span></div>`;
    badgeHtml = `
<div class="payback-badge not-recovered">
  <div>
    <div class="label">Resultado</div>
    <div class="value">No se recupera</div>
  </div>
</div>`;
    analysisHtml = `<div class="analysis-text">Con los flujos de caja proyectados, la inversión inicial de ${fmtMoney(io)} <strong>no se recupera</strong> dentro de los ${flujos.length} períodos evaluados. Falta recuperar ${fmtMoney(r.faltante)}. Se recomienda extender el horizonte del proyecto o revisar los flujos de caja proyectados.</div>`;
  } else {
    stepsHtml = `
<div class="step-line">PRI = a + (Io − D) / F</div>
<div class="step-line"></div>
<div class="step-line">Flujo acumulado por período:</div>
<div class="step-line">${acumStr}</div>
<div class="step-line"></div>
<div class="step-line">Período de recuperación: <span class="step-highlight">Año ${r.periodoRecuperacion}</span></div>
<div class="step-line">a (períodos que preceden la recuperación) = ${r.a}</div>
<div class="step-line">D (flujo acumulado hasta el año ${r.a}) = ${fmtMoney(r.D)}</div>
<div class="step-line">F (flujo del año ${r.periodoRecuperacion}) = ${fmtMoney(r.F)}</div>
<div class="step-line"></div>
<div class="step-line">Io − D = ${fmtMoney(io)} − ${fmtMoney(r.D)} = ${fmtMoney(r.diferencia)}</div>
<div class="step-line">(Io − D) / F = ${fmtMoney(r.diferencia)} / ${fmtMoney(r.F)} = ${fmtNum(r.fraccion, 4)}</div>
<div class="step-line">${fmtNum(r.fraccion, 4)} × 12 meses = <span class="step-highlight">${r.a === (r.anios) ? Math.round(r.fraccion*12) : Math.round(r.fraccion*12)} meses</span></div>
<div class="step-line"></div>
<div class="step-line">PRI = ${r.a} + ${fmtNum(r.fraccion, 4)} = <span class="step-highlight">${fmtNum(r.aniosExactos, 4)} años</span></div>`;

    badgeHtml = `
<div class="payback-badge">
  <div>
    <div class="label">PAY BACK</div>
    <div class="value">${r.anios} <small>años</small> ${r.meses} <small>meses</small></div>
  </div>
</div>`;
    analysisHtml = `<div class="analysis-text">${textoAnalisis(r.anios, r.meses)} La recuperación ocurre durante el año ${r.periodoRecuperacion} del proyecto.</div>`;
  }

  box.innerHTML = `
    <div class="steps">${stepsHtml}</div>
    ${badgeHtml}
    ${analysisHtml}
    <div class="save-row">
      <input type="text" id="m1-nombre" placeholder="Nombre del proyecto (para el historial)">
      <button class="btn btn-primary" id="m1-save">Guardar en historial</button>
    </div>
  `;

  document.getElementById("m1-save").addEventListener("click", () => {
    const nombre = document.getElementById("m1-nombre").value.trim() || "Proyecto sin nombre";
    guardarHistorial({
      id: uid(),
      fecha: todayStr(),
      nombre,
      modulo: "Módulo 1 · Flujos variados",
      moduloClass: "m1",
      io,
      flujos,
      recuperado: r.recuperado,
      anios: r.recuperado ? r.anios : null,
      meses: r.recuperado ? r.meses : null,
      detalle: r
    });
    showToast("Proyecto guardado en el historial");
  });
}

/* ==========================================================
   MÓDULO 2 · Flujos constantes
   ========================================================== */

document.getElementById("m2-calc").addEventListener("click", () => {
  const io = parseFloat(document.getElementById("m2-io").value);
  const f = parseFloat(document.getElementById("m2-f").value);
  const box = document.getElementById("m2-result");

  if (!io || io <= 0 || !f || f <= 0) {
    box.style.display = "block";
    box.innerHTML = `<div class="error-msg">Ingresa la inversión inicial y el flujo de caja anual (ambos mayores a cero).</div>`;
    return;
  }

  const r = motorFlujoConstante(io, f);
  renderM2Result(io, f, r);
});

function renderM2Result(io, f, r) {
  const box = document.getElementById("m2-result");
  box.style.display = "block";

  const stepsHtml = `
<div class="step-line">PRI = Io / F</div>
<div class="step-line"></div>
<div class="step-line">PRI = ${fmtMoney(io)} / ${fmtMoney(f)} = <span class="step-highlight">${fmtNum(r.aniosExactos, 4)} años</span></div>
<div class="step-line"></div>
<div class="step-line">Parte entera (años completos) = ${Math.floor(r.aniosExactos)}</div>
<div class="step-line">Parte decimal × 12 meses = ${fmtNum(r.fraccion, 4)} × 12 = <span class="step-highlight">${r.meses} meses</span></div>`;

  const badgeHtml = `
<div class="payback-badge">
  <div>
    <div class="label">PAY BACK</div>
    <div class="value">${r.anios} <small>años</small> ${r.meses} <small>meses</small></div>
  </div>
</div>`;

  const analysisHtml = `<div class="analysis-text">${textoAnalisis(r.anios, r.meses)} Al ser un flujo de caja constante de ${fmtMoney(f)} por período, la recuperación es lineal a lo largo del tiempo.</div>`;

  box.innerHTML = `
    <div class="steps">${stepsHtml}</div>
    ${badgeHtml}
    ${analysisHtml}
    <div class="save-row">
      <input type="text" id="m2-nombre" placeholder="Nombre del proyecto (para el historial)">
      <button class="btn btn-primary" id="m2-save">Guardar en historial</button>
    </div>
  `;

  document.getElementById("m2-save").addEventListener("click", () => {
    const nombre = document.getElementById("m2-nombre").value.trim() || "Proyecto sin nombre";
    guardarHistorial({
      id: uid(),
      fecha: todayStr(),
      nombre,
      modulo: "Módulo 2 · Flujos constantes",
      moduloClass: "m2",
      io,
      flujos: [f],
      recuperado: true,
      anios: r.anios,
      meses: r.meses,
      detalle: r
    });
    showToast("Proyecto guardado en el historial");
  });
}

/* ==========================================================
   MÓDULO 3 · Método tabular (tablas de recuperación)
   ========================================================== */

document.getElementById("m3-gen").addEventListener("click", () => {
  const n = parseInt(document.getElementById("m3-n").value, 10);
  if (!n || n < 1 || n > 20) { showToast("Ingresa un número de períodos válido (1-20)"); return; }
  buildFlowTable("m3", n);
});

document.getElementById("m3-calc").addEventListener("click", () => {
  const io = parseFloat(document.getElementById("m3-io").value);
  const n = parseInt(document.getElementById("m3-n").value, 10);
  const box = document.getElementById("m3-result");

  if (!io || io <= 0 || !n || n < 1) {
    box.style.display = "block";
    box.innerHTML = `<div class="error-msg">Completa la inversión inicial y el número de períodos, y genera la tabla de flujo de caja.</div>`;
    return;
  }
  const flujos = readFlowTable("m3", n);
  const r = motorFlujosVariados(io, flujos);
  renderM3Result(io, flujos, r);
});

function renderM3Result(io, flujos, r) {
  const box = document.getElementById("m3-result");
  box.style.display = "block";

  // Tabla de saldo pendiente (Io - acumulado), con piso en 0
  const saldos = r.acumulado.map((c) => Math.max(io - c, 0));

  const tablaAcum = r.acumulado.map((v, i) =>
    `<td class="num">${fmtMoney(Math.min(v, io))}</td>`).join("");
  const tablaSaldo = saldos.map((v) => `<td class="num">${fmtMoney(v)}</td>`).join("");
  const tablaFlujo = flujos.map((v) => `<td class="num">${fmtMoney(v)}</td>`).join("");
  const headerCols = flujos.map((_, i) => `<th>Año ${i + 1}</th>`).join("");

  let tablesHtml = `
<div class="flow-table-wrap">
  <table class="flow-table">
    <thead><tr><th style="text-align:left;">Flujo de caja</th>${headerCols}</tr></thead>
    <tbody><tr><td style="text-align:left;font-weight:700;">$</td>${tablaFlujo}</tr></tbody>
  </table>
</div>
<div class="flow-table-wrap">
  <table class="flow-table">
    <thead><tr><th style="text-align:left;">Tabla de recuperación (acumulado)</th>${headerCols}</tr></thead>
    <tbody><tr><td style="text-align:left;font-weight:700;">$</td>${tablaAcum}</tr></tbody>
  </table>
</div>
<div class="flow-table-wrap">
  <table class="flow-table">
    <thead><tr><th style="text-align:left;">Saldo pendiente por recuperar</th>${headerCols}</tr></thead>
    <tbody><tr><td style="text-align:left;font-weight:700;">$</td>${tablaSaldo}</tr></tbody>
  </table>
</div>`;

  let stepsHtml = "";
  let badgeHtml = "";
  let analysisHtml = "";

  if (!r.recuperado) {
    stepsHtml = `<div class="step-line">Saldo sin recuperar al final del horizonte: <span class="step-highlight">${fmtMoney(r.faltante)}</span></div>`;
    badgeHtml = `
<div class="payback-badge not-recovered">
  <div><div class="label">Resultado</div><div class="value">No se recupera</div></div>
</div>`;
    analysisHtml = `<div class="analysis-text">Con los flujos de caja proyectados, la inversión inicial de ${fmtMoney(io)} <strong>no se recupera</strong> dentro de los ${flujos.length} períodos evaluados. Falta recuperar ${fmtMoney(r.faltante)}.</div>`;
  } else {
    const flujoMensual = r.F / 12;
    const mesesCalc = r.diferencia / flujoMensual;
    stepsHtml = `
<div class="step-line">Saldo pendiente al iniciar el año ${r.periodoRecuperacion} = Io − D = ${fmtMoney(io)} − ${fmtMoney(r.D)} = <span class="step-highlight">${fmtMoney(r.diferencia)}</span></div>
<div class="step-line"></div>
<div class="step-line">Flujo mensual del año ${r.periodoRecuperacion} = ${fmtMoney(r.F)} ÷ 12 = ${fmtNum(flujoMensual, 4)}</div>
<div class="step-line">Meses necesarios = ${fmtMoney(r.diferencia)} ÷ ${fmtNum(flujoMensual, 4)} = <span class="step-highlight">${fmtNum(mesesCalc, 2)} ≈ ${r.meses} meses</span></div>
<div class="step-line"></div>
<div class="step-line">La inversión se recupera en el año ${r.periodoRecuperacion}, a los ${r.meses} meses de iniciado ese período.</div>`;

    badgeHtml = `
<div class="payback-badge">
  <div><div class="label">PAY BACK</div><div class="value">${r.anios} <small>años</small> ${r.meses} <small>meses</small></div></div>
</div>`;
    analysisHtml = `<div class="analysis-text">${textoAnalisis(r.anios, r.meses)} La recuperación se completa durante el año ${r.periodoRecuperacion} del proyecto.</div>`;
  }

  box.innerHTML = `
    ${tablesHtml}
    <div class="steps">${stepsHtml}</div>
    ${badgeHtml}
    ${analysisHtml}
    <div class="save-row">
      <input type="text" id="m3-nombre" placeholder="Nombre del proyecto (para el historial)">
      <button class="btn btn-primary" id="m3-save">Guardar en historial</button>
    </div>
  `;

  document.getElementById("m3-save").addEventListener("click", () => {
    const nombre = document.getElementById("m3-nombre").value.trim() || "Proyecto sin nombre";
    guardarHistorial({
      id: uid(),
      fecha: todayStr(),
      nombre,
      modulo: "Módulo 3 · Método tabular",
      moduloClass: "m3",
      io,
      flujos,
      recuperado: r.recuperado,
      anios: r.recuperado ? r.anios : null,
      meses: r.recuperado ? r.meses : null,
      detalle: r
    });
    showToast("Proyecto guardado en el historial");
  });
}

/* ==========================================================
   HISTORIAL (persistencia local + render + acciones)
   ========================================================== */

function getHistorial() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function setHistorial(arr) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
  updateHistCountBadge();
}

function guardarHistorial(entry) {
  const arr = getHistorial();
  arr.unshift(entry);
  setHistorial(arr);
  renderHistorial();
}

function eliminarHistorial(id) {
  const arr = getHistorial().filter((e) => e.id !== id);
  setHistorial(arr);
  renderHistorial();
}

function updateHistCountBadge() {
  const n = getHistorial().length;
  document.getElementById("histCountTab").textContent = n + (n === 1 ? " proyecto" : " proyectos");
}

let histSelectedIds = new Set();

function renderHistorial() {
  const arr = getHistorial();
  // limpia selecciones de proyectos que ya no existen
  histSelectedIds.forEach((id) => { if (!arr.find((e) => e.id === id)) histSelectedIds.delete(id); });

  document.getElementById("histCount").textContent = arr.length + (arr.length === 1 ? " proyecto registrado" : " proyectos registrados");
  const content = document.getElementById("histContent");

  if (arr.length === 0) {
    content.innerHTML = `
      <div class="empty-state">
        <div class="big-icon">🗂️</div>
        <p>Todavía no has guardado ningún proyecto.<br>Calcula un PAY BACK en cualquier módulo y presiona "Guardar en historial".</p>
      </div>`;
    return;
  }

  const allChecked = arr.every((e) => histSelectedIds.has(e.id));

  const rows = arr.map((e) => {
    const pillMod = `<span class="pill ${e.moduloClass}">${e.modulo.split("·")[0].trim()}</span>`;
    const pillRec = e.recuperado
      ? `<span class="pill recovered">${e.anios}a ${e.meses}m</span>`
      : `<span class="pill not-recovered">No recuperado</span>`;
    const inversionCol = e.moduloClass === "m4"
      ? `${e.numProyectos || (e.detalle && e.detalle.comparacion ? e.detalle.comparacion.length : 0)} proyectos`
      : fmtMoney(e.io);
    const editBtn = e.moduloClass === "m4"
      ? `<button class="icon-btn" title="Editar comparación" onclick="cargarComparacionParaEditar('${e.id}')">✎</button>`
      : "";
    return `
      <tr>
        <td><input type="checkbox" class="hist-check" data-id="${e.id}" ${histSelectedIds.has(e.id) ? "checked" : ""}></td>
        <td>${e.fecha}</td>
        <td>${e.nombre}</td>
        <td>${pillMod}</td>
        <td class="num">${inversionCol}</td>
        <td>${pillRec}</td>
        <td>
          <div class="row-actions">
            ${editBtn}
            <button class="icon-btn danger" title="Eliminar" onclick="eliminarHistorial('${e.id}')">✕</button>
          </div>
        </td>
      </tr>`;
  }).join("");

  content.innerHTML = `
    <p class="hint">Selecciona proyectos para exportar solo esos. Si no marcas ninguno, se exportan todos.</p>
    <div class="hist-table-wrap">
      <table class="hist-table">
        <thead>
          <tr>
            <th><input type="checkbox" id="histSelectAll" ${allChecked ? "checked" : ""}></th>
            <th>Fecha</th>
            <th>Proyecto</th>
            <th>Módulo</th>
            <th>Inversión</th>
            <th>Payback</th>
            <th>Acción</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

document.getElementById("histContent").addEventListener("change", (ev) => {
  if (ev.target.id === "histSelectAll") {
    const ids = getHistorial().map((e) => e.id);
    if (ev.target.checked) ids.forEach((id) => histSelectedIds.add(id));
    else ids.forEach((id) => histSelectedIds.delete(id));
    renderHistorial();
  } else if (ev.target.classList.contains("hist-check")) {
    const id = ev.target.dataset.id;
    if (ev.target.checked) histSelectedIds.add(id);
    else histSelectedIds.delete(id);
  }
});

document.getElementById("clearHist").addEventListener("click", () => {
  if (getHistorial().length === 0) return;
  if (confirm("¿Vaciar todo el historial de proyectos? Esta acción no se puede deshacer.")) {
    setHistorial([]);
    renderHistorial();
    showToast("Historial vaciado");
  }
});

/* ---------------- Exportar PDF ---------------- */

document.getElementById("exportPdf").addEventListener("click", () => {
  const all = getHistorial();
  if (all.length === 0) { showToast("No hay proyectos para exportar"); return; }
  const arr = histSelectedIds.size > 0 ? all.filter((e) => histSelectedIds.has(e.id)) : all;
  if (arr.length === 0) { showToast("No hay proyectos para exportar"); return; }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(16);
  doc.setTextColor(11, 61, 102);
  doc.text("Sistema PAY BACK - F. Muñoz", 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(80, 80, 80);
  doc.text("Historial de proyectos - Período de Recuperación de la Inversión", 14, 25);
  doc.text("Generado: " + todayStr() + (histSelectedIds.size > 0 ? " · Selección de " + arr.length + " proyecto(s)" : ""), 14, 30);

  const body = arr.map((e) => [
    e.fecha,
    e.nombre,
    e.modulo,
    e.moduloClass === "m4" ? `${e.numProyectos || ""} proyectos` : fmtMoney(e.io),
    e.recuperado ? `${e.anios} años, ${e.meses} meses` : "No recuperado"
  ]);

  doc.autoTable({
    startY: 36,
    head: [["Fecha", "Proyecto", "Módulo", "Inversión", "PAY BACK"]],
    body,
    headStyles: { fillColor: [11, 61, 102] },
    styles: { fontSize: 8.5, cellPadding: 3 },
    alternateRowStyles: { fillColor: [223, 241, 254] }
  });

  doc.save("historial-payback-fmunoz.pdf");
  showToast("PDF exportado");
});

/* ---------------- Exportar Excel ---------------- */

document.getElementById("exportExcel").addEventListener("click", () => {
  const all = getHistorial();
  if (all.length === 0) { showToast("No hay proyectos para exportar"); return; }
  const arr = histSelectedIds.size > 0 ? all.filter((e) => histSelectedIds.has(e.id)) : all;
  if (arr.length === 0) { showToast("No hay proyectos para exportar"); return; }

  const data = arr.map((e) => ({
    Fecha: e.fecha,
    Proyecto: e.nombre,
    Módulo: e.modulo,
    "Inversión inicial": e.moduloClass === "m4" ? "" : e.io,
    "Proyectos comparados": e.moduloClass === "m4" ? (e.numProyectos || "") : "",
    "Flujos de caja": (e.flujos || []).join(" | "),
    Recuperado: e.recuperado ? "Sí" : "No",
    "Años": e.anios ?? "",
    "Meses": e.meses ?? ""
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  ws["!cols"] = [
    { wch: 16 }, { wch: 22 }, { wch: 26 }, { wch: 16 }, { wch: 16 }, { wch: 30 }, { wch: 10 }, { wch: 8 }, { wch: 8 }
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Historial PAY BACK");
  XLSX.writeFile(wb, "historial-payback-fmunoz.xlsx");
  showToast("Excel exportado");
});

/* ==========================================================
   MÓDULO 4 · Comparar proyectos y elegir el mejor
   ========================================================== */

const COMPARE_KEY = "payback_fmunoz_comparacion";
let m4EditingId = null;
let m4EditingNombre = "";

function getComparacion() {
  try { return JSON.parse(localStorage.getItem(COMPARE_KEY)) || []; }
  catch (e) { return []; }
}

function setComparacion(arr) {
  localStorage.setItem(COMPARE_KEY, JSON.stringify(arr));
}

function totalMeses(anios, meses) {
  return (anios || 0) * 12 + (meses || 0);
}

function populateHistSelectM4() {
  const sel = document.getElementById("m4-hist-select");
  const arr = getHistorial().filter((e) => e.recuperado && e.moduloClass !== "m4");
  if (arr.length === 0) {
    sel.innerHTML = `<option value="">No hay proyectos recuperados guardados en el historial</option>`;
    return;
  }
  sel.innerHTML = arr.map((e) =>
    `<option value="${e.id}">${e.nombre} · ${e.modulo.split("·")[0].trim()} · ${fmtMoney(e.io)}</option>`
  ).join("");
}

document.getElementById("m4-add-manual").addEventListener("click", () => {
  const nombre = document.getElementById("m4-nombre").value.trim();
  const io = parseFloat(document.getElementById("m4-io").value);
  const f = parseFloat(document.getElementById("m4-f").value);
  const rentInput = document.getElementById("m4-rent").value;
  const rentabilidad = rentInput === "" ? null : parseFloat(rentInput);

  if (!nombre || !io || io <= 0 || !f || f <= 0) {
    showToast("Completa nombre, inversión inicial y flujo de caja anual");
    return;
  }

  const r = motorFlujoConstante(io, f);
  if (!r.recuperado) { showToast("No se pudo calcular el payback con esos datos"); return; }

  const arr = getComparacion();
  arr.push({
    id: uid(),
    nombre,
    io,
    rentabilidad,
    anios: r.anios,
    meses: r.meses,
    totalMeses: totalMeses(r.anios, r.meses),
    origen: "manual"
  });
  setComparacion(arr);
  renderComparacion();

  document.getElementById("m4-nombre").value = "";
  document.getElementById("m4-io").value = "";
  document.getElementById("m4-f").value = "";
  document.getElementById("m4-rent").value = "";
  showToast("Proyecto agregado a la comparación");
});

document.getElementById("m4-add-hist").addEventListener("click", () => {
  const sel = document.getElementById("m4-hist-select");
  const id = sel.value;
  if (!id) { showToast("No hay un proyecto válido para importar"); return; }
  const entry = getHistorial().find((e) => e.id === id);
  if (!entry) { showToast("Ese proyecto ya no está en el historial"); return; }

  const arr = getComparacion();
  arr.push({
    id: uid(),
    nombre: entry.nombre,
    io: entry.io,
    rentabilidad: null,
    anios: entry.anios,
    meses: entry.meses,
    totalMeses: totalMeses(entry.anios, entry.meses),
    origen: "historial (" + entry.modulo.split("·")[0].trim() + ")"
  });
  setComparacion(arr);
  renderComparacion();
  showToast("Proyecto importado del historial");
});

function eliminarComparacion(id) {
  const arr = getComparacion().filter((e) => e.id !== id);
  setComparacion(arr);
  renderComparacion();
}

document.getElementById("m4-clear").addEventListener("click", () => {
  if (getComparacion().length === 0) return;
  if (confirm("¿Vaciar la comparación de proyectos?")) {
    setComparacion([]);
    m4EditingId = null;
    m4EditingNombre = "";
    renderComparacion();
    showToast("Comparación vaciada");
  }
});

function renderComparacion() {
  const arr = getComparacion();
  document.getElementById("m4-count").textContent =
    arr.length + (arr.length === 1 ? " proyecto en comparación" : " proyectos en comparación");
  const content = document.getElementById("m4-content");

  if (arr.length === 0) {
    content.innerHTML = `
      <div class="empty-state">
        <div class="big-icon">⚖️</div>
        <p>Agrega al menos dos proyectos para comparar cuál se recupera en menor tiempo.</p>
      </div>`;
    return;
  }

  const minMeses = Math.min(...arr.map((e) => e.totalMeses));

  const rows = arr.map((e) => {
    const isBest = e.totalMeses === minMeses;
    return `
      <tr class="${isBest ? "best-row" : ""}">
        <td>${e.nombre}${isBest ? `<div class="trophy">🏆 Mejor opción</div>` : ""}</td>
        <td class="num">${fmtMoney(e.io)}</td>
        <td class="num">${e.rentabilidad !== null && e.rentabilidad !== undefined ? fmtNum(e.rentabilidad, 2) + "%" : "-"}</td>
        <td class="num">${e.anios}a ${e.meses}m</td>
        <td class="num">${e.totalMeses}</td>
        <td><button class="icon-btn danger" title="Eliminar" onclick="eliminarComparacion('${e.id}')">✕</button></td>
      </tr>`;
  }).join("");

  const mejor = arr.find((e) => e.totalMeses === minMeses);
  const empatados = arr.filter((e) => e.totalMeses === minMeses);
  let analisis;
  if (empatados.length > 1) {
    const nombres = empatados.map((e) => `"${e.nombre}"`).join(" y ");
    analisis = `Hay un empate: ${nombres} se recuperan en el mismo tiempo (${minMeses} meses). Evalúa la rentabilidad u otros factores para decidir entre ellas.`;
  } else {
    const rentTxt = mejor.rentabilidad !== null && mejor.rentabilidad !== undefined
      ? ` y una rentabilidad estimada de ${fmtNum(mejor.rentabilidad, 2)}% anual`
      : "";
    analisis = `De acuerdo al análisis, la opción más viable es "${mejor.nombre}", ya que recupera la inversión inicial en el menor tiempo (${mejor.anios} años y ${mejor.meses} meses${rentTxt}), frente a las demás alternativas evaluadas.`;
  }

  content.innerHTML = `
    ${m4EditingId ? `<div class="analysis-text" style="background:#FCE4EC;color:#AD1457;">✎ Editando comparación guardada: "<strong>${m4EditingNombre}</strong>". Los cambios que hagas se pueden actualizar en el historial.</div>` : ""}
    <div class="hist-table-wrap">
      <table class="compare-table">
        <thead>
          <tr>
            <th>Proyecto</th>
            <th>Inversión</th>
            <th>Rentabilidad</th>
            <th>Payback</th>
            <th>Meses (PER)</th>
            <th>Acción</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${arr.length > 1 ? `<div class="analysis-text">${analisis}</div>` : `<p class="hint">Agrega al menos un proyecto más para generar el análisis comparativo.</p>`}
    <div class="save-row">
      <input type="text" id="m4-save-nombre" placeholder="Nombre de esta comparación" value="${escAttr(m4EditingId ? m4EditingNombre : "")}">
      <button class="btn btn-primary" id="m4-save-btn">${m4EditingId ? "Actualizar en historial" : "Guardar comparación en historial"}</button>
      ${m4EditingId ? `<button class="btn btn-ghost" id="m4-cancel-edit">Guardar como nueva</button>` : ""}
    </div>
  `;

  document.getElementById("m4-save-btn").addEventListener("click", () => {
    const nombreInput = document.getElementById("m4-save-nombre").value.trim();
    const nombre = nombreInput || "Comparación sin nombre";
    const compArr = getComparacion();
    if (compArr.length === 0) { showToast("Agrega proyectos antes de guardar"); return; }

    const minM = Math.min(...compArr.map((e) => e.totalMeses));
    const mejorProyecto = compArr.find((e) => e.totalMeses === minM);

    if (m4EditingId) {
      const histArr = getHistorial();
      const idx = histArr.findIndex((e) => e.id === m4EditingId);
      if (idx === -1) {
        showToast("Ese registro ya no existe en el historial, se guardará como nuevo");
        m4EditingId = null;
      } else {
        histArr[idx] = {
          ...histArr[idx],
          nombre,
          fecha: todayStr(),
          anios: mejorProyecto.anios,
          meses: mejorProyecto.meses,
          numProyectos: compArr.length,
          detalle: { comparacion: compArr, mejor: mejorProyecto.nombre }
        };
        setHistorial(histArr);
        renderHistorial();
        showToast("Comparación actualizada en el historial");
        return;
      }
    }

    guardarHistorial({
      id: uid(),
      fecha: todayStr(),
      nombre,
      modulo: "Módulo 4 · Comparación de proyectos",
      moduloClass: "m4",
      io: null,
      flujos: [],
      recuperado: true,
      anios: mejorProyecto.anios,
      meses: mejorProyecto.meses,
      numProyectos: compArr.length,
      detalle: { comparacion: compArr, mejor: mejorProyecto.nombre }
    });
    showToast("Comparación guardada en el historial");
  });

  if (m4EditingId) {
    document.getElementById("m4-cancel-edit").addEventListener("click", () => {
      m4EditingId = null;
      m4EditingNombre = "";
      renderComparacion();
      showToast("Ahora se guardará como una comparación nueva");
    });
  }
}

function cargarComparacionParaEditar(id) {
  const entry = getHistorial().find((e) => e.id === id);
  if (!entry || !entry.detalle || !entry.detalle.comparacion) {
    showToast("No se pudo cargar esa comparación");
    return;
  }
  setComparacion(entry.detalle.comparacion);
  m4EditingId = entry.id;
  m4EditingNombre = entry.nombre;

  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
  document.querySelector('.tab-btn[data-tab="m4"]').classList.add("active");
  document.getElementById("panel-m4").classList.add("active");

  populateHistSelectM4();
  renderComparacion();
  showToast('Comparación "' + entry.nombre + '" cargada para editar');
}

document.getElementById("m4-export-pdf").addEventListener("click", () => {
  const arr = getComparacion();
  if (arr.length === 0) { showToast("No hay proyectos para exportar"); return; }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.setTextColor(11, 61, 102);
  doc.text("Sistema PAY BACK - F. Muñoz", 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(80, 80, 80);
  doc.text("Comparación de proyectos - Módulo 4", 14, 25);
  doc.text("Generado: " + todayStr(), 14, 30);

  const minMeses = Math.min(...arr.map((e) => e.totalMeses));
  const body = arr.map((e) => [
    e.nombre + (e.totalMeses === minMeses ? " (mejor opción)" : ""),
    fmtMoney(e.io),
    e.rentabilidad !== null && e.rentabilidad !== undefined ? fmtNum(e.rentabilidad, 2) + "%" : "-",
    `${e.anios}a ${e.meses}m`,
    String(e.totalMeses)
  ]);

  doc.autoTable({
    startY: 36,
    head: [["Proyecto", "Inversión", "Rentabilidad", "Payback", "Meses (PER)"]],
    body,
    headStyles: { fillColor: [11, 61, 102] },
    styles: { fontSize: 8.5, cellPadding: 3 },
    alternateRowStyles: { fillColor: [223, 241, 254] }
  });

  doc.save("comparacion-proyectos-payback.pdf");
  showToast("PDF exportado");
});

document.getElementById("m4-export-excel").addEventListener("click", () => {
  const arr = getComparacion();
  if (arr.length === 0) { showToast("No hay proyectos para exportar"); return; }

  const minMeses = Math.min(...arr.map((e) => e.totalMeses));
  const data = arr.map((e) => ({
    Proyecto: e.nombre,
    "Inversión inicial": e.io,
    "Rentabilidad %": e.rentabilidad ?? "",
    "Años": e.anios,
    "Meses": e.meses,
    "Meses totales (PER)": e.totalMeses,
    "Mejor opción": e.totalMeses === minMeses ? "Sí" : ""
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  ws["!cols"] = [{ wch: 22 }, { wch: 16 }, { wch: 14 }, { wch: 8 }, { wch: 8 }, { wch: 16 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Comparación PAY BACK");
  XLSX.writeFile(wb, "comparacion-proyectos-payback.xlsx");
  showToast("Excel exportado");
});

/* ==========================================================
   INIT
   ========================================================== */

updateHistCountBadge();
renderHistorial();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}
