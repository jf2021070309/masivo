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

  // Diagnóstico de errores en WhatsApp Web
  window.addEventListener('error', (event) => {
    console.error('🚨 [SURGAS ERROR DETECTADO]:', event.message, event.filename, event.lineno, event.error);
  });
  window.addEventListener('unhandledrejection', (event) => {
    console.error('🚨 [SURGAS PROMISE RECHAZADA]:', event.reason);
  });

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
      editBeforeSend: false,
      attachment: null
    },
    {
      id: 'qr_app',
      name: 'APP GAS',
      text: `📲 *Descarga la App de Surgas* y pide en 30 segundos sin esperar llamadas:
https://surgas.pe/descarga

🔥 Tienes *S/ 3 de descuento* en tu primer pedido ingresando desde la aplicación. ¿Te gustaría que te ayudemos a pedir hoy?`,
      pinned: true,
      editBeforeSend: false,
      attachment: null
    },
    {
      id: 'qr_yape',
      name: 'YAPE / PAGOS',
      text: `💳 *Pagos Surgas:*
Aceptamos *Yape*, *Plin*, efectivo y transferencias.
Al momento de la entrega puedes pagar directamente con el repartidor.`,
      pinned: true,
      editBeforeSend: false,
      attachment: null
    },
    {
      id: 'qr_gracias',
      name: 'GRACIAS',
      text: `🤝 *¡GRACIAS POR SU COMPRA!*
En Surgas estamos para atenderte siempre. ¡Que tengas un excelente día!`,
      pinned: true,
      editBeforeSend: false,
      attachment: null
    }
  ];


  // Plantillas oficiales predefinidas para los trabajadores de Surgas
  const CAMPAIGN_TEMPLATES = [
    {
      id: 'app_launch',
      name: '📲 Lanzamiento App (Descuento S/ 3 + Sorteo PS5)',
      text: `Hola 👋 Somos SURGAS. Pediste gas con nosotros y ahora puedes pedirlo directamente desde la app, con delivery y S/ 3 de descuento en tu primer pedido 🔥

🤖 Android: https://play.google.com/store/apps/details?id=pe.surgas.appgas
🍎 iPhone: https://apps.apple.com/pe/app/surgas/id6793674063

🎁 ¡Además acumulas puntos para canjear regalos y participas en el sorteo de una PlayStation 5! 🎮`
    },
    {
      id: 'precios_gas',
      name: '🔥 Precios Oficiales (Depósito S/57 y Domicilio S/63)',
      text: `Hola 👋 Te recordamos los precios oficiales de SURGAS para Tacna:

📍 Balón en Depósito: S/ 57
🏠 Balón a Domicilio: S/ 63
📲 Con la App Móvil: S/ 60 en tu primer pedido

¿Deseas que te enviemos un balón hoy?`
    },
    {
      id: 'promo_delivery',
      name: '🎁 Pedido Rápido y Puntos',
      text: `Hola 👋 ¿Te estás quedando sin gas? Recuerda que en SURGAS tu pedido llega rápido, seguro y con peso exacto garantizado.

Pide al instante desde la app:
📲 https://surgas.pe/descarga

¡Estamos listos para atenderte hoy!`
    },
    {
      id: 'custom',
      name: '✏️ Escribir Mensaje Libre',
      text: `Hola 👋 `
    }
  ];

  // Estado global
  const STATE = {
    // Campaña
    campaignName: 'Lanzamiento App Surgas',
    selectedTemplateId: 'app_launch',
    contacts: [],
    messageText: CAMPAIGN_TEMPLATES[0].text,
    attachment: null,
    attachmentType: 'text',
    minDelay: 25,
    maxDelay: 45,
    batchLimit: 0, // 0 = Sin límite artificial (enviar todos los pendientes en el mismo flujo)
    simulateTyping: true,
    rotateGreetings: true,
    campaignStatus: 'idle',
    contactsFilter: 'all', // 'all' | 'pending' | 'sent' | 'error'
    greetings: [
      'Hola {nombre} 👋',
      'Buen día {nombre} 👋',
      '¡Hola {nombre}! 👋',
      'Hola qué tal {nombre} 👋'
    ],
    // Respuestas Rápidas
    quickReplies: [],
    selectedQrId: null
  };

  // Motor Spintax dinámico para anti-baneo: procesa {opcion1|opcion2|opcion3}
  function processSpintax(text) {
    if (!text) return '';
    let processed = text;
    const spintaxRegex = /\{([^{}]+?\|[^{}]+?)\}/g;
    let iterations = 0;
    while (spintaxRegex.test(processed) && iterations < 15) {
      iterations++;
      processed = processed.replace(spintaxRegex, (_, choices) => {
        const options = choices.split('|');
        return options[Math.floor(Math.random() * options.length)];
      });
    }
    return processed;
  }

  // =========================================================================
  // ALMACENAMIENTO DE ARCHIVOS EN INDEXEDDB (Para no exceder los 5MB de localStorage)
  // =========================================================================
  const IDB_NAME = 'surgas_media_store_v1';
  const IDB_STORE = 'attachments';

  function openMediaDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function saveMediaToDB(id, dataUrl) {
    try {
      const db = await openMediaDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(dataUrl, id);
        tx.oncomplete = () => resolve(true);
        tx.onerror = (e) => reject(e.target.error);
      });
    } catch (err) {
      console.warn('[SURGAS] Error guardando adjunto en IndexedDB:', err);
      return false;
    }
  }

  async function getMediaFromDB(id) {
    try {
      const db = await openMediaDB();
      return new Promise((resolve) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch (err) {
      return null;
    }
  }

  async function deleteMediaFromDB(id) {
    try {
      const db = await openMediaDB();
      return new Promise((resolve) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).delete(id);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    } catch (err) {
      return false;
    }
  }

  async function hydrateQuickReplyAttachments() {
    if (!STATE.quickReplies || !Array.isArray(STATE.quickReplies)) return;
    for (const qr of STATE.quickReplies) {
      if (qr.attachment && !qr.attachment.dataUrl) {
        const data = await getMediaFromDB(qr.id);
        if (data) {
          qr.attachment.dataUrl = data;
        }
      }
    }
  }

  async function hydrateCampaignAttachment() {
    if (STATE.attachment && !STATE.attachment.dataUrl) {
      const data = await getMediaFromDB('campaign_attachment');
      if (data) {
        STATE.attachment.dataUrl = data;
      }
    }
  }

  // Carga y persistencia
  function loadPersistedState() {
    try {
      const savedCamp = localStorage.getItem(STORAGE_KEY_CAMPAIGN);
      if (savedCamp) {
        const parsed = JSON.parse(savedCamp);
        if (parsed.campaignName) STATE.campaignName = parsed.campaignName;
        if (parsed.contacts) STATE.contacts = parsed.contacts;
        if (parsed.selectedTemplateId) STATE.selectedTemplateId = parsed.selectedTemplateId;

        // Limpiar texto corrupto con llaves repetidas si existiese
        if (parsed.messageText) {
          if (parsed.messageText.includes('tardes}{Hola') || parsed.messageText.includes('{Hola|Buen día') || parsed.messageText.length > 2500) {
            STATE.messageText = CAMPAIGN_TEMPLATES[0].text;
          } else {
            STATE.messageText = parsed.messageText;
          }
        }
        if (parsed.minDelay) STATE.minDelay = parsed.minDelay;
        if (parsed.maxDelay) STATE.maxDelay = parsed.maxDelay;
        if (parsed.batchLimit !== undefined && parsed.batchLimit !== null) {
          // Si tenía guardado 30 por la versión anterior, restablecer a 0 (sin límite)
          STATE.batchLimit = (parsed.batchLimit === 30) ? 0 : parsed.batchLimit;
        }
        if (parsed.attachment) {
          if (!STATE.attachment || !STATE.attachment.dataUrl) {
            STATE.attachment = parsed.attachment;
          }
        }
        if (parsed.attachmentType) STATE.attachmentType = parsed.attachmentType;
      }

      const savedQr = localStorage.getItem(STORAGE_KEY_QUICK);
      if (savedQr) {
        STATE.quickReplies = JSON.parse(savedQr);
      } else {
        STATE.quickReplies = DEFAULT_QUICK_REPLIES;
        persistQuickReplies();
      }
      hydrateQuickReplyAttachments();
      hydrateCampaignAttachment();
    } catch (e) {
      console.error('[Surgas] Error cargando estado:', e);
      STATE.quickReplies = DEFAULT_QUICK_REPLIES;
    }
  }

  function persistCampaign() {
    try {
      // Evitar guardar dataUrl pesados en localStorage para prevenir superar la cuota de 5MB
      let safeAttachment = null;
      if (STATE.attachment) {
        safeAttachment = {
          name: STATE.attachment.name,
          type: STATE.attachment.type,
          mimeType: STATE.attachment.mimeType,
          sizeFormatted: STATE.attachment.sizeFormatted,
          dataUrl: STATE.attachment.dataUrl && STATE.attachment.dataUrl.length < 400000 ? STATE.attachment.dataUrl : null
        };
      }
      localStorage.setItem(STORAGE_KEY_CAMPAIGN, JSON.stringify({
        campaignName: STATE.campaignName,
        contacts: STATE.contacts,
        messageText: STATE.messageText,
        minDelay: STATE.minDelay,
        maxDelay: STATE.maxDelay,
        batchLimit: STATE.batchLimit,
        attachment: safeAttachment,
        attachmentType: STATE.attachmentType
      }));
    } catch (e) {
      console.warn('[Surgas] Advertencia: localStorage lleno o error al guardar, reintentando sin adjunto:', e);
      try {
        localStorage.setItem(STORAGE_KEY_CAMPAIGN, JSON.stringify({
          campaignName: STATE.campaignName,
          contacts: STATE.contacts,
          messageText: STATE.messageText,
          minDelay: STATE.minDelay,
          maxDelay: STATE.maxDelay,
          batchLimit: STATE.batchLimit,
          attachment: null,
          attachmentType: STATE.attachmentType
        }));
      } catch (err2) {
        console.error('[Surgas] Error crítico persistiendo campaña:', err2);
      }
    }
  }

  function persistQuickReplies() {
    try {
      // Guardar en localStorage sólo los metadatos del archivo para no exceder cuota
      const serialized = STATE.quickReplies.map(qr => {
        const item = { ...qr };
        if (item.attachment) {
          item.attachment = {
            name: item.attachment.name,
            type: item.attachment.type,
            mimeType: item.attachment.mimeType,
            sizeFormatted: item.attachment.sizeFormatted
          };
        }
        return item;
      });
      localStorage.setItem(STORAGE_KEY_QUICK, JSON.stringify(serialized));

      // Guardar en IndexedDB los archivos pesados (dataUrl base64)
      STATE.quickReplies.forEach(qr => {
        if (qr.attachment && qr.attachment.dataUrl) {
          saveMediaToDB(qr.id, qr.attachment.dataUrl);
        } else {
          deleteMediaFromDB(qr.id);
        }
      });
    } catch (e) {
      console.error('[SURGAS] Error persistiendo respuestas rápidas:', e);
    }
  }

  function cleanPhone(raw) {
    if (raw == null) return null;
    let s = String(raw).trim();
    // Limpiar decimales si Excel lo exportó como flotante (ej: 952909961.0)
    s = s.replace(/\.0+$/, '');
    let digits = s.replace(/\D/g, '');
    if (!digits) return null;
    // Si viene con prefijo internacional con ceros 0051...
    if (digits.startsWith('0051')) digits = digits.slice(2);
    // Eliminar ceros iniciales de discado nacional (ej: 0952909961 -> 952909961)
    digits = digits.replace(/^0+/, '');
    // Número peruano estándar 9 dígitos que empieza en 9 -> agregar 51
    if (digits.length === 9 && digits.startsWith('9')) return '51' + digits;
    // Número peruano con prefijo país 51 + 9 dígitos (11 dígitos)
    if (digits.length === 11 && digits.startsWith('519')) return digits;
    // Otros números de 11 dígitos
    if (digits.length === 11) return digits;
    // Otros números de 9 dígitos
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
    // Limpieza de botones redundantes si existiesen en el DOM
    const oldLauncher = document.getElementById('surgas-launcher-btn');
    if (oldLauncher) oldLauncher.remove();
    const oldHeaderBtn = document.getElementById('surgas-header-btn');
    if (oldHeaderBtn) oldHeaderBtn.remove();

    // Modal de Campaña
    const overlay = document.createElement('div');
    overlay.id = 'surgas-modal-overlay';
    overlay.innerHTML = `
      <div id="surgas-modal-container">
        <!-- Header -->
        <div class="surgas-modal-header">
          <div class="surgas-header-title">
            <span>🔥 SURGAS WSP - Envíos Masivos</span>
          </div>
          <button id="surgas-btn-close" class="surgas-close-btn" title="Cerrar">✕</button>
        </div>

        <div class="surgas-modal-body">
          <div class="surgas-grid-2col">
            <!-- Columna 1: Contactos -->
            <div>
              <div style="font-size: 13px; font-weight: 700; color: #e9edef; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
                <span>👥 Paso 1: ¿A quiénes enviamos?</span>
              </div>

              <button type="button" class="surgas-btn-load-main" id="surgas-btn-load-501">
                ⚡ Cargar 501 Clientes de Tacna (Surgas)
              </button>

              <div class="surgas-excel-box-compact" id="surgas-excel-drop">
                <span>📁 O arrastra aquí un archivo Excel / CSV</span>
                <input type="file" id="surgas-excel-file" accept=".xlsx, .xls, .csv" style="display:none;">
              </div>

              <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px; margin-bottom: 6px;">
                <div id="surgas-contacts-summary" style="font-size: 12px; color: #00a884; font-weight: 700;">
                  0 contactos cargados
                </div>
                <div style="display: flex; gap: 6px;">
                  <button type="button" class="surgas-tool-btn" id="surgas-btn-export-excel" style="font-size: 11px; padding: 4px 8px;" title="Descargar Excel con resultados">
                    📊 Exportar
                  </button>
                  <button type="button" class="surgas-tool-btn" id="surgas-btn-retry-failed" style="font-size: 11px; padding: 4px 8px; color: #fbbf24; display: none;" title="Reintentar números con error">
                    🔄 Reintentar
                  </button>
                  <button type="button" class="surgas-tool-btn" id="surgas-btn-clear-contacts" style="font-size: 11px; padding: 4px 8px; color: #f87171;" title="Vaciar lista">
                    🗑 Limpiar
                  </button>
                </div>
              </div>

              <!-- Filtros rápidos -->
              <div class="surgas-filter-tabs" id="surgas-filter-tabs-bar" style="display: none;">
                <button type="button" class="surgas-filter-tab active" data-filter="all" id="surgas-tab-all">Todos (0)</button>
                <button type="button" class="surgas-filter-tab" data-filter="pending" id="surgas-tab-pending">Pendientes (0)</button>
                <button type="button" class="surgas-filter-tab" data-filter="sent" id="surgas-tab-sent">Enviados (0)</button>
                <button type="button" class="surgas-filter-tab" data-filter="error" id="surgas-tab-error">Errores (0)</button>
              </div>

              <!-- Previsualización de Contactos Cargados -->
              <div id="surgas-contacts-preview-box" class="surgas-table-wrap" style="margin-top: 6px; max-height: 140px; display: none; background: #111b21; border-radius: 8px; border: 1px solid #2a3942; overflow-y: auto;">
                <table class="surgas-table" style="width: 100%; border-collapse: collapse; font-size: 11px;">
                  <thead>
                    <tr style="background: #182229; color: #8696a0; text-align: left; position: sticky; top: 0; z-index: 2;">
                      <th style="padding: 6px 8px; width: 26px;">#</th>
                      <th style="padding: 6px 8px;">Nombre</th>
                      <th style="padding: 6px 8px;">Número</th>
                      <th style="padding: 6px 8px; width: 68px;">Estado</th>
                      <th style="padding: 6px 8px; width: 22px;"></th>
                    </tr>
                  </thead>
                  <tbody id="surgas-contacts-preview-tbody">
                  </tbody>
                </table>
              </div>

              <!-- Acordeón de Configuración Avanzada (Oculto por defecto para no asustar al trabajador) -->
              <div style="margin-top: 12px; border-top: 1px solid #2a3942; padding-top: 6px;">
                <button type="button" id="surgas-toggle-advanced" style="background:transparent; border:none; color:#8696a0; font-size:11px; cursor:pointer; display:flex; align-items:center; gap:5px; padding:3px 0;">
                  <span>⚙️ Opciones avanzadas (Pausas y Límites)</span>
                  <span id="surgas-adv-arrow">▾</span>
                </button>
                
                <div id="surgas-advanced-panel" style="display:none; margin-top: 6px; background: #111b21; padding: 10px 12px; border-radius: 6px; border: 1px solid #2a3942;">
                  <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                    <div style="flex:1;">
                      <div class="surgas-delay-sublabel" style="font-size:10px;">Segundo mín:</div>
                      <input type="number" id="surgas-delay-min" class="surgas-input" value="${STATE.minDelay}" min="10" max="180" style="padding:4px 6px; font-size:11px;">
                    </div>
                    <div style="flex:1;">
                      <div class="surgas-delay-sublabel" style="font-size:10px;">Segundo máx:</div>
                      <input type="number" id="surgas-delay-max" class="surgas-input" value="${STATE.maxDelay}" min="15" max="300" style="padding:4px 6px; font-size:11px;">
                    </div>
                    <div style="flex:1;">
                      <div class="surgas-delay-sublabel" style="font-size:10px;">Límite lote:</div>
                      <input type="number" id="surgas-batch-limit" class="surgas-input" value="${STATE.batchLimit || 0}" min="0" max="5000" placeholder="0 = Todos" style="padding:4px 6px; font-size:11px;" title="0 = Enviar a todos los contactos pendientes">
                    </div>
                  </div>

                  <label class="surgas-toggle-row" style="margin-bottom:6px;">
                    <input type="checkbox" id="surgas-chk-typing" checked style="display:none;">
                    <span class="surgas-toggle-switch"></span>
                    <span class="surgas-toggle-label" style="font-size:11px;">Simular "escribiendo..."</span>
                  </label>

                  <label class="surgas-toggle-row">
                    <input type="checkbox" id="surgas-chk-stop-err" checked style="display:none;">
                    <span class="surgas-toggle-switch"></span>
                    <span class="surgas-toggle-label" style="font-size:11px;">Pausar si ocurren 3 fallos seguidos</span>
                  </label>
                  <input type="hidden" id="surgas-input-camp-name" value="${escapeHtml(STATE.campaignName)}">
                  <span id="surgas-delay-range-display" style="display:none;"></span>
                </div>
              </div>

              <div class="surgas-bg-hint" style="margin-top: 6px;">
                💡 <span>Pausas humanas de 25 a 45s aplicadas automáticamente.</span>
              </div>
            </div>

            <!-- Columna 2: Mensaje y Envío -->
            <div>
              <div style="font-size: 13px; font-weight: 700; color: #e9edef; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">
                <span>💬 Paso 2: Mensaje a Enviar</span>
                <span style="font-size: 11px; color: #00a884; font-weight: 600;">Anti-bloqueo activo ✓</span>
              </div>

              <div style="margin-bottom: 8px;">
                <label style="display:block; font-size: 11px; color: #8696a0; margin-bottom: 3px;">Elegir Plantilla de Surgas:</label>
                <select id="surgas-select-template" class="surgas-select" style="width:100%; padding: 6px 10px; font-size: 12px; background: #111b21; border: 1px solid #00a884; font-weight: 600; color: #25d366;">
                  <option value="app_launch">📲 1. Lanzamiento App (Descuento S/ 3 + Sorteo PS5)</option>
                  <option value="precios_gas">🔥 2. Precios del Balón (Depósito S/57 y Domicilio S/63)</option>
                  <option value="promo_delivery">🎁 3. Promo Rápida y Puntos</option>
                  <option value="custom">✏️ 4. Escribir Mensaje Libre</option>
                </select>
              </div>

              <div class="surgas-msg-card" style="padding: 10px;">
                <div class="surgas-msg-header" style="margin-bottom: 6px;">
                  <span style="font-size: 11px; font-weight: 600; color: #8696a0;">Texto a enviar</span>
                  <div style="width: 140px;">
                    <select id="surgas-select-template-type" class="surgas-select" style="padding:4px 8px; font-size:11px;">
                      <option value="text">Solo Mensaje</option>
                      <option value="image">Con Imagen / Afiche</option>
                      <option value="video">Con Video</option>
                      <option value="document">Con PDF</option>
                    </select>
                  </div>
                </div>

                <div id="surgas-media-container" class="surgas-media-row" style="display:none; padding:6px 10px; margin-bottom:8px;">
                  <div class="surgas-media-info">
                    <span id="surgas-media-icon">📎</span>
                    <span id="surgas-media-name" style="max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:11px;">Ningún archivo</span>
                  </div>
                  <div style="display:flex; gap:6px;">
                    <button type="button" class="surgas-tool-btn" id="surgas-btn-select-file" style="font-size:11px; padding:3px 8px;">Elegir</button>
                    <button type="button" class="surgas-tool-btn" style="color:#f87171; font-size:11px; padding:3px 8px;" id="surgas-btn-clear-file">✕</button>
                  </div>
                  <input type="file" id="surgas-file-input" style="display:none;">
                </div>

                <textarea id="surgas-textarea-msg" class="surgas-msg-textarea" style="min-height: 75px; font-size: 12px;" placeholder="Escribe el mensaje aquí..."></textarea>

                <div class="surgas-msg-toolbar" style="padding-top: 5px; margin-top: 5px;">
                  <div class="surgas-tool-buttons">
                    <button type="button" class="surgas-tool-btn" id="surgas-tool-var" style="font-size: 11px; padding: 3px 8px;">👤 + Nombre</button>
                    <button type="button" class="surgas-tool-btn" id="surgas-tool-bold"><strong>B</strong></button>
                    <button type="button" class="surgas-tool-btn" id="surgas-tool-emoji">😊</button>
                  </div>
                </div>
              </div>

              <!-- Vista previa simulada de cliente -->
              <div class="surgas-preview-card" style="margin-top: 8px; padding: 8px 10px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                  <span style="font-size:10px; font-weight:700; color:#8696a0; text-transform:uppercase;">👁️ Vista Previa (Lo que recibe el cliente):</span>
                  <button type="button" id="surgas-btn-refresh-preview" class="surgas-tool-btn" style="padding:1px 6px; font-size:10px;">🔄 Ver variante</button>
                </div>
                <div id="surgas-preview-text" class="surgas-preview-bubble" style="max-height: 95px; overflow-y: auto; font-size: 11.5px; padding: 8px 10px;"></div>
              </div>
            </div>
          </div>

          <!-- Panel de progreso durante el envío -->
          <div id="surgas-live-panel" class="surgas-live-banner" style="display:none; margin-top: 12px;">
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

        <!-- Footer -->
        <div class="surgas-modal-footer">
          <div class="surgas-footer-stats" id="surgas-footer-stats">
            Contactos: 0 | Pendientes: 0 | Enviados: 0
          </div>
          <div class="surgas-footer-buttons">
            <button type="button" class="surgas-btn-cancel" id="surgas-btn-cancel">Cerrar</button>
            <button type="button" class="surgas-btn-pause" id="surgas-btn-pause" style="display:none;">Pausar</button>
            <button type="button" class="surgas-btn-stop" id="surgas-btn-stop" style="display:none;">Detener</button>
            <button type="button" class="surgas-btn-submit" id="surgas-btn-start">▶ Iniciar Envíos (Lote)</button>
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

    // Selector de plantillas predefinidas
    const templateSelect = document.getElementById('surgas-select-template');
    if (templateSelect) {
      templateSelect.value = STATE.selectedTemplateId || 'app_launch';
      templateSelect.addEventListener('change', (e) => {
        const found = CAMPAIGN_TEMPLATES.find(t => t.id === e.target.value);
        if (found) {
          STATE.selectedTemplateId = found.id;
          STATE.messageText = found.text;
          const txt = document.getElementById('surgas-textarea-msg');
          if (txt) txt.value = found.text;
          persistCampaign();
          updateLivePreview();
        }
      });
    }

    // Toggle de opciones avanzadas
    const toggleAdvBtn = document.getElementById('surgas-toggle-advanced');
    const advPanel = document.getElementById('surgas-advanced-panel');
    const advArrow = document.getElementById('surgas-adv-arrow');
    if (toggleAdvBtn && advPanel) {
      toggleAdvBtn.addEventListener('click', () => {
        const isHidden = advPanel.style.display === 'none';
        advPanel.style.display = isHidden ? 'block' : 'none';
        advArrow.textContent = isHidden ? '▴' : '▾';
      });
    }

    const textarea = document.getElementById('surgas-textarea-msg');
    textarea.value = STATE.messageText;
    textarea.addEventListener('input', (e) => {
      STATE.messageText = e.target.value;
      persistCampaign();
      updateLivePreview();
    });

    document.getElementById('surgas-tool-var').addEventListener('click', () => {
      insertAtCursor(textarea, '{nombre}');
      updateLivePreview();
    });
    document.getElementById('surgas-tool-bold').addEventListener('click', () => wrapSelection(textarea, '*'));
    document.getElementById('surgas-tool-emoji').addEventListener('click', (e) => {
      toggleEmojiPicker(e.currentTarget, textarea, () => updateLivePreview());
    });
    document.getElementById('surgas-btn-refresh-preview').addEventListener('click', () => updateLivePreview());

    const inputMin = document.getElementById('surgas-delay-min');
    const inputMax = document.getElementById('surgas-delay-max');

    function updateRange() {
      let min = parseInt(inputMin.value) || 20;
      let max = parseInt(inputMax.value) || 40;
      if (min > max) max = min + 5;
      STATE.minDelay = min;
      STATE.maxDelay = max;
      persistCampaign();
    }

    inputMin.addEventListener('input', updateRange);
    inputMax.addEventListener('input', updateRange);

    document.getElementById('surgas-batch-limit').addEventListener('input', (e) => {
      STATE.batchLimit = parseInt(e.target.value) || 0;
      persistCampaign();
      updateCampaignUI();
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

    document.getElementById('surgas-btn-export-excel').addEventListener('click', exportCampaignReport);
    document.getElementById('surgas-btn-retry-failed').addEventListener('click', retryFailedContacts);

    // Pestañas de filtrado de contactos
    ['all', 'pending', 'sent', 'error'].forEach(filter => {
      const tab = document.getElementById(`surgas-tab-${filter}`);
      if (tab) {
        tab.addEventListener('click', () => {
          STATE.contactsFilter = filter;
          document.querySelectorAll('.surgas-filter-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          updateCampaignUI();
        });
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
    document.getElementById('surgas-btn-clear-file').addEventListener('click', async () => {
      STATE.attachment = null;
      await deleteMediaFromDB('campaign_attachment');
      persistCampaign();
      updateMediaVisibility();
      updateLivePreview();
    });

    document.getElementById('surgas-btn-start').addEventListener('click', startSendingCampaign);
    document.getElementById('surgas-btn-pause').addEventListener('click', pauseSendingCampaign);
    document.getElementById('surgas-btn-stop').addEventListener('click', stopSendingCampaign);

    updateMediaVisibility();
    updateLivePreview();
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

  // =========================================================================
  // SELECTOR FLOTANTE DE EMOJIS (NEGOCIO, REACCIONES Y SÍMBOLOS)
  // =========================================================================
  const EMOJI_CATEGORIES = [
    {
      id: 'negocio',
      icon: '🔥',
      name: 'Negocio y Surgas',
      emojis: ['🔥', '📍', '🏠', '📲', '🎁', '💳', '🤝', '👍', '👋', '🛵', '⛽', '🚚', '⭐', '✅', '❌', '⚠️', '💬', '📞', '💰', '🏷️', '📢']
    },
    {
      id: 'caritas',
      icon: '😊',
      name: 'Caras y Reacciones',
      emojis: ['😊', '😀', '😁', '😂', '😃', '😎', '😍', '🤩', '🤔', '🥳', '🙏', '🙌', '👏', '💯', '🙋', '👨‍💼', '👩‍💼', '🧑‍🔧', '💪', '🎉', '✨']
    },
    {
      id: 'simbolos',
      icon: '💡',
      name: 'Símbolos y Señales',
      emojis: ['✔️', '➡️', '⬅️', '⬆️', '⬇️', '🔹', '🔸', '🔴', '🟢', '💡', '📌', '🔔', '🚨', '⚡', '💥', '🏆', '⏰', '📅', '🎯', '🚀', '🔑']
    }
  ];

  let activeEmojiTargetTextarea = null;
  let activeEmojiChangeCallback = null;

  function initEmojiPicker() {
    let picker = document.getElementById('surgas-emoji-picker');
    if (!picker) {
      picker = document.createElement('div');
      picker.id = 'surgas-emoji-picker';
      picker.className = 'surgas-emoji-picker';
      picker.innerHTML = `
        <div class="surgas-emoji-header">
          <span id="surgas-emoji-title">🔥 Negocio y Surgas</span>
          <button type="button" id="surgas-emoji-close" style="background:transparent; border:none; color:#8696a0; cursor:pointer; font-size:14px; line-height:1; padding:2px 4px;">✕</button>
        </div>
        <div class="surgas-emoji-tabs">
          ${EMOJI_CATEGORIES.map((cat, idx) => `
            <button type="button" class="surgas-emoji-tab ${idx === 0 ? 'active' : ''}" data-cat="${cat.id}" title="${cat.name}">${cat.icon}</button>
          `).join('')}
        </div>
        <div class="surgas-emoji-grid" id="surgas-emoji-grid">
          <!-- Emojis inyectados dinámicamente -->
        </div>
      `;
      document.body.appendChild(picker);

      document.getElementById('surgas-emoji-close').addEventListener('click', closeEmojiPicker);

      picker.querySelectorAll('.surgas-emoji-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          picker.querySelectorAll('.surgas-emoji-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          renderEmojiCategory(tab.dataset.cat);
        });
      });

      // Cerrar al hacer clic afuera
      document.addEventListener('mousedown', (e) => {
        if (!picker.classList.contains('active')) return;
        if (!picker.contains(e.target) && !e.target.closest('#surgas-qr-emoji, #surgas-tool-emoji')) {
          closeEmojiPicker();
        }
      });
    }

    renderEmojiCategory('negocio');
  }

  function renderEmojiCategory(catId) {
    const grid = document.getElementById('surgas-emoji-grid');
    const title = document.getElementById('surgas-emoji-title');
    if (!grid) return;

    const cat = EMOJI_CATEGORIES.find(c => c.id === catId) || EMOJI_CATEGORIES[0];
    if (title) title.textContent = cat.name;

    grid.innerHTML = cat.emojis.map(emoji => `
      <button type="button" class="surgas-emoji-item" data-emoji="${emoji}">${emoji}</button>
    `).join('');

    grid.querySelectorAll('.surgas-emoji-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const emoji = btn.dataset.emoji;
        if (activeEmojiTargetTextarea) {
          insertAtCursor(activeEmojiTargetTextarea, emoji + ' ');
          if (typeof activeEmojiChangeCallback === 'function') {
            activeEmojiChangeCallback();
          }
        }
      });
    });
  }

  function toggleEmojiPicker(triggerBtn, targetTextarea, onInsert) {
    initEmojiPicker();
    const picker = document.getElementById('surgas-emoji-picker');
    if (!picker) return;

    if (picker.classList.contains('active') && activeEmojiTargetTextarea === targetTextarea) {
      closeEmojiPicker();
      return;
    }

    activeEmojiTargetTextarea = targetTextarea;
    activeEmojiChangeCallback = onInsert || null;

    // Posicionar flotante sobre o debajo del botón
    const rect = triggerBtn.getBoundingClientRect();
    const pickerHeight = 270;
    const pickerWidth = 290;

    let top = rect.bottom + 6;
    let left = rect.left;

    if (top + pickerHeight > window.innerHeight) {
      top = rect.top - pickerHeight - 6;
    }
    if (left + pickerWidth > window.innerWidth) {
      left = window.innerWidth - pickerWidth - 16;
    }

    picker.style.top = `${Math.max(10, top)}px`;
    picker.style.left = `${Math.max(10, left)}px`;
    picker.classList.add('active');
  }

  function closeEmojiPicker() {
    const picker = document.getElementById('surgas-emoji-picker');
    if (picker) picker.classList.remove('active');
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
    reader.onload = async (e) => {
      const dataUrl = e.target.result;
      STATE.attachment = {
        name: file.name,
        type: STATE.attachmentType,
        mimeType: file.type,
        dataUrl: dataUrl,
        sizeFormatted: (file.size / 1024 / 1024).toFixed(2) + ' MB'
      };
      await saveMediaToDB('campaign_attachment', dataUrl);
      persistCampaign();
      updateMediaVisibility();
      updateLivePreview();
    };
    reader.readAsDataURL(file);
  }

  function handleExcelUpload(file) {
    const excelFile = document.getElementById('surgas-excel-file');
    if (excelFile) excelFile.value = '';

    const isTextFile = file.name.endsWith('.csv') || file.name.endsWith('.txt') || file.name.endsWith('.md');

    // Función auxiliar para parsear filas de Excel / CSV
    function extractFromRows(rows) {
      const list = [];
      let totalRows = 0;
      let duplicatesCount = 0;
      const seenInFile = new Set();

      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        if (!row) continue;
        const cells = Array.isArray(row) ? row : Object.values(row);
        if (cells.length === 0 || cells.every(c => c == null || String(c).trim() === '')) continue;
        totalRows++;

        let foundPhone = null;
        let foundName = 'Cliente';

        for (let c = 0; c < cells.length; c++) {
          const val = String(cells[c] != null ? cells[c] : '').trim();
          if (!val) continue;
          
          const clean = cleanPhone(val);
          if (clean && !foundPhone) {
            foundPhone = clean;
          } else if (val.length >= 2 && isNaN(val) && foundName === 'Cliente') {
            // Evitar tomar cabeceras como nombres
            const lower = val.toLowerCase();
            if (!lower.includes('tel') && !lower.includes('cel') && !lower.includes('num') && !lower.includes('phone') && !lower.includes('nom') && !lower.includes('name')) {
              foundName = val;
            }
          }
        }

        if (foundPhone) {
          if (!seenInFile.has(foundPhone)) {
            seenInFile.add(foundPhone);
            list.push({ phone: foundPhone, cleanPhone: foundPhone, name: foundName });
          } else {
            duplicatesCount++;
          }
        }
      }
      return { list, totalRows, duplicatesCount };
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
          const res = extractFromRows(json);
          const list = res.list;

          if (list.length > 0) {
            if (STATE.contacts.length > 0) {
              const replace = confirm(
                `Se encontraron ${list.length} contactos en "${file.name}".\n\n` +
                `¿Deseas REEMPLAZAR la lista actual (${STATE.contacts.length} contactos)?\n\n` +
                `[Aceptar = Reemplazar lista con los ${list.length} del Excel]\n` +
                `[Cancelar = Agregar a los contactos existentes]`
              );
              if (replace) {
                STATE.contacts = [];
              }
            }
            addNumbers(list);
            let msg = `✅ Se importaron ${list.length} contactos de "${file.name}" correctamente.`;
            if (res.duplicatesCount > 0) {
              msg += `\n(${res.duplicatesCount} números repetidos omitidos en el archivo)`;
            }
            alert(msg);
          } else {
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
          const rawRows = lines.map(line => line.split(/[,\t;]/).map(p => p.trim()));
          const res = extractFromRows(rawRows);
          const list = res.list;

          if (list.length > 0) {
            if (STATE.contacts.length > 0) {
              const replace = confirm(
                `Se encontraron ${list.length} contactos en "${f.name}".\n\n` +
                `¿Deseas REEMPLAZAR la lista actual (${STATE.contacts.length} contactos)?\n\n` +
                `[Aceptar = Reemplazar lista]\n` +
                `[Cancelar = Agregar a existentes]`
              );
              if (replace) {
                STATE.contacts = [];
              }
            }
            addNumbers(list);
            let msg = `✅ Se importaron ${list.length} contactos de "${f.name}" correctamente.`;
            if (res.duplicatesCount > 0) {
              msg += `\n(${res.duplicatesCount} números repetidos omitidos en el archivo)`;
            }
            alert(msg);
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
    // Por defecto, resetear el límite a 0 (sin límite) para que en el primer flujo se envíen todos
    STATE.batchLimit = 0;
    const batchInput = document.getElementById('surgas-batch-limit');
    if (batchInput) batchInput.value = '0';
    persistCampaign();
    updateCampaignUI();
  }

  function updateLivePreview() {
    const previewEl = document.getElementById('surgas-preview-text');
    if (!previewEl) return;
    let sampleText = STATE.messageText || '';
    sampleText = processSpintax(sampleText);

    if (STATE.attachment && STATE.attachmentType !== 'text') {
      sampleText = `[📎 Adjunto: ${STATE.attachment.name}]\n\n` + sampleText;
    }

    previewEl.textContent = sampleText;
  }

  function exportCampaignReport() {
    if (!STATE.contacts || STATE.contacts.length === 0) {
      alert('No hay contactos en la campaña para exportar.');
      return;
    }
    if (!window.XLSX) {
      alert('Librería XLSX no disponible para exportar.');
      return;
    }
    const rows = STATE.contacts.map((c, idx) => ({
      'N°': idx + 1,
      'Nombre': c.name || 'Cliente',
      'Número': '+' + c.cleanPhone,
      'Estado': c.status === 'sent' ? 'ENVIADO' : (c.status === 'error' ? 'ERROR' : 'PENDIENTE'),
      'Detalle': c.errorMsg || (c.status === 'sent' ? 'Enviado correctamente' : 'En cola de envío')
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Reporte Campaña');

    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    const nameClean = (STATE.campaignName || 'Surgas').replace(/[^a-zA-Z0-9_-]/g, '_');
    XLSX.writeFile(wb, `Reporte_${nameClean}_${dateStr}.xlsx`);
  }

  function retryFailedContacts() {
    const failed = STATE.contacts.filter(c => c.status === 'error');
    if (failed.length === 0) {
      alert('No hay contactos con error para reintentar.');
      return;
    }
    if (confirm(`¿Marcar ${failed.length} contactos con error como "pendientes" para reintentar?`)) {
      failed.forEach(c => {
        c.status = 'pending';
        c.errorMsg = null;
      });
      persistCampaign();
      updateCampaignUI();
    }
  }

  function updateCampaignUI() {
    const total = STATE.contacts.length;
    const pending = STATE.contacts.filter(c => c.status === 'pending').length;
    const sent = STATE.contacts.filter(c => c.status === 'sent').length;
    const errors = STATE.contacts.filter(c => c.status === 'error').length;

    const summary = document.getElementById('surgas-contacts-summary');
    if (summary) {
      summary.textContent = `${total} contactos cargados (${pending} pendientes, ${sent} enviados, ${errors} con error)`;
    }

    const retryBtn = document.getElementById('surgas-btn-retry-failed');
    if (retryBtn) {
      retryBtn.style.display = errors > 0 ? 'inline-block' : 'none';
    }

    const stats = document.getElementById('surgas-footer-stats');
    if (stats) {
      stats.textContent = `Pendientes: ${pending} | Enviados: ${sent} | Errores: ${errors} | Total: ${total}`;
    }

    // Actualizar badges en pestañas de filtro
    const tabFilterBar = document.getElementById('surgas-filter-tabs-bar');
    if (tabFilterBar) {
      tabFilterBar.style.display = total > 0 ? 'flex' : 'none';
      const tabAll = document.getElementById('surgas-tab-all');
      const tabPending = document.getElementById('surgas-tab-pending');
      const tabSent = document.getElementById('surgas-tab-sent');
      const tabError = document.getElementById('surgas-tab-error');
      if (tabAll) tabAll.textContent = `Todos (${total})`;
      if (tabPending) tabPending.textContent = `Pendientes (${pending})`;
      if (tabSent) tabSent.textContent = `Enviados (${sent})`;
      if (tabError) tabError.textContent = `Errores (${errors})`;
    }

    // Filtrar lista según pestaña activa
    let filteredContacts = STATE.contacts;
    if (STATE.contactsFilter === 'pending') {
      filteredContacts = STATE.contacts.filter(c => c.status === 'pending');
    } else if (STATE.contactsFilter === 'sent') {
      filteredContacts = STATE.contacts.filter(c => c.status === 'sent');
    } else if (STATE.contactsFilter === 'error') {
      filteredContacts = STATE.contacts.filter(c => c.status === 'error');
    }

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
        const slice = filteredContacts.slice(0, displayLimit);

        if (slice.length === 0) {
          previewTbody.innerHTML = `
            <tr>
              <td colspan="5" style="padding: 12px; text-align: center; color: #8696a0;">
                No hay contactos en esta sección (${STATE.contactsFilter}).
              </td>
            </tr>
          `;
        } else {
          previewTbody.innerHTML = slice.map((c) => {
            const originalIdx = STATE.contacts.indexOf(c);
            let statusBadge = '<span class="surgas-badge-status status-pending">Pendiente</span>';
            if (c.status === 'sent') {
              statusBadge = '<span class="surgas-badge-status status-sent">✓ Enviado</span>';
            } else if (c.status === 'error') {
              const errTitle = escapeHtml(c.errorMsg || 'Fallo de envío');
              statusBadge = `<span class="surgas-badge-status status-error" title="${errTitle}">✕ Error</span>`;
            }

            return `
              <tr style="border-bottom: 1px solid #1f2c34;">
                <td style="padding: 5px 8px; color: #8696a0;">${originalIdx + 1}</td>
                <td style="padding: 5px 8px; color: #e9edef; font-weight: 500;">${escapeHtml(c.name || 'Cliente')}</td>
                <td style="padding: 5px 8px; color: #38bdf8; font-family: monospace;">+${c.cleanPhone}</td>
                <td style="padding: 5px 8px;">${statusBadge}</td>
                <td style="padding: 5px 8px; text-align: center;">
                  <button type="button" class="surgas-btn-remove-single" data-idx="${originalIdx}" style="background:transparent; border:none; color:#f87171; cursor:pointer; font-size:12px; padding:0; line-height:1;" title="Quitar contacto">✕</button>
                </td>
              </tr>
            `;
          }).join('');
        }

        if (filteredContacts.length > displayLimit) {
          previewTbody.innerHTML += `
            <tr>
              <td colspan="5" style="padding: 6px 8px; text-align: center; color: #8696a0; font-size: 10px;">
                ... y ${filteredContacts.length - displayLimit} contactos más en esta vista
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

    // Actualizar botón de inicio de envíos con cantidad de pendientes
    const btnStart = document.getElementById('surgas-btn-start');
    if (btnStart) {
      if (pending === 0) {
        btnStart.textContent = '▶ Sin pendientes';
        btnStart.disabled = true;
        btnStart.style.opacity = '0.5';
        btnStart.style.cursor = 'not-allowed';
      } else {
        btnStart.disabled = false;
        btnStart.style.opacity = '1';
        btnStart.style.cursor = 'pointer';
        const limit = (STATE.batchLimit && STATE.batchLimit > 0) ? Math.min(STATE.batchLimit, pending) : pending;
        if (STATE.batchLimit && STATE.batchLimit > 0 && STATE.batchLimit < pending) {
          btnStart.textContent = `▶ Iniciar Envíos (${limit} de ${pending})`;
        } else {
          btnStart.textContent = `▶ Iniciar Envíos (${pending})`;
        }
      }
    }

    updateLivePreview();
  }

  async function ensureWPPLoaded() {
    if (window.WPP && (window.WPP.isReady || window.WPP.chat)) return true;
    return new Promise((resolve) => {
      let script = document.getElementById('surgas-wppconnect-script');
      if (!script && typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getURL === 'function') {
        script = document.createElement('script');
        script.id = 'surgas-wppconnect-script';
        script.src = chrome.runtime.getURL('lib/wppconnect-wa.js');
        document.head.appendChild(script);
      }
      let checks = 0;
      const checkReady = setInterval(() => {
        checks++;
        if (window.WPP && (window.WPP.isReady || window.WPP.chat)) {
          clearInterval(checkReady);
          resolve(true);
        } else if (checks > 100) {
          clearInterval(checkReady);
          resolve(!!(window.WPP && window.WPP.chat));
        }
      }, 200);
    });
  }

  // Helper proactivo para resolver MediaPrep si el módulo interno de WhatsApp Web cambió de export
  async function ensureMediaPrepReady() {
    try {
      if (window.WPP && window.WPP.whatsapp && window.WPP.whatsapp.MediaPrep && typeof window.WPP.whatsapp.MediaPrep.prepRawMedia === 'function') {
        return true;
      }
      if (window.WPP && window.WPP.loader && typeof window.WPP.loader.search === 'function') {
        const found = window.WPP.loader.search((m, id) => {
          return Boolean(m && (m.prepRawMedia || (m.MediaPrep && m.MediaPrep.prepRawMedia) || (id && /MediaPrep|PrepRawMedia/i.test(String(id)))));
        });
        if (found) {
          const prep = found.prepRawMedia ? found : (found.MediaPrep || found);
          if (window.WPP.whatsapp) {
            window.WPP.whatsapp.MediaPrep = prep;
          }
          if (typeof window.WPP.loader.injectFallbackModule === 'function') {
            try { window.WPP.loader.injectFallbackModule('MediaPrep', prep); } catch (e) {}
          }
          return true;
        }
      }
      const req = window.require || (window.WPP && window.WPP.loader && window.WPP.loader.moduleRequire);
      if (req) {
        const debug = (typeof req === 'function') ? (function() { try { return req('__debug'); } catch(e) { return null; } })() : null;
        if (debug && debug.modulesMap) {
          for (const k of Object.keys(debug.modulesMap)) {
            if (/media|prep/i.test(k)) {
              try {
                const m = req(k);
                if (m && (m.prepRawMedia || (m.MediaPrep && m.MediaPrep.prepRawMedia))) {
                  const prep = m.prepRawMedia ? m : (m.MediaPrep || m);
                  if (window.WPP && window.WPP.whatsapp) {
                    window.WPP.whatsapp.MediaPrep = prep;
                  }
                  return true;
                }
              } catch (e) {}
            }
          }
        }
      }
    } catch (err) {
      console.warn('[SURGAS] ensureMediaPrepReady advertencia:', err);
    }
    return false;
  }

  async function startSendingCampaign() {
    if (STATE.campaignStatus === 'running') return;
    const pending = STATE.contacts.filter(c => c.status === 'pending');
    if (pending.length === 0) {
      alert('No hay contactos pendientes.');
      return;
    }

    // Si se configuró enviar con archivo (imagen/afiche, video, pdf), asegurar que dataUrl esté disponible
    if (STATE.attachmentType !== 'text') {
      if (!STATE.attachment || !STATE.attachment.dataUrl) {
        const restoredData = await getMediaFromDB('campaign_attachment');
        if (restoredData && STATE.attachment) {
          STATE.attachment.dataUrl = restoredData;
        } else {
          alert('⚠️ Has seleccionado enviar con Imagen/Afiche, pero el archivo no está cargado.\n\nPor favor haz clic en "Elegir" para volver a seleccionar la imagen antes de iniciar.');
          return;
        }
      }
    }

    const livePanel = document.getElementById('surgas-live-panel');
    const statusText = document.getElementById('surgas-live-status-text');
    livePanel.style.display = 'block';
    statusText.textContent = 'Conectando con motor de WhatsApp Web...';

    const isWppReady = await ensureWPPLoaded();
    if (!isWppReady || !window.WPP || !window.WPP.chat) {
      alert('No se pudo conectar con el motor de envíos masivos. Por favor recarga WhatsApp Web e intenta de nuevo.');
      livePanel.style.display = 'none';
      return;
    }

    const limit = (STATE.batchLimit && STATE.batchLimit > 0) ? STATE.batchLimit : pending.length;
    const batch = pending.slice(0, limit);
    STATE.campaignStatus = 'running';

    const btnStart = document.getElementById('surgas-btn-start');
    const btnPause = document.getElementById('surgas-btn-pause');
    const btnStop = document.getElementById('surgas-btn-stop');
    if (btnStart) btnStart.style.display = 'none';
    if (btnPause) btnPause.style.display = 'inline-block';
    if (btnStop) btnStop.style.display = 'inline-block';

    const timerText = document.getElementById('surgas-live-timer-text');
    const progressBar = document.getElementById('surgas-live-bar');
    const counterText = document.getElementById('surgas-live-counter');
    const targetText = document.getElementById('surgas-live-target');

    livePanel.style.display = 'block';
    if (targetText) {
      targetText.textContent = (batch.length === pending.length) 
        ? `Total a enviar: ${batch.length}` 
        : `Lote actual: ${batch.length} de ${pending.length}`;
    }

    let consecutiveErrors = 0;

    for (let i = 0; i < batch.length; i++) {
      if (STATE.campaignStatus !== 'running') break;

      const contact = batch[i];
      const jid = `${contact.cleanPhone}@c.us`;

      // Simular escritura ("composing...")
      if (document.getElementById('surgas-chk-typing').checked && window.WPP.chat.markIsComposing) {
        try { await window.WPP.chat.markIsComposing(jid, 2000); } catch (e) {}
      }

      // Enviar exactamente el texto definido por el usuario en el modal, sin alterar saludos ni nombres
      let textToSend = STATE.messageText || '';
      textToSend = processSpintax(textToSend);

      statusText.textContent = `Enviando a +${contact.cleanPhone} (${i + 1}/${batch.length})...`;

      try {
        if (STATE.attachmentType !== 'text' && STATE.attachment && STATE.attachment.dataUrl) {
          console.log('[SURGAS] Enviando archivo multimedia adjunto a', jid, STATE.attachment.name);
          await ensureMediaPrepReady();
          await window.WPP.chat.sendFileMessage(jid, STATE.attachment.dataUrl, {
            type: 'auto-detect',
            filename: STATE.attachment.name,
            caption: textToSend,
            mimetype: STATE.attachment.mimeType || undefined
          });
        } else {
          console.log('[SURGAS] Enviando mensaje de solo texto a', jid);
          await window.WPP.chat.sendTextMessage(jid, textToSend);
        }
        contact.status = 'sent';
        contact.errorMsg = null;
        consecutiveErrors = 0;
      } catch (err) {
        contact.status = 'error';
        contact.errorMsg = err && err.message ? err.message : 'Error desconocido al enviar';
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
    if (btnStart) btnStart.style.display = 'inline-block';
    if (btnPause) btnPause.style.display = 'none';
    if (btnStop) btnStop.style.display = 'none';
    if (timerText) timerText.textContent = '✓ Listo';
    if (statusText) {
      statusText.textContent = (batch.length === pending.length) ? '¡Campaña finalizada!' : `Tanda de ${batch.length} finalizada.`;
    }
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
      // Si la pantalla de previsualización o editor de multimedia está abierta, ocultar barra
      const mediaViewer = document.querySelector('[data-animate-media-viewer="true"]') ||
                          document.querySelector('div[aria-label="Editor de medios"]') ||
                          document.querySelector('div[aria-label="Media editor"]') ||
                          document.querySelector('header span[data-icon="x-viewer"]') ||
                          document.querySelector('span[data-icon="send-media"]') ||
                          document.querySelector('div[data-testid="media-editor"]');
      
      const bar = document.getElementById('surgas-quick-bar');
      if (mediaViewer) {
        if (bar) bar.style.display = 'none';
        return;
      }
      if (bar && bar.style.display === 'none') {
        bar.style.display = 'flex';
      }

      const mainPanel = document.querySelector('#main');
      if (!mainPanel) return;

      const chatFooter = mainPanel.querySelector('footer');
      if (!chatFooter) return;

      if (!bar) {
        const newBar = document.createElement('div');
        newBar.id = 'surgas-quick-bar';
        newBar.className = 'surgas-quick-bar';
        chatFooter.parentNode.insertBefore(newBar, chatFooter);
        renderQuickBarChips();
      } else if (bar.parentNode !== chatFooter.parentNode) {
        chatFooter.parentNode.insertBefore(bar, chatFooter);
      }
    }, 1000);
  }

  function renderQuickBarChips() {
    const bar = document.getElementById('surgas-quick-bar');
    if (!bar) return;

    // Botón Campaña Masiva + Botón gestor ☰ + chips fijados estilo WhatsApp
    const pinned = STATE.quickReplies.filter(qr => qr.pinned);

    let html = `
      <button class="surgas-quick-camp-btn" id="surgas-qr-open-camp" title="Abrir Envíos Masivos Surgas">
        🔥 Masivos
      </button>
      <button class="surgas-quick-mgr-btn" id="surgas-qr-open-mgr" title="Gestionar respuestas rápidas">
        ☰
      </button>
    `;

    pinned.forEach(qr => {
      let icon = '💬';
      if (qr.attachment) {
        if (qr.attachment.type === 'image') icon = '🖼️';
        else if (qr.attachment.type === 'video') icon = '🎬';
        else icon = '📄';
      }
      html += `
        <button class="surgas-quick-chip" data-qrid="${qr.id}" title="${qr.attachment ? `[${qr.attachment.name}] ` : ''}Haga clic para enviar o pegar en el chat">
          ${icon} ${escapeHtml(qr.name)} ↗
        </button>
      `;
    });

    bar.innerHTML = html;

    // Eventos
    const campBtn = bar.querySelector('#surgas-qr-open-camp');
    if (campBtn) campBtn.addEventListener('click', () => toggleCampaignModal(true));

    const mgrBtn = bar.querySelector('#surgas-qr-open-mgr');
    if (mgrBtn) mgrBtn.addEventListener('click', () => toggleQuickModal(true));

    bar.querySelectorAll('.surgas-quick-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const qrId = chip.dataset.qrid;
        const qr = STATE.quickReplies.find(q => q.id === qrId);
        if (qr) executeQuickReply(qr);
      });
    });
  }

  // Función auxiliar para insertar texto multilínea preservando saltos de línea (\n)
  async function insertMultilineText(input, text) {
    if (!input || !text) return;

    input.focus();

    // 1. Limpiar completamente cualquier contenido previo usando Selection / Range
    try {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(input);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand('delete', false, null);
    } catch (e) {
      document.execCommand('selectAll', false, null);
      document.execCommand('delete', false, null);
    }

    // 2. Método 1: Inserción nativa mediante ClipboardEvent 'paste' con DataTransfer
    try {
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      const pasteEv = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: dt
      });
      input.dispatchEvent(pasteEv);
    } catch (err) {
      console.warn('[SURGAS] Falló ClipboardEvent paste:', err);
    }

    // Pequeño retardo para dar tiempo a Lexical a procesar el pegado
    await new Promise(r => setTimeout(r, 60));

    // 3. Verificación: Comprobar si el texto real se insertó en el editor.
    // Usamos una muestra de las primeras letras para evitar falsos positivos con placeholders
    // como "Escribe un mensaje", "Escribe un pie de foto" o "Add a caption".
    const sample = text.trim().substring(0, 8);
    const currentDomText = (input.innerText || input.textContent || '');
    const isTextPresent = sample && currentDomText.includes(sample);

    if (!isTextPresent) {
      // Limpiar de nuevo por si quedó algo residual
      try {
        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null);
      } catch (e) {}

      // Inserción línea por línea usando Shift + Enter para saltos de línea nativos en WhatsApp
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.length > 0) {
          document.execCommand('insertText', false, line);
        }
        if (i < lines.length - 1) {
          const shiftEnterDown = new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            shiftKey: true,
            bubbles: true,
            cancelable: true
          });
          input.dispatchEvent(shiftEnterDown);

          const shiftEnterUp = new KeyboardEvent('keyup', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            shiftKey: true,
            bubbles: true,
            cancelable: true
          });
          input.dispatchEvent(shiftEnterUp);
        }
      }
    }

    // 4. Notificar a React / Lexical del cambio
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Función auxiliar para disparar el envío del mensaje en WhatsApp Web
  function triggerSend(input) {
    const footer = document.querySelector('#main footer') || document.querySelector('footer');
    const findBtn = () => (footer && (
      footer.querySelector('[data-icon="send"]') ||
      footer.querySelector('[data-icon="wds-ic-send-filled"]') ||
      footer.querySelector('[data-icon="send-light"]') ||
      footer.querySelector('button[aria-label="Enviar"]') ||
      footer.querySelector('button[aria-label="Send"]') ||
      footer.querySelector('button[aria-label*="Enviar"]') ||
      footer.querySelector('button[aria-label*="Send"]') ||
      footer.querySelector('button[data-tab="11"]')
    )) || document.querySelector('button[aria-label="Enviar"], [data-icon="send"]');

    // Comprobación inmediata para enviar al instante
    const immediateBtn = findBtn();
    if (immediateBtn) {
      const btn = immediateBtn.closest('button, [role="button"]') || immediateBtn;
      btn.click();
      return;
    }

    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      const sendBtn = findBtn();
      if (sendBtn) {
        clearInterval(interval);
        const btn = sendBtn.closest('button, [role="button"]') || sendBtn;
        btn.click();
        return;
      }

      // Si pasaron 250ms y no encontró el botón, enviar por tecla Enter
      if (attempts >= 6) {
        clearInterval(interval);
        if (input) {
          input.focus();
          input.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true
          }));
        }
      }
    }, 40);
  }

  // Funciones auxiliares para adjuntar archivos a chats de WhatsApp Web
  function dataURLtoFile(dataurl, filename) {
    if (!dataurl) return null;
    try {
      const arr = dataurl.split(',');
      const mimeMatch = arr[0].match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      return new File([u8arr], filename, { type: mime });
    } catch (e) {
      console.warn('[SURGAS] Error convirtiendo dataURL a File:', e);
      return null;
    }
  }

  // Envío nativo de multimedia a través de la interfaz de WhatsApp Web
  // No toca módulos internos de Webpack ni workers, garantizando que nunca se congele el envío.
  async function sendMediaViaNativeUI(file, caption = '', autoSend = false) {
    const mainPanel = document.querySelector('#main');
    const chatInput = (mainPanel && mainPanel.querySelector('footer div[contenteditable="true"]')) || 
                      document.querySelector('#main footer div[contenteditable="true"]') ||
                      document.querySelector('footer div[contenteditable="true"]');
    
    if (chatInput) {
      chatInput.focus();
    }
    const target = chatInput || (mainPanel && mainPanel.querySelector('footer')) || mainPanel || document.body;

    const dt = new DataTransfer();
    dt.items.add(file);

    const pasteEv = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: dt
    });

    // Disparar paste UNA SOLA VEZ para evitar duplicados
    target.dispatchEvent(pasteEv);

    // Monitorear apertura del visor nativo de medios y su input de pie de foto
    let attempts = 0;
    const maxAttempts = 50; // ~7.5 segundos

    return new Promise((resolve) => {
      const interval = setInterval(async () => {
        attempts++;

        // 1. Localizar el input de pie de foto:
        // En WhatsApp Web, es cualquier contenteditable que NO esté en la barra lateral (#side)
        // ni en el chat de fondo (#main footer)
        const allEditables = Array.from(document.querySelectorAll('div[contenteditable="true"]'));
        const captionInput = allEditables.find(el => !el.closest('#side') && !el.closest('#main footer'));

        // Localizar el botón de envío del visor de medios (fuera de #side y #main footer)
        const allSendIcons = Array.from(document.querySelectorAll('[data-icon="send"], [data-icon="send-media"], [data-icon="send-light"], [data-icon="wds-ic-send-filled"], button[aria-label="Enviar"], div[role="button"][aria-label="Enviar"]'));
        const mediaSendBtnIcon = allSendIcons.find(el => !el.closest('#side') && !el.closest('#main footer'));

        // Si aún no aparece el visor ni sus elementos, seguir esperando
        if (!captionInput && !mediaSendBtnIcon) {
          if (attempts >= maxAttempts) {
            clearInterval(interval);
            console.warn('[SURGAS] Tiempo de espera agotado buscando visor de medios.');
            resolve(false);
          }
          return;
        }

        clearInterval(interval);

        // 2. Si hay texto para el pie de foto, escribirlo en el input del visor
        if (caption && captionInput) {
          captionInput.focus();
          captionInput.click();

          // Colocar el cursor dentro del input
          try {
            const sel = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(captionInput);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
          } catch (e) {}

          await new Promise(r => setTimeout(r, 40));

          // Escribir el texto con saltos de línea
          await insertMultilineText(captionInput, caption);
          await new Promise(r => setTimeout(r, 50));
        }

        // 3. Enviar o dejar abierto
        if (autoSend) {
          setTimeout(() => {
            const sendBtn = mediaSendBtnIcon ? (mediaSendBtnIcon.closest('button, [role="button"]') || mediaSendBtnIcon) : null;
            if (sendBtn) {
              sendBtn.click();
            } else if (captionInput) {
              captionInput.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true
              }));
            }
            resolve(true);
          }, 120);
        } else {
          // Modo "Editar antes de enviar": dejar el visor abierto con el pie de foto ya colocado para revisión
          resolve(true);
        }
      }, 150);
    });
  }

  // Ejecutar respuesta rápida en el chat actual
  async function executeQuickReply(qr) {
    const mainPanel = document.querySelector('#main');
    const chatInput = (mainPanel && mainPanel.querySelector('footer div[contenteditable="true"]')) || 
                      document.querySelector('#main footer div[contenteditable="true"]') ||
                      document.querySelector('footer div[contenteditable="true"]');

    // Asegurarse de tener el dataUrl cargado desde IndexedDB si tiene adjunto
    if (qr.attachment && !qr.attachment.dataUrl) {
      qr.attachment.dataUrl = await getMediaFromDB(qr.id);
    }

    // =======================================================================
    // CASO CON ARCHIVO ADJUNTO (IMAGEN, VIDEO O PDF)
    // =======================================================================
    if (qr.attachment && qr.attachment.dataUrl) {
      try {
        const file = dataURLtoFile(qr.attachment.dataUrl, qr.attachment.name);
        if (file) {
          // autoSend = true cuando editBeforeSend está apagado
          const autoSend = !qr.editBeforeSend;
          await sendMediaViaNativeUI(file, qr.text || '', autoSend);
          return;
        }
      } catch (e) {
        console.warn('[SURGAS] Error enviando multimedia por UI nativa:', e);
      }

      // Si falló el archivo, al menos colocar el texto en el chat
      if (chatInput && qr.text) {
        await insertMultilineText(chatInput, qr.text);
        if (!qr.editBeforeSend) triggerSend(chatInput);
      }
      return;
    }

    // =======================================================================
    // CASO SIN ADJUNTO (SOLO TEXTO)
    // =======================================================================
    if (chatInput) {
      if (!qr.editBeforeSend) {
        // Enviar "de frente" sin parpadeo visual en la caja de texto
        const prevOpacity = chatInput.style.opacity;
        chatInput.style.opacity = '0';
        await insertMultilineText(chatInput, qr.text || '');
        triggerSend(chatInput);
        setTimeout(() => {
          chatInput.style.opacity = prevOpacity || '';
        }, 100);
      } else {
        // Modo "Editar antes de enviar": se escribe en la caja para que el usuario edite
        await insertMultilineText(chatInput, qr.text || '');
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

              <!-- Archivo adjunto (Imagen, Video o PDF) -->
              <div class="surgas-field">
                <label class="surgas-label">Archivo adjunto (Imagen, Video o PDF) <span style="color:#8696a0; font-weight:normal; font-size:11px;">(opcional)</span></label>
                <input type="file" id="surgas-qr-file-input" style="display:none;" accept="image/*,video/*,application/pdf">
                
                <div id="surgas-qr-media-box" class="surgas-qr-media-box">
                  <div id="surgas-qr-media-empty" class="surgas-qr-media-empty">
                    <button type="button" class="surgas-btn-media-add" id="surgas-qr-btn-add-file">
                      📎 Adjuntar Imagen, Video o PDF
                    </button>
                    <span class="surgas-media-hint">Soporta JPG, PNG, MP4, PDF</span>
                  </div>

                  <div id="surgas-qr-media-selected" class="surgas-qr-media-selected" style="display:none;">
                    <div class="surgas-qr-media-preview-thumb" id="surgas-qr-media-thumb">🖼️</div>
                    <div class="surgas-qr-media-meta">
                      <div class="surgas-qr-media-filename" id="surgas-qr-media-name">archivo.pdf</div>
                      <div class="surgas-qr-media-filesize" id="surgas-qr-media-size">1.2 MB</div>
                    </div>
                    <button type="button" class="surgas-qr-btn-remove-media" id="surgas-qr-btn-remove-file" title="Quitar archivo adjunto">✕</button>
                  </div>
                </div>
              </div>

              <div class="surgas-msg-card">
                <div class="surgas-msg-header">
                  <span class="surgas-msg-title">Mensaje / Pie de foto</span>
                </div>
                <textarea id="surgas-qr-edit-text" class="surgas-msg-textarea" placeholder="Escribe el texto de la respuesta rápida..."></textarea>
                
                <div class="surgas-msg-toolbar">
                  <div class="surgas-tool-buttons">
                    <button type="button" class="surgas-tool-btn" id="surgas-qr-bold"><strong>B</strong></button>
                    <button type="button" class="surgas-tool-btn" id="surgas-qr-italic"><em>I</em></button>
                    <button type="button" class="surgas-tool-btn" id="surgas-qr-strike"><s>S</s></button>
                    <button type="button" class="surgas-tool-btn" id="surgas-qr-emoji" title="Selector de emojis">😊</button>
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

  let currentQrAttachment = null;

  function updateQrMediaEditorUI() {
    const emptyBox = document.getElementById('surgas-qr-media-empty');
    const selectedBox = document.getElementById('surgas-qr-media-selected');
    const thumbEl = document.getElementById('surgas-qr-media-thumb');
    const nameEl = document.getElementById('surgas-qr-media-name');
    const sizeEl = document.getElementById('surgas-qr-media-size');

    if (!emptyBox || !selectedBox) return;

    if (!currentQrAttachment) {
      emptyBox.style.display = 'flex';
      selectedBox.style.display = 'none';
      return;
    }

    emptyBox.style.display = 'none';
    selectedBox.style.display = 'flex';

    nameEl.textContent = currentQrAttachment.name;
    const typeLabel = currentQrAttachment.type === 'image' ? '🖼️ Imagen' : currentQrAttachment.type === 'video' ? '🎬 Video' : '📄 Documento / PDF';
    sizeEl.textContent = `${typeLabel} • ${currentQrAttachment.sizeFormatted || ''}`;

    if (currentQrAttachment.type === 'image' && currentQrAttachment.dataUrl) {
      thumbEl.innerHTML = `<img src="${currentQrAttachment.dataUrl}" alt="Preview">`;
    } else if (currentQrAttachment.type === 'video') {
      thumbEl.innerHTML = '🎬';
    } else {
      thumbEl.innerHTML = '📄';
    }
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

    // Adjuntos multimedia (Imagen, Video, PDF)
    const qrFileInput = document.getElementById('surgas-qr-file-input');
    const qrAddFileBtn = document.getElementById('surgas-qr-btn-add-file');
    const qrRemoveFileBtn = document.getElementById('surgas-qr-btn-remove-file');

    if (qrAddFileBtn && qrFileInput) {
      qrAddFileBtn.addEventListener('click', () => qrFileInput.click());
    }

    if (qrFileInput) {
      qrFileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
          const file = e.target.files[0];
          const reader = new FileReader();
          reader.onload = (ev) => {
            let type = 'document';
            if (file.type.startsWith('image/')) type = 'image';
            else if (file.type.startsWith('video/')) type = 'video';
            else if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) type = 'document';

            currentQrAttachment = {
              name: file.name,
              type: type,
              mimeType: file.type || (type === 'image' ? 'image/jpeg' : type === 'video' ? 'video/mp4' : 'application/pdf'),
              dataUrl: ev.target.result,
              sizeFormatted: (file.size / 1024 / 1024).toFixed(2) + ' MB'
            };
            updateQrMediaEditorUI();
            qrFileInput.value = '';
          };
          reader.readAsDataURL(file);
        }
      });
    }

    if (qrRemoveFileBtn) {
      qrRemoveFileBtn.addEventListener('click', () => {
        currentQrAttachment = null;
        updateQrMediaEditorUI();
        if (qrFileInput) qrFileInput.value = '';
      });
    }

    // Nuevo
    document.getElementById('surgas-qr-btn-new').addEventListener('click', () => {
      const newQr = {
        id: 'qr_' + Date.now(),
        name: 'NUEVA RESPUESTA',
        text: 'Escribe tu mensaje aquí...',
        pinned: true,
        editBeforeSend: false,
        attachment: null
      };
      STATE.quickReplies.push(newQr);
      STATE.selectedQrId = newQr.id;
      currentQrAttachment = null;
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
        target.attachment = currentQrAttachment ? { ...currentQrAttachment } : null;
      }

      persistQuickReplies();
      renderQuickModalList();
      renderQuickBarChips();
      alert('Respuesta rápida guardada con éxito.');
    });

    // Eliminar
    document.getElementById('surgas-qr-btn-del').addEventListener('click', () => {
      if (!confirm('¿Eliminar esta respuesta rápida?')) return;
      const idToDelete = STATE.selectedQrId;
      STATE.quickReplies = STATE.quickReplies.filter(q => q.id !== idToDelete);
      deleteMediaFromDB(idToDelete);
      STATE.selectedQrId = STATE.quickReplies.length > 0 ? STATE.quickReplies[0].id : null;
      currentQrAttachment = null;
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
    document.getElementById('surgas-qr-emoji').addEventListener('click', (e) => {
      toggleEmojiPicker(e.currentTarget, qrTextarea);
    });
  }

  function renderQuickModalList(filter = '') {
    const listContainer = document.getElementById('surgas-qr-list-items');
    if (!listContainer) return;

    const filtered = STATE.quickReplies.filter(qr => qr.name.toLowerCase().includes(filter));

    if (filtered.length === 0) {
      listContainer.innerHTML = '<div style="color:#8696a0; font-size:12px; text-align:center; padding:16px;">No se encontraron respuestas.</div>';
      return;
    }

    listContainer.innerHTML = filtered.map(qr => {
      let mediaIcon = '';
      if (qr.attachment) {
        if (qr.attachment.type === 'image') mediaIcon = '🖼️ ';
        else if (qr.attachment.type === 'video') mediaIcon = '🎬 ';
        else mediaIcon = '📄 ';
      }
      return `
        <div class="surgas-qr-item ${qr.id === STATE.selectedQrId ? 'selected' : ''}" data-id="${qr.id}">
          <div class="surgas-qr-item-title">
            <span>:: ${escapeHtml(qr.name)}</span>
          </div>
          <div class="surgas-qr-item-badge">
            ${mediaIcon}${qr.pinned ? '📌 Fijado' : ''} 💬 1
          </div>
        </div>
      `;
    }).join('');

    listContainer.querySelectorAll('.surgas-qr-item').forEach(item => {
      item.addEventListener('click', () => {
        STATE.selectedQrId = item.dataset.id;
        renderQuickModalList(filter);
        loadSelectedQrIntoEditor();
      });
    });
  }

  async function loadSelectedQrIntoEditor() {
    const target = STATE.quickReplies.find(q => q.id === STATE.selectedQrId);
    if (!target) return;

    document.getElementById('surgas-qr-edit-name').value = target.name;
    document.getElementById('surgas-qr-edit-text').value = target.text;
    document.getElementById('surgas-qr-edit-pinned').checked = target.pinned;
    document.getElementById('surgas-qr-edit-editfirst').checked = target.editBeforeSend;

    if (target.attachment && !target.attachment.dataUrl) {
      target.attachment.dataUrl = await getMediaFromDB(target.id);
    }

    currentQrAttachment = target.attachment ? { ...target.attachment } : null;
    updateQrMediaEditorUI();
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
