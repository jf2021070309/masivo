/**
 * SURGAS MASIVO - EXTENSIÓN PARA WHATSAPP WEB
 * Incluye:
 * 1. Campaña Masiva (Excel, texto, adjuntos, pausas humanas)
 * 2. Respuestas Rápidas fijas en la barra de accesos directos del chat (Screenshot 1, 2 y 3)
 */

(function () {
  'use strict';

  if (window.__SURGAS_INJECTED__) return;
  window.__SURGAS_INJECTED__ = true;

  const STORAGE_KEY_CAMPAIGN = 'surgas_extension_whato_v1';
  const STORAGE_KEY_QUICK = 'surgas_quick_replies_v1';

  // Plantillas iniciales de respuestas rápidas para Surgas (Tacna)
  const DEFAULT_QUICK_REPLIES = [
    {
      id: 'qr_precios',
      name: 'PRECIOS',
      text: `🔥 *PRECIOS SURGAS* 🔥

📍 Balón en Depósito: *S/ 57*
🏠 Balón a Domicilio: *S/ 63*
📲 Por el aplicativo: *S/ 60* en tu primer pedido.

🎁 ¡Incluye entrega rápida y acumulas puntos para canjear regalos!`,
      pinned: true,
      editBeforeSend: false
    },
    {
      id: 'qr_app',
      name: 'APP GAS',
      text: `📲 *Descarga la App de Surgas* y pide en 30 segundos sin esperar llamadas:
https://surgas.pe/descarga

🔥 Tienes *S/ 3 de descuento* en tu primer pedido ingresando desde la aplicación. ¿Te gustaría que te ayudemos a pedir hoy?`,
      pinned: true,
      editBeforeSend: false
    },
    {
      id: 'qr_yape',
      name: 'YAPE / PAGOS',
      text: `💳 *Pagos Surgas:*
Aceptamos *Yape*, *Plin*, efectivo y transferencias.
Al momento de la entrega puedes pagar directamente con el repartidor.`,
      pinned: true,
      editBeforeSend: false
    },
    {
      id: 'qr_gracias',
      name: 'GRACIAS',
      text: `🤝 *¡GRACIAS POR SU COMPRA!*
En Surgas estamos para atenderte siempre. ¡Que tengas un excelente día!`,
      pinned: true,
      editBeforeSend: false
    }
  ];

  // Estado global
  const STATE = {
    // Campaña
    campaignName: 'Lanzamiento App Surgas',
    contacts: [],
    messageText: `Hola 👋 Somos SURGAS. Pediste gas con nosotros y ahora puedes pedirlo desde la app, con delivery y S/ 3 de descuento en tu primer pedido 🔥

🤖 Android: https://play.google.com/store/apps/details?id=pe.surgas.appgas
🍎 iPhone: https://apps.apple.com/pe/app/surgas/id6793674063

🎁 Además, obtén un regalo y participa en el sorteo de una PlayStation 5 🎮`,
    attachment: null,
    attachmentType: 'text',
    minDelay: 25,
    maxDelay: 45,
    batchLimit: 30,
    simulateTyping: true,
    rotateGreetings: true,
    campaignStatus: 'idle',
    greetings: [
      'Hola 👋',
      'Buen día 👋',
      '¡Hola! 👋',
      'Hola qué tal 👋'
    ],
    // Respuestas Rápidas
    quickReplies: [],
    selectedQrId: null
  };

  // Carga y persistencia
  function loadPersistedState() {
    try {
      const savedCamp = localStorage.getItem(STORAGE_KEY_CAMPAIGN);
      if (savedCamp) {
        const parsed = JSON.parse(savedCamp);
        if (parsed.campaignName) STATE.campaignName = parsed.campaignName;
        if (parsed.contacts) STATE.contacts = parsed.contacts;
        if (parsed.messageText && !parsed.messageText.includes('surgas.pe/descarga')) {
          STATE.messageText = parsed.messageText;
        }
        if (parsed.minDelay) STATE.minDelay = parsed.minDelay;
        if (parsed.maxDelay) STATE.maxDelay = parsed.maxDelay;
        if (parsed.batchLimit) STATE.batchLimit = parsed.batchLimit;
        if (parsed.attachment) STATE.attachment = parsed.attachment;
        if (parsed.attachmentType) STATE.attachmentType = parsed.attachmentType;
      }

      const savedQr = localStorage.getItem(STORAGE_KEY_QUICK);
      if (savedQr) {
        STATE.quickReplies = JSON.parse(savedQr);
      } else {
        STATE.quickReplies = DEFAULT_QUICK_REPLIES;
        persistQuickReplies();
      }
    } catch (e) {
      console.error('[Surgas] Error cargando estado:', e);
      STATE.quickReplies = DEFAULT_QUICK_REPLIES;
    }
  }

  function persistCampaign() {
    try {
      localStorage.setItem(STORAGE_KEY_CAMPAIGN, JSON.stringify({
        campaignName: STATE.campaignName,
        contacts: STATE.contacts,
        messageText: STATE.messageText,
        minDelay: STATE.minDelay,
        maxDelay: STATE.maxDelay,
        batchLimit: STATE.batchLimit,
        attachment: STATE.attachment,
        attachmentType: STATE.attachmentType
      }));
    } catch (e) {
      console.error(e);
    }
  }

  function persistQuickReplies() {
    try {
      localStorage.setItem(STORAGE_KEY_QUICK, JSON.stringify(STATE.quickReplies));
    } catch (e) {
      console.error(e);
    }
  }

  function cleanPhone(raw) {
    if (!raw) return null;
    let digits = String(raw).replace(/\D/g, '');
    if (digits.startsWith('51') && digits.length === 11) return digits;
    if (digits.length === 9 && digits.startsWith('9')) return '51' + digits;
    if (digits.length === 11) return digits;
    if (digits.length === 9) return '51' + digits;
    return null;
  }

  function formatTimeRange(min, max) {
    const minM = String(Math.floor(min / 60)).padStart(2, '0');
    const minS = String(min % 60).padStart(2, '0');
    const maxM = String(Math.floor(max / 60)).padStart(2, '0');
    const maxS = String(max % 60).padStart(2, '0');
    return `${minM}:${minS} - ${maxM}:${maxS}`;
  }

  // =========================================================================
  // 1. INYECCIÓN DEL MODAL DE CAMPAÑA MASIVA
  // =========================================================================
  function injectCampaignModal() {
    // Botón flotante lanzador de Campaña
    const launcher = document.createElement('div');
    launcher.id = 'surgas-launcher-btn';
    launcher.innerHTML = `
      <span class="surgas-pulse-dot"></span>
      <span>🔥 SURGAS WSP</span>
    `;
    launcher.addEventListener('click', () => toggleCampaignModal(true));
    document.body.appendChild(launcher);

    // Modal de Campaña
    const overlay = document.createElement('div');
    overlay.id = 'surgas-modal-overlay';
    overlay.innerHTML = `
      <div id="surgas-modal-container">
        <div class="surgas-modal-header">
          <div class="surgas-header-title">
            <span>🔥 SURGAS WSP - Campaña de Mensajes</span>
          </div>
          <button id="surgas-btn-close" class="surgas-close-btn" title="Cerrar">✕</button>
        </div>

        <div class="surgas-modal-body">
          <div class="surgas-grid-2col">
            <!-- Izquierda -->
            <div>
              <div class="surgas-field">
                <label class="surgas-label">Nombre de la Campaña <span class="surgas-req">*</span></label>
                <input type="text" id="surgas-input-camp-name" class="surgas-input" value="${escapeHtml(STATE.campaignName)}">
              </div>

              <div class="surgas-field">
                <label class="surgas-label">Lista de Contactos / Destinatarios <span class="surgas-req">*</span></label>
                
                <div class="surgas-excel-box" id="surgas-excel-drop">
                  <div class="surgas-excel-title">📊 Subir archivo Excel o CSV</div>
                  <div class="surgas-excel-desc">Arrastra tu archivo (.xlsx, .xls) o haz clic aquí</div>
                  <input type="file" id="surgas-excel-file" accept=".xlsx, .xls, .csv" style="display:none;">
                </div>

                <div style="display: flex; gap: 8px; margin-top: 8px;">
                  <button type="button" class="surgas-tool-btn" style="flex:1;" id="surgas-btn-load-501">
                    ⚡ Cargar 501 de Surgas
                  </button>
                  <button type="button" class="surgas-tool-btn" style="flex:1;" id="surgas-btn-clear-contacts">
                    🗑 Vaciar lista
                  </button>
                </div>
                
                <div id="surgas-contacts-summary" class="surgas-help-text" style="color:#00a884; font-weight:600;">
                  0 contactos cargados
                </div>

                <!-- Previsualización de Contactos Cargados -->
                <div id="surgas-contacts-preview-box" class="surgas-table-wrap" style="margin-top: 8px; max-height: 140px; display: none; background: #111b21; border-radius: 8px; border: 1px solid #2a3942; overflow-y: auto;">
                  <table class="surgas-table" style="width: 100%; border-collapse: collapse; font-size: 11px;">
                    <thead>
                      <tr style="background: #182229; color: #8696a0; text-align: left; position: sticky; top: 0; z-index: 2;">
                        <th style="padding: 6px 8px; width: 28px;">#</th>
                        <th style="padding: 6px 8px;">Nombre</th>
                        <th style="padding: 6px 8px;">Número</th>
                        <th style="padding: 6px 8px; width: 25px;"></th>
                      </tr>
                    </thead>
                    <tbody id="surgas-contacts-preview-tbody">
                    </tbody>
                  </table>
                </div>
              </div>

              <div class="surgas-field" style="margin-top: 20px;">
                <label class="surgas-label" style="margin-bottom:12px;">Condiciones de envío</label>

                <label class="surgas-toggle-row">
                  <input type="checkbox" id="surgas-chk-typing" checked style="display:none;">
                  <span class="surgas-toggle-switch"></span>
                  <span class="surgas-toggle-label">Mostrar estado de escritura ("escribiendo...")</span>
                </label>

                <label class="surgas-toggle-row">
                  <input type="checkbox" id="surgas-chk-rotate" checked style="display:none;">
                  <span class="surgas-toggle-switch"></span>
                  <span class="surgas-toggle-label">Rotar saludos al azar (Anti-bloqueo)</span>
                </label>

                <label class="surgas-toggle-row">
                  <input type="checkbox" id="surgas-chk-stop-err" checked style="display:none;">
                  <span class="surgas-toggle-switch"></span>
                  <span class="surgas-toggle-label">Pausar si ocurren 3 fallos seguidos</span>
                </label>
              </div>
            </div>

            <!-- Derecha -->
            <div>
              <div class="surgas-msg-card">
                <div class="surgas-msg-header">
                  <div class="surgas-msg-title">
                    <span>Mensaje</span>
                  </div>
                  <div style="width: 150px;">
                    <select id="surgas-select-template-type" class="surgas-select" style="padding:6px 10px; font-size:12px;">
                      <option value="text">Solo Mensaje</option>
                      <option value="image">Con Imagen</option>
                      <option value="video">Con Video</option>
                      <option value="document">Con PDF / Documento</option>
                    </select>
                  </div>
                </div>

                <div id="surgas-media-container" class="surgas-media-row" style="display:none;">
                  <div class="surgas-media-info">
                    <span id="surgas-media-icon">📎</span>
                    <span id="surgas-media-name" style="max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">Ningún archivo</span>
                  </div>
                  <div style="display:flex; gap:6px;">
                    <button type="button" class="surgas-tool-btn" id="surgas-btn-select-file">Elegir archivo</button>
                    <button type="button" class="surgas-tool-btn" style="color:#f87171;" id="surgas-btn-clear-file">✕</button>
                  </div>
                  <input type="file" id="surgas-file-input" style="display:none;">
                </div>

                <textarea id="surgas-textarea-msg" class="surgas-msg-textarea" placeholder="Ingresa el texto del mensaje"></textarea>

                <div class="surgas-msg-toolbar">
                  <div class="surgas-tool-buttons">
                    <button type="button" class="surgas-tool-btn" id="surgas-tool-var">+ Variable</button>
                    <button type="button" class="surgas-tool-btn" id="surgas-tool-bold"><strong>B</strong></button>
                    <button type="button" class="surgas-tool-btn" id="surgas-tool-italic"><em>I</em></button>
                    <button type="button" class="surgas-tool-btn" id="surgas-tool-strike"><s>S</s></button>
                    <button type="button" class="surgas-tool-btn" id="surgas-tool-emoji">😊</button>
                  </div>
                </div>
              </div>

              <div class="surgas-delay-header">
                <span class="surgas-delay-label">Retardo de envío</span>
                <span id="surgas-delay-range-display" class="surgas-delay-range-badge">00:25 - 00:45</span>
              </div>

              <div class="surgas-delay-inputs">
                <div>
                  <div class="surgas-delay-sublabel">Segundo mínimo:</div>
                  <input type="number" id="surgas-delay-min" class="surgas-input" value="${STATE.minDelay}" min="10" max="180">
                </div>
                <div>
                  <div class="surgas-delay-sublabel">Segundo máximo:</div>
                  <input type="number" id="surgas-delay-max" class="surgas-input" value="${STATE.maxDelay}" min="15" max="300">
                </div>
              </div>

              <div style="margin-top: 12px;">
                <div class="surgas-delay-sublabel">Límite a enviar en esta sesión:</div>
                <input type="number" id="surgas-batch-limit" class="surgas-input" value="${STATE.batchLimit}" min="1" max="1000">
              </div>
            </div>
          </div>

          <div id="surgas-live-panel" class="surgas-live-banner" style="display:none;">
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px;">
              <span id="surgas-live-status-text" style="font-weight:600; color:#e9edef;">Iniciando envíos...</span>
              <span id="surgas-live-timer-text" style="color:#fbbf24; font-weight:700;">⏳ Pausa: 0s</span>
            </div>
            <div class="surgas-progress-track">
              <div id="surgas-live-bar" class="surgas-progress-bar"></div>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:11px; color:#8696a0;">
              <span id="surgas-live-counter">0 / 0 enviados</span>
              <span id="surgas-live-target">Objetivo: 30</span>
            </div>
          </div>
        </div>

        <div class="surgas-modal-footer">
          <div class="surgas-footer-stats" id="surgas-footer-stats">
            Contactos pendientes: 0 | Enviados: 0
          </div>
          <div class="surgas-footer-buttons">
            <button type="button" class="surgas-btn-cancel" id="surgas-btn-cancel">Cancelar</button>
            <button type="button" class="surgas-btn-pause" id="surgas-btn-pause" style="display:none;">Pausar</button>
            <button type="button" class="surgas-btn-stop" id="surgas-btn-stop" style="display:none;">Detener</button>
            <button type="button" class="surgas-btn-submit" id="surgas-btn-start">Iniciar Campaña</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    setupCampaignEvents();
    updateCampaignUI();
  }

  function toggleCampaignModal(open) {
    const overlay = document.getElementById('surgas-modal-overlay');
    if (overlay) overlay.classList.toggle('active', open);
  }

  function setupCampaignEvents() {
    document.getElementById('surgas-btn-close').addEventListener('click', () => toggleCampaignModal(false));
    document.getElementById('surgas-btn-cancel').addEventListener('click', () => toggleCampaignModal(false));
    document.getElementById('surgas-modal-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'surgas-modal-overlay') toggleCampaignModal(false);
    });

    document.getElementById('surgas-input-camp-name').addEventListener('input', (e) => {
      STATE.campaignName = e.target.value;
      persistCampaign();
    });

    const textarea = document.getElementById('surgas-textarea-msg');
    textarea.value = STATE.messageText;
    textarea.addEventListener('input', (e) => {
      STATE.messageText = e.target.value;
      persistCampaign();
    });

    document.getElementById('surgas-tool-var').addEventListener('click', () => insertAtCursor(textarea, '{nombre}'));
    document.getElementById('surgas-tool-bold').addEventListener('click', () => wrapSelection(textarea, '*'));
    document.getElementById('surgas-tool-italic').addEventListener('click', () => wrapSelection(textarea, '_'));
    document.getElementById('surgas-tool-strike').addEventListener('click', () => wrapSelection(textarea, '~'));
    document.getElementById('surgas-tool-emoji').addEventListener('click', () => insertAtCursor(textarea, '🔥 '));

    const inputMin = document.getElementById('surgas-delay-min');
    const inputMax = document.getElementById('surgas-delay-max');
    const rangeDisplay = document.getElementById('surgas-delay-range-display');

    function updateRange() {
      let min = parseInt(inputMin.value) || 20;
      let max = parseInt(inputMax.value) || 40;
      if (min > max) max = min + 5;
      STATE.minDelay = min;
      STATE.maxDelay = max;
      rangeDisplay.textContent = formatTimeRange(min, max);
      persistCampaign();
    }

    inputMin.addEventListener('input', updateRange);
    inputMax.addEventListener('input', updateRange);
    updateRange();

    document.getElementById('surgas-batch-limit').addEventListener('input', (e) => {
      STATE.batchLimit = parseInt(e.target.value) || 30;
      persistCampaign();
    });

    document.getElementById('surgas-btn-load-501').addEventListener('click', () => {
      if (window.SURGAS_DEFAULT_NUMBERS && Array.isArray(window.SURGAS_DEFAULT_NUMBERS)) {
        addNumbers(window.SURGAS_DEFAULT_NUMBERS);
      }
    });

    document.getElementById('surgas-btn-clear-contacts').addEventListener('click', () => {
      if (confirm('¿Vaciar la lista de contactos?')) {
        STATE.contacts = [];
        persistCampaign();
        updateCampaignUI();
      }
    });

    const dropZone = document.getElementById('surgas-excel-drop');
    const excelFile = document.getElementById('surgas-excel-file');
    dropZone.addEventListener('click', () => excelFile.click());
    dropZone.addEventListener('dragover', (e) => e.preventDefault());
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      if (e.dataTransfer.files.length > 0) handleExcelUpload(e.dataTransfer.files[0]);
    });
    excelFile.addEventListener('change', (e) => {
      if (e.target.files.length > 0) handleExcelUpload(e.target.files[0]);
    });

    const selectType = document.getElementById('surgas-select-template-type');
    selectType.value = STATE.attachmentType;
    selectType.addEventListener('change', (e) => {
      STATE.attachmentType = e.target.value;
      updateMediaVisibility();
      persistCampaign();
    });

    const fileInput = document.getElementById('surgas-file-input');
    document.getElementById('surgas-btn-select-file').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) handleMediaUpload(e.target.files[0]);
    });
    document.getElementById('surgas-btn-clear-file').addEventListener('click', () => {
      STATE.attachment = null;
      persistCampaign();
      updateMediaVisibility();
    });

    document.getElementById('surgas-btn-start').addEventListener('click', startSendingCampaign);
    document.getElementById('surgas-btn-pause').addEventListener('click', pauseSendingCampaign);
    document.getElementById('surgas-btn-stop').addEventListener('click', stopSendingCampaign);

    updateMediaVisibility();
  }

  function insertAtCursor(textarea, text) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    textarea.value = textarea.value.substring(0, start) + text + textarea.value.substring(end);
    textarea.focus();
    textarea.selectionStart = textarea.selectionEnd = start + text.length;
  }

  function wrapSelection(textarea, wrapper) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.substring(start, end) || 'texto';
    const wrapped = `${wrapper}${selected}${wrapper}`;
    textarea.value = textarea.value.substring(0, start) + wrapped + textarea.value.substring(end);
    textarea.focus();
  }

  function updateMediaVisibility() {
    const mediaContainer = document.getElementById('surgas-media-container');
    const mediaIcon = document.getElementById('surgas-media-icon');
    const mediaName = document.getElementById('surgas-media-name');
    const fileInput = document.getElementById('surgas-file-input');

    if (STATE.attachmentType === 'text') {
      mediaContainer.style.display = 'none';
      return;
    }
    mediaContainer.style.display = 'flex';
    if (STATE.attachmentType === 'image') {
      fileInput.accept = 'image/*';
      mediaIcon.textContent = '🖼️';
    } else if (STATE.attachmentType === 'video') {
      fileInput.accept = 'video/*';
      mediaIcon.textContent = '🎬';
    } else {
      fileInput.accept = 'application/pdf,.doc,.docx';
      mediaIcon.textContent = '📄';
    }
    mediaName.textContent = STATE.attachment ? `${STATE.attachment.name} (${STATE.attachment.sizeFormatted})` : 'Ningún archivo adjunto aún';
  }

  function handleMediaUpload(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      STATE.attachment = {
        name: file.name,
        type: STATE.attachmentType,
        mimeType: file.type,
        dataUrl: e.target.result,
        sizeFormatted: (file.size / 1024 / 1024).toFixed(2) + ' MB'
      };
      persistCampaign();
      updateMediaVisibility();
    };
    reader.readAsDataURL(file);
  }

  function handleExcelUpload(file) {
    const excelFile = document.getElementById('surgas-excel-file');
    if (excelFile) excelFile.value = '';

    const isTextFile = file.name.endsWith('.csv') || file.name.endsWith('.txt') || file.name.endsWith('.md');

    // Función auxiliar para parsear filas
    function extractFromRows(rows) {
      const list = [];
      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        if (!row) continue;
        const cells = Array.isArray(row) ? row : Object.values(row);
        let foundPhone = null;
        let foundName = 'Cliente';

        for (let c = 0; c < cells.length; c++) {
          const val = String(cells[c] != null ? cells[c] : '').trim();
          const digits = val.replace(/\D/g, '');
          
          if ((digits.length === 9 && digits.startsWith('9')) || (digits.length === 11 && digits.startsWith('519'))) {
            foundPhone = digits;
          } else if (val.length >= 3 && isNaN(val) && foundName === 'Cliente') {
            // Evitar tomar cabeceras como nombres
            const lower = val.toLowerCase();
            if (!lower.includes('tel') && !lower.includes('cel') && !lower.includes('num') && !lower.includes('phone') && !lower.includes('nom') && !lower.includes('name')) {
              foundName = val;
            }
          }
        }
        if (foundPhone) {
          list.push({ phone: foundPhone, name: foundName });
        }
      }
      return list;
    }

    // Intento 1: Si es XLSX / XLS o tiene librería XLSX
    if (window.XLSX && !isTextFile) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
            parseAsPlainText(file);
            return;
          }
          const worksheet = workbook.Sheets[workbook.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          const list = extractFromRows(json);

          if (list.length > 0) {
            addNumbers(list);
            alert(`✅ Se importaron ${list.length} contactos de "${file.name}" correctamente.`);
          } else {
            // Intentar como texto
            parseAsPlainText(file);
          }
        } catch (err) {
          console.warn('[Surgas] Falló lectura XLSX, intentando como texto plano:', err);
          parseAsPlainText(file);
        }
      };
      reader.onerror = () => parseAsPlainText(file);
      reader.readAsArrayBuffer(file);
    } else {
      parseAsPlainText(file);
    }

    // Fallback: Parsear como texto plano (útil para CSV, TXT, o si XLSX falla)
    function parseAsPlainText(f) {
      const txtReader = new FileReader();
      txtReader.onload = (e) => {
        try {
          const text = e.target.result;
          const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
          const list = [];

          for (const line of lines) {
            // Dividir por comas, puntos y comas o tabuladores
            const parts = line.split(/[,\t;]/).map(p => p.trim());
            let foundPhone = null;
            let foundName = 'Cliente';

            for (const part of parts) {
              const digits = part.replace(/\D/g, '');
              if ((digits.length === 9 && digits.startsWith('9')) || (digits.length === 11 && digits.startsWith('519'))) {
                foundPhone = digits;
              } else if (part.length >= 3 && isNaN(part) && foundName === 'Cliente') {
                foundName = part;
              }
            }

            if (foundPhone) {
              list.push({ phone: foundPhone, name: foundName });
            }
          }

          if (list.length > 0) {
            addNumbers(list);
            alert(`✅ Se importaron ${list.length} contactos de "${f.name}" correctamente.`);
          } else {
            alert('No se encontraron números de teléfono válidos en el archivo.');
          }
        } catch (err) {
          console.error('[Surgas] Error en texto plano:', err);
          alert('Error al procesar el archivo: ' + (err.message || 'formato no reconocido'));
        }
      };
      txtReader.readAsText(f);
    }
  }

  function addNumbers(list) {
    const seen = new Set(STATE.contacts.map(c => c.cleanPhone));
    list.forEach(item => {
      const phone = typeof item === 'object' ? item.phone : item;
      const name = typeof item === 'object' ? (item.name || 'Cliente') : 'Cliente';
      const clean = cleanPhone(phone);
      if (clean && !seen.has(clean)) {
        seen.add(clean);
        STATE.contacts.push({ phone, cleanPhone: clean, name, status: 'pending' });
      }
    });
    persistCampaign();
    updateCampaignUI();
  }

  function updateCampaignUI() {
    const total = STATE.contacts.length;
    const pending = STATE.contacts.filter(c => c.status === 'pending').length;
    const sent = STATE.contacts.filter(c => c.status === 'sent').length;

    const summary = document.getElementById('surgas-contacts-summary');
    if (summary) summary.textContent = `${total} contactos cargados (${pending} pendientes, ${sent} enviados)`;

    const stats = document.getElementById('surgas-footer-stats');
    if (stats) stats.textContent = `Pendientes: ${pending} | Enviados: ${sent} | Total: ${total}`;

    // Renderizar previsualización de contactos
    const previewBox = document.getElementById('surgas-contacts-preview-box');
    const previewTbody = document.getElementById('surgas-contacts-preview-tbody');
    if (previewBox && previewTbody) {
      if (total === 0) {
        previewBox.style.display = 'none';
        previewTbody.innerHTML = '';
      } else {
        previewBox.style.display = 'block';
        const displayLimit = 100;
        const slice = STATE.contacts.slice(0, displayLimit);

        previewTbody.innerHTML = slice.map((c, idx) => `
          <tr style="border-bottom: 1px solid #1f2c34;">
            <td style="padding: 5px 8px; color: #8696a0;">${idx + 1}</td>
            <td style="padding: 5px 8px; color: #e9edef; font-weight: 500;">${escapeHtml(c.name || 'Cliente')}</td>
            <td style="padding: 5px 8px; color: #38bdf8; font-family: monospace;">+${c.cleanPhone}</td>
            <td style="padding: 5px 8px; text-align: center;">
              <button type="button" class="surgas-btn-remove-single" data-idx="${idx}" style="background:transparent; border:none; color:#f87171; cursor:pointer; font-size:12px; padding:0; line-height:1;" title="Quitar contacto">✕</button>
            </td>
          </tr>
        `).join('');

        if (total > displayLimit) {
          previewTbody.innerHTML += `
            <tr>
              <td colspan="4" style="padding: 6px 8px; text-align: center; color: #8696a0; font-size: 10px;">
                ... y ${total - displayLimit} contactos más
              </td>
            </tr>
          `;
        }

        // Listener para eliminar contacto individual
        previewTbody.querySelectorAll('.surgas-btn-remove-single').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const idxToRemove = parseInt(e.currentTarget.dataset.idx);
            STATE.contacts.splice(idxToRemove, 1);
            persistCampaign();
            updateCampaignUI();
          });
        });
      }
    }
  }

  async function startSendingCampaign() {
    if (STATE.campaignStatus === 'running') return;
    if (!window.WPP || !window.WPP.chat) {
      alert('Esperando conexión con WhatsApp Web. Asegúrate de tener WhatsApp Web abierto.');
      return;
    }
    const pending = STATE.contacts.filter(c => c.status === 'pending');
    if (pending.length === 0) {
      alert('No hay contactos pendientes.');
      return;
    }

    const limit = STATE.batchLimit || 30;
    const batch = pending.slice(0, limit);
    STATE.campaignStatus = 'running';

    const btnStart = document.getElementById('surgas-btn-start');
    const btnPause = document.getElementById('surgas-btn-pause');
    const btnStop = document.getElementById('surgas-btn-stop');
    const livePanel = document.getElementById('surgas-live-panel');
    const statusText = document.getElementById('surgas-live-status-text');
    const timerText = document.getElementById('surgas-live-timer-text');
    const progressBar = document.getElementById('surgas-live-bar');
    const counterText = document.getElementById('surgas-live-counter');
    const targetText = document.getElementById('surgas-live-target');

    btnStart.style.display = 'none';
    btnPause.style.display = 'inline-block';
    btnStop.style.display = 'inline-block';
    livePanel.style.display = 'block';
    targetText.textContent = `Lote de hoy: ${batch.length}`;

    let consecutiveErrors = 0;

    for (let i = 0; i < batch.length; i++) {
      if (STATE.campaignStatus !== 'running') break;

      const contact = batch[i];
      const jid = `${contact.cleanPhone}@c.us`;

      // Simular escritura
      if (document.getElementById('surgas-chk-typing').checked && window.WPP.chat.markIsComposing) {
        try { await window.WPP.chat.markIsComposing(jid, 2000); } catch (e) {}
      }

      // Saludo rotativo
      let textToSend = STATE.messageText;
      const formattedName = contact.name && contact.name !== 'Cliente' ? contact.name : 'Vecino/a';
      if (document.getElementById('surgas-chk-rotate').checked && textToSend.includes('{nombre}')) {
        const greeting = STATE.greetings[i % STATE.greetings.length];
        textToSend = textToSend.replace(/^¡?Hola {nombre}!?/i, greeting);
      }
      textToSend = textToSend.replace(/{nombre}/g, formattedName);

      statusText.textContent = `Enviando a +${contact.cleanPhone} (${i + 1}/${batch.length})...`;

      try {
        if (STATE.attachmentType !== 'text' && STATE.attachment && STATE.attachment.dataUrl) {
          await window.WPP.chat.sendFileMessage(jid, STATE.attachment.dataUrl, {
            type: STATE.attachment.type,
            filename: STATE.attachment.name,
            caption: textToSend
          });
        } else {
          await window.WPP.chat.sendTextMessage(jid, textToSend);
        }
        contact.status = 'sent';
        consecutiveErrors = 0;
      } catch (err) {
        contact.status = 'error';
        consecutiveErrors++;
        if (document.getElementById('surgas-chk-stop-err').checked && consecutiveErrors >= 3) {
          alert('Se detuvo la campaña automáticamente por 3 fallos consecutivos.');
          break;
        }
      }

      persistCampaign();
      updateCampaignUI();

      const pct = Math.round(((i + 1) / batch.length) * 100);
      progressBar.style.width = pct + '%';
      counterText.textContent = `${i + 1} / ${batch.length} procesados`;

      if (i < batch.length - 1 && STATE.campaignStatus === 'running') {
        const delay = Math.floor(Math.random() * (STATE.maxDelay - STATE.minDelay + 1)) + STATE.minDelay;
        let rem = delay;
        while (rem > 0 && STATE.campaignStatus === 'running') {
          timerText.textContent = `⏳ Esperando: ${rem}s`;
          await new Promise(r => setTimeout(r, 1000));
          rem--;
        }
      }
    }

    STATE.campaignStatus = 'idle';
    btnStart.style.display = 'inline-block';
    btnPause.style.display = 'none';
    btnStop.style.display = 'none';
    timerText.textContent = '✓ Listo';
    statusText.textContent = 'Tanda finalizada.';
    updateCampaignUI();
  }

  function pauseSendingCampaign() {
    STATE.campaignStatus = 'paused';
    document.getElementById('surgas-btn-start').style.display = 'inline-block';
    document.getElementById('surgas-btn-pause').style.display = 'none';
  }

  function stopSendingCampaign() {
    STATE.campaignStatus = 'stopped';
    document.getElementById('surgas-btn-start').style.display = 'inline-block';
    document.getElementById('surgas-btn-pause').style.display = 'none';
    document.getElementById('surgas-btn-stop').style.display = 'none';
  }

  // =========================================================================
  // 2. BARRA DE ACCESOS DIRECTOS (RESPUESTAS RÁPIDAS EN EL CHAT) - Screenshot 3
  // =========================================================================
  function initQuickRepliesBar() {
    // Monitorear cuando WhatsApp Web abre un chat
    setInterval(() => {
      const chatFooter = document.querySelector('#main footer') || document.querySelector('footer');
      if (!chatFooter) return;

      let bar = document.getElementById('surgas-quick-bar');
      if (!bar) {
        bar = document.createElement('div');
        bar.id = 'surgas-quick-bar';
        bar.className = 'surgas-quick-bar';
        // Insertar justo antes del footer o arriba del área de escribir
        chatFooter.parentNode.insertBefore(bar, chatFooter.nextSibling);
      }
      renderQuickBarChips();
    }, 1000);
  }

  function renderQuickBarChips() {
    const bar = document.getElementById('surgas-quick-bar');
    if (!bar) return;

    // Botón gestor ☰ a la izquierda + chips fijados
    const pinned = STATE.quickReplies.filter(qr => qr.pinned);

    let html = `
      <button class="surgas-quick-mgr-btn" id="surgas-qr-open-mgr" title="Gestionar respuestas rápidas">
        ☰
      </button>
    `;

    pinned.forEach(qr => {
      html += `
        <button class="surgas-quick-chip" data-qrid="${qr.id}" title="Haga clic para enviar o pegar en el chat">
          💬 ${escapeHtml(qr.name)} ↗
        </button>
      `;
    });

    bar.innerHTML = html;

    // Eventos de los chips
    bar.querySelector('#surgas-qr-open-mgr').addEventListener('click', () => toggleQuickModal(true));

    bar.querySelectorAll('.surgas-quick-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const qrId = chip.dataset.qrid;
        const qr = STATE.quickReplies.find(q => q.id === qrId);
        if (qr) executeQuickReply(qr);
      });
    });
  }

  // Ejecutar respuesta rápida en el chat actual
  async function executeQuickReply(qr) {
    const chatInput = document.querySelector('#main footer div[contenteditable="true"]') || document.querySelector('footer div[contenteditable="true"]');
    
    // Si la opción "Editar antes de enviar" está activada o se desea revisar
    if (qr.editBeforeSend || !window.WPP || !window.WPP.chat) {
      if (chatInput) {
        chatInput.focus();
        document.execCommand('insertText', false, qr.text);
      }
      return;
    }

    // Envío directo con WPPConnect al chat activo
    try {
      const activeChat = window.WPP.chat.getActiveChat ? await window.WPP.chat.getActiveChat() : null;
      if (activeChat && activeChat.id) {
        await window.WPP.chat.sendTextMessage(activeChat.id, qr.text);
      } else if (chatInput) {
        // Fallback: pegar y presionar enter
        chatInput.focus();
        document.execCommand('insertText', false, qr.text);
        setTimeout(() => {
          const sendBtn = document.querySelector('button[aria-label="Enviar"], span[data-icon="send"]');
          if (sendBtn) sendBtn.click();
        }, 300);
      }
    } catch (err) {
      console.error('Error enviando respuesta rápida:', err);
      if (chatInput) {
        chatInput.focus();
        document.execCommand('insertText', false, qr.text);
      }
    }
  }

  // =========================================================================
  // 3. GESTOR Y EDITOR DE RESPUESTAS RÁPIDAS (Screenshots 1 & 2)
  // =========================================================================
  function injectQuickRepliesModal() {
    const overlay = document.createElement('div');
    overlay.id = 'surgas-qr-overlay';
    overlay.innerHTML = `
      <div id="surgas-qr-container">
        
        <!-- Header -->
        <div class="surgas-modal-header">
          <div class="surgas-header-title">
            <span>💬 Respuestas Rápidas</span>
          </div>
          <button id="surgas-qr-close" class="surgas-close-btn" title="Cerrar">✕</button>
        </div>

        <!-- Body (2 Columnas: Lista en izq, Editor en der) -->
        <div class="surgas-modal-body">
          <div class="surgas-grid-2col">
            
            <!-- Columna Izquierda: Lista (Screenshot 1) -->
            <div>
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <input type="text" id="surgas-qr-search" class="surgas-input" placeholder="Buscar aquí..." style="padding:8px 12px; font-size:12px;">
              </div>

              <button class="surgas-btn-submit" id="surgas-qr-btn-new" style="width:100%; margin-bottom:12px; padding:8px 14px; font-size:12px;">
                + Agregar respuesta rápida
              </button>

              <div class="surgas-qr-list" id="surgas-qr-list-items">
                <!-- Generado dinámicamente -->
              </div>
            </div>

            <!-- Columna Derecha: Editor / Previsualización (Screenshot 2) -->
            <div>
              <div class="surgas-field">
                <label class="surgas-label">Nombre de la respuesta rápida <span class="surgas-req">*</span></label>
                <input type="text" id="surgas-qr-edit-name" class="surgas-input" placeholder="Ej: PRECIOS">
              </div>

              <div class="surgas-field">
                <label class="surgas-toggle-row">
                  <input type="checkbox" id="surgas-qr-edit-pinned" checked style="display:none;">
                  <span class="surgas-toggle-switch"></span>
                  <span class="surgas-toggle-label">Fijar en la barra de accesos directos</span>
                </label>

                <label class="surgas-toggle-row">
                  <input type="checkbox" id="surgas-qr-edit-editfirst" style="display:none;">
                  <span class="surgas-toggle-switch"></span>
                  <span class="surgas-toggle-label">Editar antes de enviar (pegar en el chat)</span>
                </label>
              </div>

              <div class="surgas-msg-card">
                <div class="surgas-msg-header">
                  <span class="surgas-msg-title">Mensaje</span>
                </div>
                <textarea id="surgas-qr-edit-text" class="surgas-msg-textarea" placeholder="Escribe el texto de la respuesta rápida..."></textarea>
                
                <div class="surgas-msg-toolbar">
                  <div class="surgas-tool-buttons">
                    <button type="button" class="surgas-tool-btn" id="surgas-qr-bold"><strong>B</strong></button>
                    <button type="button" class="surgas-tool-btn" id="surgas-qr-italic"><em>I</em></button>
                    <button type="button" class="surgas-tool-btn" id="surgas-qr-strike"><s>S</s></button>
                    <button type="button" class="surgas-tool-btn" id="surgas-qr-emoji">🔥</button>
                  </div>
                </div>
              </div>

              <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:16px;">
                <button type="button" class="surgas-btn-cancel" id="surgas-qr-btn-del" style="color:#f87171; border-color:rgba(248,113,113,0.3);">Eliminar</button>
                <button type="button" class="surgas-btn-submit" id="surgas-qr-btn-save">Guardar Respuesta</button>
              </div>

            </div>

          </div>
        </div>

      </div>
    `;

    document.body.appendChild(overlay);
    setupQuickModalEvents();
  }

  function toggleQuickModal(open) {
    const overlay = document.getElementById('surgas-qr-overlay');
    if (overlay) {
      overlay.classList.toggle('active', open);
      if (open) {
        if (!STATE.selectedQrId && STATE.quickReplies.length > 0) {
          STATE.selectedQrId = STATE.quickReplies[0].id;
        }
        renderQuickModalList();
        loadSelectedQrIntoEditor();
      }
    }
  }

  function setupQuickModalEvents() {
    document.getElementById('surgas-qr-close').addEventListener('click', () => toggleQuickModal(false));
    document.getElementById('surgas-qr-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'surgas-qr-overlay') toggleQuickModal(false);
    });

    // Nuevo
    document.getElementById('surgas-qr-btn-new').addEventListener('click', () => {
      const newQr = {
        id: 'qr_' + Date.now(),
        name: 'NUEVA RESPUESTA',
        text: 'Escribe tu mensaje aquí...',
        pinned: true,
        editBeforeSend: false
      };
      STATE.quickReplies.push(newQr);
      STATE.selectedQrId = newQr.id;
      persistQuickReplies();
      renderQuickModalList();
      loadSelectedQrIntoEditor();
      renderQuickBarChips();
    });

    // Guardar
    document.getElementById('surgas-qr-btn-save').addEventListener('click', () => {
      const name = document.getElementById('surgas-qr-edit-name').value.trim();
      const text = document.getElementById('surgas-qr-edit-text').value.trim();
      const pinned = document.getElementById('surgas-qr-edit-pinned').checked;
      const editBeforeSend = document.getElementById('surgas-qr-edit-editfirst').checked;

      if (!name) {
        alert('Por favor ingresa un nombre para la respuesta rápida.');
        return;
      }

      let target = STATE.quickReplies.find(q => q.id === STATE.selectedQrId);
      if (target) {
        target.name = name;
        target.text = text;
        target.pinned = pinned;
        target.editBeforeSend = editBeforeSend;
      }

      persistQuickReplies();
      renderQuickModalList();
      renderQuickBarChips();
      alert('Respuesta rápida guardada con éxito.');
    });

    // Eliminar
    document.getElementById('surgas-qr-btn-del').addEventListener('click', () => {
      if (!confirm('¿Eliminar esta respuesta rápida?')) return;
      STATE.quickReplies = STATE.quickReplies.filter(q => q.id !== STATE.selectedQrId);
      STATE.selectedQrId = STATE.quickReplies.length > 0 ? STATE.quickReplies[0].id : null;
      persistQuickReplies();
      renderQuickModalList();
      loadSelectedQrIntoEditor();
      renderQuickBarChips();
    });

    // Buscar
    document.getElementById('surgas-qr-search').addEventListener('input', (e) => {
      renderQuickModalList(e.target.value.toLowerCase().trim());
    });

    // Botones de formato
    const qrTextarea = document.getElementById('surgas-qr-edit-text');
    document.getElementById('surgas-qr-bold').addEventListener('click', () => wrapSelection(qrTextarea, '*'));
    document.getElementById('surgas-qr-italic').addEventListener('click', () => wrapSelection(qrTextarea, '_'));
    document.getElementById('surgas-qr-strike').addEventListener('click', () => wrapSelection(qrTextarea, '~'));
    document.getElementById('surgas-qr-emoji').addEventListener('click', () => insertAtCursor(qrTextarea, '🔥 '));
  }

  function renderQuickModalList(filter = '') {
    const listContainer = document.getElementById('surgas-qr-list-items');
    if (!listContainer) return;

    const filtered = STATE.quickReplies.filter(qr => qr.name.toLowerCase().includes(filter));

    if (filtered.length === 0) {
      listContainer.innerHTML = '<div style="color:#8696a0; font-size:12px; text-align:center; padding:16px;">No se encontraron respuestas.</div>';
      return;
    }

    listContainer.innerHTML = filtered.map(qr => `
      <div class="surgas-qr-item ${qr.id === STATE.selectedQrId ? 'selected' : ''}" data-id="${qr.id}">
        <div class="surgas-qr-item-title">
          <span>:: ${escapeHtml(qr.name)}</span>
        </div>
        <div class="surgas-qr-item-badge">
          ${qr.pinned ? '📌 Fijado' : ''} 💬 1
        </div>
      </div>
    `).join('');

    listContainer.querySelectorAll('.surgas-qr-item').forEach(item => {
      item.addEventListener('click', () => {
        STATE.selectedQrId = item.dataset.id;
        renderQuickModalList(filter);
        loadSelectedQrIntoEditor();
      });
    });
  }

  function loadSelectedQrIntoEditor() {
    const target = STATE.quickReplies.find(q => q.id === STATE.selectedQrId);
    if (!target) return;

    document.getElementById('surgas-qr-edit-name').value = target.name;
    document.getElementById('surgas-qr-edit-text').value = target.text;
    document.getElementById('surgas-qr-edit-pinned').checked = target.pinned;
    document.getElementById('surgas-qr-edit-editfirst').checked = target.editBeforeSend;
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[s]);
  }

  // =========================================================================
  // INICIALIZACIÓN
  // =========================================================================
  loadPersistedState();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      injectCampaignModal();
      injectQuickRepliesModal();
      initQuickRepliesBar();
    });
  } else {
    injectCampaignModal();
    injectQuickRepliesModal();
    initQuickRepliesBar();
  }

})();
