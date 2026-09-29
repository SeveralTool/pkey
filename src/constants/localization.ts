/**
 * @fileoverview Central localization dictionary for PKEY UI copies.
 * Supports multiple languages including Spanish (ESP) and English (ING).
 *
 * STRUCTURE:
 * - Session & Authentication (app desc, login, session creation)
 * - Credentials/Cards (CRUD operations, card types, fields)
 * - Links (URL handling, validation, errors)
 * - Password Generator (configuration, validation)
 * - Notifications (alerts, toasts, status)
 * - Settings (general UI settings)
 * - Statistics (security metrics, session info)
 * - Security (auth prompts, sensitive actions)
 * - Cloud & Backup (sync, import/export)
 * - Errors & Validation (error messages)
 * - Tags (security tags)
 * - UI Actions (buttons, dialogs, actions)
 * - Misc (examples, placeholders, labels)
 */

import { resolveUiLanguage } from '@pkey/core';
import { getDeviceLocaleTag } from '../utils/devicePreferences';

export const LOCALE_DICT = {
  ESP: {
    // ===== SESSION & AUTHENTICATION =====
    app_desc: 'Gestor de contraseñas local-first',
    create_session_title: 'Crear nueva sesión',
    login_transparency_title: 'La bóveda se cifra en este dispositivo',
    login_transparency_body:
      'La contraseña maestra no se envía a una nube del editor. Internet se usa solo si abrís un enlace o activás opciones como iconos remotos o la comprobación de filtraciones.',
    create_session_btn: 'Crear sesión segura',
    login_legal_accept: 'He leído el texto de privacidad y los términos',
    login_legal_open_privacy: 'Abrir política de privacidad',
    login_legal_open_terms: 'Abrir términos de uso',
    login_legal_required: 'Para crear o restaurar una sesión, leé y aceptá los textos legales.',
    import_session_btn: 'Importar archivo de sesión',

    // ===== LOGIN & AUTHENTICATION =====
    login_required: 'Iniciar sesión en PKEY',
    login_placeholder: 'Introduce contraseña maestra',
    login_btn: 'Desbloquear PKEY',
    login_bio_btn: 'Usar acceso biométrico',
    login_bio_needs_password:
      'Tras una migración o cambio de bóveda, desbloqueá primero con tu contraseña maestra. Luego podrás volver a usar biometría.',
    auth_busy_unlock: 'Descifrando bóveda segura…',
    auth_busy_create: 'Generando claves de cifrado…',
    auth_busy_hint:
      'Derivando clave maestra (Argon2id). Solo en el primer acceso o contraseña nueva.',
    auth_busy_verify: 'Verificando clave maestra (Argon2id)…',
    auth_native_kdf_unavailable:
      'No se pudo usar el desbloqueo nativo. Probá de nuevo o usá biometría si está configurada.',
    session_check_error:
      'No se pudo comprobar si hay una sesión en este dispositivo. Reintentá; no crees una sesión nueva.',
    session_check_retry: 'Reintentar',
    session_check_pending: 'Comprobando si hay una sesión…',
    authenticate_empty_session: 'No hay ninguna sesión activa. Crea una para comenzar.',
    biometrics_reason: 'Verifica tu identidad para ingresar a PKEY',
    enter_pass: 'Contraseña maestra',
    master_password_help_a11y: 'Por qué se piden 12 caracteres o más',
    repeat_pass: 'Repite la contraseña',
    logout_btn: 'Cerrar sesión activa',

    // ===== DISCLAIMER & WARNINGS =====
    disclaimer_importance: 'Advertencia crítica',
    disclaimer_body:
      'Debes recordar perfectamente esta contraseña. El editor no la guarda y no puede recuperarla. Si la olvidas, no hay forma de descifrar las llaves guardadas en este dispositivo.',
    import_from_login_btn: 'Restaurar de archivo backup',
    import_warning_override:
      'Atención: Tienes una sesión iniciada o existen datos locales. Si restauras un respaldo, se sobrescribirán los datos actuales. Si el archivo no es válido, se podrían perder los datos de forma irreversible. ¿Continuar con la importación?',

    // ===== CREDENTIALS / CARDS =====
    cards_title: 'Llaves',
    empty_cards: 'No hay llaves creadas aún.',
    empty_cards_no_match: 'Ninguna llave coincide con la búsqueda o el filtro.',
    empty_cards_clear: 'Quitar búsqueda y filtro',
    add_first_card: 'Crear tu primera llave',
    search_placeholder: 'Buscar por título, usuario, link...',
    default_card_name: 'Nueva llave',

    // Card types & fields
    card_type_label: 'Tipo de llave',
    card_type_pass: 'Contraseña',
    card_type_phrase: 'Frase semilla',
    card_type_note: 'Nota segura',
    autofill_match_title: 'Autocompletado del sistema',
    autofill_match_desc_android:
      'Con la bóveda desbloqueada, PKEY ofrece logins al sistema. El SO no permite activarlo en silencio: tenés que elegir PKEY en el selector de autocompletado. La caché se sincroniza sola al desbloquear.',
    autofill_match_desc_ios:
      'En iOS hace falta un Credential Provider (extensión del sistema). Todavía no está incluido. Mientras tanto, la búsqueda por URL en la bóveda ordena llaves por dominio.',
    autofill_status_on: 'PKEY está activo como autocompletado',
    autofill_status_off: 'PKEY no es el servicio de autocompletado',
    autofill_status_unknown: 'Comprobando autocompletado…',
    autofill_enable_btn: 'Activar en ajustes del sistema',
    autofill_open_settings: 'Abrir ajustes de autocompletado',
    card_title_label: 'Título de llave (máx 512 caracteres)',
    card_user_label: 'Nombre de usuario o Email',
    card_pass_label: 'Contraseña segura',
    card_otp_secret_label: 'Secreto OTP (Base32)',
    card_otp_copy_btn: 'Copiar código OTP',
    card_otp_code_label: 'Código OTP',
    card_otp_show_code: 'Ver código OTP',
    card_otp_hide_code: 'Ocultar código OTP',
    card_otp_countdown: 'Renueva en {n}s',
    card_otp_paste_uri: 'Pega otpauth:// URI',
    card_otp_show: 'Mostrar',
    card_otp_hide: 'Ocultar',
    card_phrase_inputs: 'Palabras de la frase semilla',
    add_phrase_word: 'Añadir palabra semilla',
    seed_phrase_placeholder: 'Palabra semilla',
    card_link_label: 'Dirección enlace / URL sitio',
    card_notes_label: 'Notas descriptivas del acceso (máx 10 000)',
    card_save_btn: 'Guardar',
    card_saved_btn: 'Guardado',
    card_delete_btn: 'Borrar llave',
    a11y_add_card: 'Añadir llave',
    a11y_clear_search: 'Borrar búsqueda',
    a11y_clear_filter: 'Quitar filtro',
    a11y_sort_cards_title: 'Orden A a Z. Toca para ordenar por última modificación',
    a11y_sort_cards_updated: 'Orden por última modificación. Toca para ordenar A a Z',
    a11y_copy_secret: 'Copiar secreto de la llave',
    notif_dismiss_a11y: 'Cerrar notificación',

    // Card metadata
    created_label: 'Creada',
    modified_label: 'Modificada',

    // ===== LINKS & URLs =====
    go_to_link: 'Abrir enlace',
    no_link_placeholder: 'Sin enlace configurado',
    invalid_link_title: 'Enlace no válido',
    invalid_link_desc:
      'Introduce una URL válida (por ejemplo: https://ejemplo.com, ejemplo.com o un enlace de app Android).',
    blocked_link_title: 'Enlace bloqueado',
    blocked_link_desc: 'Este tipo de enlace no está permitido por seguridad.',
    link_unavailable_title: 'No se puede abrir',
    link_unavailable_desc: 'Ninguna app del dispositivo puede abrir este enlace.',
    link_open_failed_title: 'Error al abrir',
    link_open_failed_desc: 'No se pudo abrir el enlace. Comprueba la URL e inténtalo de nuevo.',
    android_link_ios_title: 'App solo en Android',
    android_link_ios_desc:
      'Este enlace pertenece a una aplicación de Android y no se puede abrir en este dispositivo.',
    android_link_open_web: 'Abrir sitio web',
    android_link_copy_package: 'Copiar nombre de la app',
    enable_favicon_lookup_title: 'Buscar favicons online',
    enable_favicon_lookup_desc:
      'Al activarlo, la aplicación pide iconos de sitio a servidores ajenos usando el dominio de la tarjeta. Eso puede revelar qué sitios guardaste. Desactivado por defecto.',
    open_links_in_app_title: 'Abrir links en navegador interno',
    open_links_in_app_desc:
      'Si está activo, los enlaces de las llaves se abren dentro de la app en lugar del navegador del sistema.',

    // ===== LEGAL (UI labels; document body is English — see legal_english_notice) =====
    legal_section_title: 'Legal',
    legal_section_desc:
      'Política de privacidad, términos de uso, licencias y avisos legales de la aplicación.',
    legal_privacy_title: 'Política de privacidad',
    legal_privacy_desc: 'Cómo trata la aplicación la información (bóveda en el dispositivo).',
    legal_terms_title: 'Términos de uso',
    legal_terms_desc: 'Acuerdo de licencia de usuario final (EULA).',
    legal_third_party_title: 'Avisos de terceros',
    legal_third_party_desc: 'Software de código abierto y atribuciones.',
    legal_official_app_title: 'App oficial y código fuente',
    legal_official_app_desc: 'Cómo reconocer la aplicación oficial y su código canónico.',
    legal_source_title: 'Licencia del código fuente',
    legal_source_desc:
      'Términos del repositorio publicado para auditoría (incluye créditos de copyright).',
    legal_english_notice:
      'El texto legal completo se muestra en inglés (versión oficial). Las etiquetas de esta sección siguen el idioma de la app. Una traducción jurídica al español puede publicarse cuando esté disponible.',
    legal_view_online: 'Ver en el sitio web',
    legal_applies_to_version: 'Texto de esta versión',
    legal_close: 'Cerrar',
    legal_app_version: 'Versión de la app',
    // ===== BUILD INTEGRITY (audit A7 + B3) =====
    integrity_section_title: 'Integridad de la build',
    integrity_section_desc:
      'Verifica que la app instalada coincide con el binario firmado publicado en el repositorio oficial. Compara el commit y la firma SHA-256 con los publicados en las releases de GitHub.',
    integrity_version_label: 'Versión',
    integrity_build_label: 'Build',
    integrity_commit_label: 'Commit',
    integrity_commit_unknown: 'desconocido',
    integrity_signature_label: 'Firma SHA-256',
    integrity_signature_unknown: 'no disponible en runtime',
    integrity_channel_label: 'Canal',
    integrity_channel_dev: 'desarrollo',
    integrity_channel_prod: 'producción',
    integrity_view_releases: 'Ver releases oficiales',
    integrity_dev_warning:
      'Estás usando una build de desarrollo. La integridad NO puede compararse contra las releases oficiales.',
    // ===== HIBP CHECK (audit B5) =====
    enable_hibp_check_title: 'Comprobar filtraciones (opt-in)',
    enable_hibp_check_desc:
      'Al activarlo, la aplicación puede consultar un servicio público de filtraciones enviando solo los primeros caracteres de un hash de la contraseña, no la contraseña. Las nuevas se consultan al guardar. Las ya guardadas solo si confirmás una comprobación masiva. Requiere Internet. Desactivado por defecto.',
    hibp_action_label: 'Comprobar en HIBP',
    hibp_result_clean: 'No aparece en brechas conocidas.',
    hibp_result_breached: 'Encontrada en {n} brecha(s) pública(s). Cámbiala.',
    hibp_result_error: 'Comprobación no disponible ({reason}).',
    hibp_disabled_hint:
      'La comprobación HIBP está desactivada. Actívala en Ajustes para usar esta acción.',
    hibp_badge_verified: 'Verificada por HIBP',
    hibp_badge_breached: 'Expuesta por HIBP · {n}',
    hibp_badge_error: 'HIBP no disponible',
    hibp_badge_pending: 'No verificada por HIBP',
    hibp_check_all_label: 'Comprobar todas',
    hibp_check_now_label: 'Comprobar ahora',
    hibp_empty_password_hint: 'Guarda primero una contraseña para poder comprobarla.',
    hibp_recheck_throttled:
      'Esta contraseña ya se comprobó recientemente. Volvé a comprobarla en {days} día(s).',
    hibp_none_to_check: 'Todas las contraseñas están verificadas.',
    hibp_enable_prompt_title: 'Activar comprobación de filtraciones',
    hibp_enable_prompt_desc:
      'Se envían solo los primeros caracteres de un hash, no la contraseña. Cancelar deja la opción apagada. Las ya guardadas se consultan solo si elegís comprobar ahora.',
    hibp_enable_only_label: 'Activar',
    hibp_enable_and_check_label: 'Activar y comprobar',
    hibp_check_progress: 'Comprobando contraseñas ({current}/{total})…',
    hibp_stop_label: 'Detener comprobación',
    hibp_bulk_done: 'HIBP: {checked} verificadas · {clean} seguras · {breached} expuestas',
    hibp_no_cards: 'No hay contraseñas para comprobar.',
    hibp_all_throttled:
      'Todas las contraseñas están en período de espera de HIBP. Reintentá más tarde.',
    hibp_throttled_or_checked:
      'Nada pendiente: ya están verificadas o en período de espera de HIBP.',
    hibp_stopped_none: 'Comprobación detenida. No se verificó ninguna contraseña.',
    hibp_stopped_partial: 'Comprobación detenida: {done} de {total} verificadas.',
    help_a11y: 'Ayuda',
    help_close: 'Cerrar',
    card_type_change_blocked_title: 'Cambio de tipo bloqueado',
    card_type_change_blocked_desc:
      'No puedes cambiar el tipo de una llave ya guardada. Creá una nueva si necesitás otro formato.',
    navigate_external: 'Navegar a sitio',
    external_redirect: 'Reenvío externo a',

    // ===== PASSWORD GENERATOR =====
    generator_config: 'Generador de contraseñas',
    generator_title: 'Generador de contraseñas',
    gen_symbols: 'Incluir símbolos (@#$...)',
    gen_numbers: 'Incluir números (0-9)',
    gen_uppercase: 'Letras mayúsculas (A-Z)',
    gen_lowercase: 'Letras minúsculas (a-z)',
    gen_length_label: 'Longitud de clave producida',
    gen_option_required_title: 'Opción requerida',
    gen_option_required_desc:
      'Debe permanecer al menos un tipo de carácter activo en el generador. Activa otro tipo antes de desactivar este.',
    gen_min_one_type_hint: 'Al menos un tipo de carácter debe permanecer activo.',
    gen_length_min_hint: 'Longitud mínima recomendada: 12 caracteres.',
    gen_not_configured_title: 'Generador no configurado',
    gen_not_configured_desc:
      'Activa al menos un tipo de carácter (símbolos, números, mayúsculas o minúsculas) en Ajustes → Generador de Contraseñas.',

    // ===== NOTIFICATIONS =====
    notif_screenshot_title: 'Captura detectada',
    notif_screenshot_body: 'Se detectó una captura de pantalla mientras PKEY estaba abierta.',
    notif_card_deleted_title: 'Llave eliminada',
    notif_card_deleted_toast: 'Llave "{title}" eliminada.',
    notif_copy_success_title: 'Copiado',
    notif_copy_success_message: 'Ahora {label} de "{title}" está en tu portapapeles',
    notif_copy_success_message_no_title: 'Ahora {label} está en tu portapapeles',
    notif_copy_cleared: 'Portapapeles limpiado',
    notif_copy_cleared_message: 'El dato copiado fue eliminado del portapapeles.',
    notif_copy_package_message: 'Ahora el nombre del paquete "{pkg}" está en tu portapapeles',
    notif_copy_empty_title: 'Nada que copiar',
    notif_copy_empty_message: 'No hay contenido para copiar en esta llave.',
    copy_label_password: 'la contraseña',
    copy_label_seed: 'la frase secreta',
    copy_label_note: 'la nota',
    copy_label_otp: 'el código OTP',
    card_swipe_a11y: 'Deslizar a la derecha para copiar, a la izquierda para eliminar',

    // ===== SECURITY TAB =====
    security_title: 'Seguridad',

    // ===== SETTINGS =====
    settings_title: 'Ajustes',
    control_access_security: 'Control de acceso y seguridad',

    // Auto-logout
    auto_logout: 'Autobloqueo de la app',
    auto_logout_desc:
      'Al salir de la app (inicio u otra app). En Android, si el acceso web está encendido, minimizar no bloquea la bóveda.',
    foreground_idle_lock: 'Bloqueo por inactividad',
    foreground_idle_lock_desc:
      'Si la app sigue abierta y no la tocás, se pide de nuevo la contraseña o la biometría.',
    strict_offline: 'Modo estrictamente offline',
    strict_offline_desc:
      'La bóveda no sale a la red (ni LAN ni Internet): apaga y oculta el acceso web, la comprobación de filtraciones y los iconos remotos.',
    rooted_banner:
      'Este dispositivo parece modificado (root/jailbreak). El desbloqueo rápido y el autocompletado quedan desactivados por defecto.',
    fast_unlock_title: 'Desbloqueo rápido',
    fast_unlock_desc:
      'Guarda la clave de sesión en el hardware (TEE/StrongBox/Keychain). Hay que confirmar con biometría; no usa el PIN del sistema.',
    device_secret_title: 'Secreto de dispositivo',
    device_secret_desc:
      'El archivo .pkey no abre en otro equipo sin el kit de recuperación. Guardá el código impreso.',
    device_secret_recovery_title: 'Kit de recuperación',
    device_secret_recovery_body:
      'Anotá este código. Sin él no podés abrir la bóveda en otro dispositivo. PKEY no puede recuperarlo.',
    device_secret_enable_failed:
      'No se pudo activar el secreto de dispositivo. Hace falta hardware Keystore/Keychain.',
    require_auth_device_secret: 'Identificate para cambiar el secreto de dispositivo',

    // Web PWA idle lock (independent of mobile auto-logout)
    web_auto_logout: 'Autobloqueo web',
    web_auto_logout_desc:
      'Bloquea la bóveda del navegador tras el tiempo de inactividad elegido, también si dejás la pestaña. No cambia el autobloqueo de la app.',

    web_theme_title: 'Tema web',
    web_theme_description: 'Independiente del tema de la app. Podés seguir el del navegador.',
    web_lang_title: 'Idioma web',
    web_lang_description: 'Independiente del idioma de la app. Podés seguir el del navegador.',

    // Appearance (unified section)
    appearance_section_title: 'Apariencia',
    app_label: 'App',
    web_label: 'Web',
    preferences_section_title: 'Preferencias',

    // Language
    lang_title: 'Idioma de la app',
    lang_description: 'Podés seguir el idioma del dispositivo.',

    // Auto-collapse
    auto_collapse_title: 'Autoplegado de llaves',
    auto_collapse_desc: 'Cierra las demás llaves al abrir una nueva.',

    // Group by link
    group_by_link_title: 'Agrupar llaves por sitio',
    group_by_link_desc: 'Junta en un grupo las llaves que comparten el mismo host (dominio o app).',
    group_by_link_accounts: '{n} cuentas',
    group_by_link_a11y: 'Grupo de sitio {label}, {n} cuentas',

    // Reveal password on copy
    reveal_copy_password_title: 'Revelar contraseña al copiar',
    reveal_copy_password_desc:
      'Al copiar, también muestra la contraseña en el campo. Si está apagado, solo copia.',

    // Screenshots
    screenshots_title: 'Capturas de pantalla',
    screenshots_description: 'Permite o bloquea capturas y grabación de pantalla.',

    // Theme
    theme_title: 'Tema visual de interfaz',
    theme_description: 'Podés seguir el tema del dispositivo.',

    // ===== STATISTICS & REPORTS =====
    stats_title: 'Estadísticas',
    password_report: 'Reporte de contraseñas',
    stats_security_hdr: 'Reporte de seguridad',
    stats_content_hdr: 'Tipos de contenido',
    stat_total_cards: 'Total de llaves',
    stat_duplicated_pass: 'Contraseñas repetidas',
    stat_weak_pass: 'Contraseñas débiles',
    stat_stale_pass: 'Deben actualizarse (>3 meses)',
    stat_hibp_checked: 'Verificadas HIBP',
    stat_hibp_breached: 'Expuestas HIBP',
    stat_unique_users: 'Usuarios únicos',
    session_details_hdr: 'Detalles de la sesión local',
    session_section_title: 'Sesión de esta bóveda',
    session_id: 'ID de sesión:',
    session_id_hint:
      'UUID de esta generación de bóveda. Comparalo con el de la PWA. La fecha es cuándo se creó la bóveda (si la acabás de crear, es hoy), no un reloj de login.',
    session_created: 'Fecha creación de sesión:',
    session_modified: 'Última modificación de la bóveda:',
    session_modified_hint: 'Incluye cambios de ajustes y ediciones de llaves.',
    session_age: 'Antigüedad de la sesión:',
    session_age_days: 'hace {n} días',
    session_age_today: 'hoy',
    last_update: 'Última actualización',
    stats_health_hdr: 'Salud de la bóveda',
    stats_health_score: 'Puntuación de salud',
    stats_loading: 'Calculando estadísticas…',
    stats_health_hint: 'Basada en duplicados, debilidad, antigüedad, 2FA y huecos de datos.',
    stats_coverage_hdr: 'Cobertura y datos',
    stats_activity_hdr: 'Actividad de llaves',
    stats_device_hdr: 'Postura del dispositivo',
    stats_unlock_hdr: 'Desbloqueos',
    stats_trend_hdr: 'Tendencia reciente',
    stats_web_sync_hdr: 'Acceso web',
    stats_filter_active: 'Filtro activo',
    stats_tap_hint: 'Toca una métrica para ver las llaves.',
    stats_trend_empty: 'Aún no hay suficientes muestras. Vuelve más tarde.',
    stats_trend_point: '{date} · salud {score} · débiles {weak} · antiguas {stale}',
    stat_type_password: 'Contraseñas',
    stat_type_secret: 'Frases secretas',
    stat_type_note: 'Notas',
    stat_reused_username: 'Usuarios reutilizados',

    stat_otp_with: 'Con 2FA/OTP',
    stat_otp_without: 'Sin 2FA/OTP',
    stat_otp_coverage: 'Cobertura 2FA',
    stat_empty_username: 'Sin usuario',
    stat_empty_password: 'Sin contraseña',
    stat_empty_link: 'Sin enlace',
    stat_unique_tags: 'Etiquetas únicas',
    stat_untagged: 'Sin etiquetas',
    stat_oldest_card: 'Más antigua (act.)',
    stat_newest_card: 'Más reciente (act.)',
    stat_tombstones: 'Eliminadas (sync)',
    stat_biometrics: 'Biometría disponible',
    stat_unlock_bundle: 'Desbloqueo biométrico guardado',
    stat_auto_logout: 'Autobloqueo de la app',
    stat_screenshots: 'Capturas de pantalla',
    stat_yes: 'Sí',
    stat_no: 'No',
    stat_allowed: 'Permitidas',
    stat_blocked: 'Bloqueadas',
    stat_current_unlock: 'Desbloqueo de esta sesión:',
    stat_last_unlock: 'Último desbloqueo:',
    stat_unlock_method_password: 'Contraseña',
    stat_unlock_method_biometrics: 'Biometría',
    stat_unlock_ok: 'OK',
    stat_unlock_fail: 'Fallido',
    stat_unlock_history_empty: 'Sin historial de desbloqueos aún.',
    stat_web_sync_off: 'Servidor web apagado',
    stat_web_sync_on: 'Servidor web activo',
    stat_web_clients: 'Clientes conectados',

    // ===== CLOUD & BACKUP =====
    import_restoration: 'Importar / Restaurar respaldos',
    import_manager_title: 'Importar desde otro gestor',
    import_manager_pick: 'Seleccionar archivo',
    import_manager_formats_hint:
      'Formatos: Bitwarden/NordPass/Enpass/Keeper JSON; Chrome/Firefox/LastPass/Dashlane/Keeper CSV; 1Password .1pif o ZIP; CSV/TXT genérico. No PDF, vídeo ni imágenes.',
    import_manager_map: 'Mapear columnas',
    import_manager_preview: 'Vista previa',
    import_manager_confirm: 'Importar',
    import_manager_count: '{n} llaves listas',
    import_manager_loading: 'Importando…',
    import_manager_icons_progress: 'Buscando iconos ({current}/{total})…',
    import_manager_saving: 'Guardando llaves en la bóveda…',
    import_manager_reading: 'Leyendo archivo…',
    import_manager_parsing: 'Analizando formato y columnas…',
    import_manager_building_preview: 'Generando vista previa…',
    import_manager_headers_found: '{n} columnas detectadas — toca cada fila para mapear.',
    card_tags_label: 'Etiquetas',
    card_tags_placeholder: 'Escribe una etiqueta...',
    card_tags_add_hint: 'Pulsa Enter para añadir',
    card_tags_remove: 'Eliminar etiqueta {name}',
    card_otp_scan: 'Escanear QR',
    otp_invalid_secret_title: 'Secreto OTP inválido',
    otp_invalid_secret_desc: 'Usa solo caracteres Base32 (A-Z, 2-7). Quita espacios y guiones.',
    otp_invalid_uri_title: 'URI OTP inválida',
    otp_invalid_uri_desc: 'El código QR no contiene una URI otpauth:// válida.',
    otp_window_prev: 'Período anterior',
    otp_window_next: 'Período siguiente',
    otp_window_label: 'Desfase {n}',
    otp_scan_success_title: 'OTP importado',
    otp_scan_success_message: 'Configuración OTP guardada en la llave.',
    otp_camera_denied_desc:
      'Permiso de cámara denegado. Actívalo en Ajustes del sistema para escanear QR.',
    import_action: 'Seleccionar archivo local PKEY',
    import_pass_prompt: 'Ingresa la contraseña maestra con la que se cifró el archivo backup:',
    import_success: '¡Base de datos importada con éxito! Iniciando sesión...',
    import_pkey_reading: 'Leyendo archivo de respaldo…',
    import_pkey_decrypting: 'Descifrando respaldo y restaurando bóveda…',
    decrypt_backup: 'Desencriptar respaldo',
    backup_export_title: 'Respaldo y exportación',
    backup_export_desc:
      'El .pkey es un respaldo cifrado de toda la bóveda (llaves y ajustes). CSV y JSON solo exportan las llaves en claro para otra app: PKEY no los guarda, solo los comparte.',
    local_backup_btn: 'Crear archivo local (.pkey)',
    export_csv_btn: 'Exportar CSV (sin cifrar)',
    export_json_btn: 'Exportar JSON (sin cifrar)',
    export_count_label: '{n} de {limit} respaldos .pkey',
    export_limit_hint:
      'Llegaste al máximo de respaldos .pkey. Borrá el más antiguo para poder crear otro.',
    export_limit_title: 'Máximo de archivos alcanzado',
    export_limit_reached:
      'No puedes crear más de 10 respaldos .pkey en este dispositivo. Se recomienda borrar los más viejos y revisar tus respaldos si no los necesitas.',
    export_limit_delete_oldest: 'Borrar el más antiguo y continuar',
    export_files_empty: 'Todavía no hay respaldos .pkey en este dispositivo.',
    export_files_loading: 'Cargando exports…',
    export_free_space: 'Espacio libre: {size}',
    export_low_space_hint:
      'Poco espacio libre. Liberá almacenamiento o borrá exports viejos antes de crear otro.',
    export_no_space:
      'No hay espacio suficiente en el dispositivo para exportar. Liberá almacenamiento o borrá exports viejos e intentá de nuevo.',
    export_share_unavailable: 'Compartir archivos no está disponible en este dispositivo.',
    export_list_failed: 'No se pudo listar los exports de este dispositivo.',
    export_share_a11y: 'Compartir archivo',
    export_delete_a11y: 'Borrar archivo',
    export_delete_title: 'Borrar export',
    export_delete_confirm: '¿Borrar «{name}» de este dispositivo? No se puede deshacer.',
    export_delete_failed: 'No se pudo borrar el archivo.',
    require_auth_delete_export: 'Identificate para borrar este export',
    require_auth_export_plaintext: 'Identificate para exportar la bóveda en texto claro',
    require_auth_export_backup: 'Identificate para crear un archivo de respaldo',
    export_saved_ok: 'Archivo guardado en Exports de PKEY',
    export_saved_message: 'Disponible en el listado de exportaciones.',
    export_shared_ok: 'Listo para compartir',
    export_shared_message:
      'CSV/JSON no se guarda en el teléfono. Si cancelaste el menú, no queda copia.',
    export_plaintext_title: 'Exportación sin cifrar',
    export_plaintext_warning:
      'El archivo incluirá contraseñas y secretos en texto claro. PKEY no lo guarda en el teléfono: solo abre el menú para compartirlo. Si cancelás, no queda copia. Cualquier destino que elijas (Drive, mail, Archivos) es tu responsabilidad.',
    export_needs_cards: 'No hay llaves para exportar. Desbloqueá la bóveda e intentá de nuevo.',
    export_failed: 'No se pudo completar la exportación.',
    export_no_database: 'No hay una bóveda activa para exportar.',

    // ===== DEVICE MIGRATION =====
    migration_section_title: 'Migración de dispositivo',
    migration_section_desc:
      'Transfiere toda tu bóveda directamente a un nuevo móvil en la misma red WiFi. Ideal al cambiar de teléfono.',
    migration_send_title: 'Migrar a nuevo dispositivo',
    migration_receive_title: 'Recibir migración',
    migration_send_btn: 'Migrar a nuevo dispositivo',
    migration_receive_btn: 'Recibir migración',
    migration_login_required: 'Debes iniciar sesión para migrar datos desde este dispositivo.',
    migration_dev_build_required:
      'La migración y el acceso web requieren un build de desarrollo o producción (no Expo Go). Ejecuta eas build --profile development.',
    migration_wifi_hint: 'Ambos dispositivos deben estar en la misma red WiFi.',
    migration_biometrics_hint:
      'La biometría no se transfiere; configúrala de nuevo en el dispositivo nuevo.',
    migration_waiting_connection: 'Esperando al dispositivo anterior…',
    migration_receiver_preparing: 'Preparando este dispositivo…',
    migration_receiver_qr_loading:
      'El código QR aparecerá aquí en un momento. En móviles más lentos puede tardar unos segundos.',
    migration_receiver_details_loading: 'Preparando código de emparejamiento y datos de red…',
    migration_receiver_ip_pending: 'Obteniendo dirección de red…',
    migration_qr_scan_hint: 'Escanea este QR desde el dispositivo que vas a dejar.',
    migration_receiver_overview:
      'Deja esta pantalla abierta. En el móvil con tus llaves, elige «Migrar a nuevo dispositivo» y conecta con QR, lista automática o IP manual.',
    migration_receiver_qr_title: 'Código QR',
    migration_devices_found: 'Dispositivos disponibles',
    migration_no_mdns: 'Dispositivos (escanea QR si no aparecen)',
    migration_scanning: 'Buscando dispositivos en la red…',
    migration_scan_qr_btn: 'Escanear QR del receptor',
    migration_send_methods_title: '¿Cómo conectar con el dispositivo nuevo?',
    migration_send_method_auto: 'Automático',
    migration_send_method_qr: 'Escanear QR',
    migration_send_method_manual: 'IP manual',
    migration_send_auto_desc:
      'Si ambos móviles están en la misma WiFi, el dispositivo nuevo puede aparecer abajo. Al elegirlo te pedirá el código de emparejamiento de su pantalla.',
    migration_mdns_pairing_required:
      'Introduce el código de emparejamiento que aparece en la pantalla del otro dispositivo.',
    migration_mdns_pairing_modal_title: 'Código de emparejamiento',
    migration_mdns_pairing_modal_desc:
      'Copia el código grande del móvil nuevo (hasta 24 caracteres). Los guiones son opcionales.',
    migration_mdns_pairing_confirm: 'Conectar',
    migration_mdns_use_qr: 'Escanear QR en su lugar',
    migration_mdns_use_manual: 'Introducir IP manualmente',
    migration_receiver_pairing_prominent: 'Código de emparejamiento',
    migration_receiver_pairing_help:
      'Es el secreto que el otro móvil necesita. Con o sin guiones vale. Sin este código no puede conectarse.',
    migration_tls_fingerprint_label: 'Certificado TLS',
    migration_fingerprint_both_hint:
      'Opcional: cuando conectéis, comprobad que estas huellas coinciden en ambos móviles.',
    migration_send_qr_desc:
      'Escanea el QR del móvil nuevo. Si falla la conexión, comprueba WiFi e IP; el código de emparejamiento va dentro del QR.',
    migration_qr_rescan: 'Seguir escaneando',
    migration_qr_torch: 'Linterna',
    migration_qr_open_scanner: 'Abrir escáner QR',
    migration_qr_modern_hint:
      'Abre el escáner del sistema (más estable). Enfoca el QR del móvil nuevo hasta que lo lea solo.',
    migration_qr_live_fallback: 'Usar cámara integrada',
    migration_send_manual_desc:
      'Necesitas dos datos del móvil nuevo: su IP y el código de emparejamiento (el código grande). El resto se obtiene solo.',
    migration_manual_ip_label: 'IP del dispositivo nuevo',
    migration_manual_ip_help: 'La misma IP que muestra el móvil nuevo en «Recibir migración».',
    migration_manual_ip_placeholder: 'Ej: 192.168.1.42',
    migration_manual_port_label: 'Puerto',
    migration_manual_port_help: 'Deja 7393 salvo que el otro móvil indique otro.',
    migration_manual_port_placeholder: '7393',
    migration_manual_session_label: 'ID de sesión',
    migration_manual_session_placeholder: 'Copia el código del dispositivo nuevo',
    migration_manual_connect_btn: 'Conectar',
    migration_manual_required: 'Indica la IP y el código de emparejamiento del móvil nuevo.',
    migration_manual_pairing_invalid:
      'Código no válido. Ingresá el código completo que aparece en el móvil nuevo (16 o 24 caracteres). Con o sin guiones.',
    migration_manual_ip_invalid: 'La dirección IP no tiene un formato válido (ej: 192.168.1.42).',
    migration_manual_port_invalid: 'El puerto debe estar entre 1 y 65535.',
    migration_receiver_qr_hint:
      'En el móvil anterior: «Migrar a nuevo dispositivo» → «Escanear QR» y apunta aquí. Incluye IP y código.',
    migration_receiver_manual_title: 'Datos para conexión manual',
    migration_receiver_manual_desc:
      'Si la cámara no funciona, anota estos valores y úsalos en el móvil anterior (pestaña «IP manual»).',
    migration_receiver_session_ref: 'Referencia de sesión',
    migration_receiver_session_help:
      'Solo para comprobar a simple vista que habláis de la misma sesión. No hace falta copiarla.',
    migration_receiver_manual_ip: 'IP de este dispositivo',
    migration_receiver_ip_help: 'Dirección en tu WiFi. El móvil anterior la usa para encontrarte.',
    migration_receiver_manual_port: 'Puerto',
    migration_receiver_port_help: 'Normalmente 7393.',
    migration_receiver_manual_session: 'ID de sesión',
    migration_receiver_manual_pairing: 'Código de emparejamiento',
    migration_manual_pairing_label: 'Código de emparejamiento',
    migration_manual_pairing_help:
      'El código grande del móvil nuevo. Con o sin guiones (XXXX-XXXX-XXXX-XXXX-XXXX-XXXX).',
    migration_manual_pairing_placeholder: 'XXXX-XXXX-XXXX-XXXX-XXXX-XXXX',
    migration_fingerprint_title: 'Huellas de verificación',
    migration_fingerprint_desc:
      'Confirma que estos valores coinciden en ambos dispositivos antes de transferir.',
    migration_fingerprint_sender: 'Huella en este dispositivo',
    migration_fingerprint_receiver: 'Huella en el receptor',
    migration_fingerprint_mismatch: 'Las huellas no coinciden. Cancela y vuelve a emparejar.',
    migration_receiver_start_failed:
      'No se pudo iniciar el servidor de migración. Comprueba que tienes un build nativo (no Expo Go) y que estás conectado a WiFi.',
    migration_receiver_port_in_use:
      'El puerto de migración está ocupado. Cierra la pantalla de migración, espera unos segundos e inténtalo de nuevo.',
    migration_send_failed: 'No se pudo completar la migración.',
    migration_err_receiver_unreachable:
      'No se puede contactar con el dispositivo receptor. Comprueba la IP, el puerto, que ambos estén en la misma WiFi y que en el receptor siga abierta la pantalla «Recibir migración».',
    migration_err_receiver_busy:
      'El receptor está ocupado con otra migración. Cierra la pantalla de migración en el dispositivo nuevo, vuelve a pulsar «Recibir migración» e inténtalo otra vez.',
    migration_err_session_mismatch:
      'El ID de sesión no coincide con el del dispositivo receptor. Cópialo de nuevo desde la pantalla «Recibir migración».',
    migration_err_protocol_mismatch:
      'Versión de protocolo incompatible entre dispositivos. Actualiza PKEY en ambos móviles.',
    migration_err_challenge_failed:
      'No se pudo verificar el emparejamiento. Revisa el código del móvil nuevo, o cierra «Recibir migración» allí, vuelve a abrirlo y usa el código nuevo.',
    migration_err_auth_failed:
      'Autenticación rechazada. Si el receptor ya tenía bóveda, usa la misma contraseña maestra; si no, revisa el código de emparejamiento.',
    migration_err_no_local_db: 'No se encontró la base de datos local en este dispositivo.',
    migration_err_meta_failed: 'No se pudieron enviar los metadatos de migración.',
    migration_err_chunk_failed: 'Falló el envío de un bloque de datos.',
    migration_err_receiver_error: 'Error en el dispositivo receptor durante la migración.',
    migration_err_timeout: 'Tiempo de espera agotado al contactar con el receptor.',
    migration_err_tcp_unavailable: 'La migración en red requiere un build nativo (no Expo Go).',
    migration_camera_permission: 'Permiso de cámara',
    migration_camera_unavailable: 'La cámara no está disponible. Usa la pestaña «IP manual».',
    migration_qr_invalid: 'Código QR de migración no válido.',
    migration_override_title: 'Sobrescribir datos locales',
    migration_override_body:
      'Recibir una migración reemplazará los datos actuales de este dispositivo. ¿Continuar?',
    migration_finalize_title: 'Finalizar migración',
    migration_finalize_body:
      'Esto avisará al dispositivo anterior para que borre sus datos de forma permanente. La bóveda recibida permanece bloqueada hasta que el aviso se complete con éxito.',
    migration_finalize_btn: 'Finalizar migración',
    migration_finalize_working: 'Finalizando…',
    migration_finalize_failed:
      'No se pudo avisar al dispositivo anterior. Comprobá que sigue en la misma WiFi con la pantalla de migración abierta. Podés reintentar o cancelar la migración (se descartarán los datos recibidos).',
    migration_finalize_no_target:
      'No hay datos de contacto del dispositivo anterior. Cancelá la migración para descartar los datos recibidos y volver al estado previo.',
    migration_staged_locked_hint:
      'Los datos recibidos aún no están disponibles para desbloquear. Solo se activan tras finalizar con éxito.',
    migration_incomplete_resume_hint:
      'Hay una migración incompleta. Finalizá el aviso al dispositivo anterior o cancelá para descartar los datos recibidos.',
    migration_abort_receive_title: 'Cancelar migración',
    migration_abort_receive_body:
      'Se descartarán los datos recibidos y este dispositivo volverá a su estado anterior (con o sin bóveda local). El dispositivo anterior no se borrará.',
    migration_abort_receive_confirm: 'Descartar y cancelar',
    migration_abort_receive_btn: 'Cancelar migración',
    migration_abort_receive_done_title: 'Migración cancelada',
    migration_abort_receive_done_body:
      'Los datos recibidos se descartaron. Este dispositivo quedó como antes. Podés iniciar sesión si ya tenías una bóveda.',
    migration_cancel_send_title: 'Cancelar en este dispositivo',
    migration_cancel_send_body:
      'Se cancela la espera del borrado. Tus datos locales se conservan intactos. Si el otro móvil recibió datos, allí deberá cancelar o finalizar por su lado.',
    migration_keep_local_btn: 'Conservar datos y salir',
    migration_cancel_send_btn: 'Cancelar migración',
    migration_cancel_send_done_title: 'Migración cancelada aquí',
    migration_cancel_send_done_body:
      'Tus datos siguen en este dispositivo, sin cambios. La bóveda no se borró.',
    migration_wipe_done_title: 'Migración completada',
    migration_wipe_done_body:
      'La migración se completó correctamente. La sesión y la bóveda de este dispositivo se vaciaron. Usa solo el dispositivo nuevo.',
    migration_receive_done_title: 'Datos recibidos',
    migration_receive_done_body:
      'La bóveda ya está activa en este dispositivo. Desbloqueá con tu contraseña maestra (la biometría se configura de nuevo al entrar).',
    migration_sender_waiting_finalize:
      'Esperando a que el dispositivo nuevo pulse «Finalizar migración». Cuando lo haga, esta pantalla se cerrará y la bóveda de este móvil se vaciará.',
    migration_sender_countdown: 'Podrás cancelar en {s}s si el otro dispositivo no finaliza…',
    migration_sender_wait_expired:
      'El otro dispositivo aún no finalizó. Podés cancelar y conservar tus datos locales.',
    migration_unlock_btn: 'Desbloquear bóveda',
    migration_cancel_title: 'Cancelar migración',
    migration_cancel_body: 'La transferencia está en curso. ¿Seguro que quieres cancelar?',
    migration_phase_idle: 'En espera',
    migration_phase_discovering: 'Buscando dispositivos en la red',
    migration_phase_connecting: 'Conectando',
    migration_phase_authenticating: 'Verificando identidad',
    migration_phase_preparing: 'Preparando bóveda',
    migration_phase_transferring: 'Transferiendo datos',
    migration_phase_applying_cards: 'Aplicando llaves',
    migration_phase_applying_settings: 'Aplicando ajustes',
    migration_phase_verifying: 'Verificando integridad',
    migration_phase_ready: 'Listo para finalizar',
    migration_phase_finalizing: 'Notificando dispositivo anterior',
    migration_phase_wipe_complete: 'Datos eliminados en origen',
    migration_phase_complete: 'Migración completada',
    migration_phase_error: 'Error',
    migration_auth_send:
      'Confirma tu identidad para enviar la bóveda a otro dispositivo. Si la migración se completa, este móvil borrará todos sus datos.',
    migration_auth_receive: 'Confirma tu identidad para recibir una migración en este dispositivo.',
    migration_auth_finalize:
      'Confirma tu identidad para finalizar la migración y borrar permanentemente los datos del dispositivo anterior.',
    web_access_title: 'Acceso web',
    web_access_toggle: 'Acceso web (navegador)',
    web_access_desc:
      'Sirve la bóveda web en el puerto {port} — accesible desde cualquier navegador en la misma WiFi.',
    web_access_transport_warning:
      'El acceso web usa HTTP en la red local (sin certificado). Usalo solo en Wi‑Fi de confianza.',
    web_access_tls_fingerprint_label: 'Huella del certificado TLS',
    web_access_tls_trust_hint: '',
    web_access_install_hint: '',
    web_access_reactivate_prompt: 'El acceso web estaba activo. ¿Reactivarlo ahora?',
    web_access_reactivate_btn: 'Reactivar',
    web_access_reactivate_dismiss: 'Descartar',
    web_access_autostart_label: 'Reactivar acceso web automáticamente al iniciar sesión',
    web_confirm_on_phone_label: 'Confirmar acciones del navegador en este teléfono',
    web_confirm_on_phone_desc:
      'Si está activo y el navegador está en línea, editar, borrar, revelar o copiar secretos pide biometría (o la contraseña maestra) en este teléfono, sin volver a tipearla en la PC. El login del navegador sigue pidiendo la contraseña maestra.',
    web_login_on_phone_label: 'Desbloquear el navegador con este teléfono',
    web_login_on_phone_desc:
      'Si está activo, el login de la PWA muestra un botón de huella. Compará el código de 6 dígitos en ambos pantallas y aprobá con biometría (o la contraseña maestra) en este teléfono. Siempre podés tipear la contraseña maestra en el navegador.',
    web_blocked_clients: 'CLIENTES BLOQUEADOS',
    web_blocked_ips: 'IPs BLOQUEADAS',
    web_server_active: 'Servidor web activo',
    web_fg_service_minimal_title: 'PKEY',
    web_fg_service_minimal_body: 'Acceso web LAN activo en segundo plano.',
    web_stat_authenticated: 'autenticados',
    web_stat_connecting: 'conectando',
    web_connected_browsers: 'NAVEGADORES CONECTADOS',
    web_client_rename: 'Renombrar navegador',
    web_client_alias_title: 'Nombre de este navegador',
    web_client_alias_message:
      'Un apodo solo en este teléfono, para reconocerlo en la lista. Vacío quita el nombre.',
    web_client_alias_placeholder: 'Ej. Notebook Oficina',
    web_client_unknown: 'Navegador',
    web_client_block: 'Bloquear navegador',
    web_notif_browser_title: 'Navegador sincronizado',
    web_notif_browser_body: 'Un navegador se sincronizó con PKEY ({client}).',
    web_notif_block_action: 'Bloquear',
    web_notif_deny_action: 'Rechazar',
    web_notif_pwa_confirm_title: 'Confirmar en este teléfono',
    web_notif_pwa_confirm_body: '{client} quiere {action}. Abrí PKEY para confirmar.',
    web_action_confirm_title: 'El navegador pide confirmación',
    web_action_confirm_message: '{client} quiere {action}: {key}',
    web_action_confirm_card_unknown: 'una llave',
    web_action_edit: 'editar secretos',
    web_action_delete: 'eliminar una llave',
    web_action_reveal: 'revelar un secreto',
    web_action_copy: 'copiar un secreto',
    web_action_copy_otp: 'copiar un código OTP',
    web_action_reveal_otp: 'revelar un código OTP',
    web_action_copy_username: 'copiar un usuario',
    web_action_confirm_approve: 'Confirmar',
    web_action_confirm_deny: 'Rechazar',
    web_action_confirm_send_failed:
      'No se pudo enviar la decisión al navegador. Mantené la app abierta.',
    web_notif_pwa_unlock_title: 'Desbloqueo del navegador',
    web_notif_pwa_unlock_body:
      '{client} quiere desbloquear la bóveda. Abrí PKEY y compará el código.',
    web_unlock_title: 'El navegador quiere desbloquear',
    web_unlock_message: '{client} pide desbloquear la bóveda web.',
    web_unlock_sas_hint: 'Compará este código de 6 dígitos con el del navegador antes de aprobar.',
    web_unlock_sas_a11y: 'Código {code}',
    web_unlock_approve: 'Aprobar',
    web_unlock_deny: 'Rechazar',
    web_unlock_send_failed: 'No se pudo enviar el desbloqueo al navegador. Mantené la app abierta.',
    web_pwa_request_expired_title: 'El pedido del navegador expiró',
    web_pwa_request_expired_body:
      'Volvé a intentarlo desde la computadora. La app se había bloqueado o reiniciado y ya no puede completar ese pedido.',
    web_notif_lan_changed_title: 'La computadora necesita la dirección de nuevo',
    web_notif_lan_changed_body: 'Abrí PKEY en el teléfono y pulse Copiar dirección otra vez.',
    web_notif_lan_changed_inapp:
      'Abrí PKEY y pulse Copiar dirección otra vez. En la computadora, pegue esa dirección en el navegador.',
    web_access_unavailable_title: 'Acceso web no disponible',
    web_access_unavailable_body:
      'El puerto {port} sigue en uso por una sesión anterior. Cierra PKEY por completo (quitar de recientes) y ábrela de nuevo, luego activa el acceso web.',
    web_access_start_failed:
      'No se pudo iniciar el acceso web (puerto ocupado o error de red). Queda desactivado; intentá de nuevo en un momento.',
    web_access_ip_label: 'Abre en el navegador (misma red):',
    web_access_mdns_label: 'URL estable (.local):',
    web_access_copy: 'Copiar URL',
    web_access_copied: 'Dirección copiada. En la computadora: pegar y Enter.',
    web_access_share: 'Enviar a la computadora',
    web_access_steps:
      '1. Abra el navegador en la computadora.\n2. Pulse el botón verde Copiar dirección.\n3. En la computadora, pegue y pulse Enter.',
    web_access_didnt_open: '¿No se abrió en la computadora?',
    web_access_fallback_hint:
      'El teléfono y la computadora deben estar en el mismo Wi‑Fi de la casa. Copie esta otra dirección:',
    web_access_other_phone: 'Estoy usando otro teléfono o tablet',
    web_access_keep_phone_open: 'Deje PKEY abierto en este teléfono mientras usa la computadora.',
    web_access_leave_tab: 'En la computadora, deje esa pestaña abierta.',
    web_access_unlock_phone_label: 'Desbloquear con este teléfono',
    web_access_unlock_phone_desc:
      'En la computadora verá un código de 6 números. Compárelo aquí y pulse Aprobar.',
    web_access_autoreconnect_hint:
      'Si cambia el Wi‑Fi o la IP, PKEY te avisa para que abras el QR nuevo. El navegador puede reencontrarte solo si la pestaña sigue abierta; usá el enlace estable para volver a entrar.',
    lan_kind_wifi: 'Wi‑Fi',
    lan_kind_ethernet: 'Ethernet',
    lan_kind_cellular: 'Datos móviles',
    lan_kind_none: 'Sin red',
    lan_kind_other: 'Otra red',
    lan_status_ip: 'IP {ip}',
    lan_status_no_ip: 'Sin dirección LAN',
    lan_not_lan_warning:
      'Este teléfono no está en el Wi‑Fi de la casa. Conéctelo al Wi‑Fi; la computadora debe estar en ese mismo Wi‑Fi.',
    lan_ssid_show: 'Mostrar nombre de la red',
    lan_ssid_rationale:
      'En Android reciente el sistema pide permiso de dispositivos Wi‑Fi cercanos para leer el nombre de la red. En versiones anteriores pide ubicación. No se usa GPS ni se envía nada fuera del teléfono.',
    lan_ssid_blocked:
      'El permiso para leer el nombre de la red está bloqueado. Podés habilitarlo en Ajustes del sistema.',
    lan_ssid_unavailable:
      'El sistema no entregó el nombre de la red. Confirmá que la ubicación del dispositivo esté activa e intentá de nuevo.',
    web_access_no_lan_url:
      'No hay dirección LAN. Conectate a una Wi‑Fi para ver la URL y el código QR.',
    vault_fork_title: 'Sesiones distintas',
    vault_fork_message:
      'Este navegador tiene una bóveda anterior ({pwa} llaves). Este teléfono tiene otra sesión ({phone} llaves). Elegí una: no se combinan. Si te quedás con el teléfono, sus llaves no se borran.',
    vault_fork_message_locked:
      'Este navegador tiene una bóveda anterior cifrada (otra sesión). No se pudo abrir con esta contraseña. Si usás este teléfono, se borra la copia del navegador. Para traer las llaves del navegador hace falta la contraseña vieja.',
    vault_fork_use_phone: 'Usar este teléfono',
    vault_fork_use_pwa: 'Usar el navegador',
    vault_fork_defer: 'Decidir más tarde',
    vault_fork_send_failed: 'No se pudo enviar la decisión al navegador. Mantené la app abierta.',

    // ===== SECURITY & AUTHENTICATION =====
    require_auth_clipboard: 'Identifícate para copiar datos sensibles al portapapeles',
    require_auth_otp_view: 'Identifícate para ver el código OTP',
    require_auth_delete: 'Identifícate para eliminar esta clave de forma permanente',
    require_auth_delete_all_bio: 'Verifica tu identidad para continuar con el borrado total',
    require_auth_delete_all_pass:
      'Introduce tu clave maestra para autorizar el borrado de todas las llaves',
    require_auth_reset_session_bio:
      'Verifica tu identidad para continuar con la creación de una nueva sesión',
    require_auth_reset_session_pass:
      'Introduce tu clave maestra para autorizar el borrado de la sesión actual',
    require_auth_never_logout: 'Identifícate para desactivar el bloqueo automático de sesión',
    require_auth_web_confirm_on_phone:
      'Identifícate para confirmar las acciones del navegador en este teléfono',
    require_auth_web_login_on_phone:
      'Identifícate para permitir el desbloqueo del navegador con este teléfono',
    require_auth_web_unlock: 'Confirmá el desbloqueo del navegador',
    require_auth_pwa_action: 'Confirmá esta acción del navegador',
    require_auth_block_web_client: 'Identifícate para bloquear este navegador',
    biometric_auth_failed: 'No se pudo verificar la biometría. Operación cancelada.',
    secure_file_alert: 'PKEY Archivo Seguro',
    secure_actions_alert: 'PKEY Acciones Seguras',

    // ===== ERRORS & VALIDATION =====
    wrong_key_p: 'La clave maestra provista no puede descifrar la sesión o el archivo.',
    login_locked_countdown: 'Demasiados intentos fallidos. Vuelve a intentarlo en {n}s.',
    p_length_warn: 'La contraseña maestra debe tener al menos 12 caracteres.',
    p_strength_warn:
      'La contraseña es demasiado débil. Usá 12+ caracteres únicos o una frase compuesta por varias palabras impredecibles.',
    p_match_warn: 'Las contraseñas maestras no coinciden.',
    error_importing_file: 'Hubo un error importando el archivo.',
    error_exporting_file: 'Hubo un error exportando el archivo.',
    alert_error_title: 'Error',
    alert_success_title: 'Éxito',
    alert_ok_title: 'Aceptar',
    alert_warning_title: 'Advertencia',
    filesystem_error_title: 'Error de almacenamiento',
    filesystem_error_body: 'No se pudo guardar la base de datos en el dispositivo.',
    filesystem_init_failed: 'No se pudo inicializar el almacenamiento.',
    crash_title: 'Algo salió mal',
    crash_body:
      'PKey encontró un error inesperado. La bóveda en disco no se modifica hasta que desbloquees. Reiniciá la app; si se repite, copiá los detalles técnicos.',
    crash_copy_details: 'Copiar detalles técnicos',
    crash_copied: 'Copiado al portapapeles',
    generate_replace_alert:
      '¿Deseas reemplazar la contraseña actual por una clave robusta generada automáticamente?',

    // ===== TAGS (Security indicators) =====
    tag_duplicated: 'Repetido',
    tag_secure: 'Seguro',
    tag_weak: 'Débil',
    tag_very_weak: 'Muy débil',
    tag_strong: 'Robusto',

    // ===== UI ACTIONS (Buttons, dialogs) =====
    confirm_delete: '¿Estás completamente seguro de eliminar esta llave de forma irreversible?',
    confirm_delete_title: 'Confirmar eliminación',
    confirm_delete_all_title: 'Eliminar todas las llaves',
    confirm_delete_all_message:
      'Se borrarán {n} llaves de forma permanente. Esta acción no se puede deshacer.',
    delete_all_section_title: 'Zona de peligro',
    delete_all_section_desc:
      'Acciones irreversibles sobre el almacén local. Los archivos de respaldo existentes no se modifican.',
    delete_all_warning:
      'Acción irreversible. Requiere biometría (si está disponible) y clave maestra.',
    delete_all_btn: 'Eliminar todas las llaves',
    delete_all_count: '{n} llaves en el almacén',
    delete_all_empty: 'No hay llaves que eliminar.',
    delete_all_success_title: 'Almacén vaciado',
    delete_all_success_toast: 'Se eliminaron {n} llaves.',
    delete_all_error: 'No se pudieron eliminar las llaves. Inténtalo de nuevo.',
    delete_all_busy: 'Eliminando llaves y guardando en el dispositivo…',
    confirm_reset_session_title: 'Crear nueva sesión',
    confirm_reset_session_message:
      'Se eliminará de forma permanente la sesión local actual (bóveda cifrada y desbloqueo biométrico). Después podrás crear una sesión nueva. Esta acción no se puede deshacer.',
    reset_session_warning:
      'Borra la sesión completa del dispositivo. Requiere biometría (si está disponible) y clave maestra.',
    reset_session_btn: 'Crear nueva sesión',
    reset_session_busy: 'Eliminando sesión local…',
    reset_session_error: 'No se pudo eliminar la sesión. Inténtalo de nuevo.',
    delete_button: 'Eliminar',
    cancel_button: 'Cancelar',
    continue_button: 'Continuar',
    proceed_button: 'Proceder',
    generate_and_replace: 'Generar y reemplazar',

    // ===== MISCELLANEOUS =====
    copiado_cop: 'Copia exitosa al portapapeles',
    sync_completed: 'Cambios sincronizados en el contenedor local.',
    status_online: 'Online encriptado',
    password_6chars: '(mín. 12 caracteres)',
    example_email: 'usuario@ejemplo.com',
    example_instagram: 'p.ej Instagram Personal',
    placeholder_credentials: 'Credenciales alternativas, token, PIN...',
    placeholder_password_mask: '******',
    placeholder_tags_example: 'trabajo, personal',
    placeholder_link_example: 'https://app.instagram.com',
    placeholder_secure_input: '••••••••',
    detecting_icon: 'Detectando icono…',
    icon_picker_title: 'Seleccionar icono predefinido',
    close_button: 'Cerrar',
    duration_seconds: '{n}s',
    duration_minutes: '{n}m',
    duration_hours: '{n}h',
    import_manager_done: '{n} llaves importadas',
    import_manager_preview_skipped: '({n} omitidas)',
    import_manager_summary: '{total} en archivo · {importing} a importar · {skipped} omitidas',
    import_manager_file_info: '{name} · {format} · {n} filas',
    import_manager_will_import: 'Se importarán',
    import_manager_skipped_title: 'Omitidas',
    import_manager_skip_vault: 'Ya en bóveda',
    import_manager_skip_vault_hint: 'Coincide con «{title}»',
    import_manager_skip_file: 'Duplicada en archivo',
    import_manager_skip_password_mismatch: 'Misma entrada, otra contraseña',
    import_manager_skip_password_mismatch_hint:
      'Coincide con «{title}» pero la contraseña del archivo es distinta (no se actualiza)',
    import_manager_headerless: 'La primera fila son datos (sin cabecera)',
    import_manager_warnings_title: 'Advertencias',
    import_manager_warn_empty_password: 'Sin contraseña',
    import_manager_warn_truncated_title: 'Título recortado',
    import_manager_warn_truncated_link: 'URL recortada',
    import_manager_warn_truncated_password: 'Contraseña recortada',
    import_manager_warn_truncated_username: 'Usuario recortado',
    import_manager_warn_truncated_notes: 'Notas recortadas',
    import_manager_warn_count: '{n} filas con {kind}',
    import_manager_list_more: '…y {n} más',
    import_manager_format_bitwarden: 'Bitwarden',
    import_manager_format_onepassword: '1Password',
    import_manager_format_dashlane: 'Dashlane',
    import_manager_format_csv: 'CSV',
    import_manager_format_unknown: 'Desconocido',
    import_manager_format_nordpass: 'NordPass',
    import_manager_format_keeper: 'Keeper',
    import_manager_format_chrome: 'Chrome',
    import_manager_format_firefox: 'Firefox',
    import_manager_format_lastpass: 'LastPass',
    import_manager_format_enpass: 'Enpass',
    import_manager_error_missing_binary:
      'No se pudo leer el archivo binario. Vuelve a seleccionar el export de 1Password (.1pif o .zip).',
    import_manager_error_unsupported_1p:
      'Formato 1Password no soportado (.1pux u archivo sin entradas .1pif). Exportá como .1pif o ZIP con .1pif.',
    import_manager_error_parse_failed:
      'No se pudo analizar el archivo. Comprobá que no esté corrupto y que el formato sea compatible.',
    import_manager_error_unsupported_format:
      'Formato no soportado. Usá un export .csv, .json, .txt, .1pif o ZIP con .1pif (Bitwarden, Chrome, 1Password, etc.). PDF, vídeo e imágenes no se pueden importar.',
    import_manager_edit_mapping: 'Mapear columnas manualmente',

    // ===== SETTINGS BUTTON OPTIONS (with { label, value } format for backend mapping) =====
    settings_buttons_options: {
      auto_logout: [
        { label: 'Inmediatamente', value: 'INSTANT' },
        { label: '1 minuto', value: '1M' },
        { label: 'Nunca', value: 'NEVER' },
      ],
      foreground_idle_lock: [
        { label: '1 min', value: '1M' },
        { label: '5 min', value: '5M' },
        { label: '15 min', value: '15M' },
        { label: 'Nunca', value: 'NEVER' },
      ],
      web_auto_logout: [
        { label: '5 min', value: '5M' },
        { label: '15 min', value: '15M' },
        { label: '1 hora', value: '1H' },
        { label: 'Nunca', value: 'NEVER' },
      ],
      lang_title: [
        { label: 'Auto', value: 'AUTO' },
        { label: 'Español', value: 'ESP' },
        { label: 'Inglés', value: 'ING' },
      ],
      auto_collapse_title: [
        { label: 'Activado', value: true },
        { label: 'Desactivado', value: false },
      ],
      screenshots: {
        screenshots_title: 'Capturas de pantalla',
        screenshots_description: 'Permite o bloquea capturas y grabación de pantalla.',
      },
      theme_title: [
        { label: 'Claro', value: 'LIGHT' },
        { label: 'Oscuro', value: 'DARK' },
        { label: 'Sistema', value: 'AUTO' },
      ],
    },
  },
  ING: {
    // ===== SESSION & AUTHENTICATION =====
    app_desc: 'Local-first password manager',
    create_session_title: 'Create new session',
    login_transparency_title: 'The vault is encrypted on this device',
    login_transparency_body:
      'The master password is not sent to a publisher cloud. Internet is used only if you open a link or turn on options such as remote icons or the breach check.',
    create_session_btn: 'Create secure session',
    login_legal_accept: 'I have read the privacy text and the terms',
    login_legal_open_privacy: 'Open privacy policy',
    login_legal_open_terms: 'Open terms of use',
    login_legal_required: 'To create or restore a session, read and accept the legal texts.',
    import_session_btn: 'Import session file',

    // ===== LOGIN & AUTHENTICATION =====
    login_required: 'Log in to PKEY',
    login_placeholder: 'Enter master password',
    login_btn: 'Unlock PKEY',
    login_bio_btn: 'Use biometrics login',
    login_bio_needs_password:
      'After a migration or vault change, unlock first with your master password. You can use biometrics again after that.',
    auth_busy_unlock: 'Decrypting secure vault…',
    auth_busy_create: 'Generating encryption keys…',
    auth_busy_hint: 'Deriving master key (Argon2id). Only on first unlock or new password.',
    auth_busy_verify: 'Verifying master password (Argon2id)…',
    auth_native_kdf_unavailable:
      'Native unlock is unavailable. Try again, or use biometrics if it is set up.',
    session_check_error:
      'Could not check whether a session exists on this device. Retry; do not create a new session.',
    session_check_retry: 'Retry',
    session_check_pending: 'Checking for an existing session…',
    authenticate_empty_session: 'No active session found. Create one to begin.',
    biometrics_reason: 'Authenticate your identity to open PKEY',
    enter_pass: 'Master password',
    master_password_help_a11y: 'Why 12 characters or more are required',
    repeat_pass: 'Repeat password',
    logout_btn: 'Lock PKEY (Exit)',

    // ===== DISCLAIMER & WARNINGS =====
    disclaimer_importance: 'Critical warning',
    disclaimer_body:
      'You must remember this password. The publisher does not store it and cannot recover it. If it is forgotten, the keys saved on this device cannot be decrypted.',
    import_from_login_btn: 'Restore from backup file',
    import_warning_override:
      'Warning: You have an active session or existing local data. Restoring a backup will overwrite current data. If the file is corrupted or could not be loaded, data might be lost irreversibly. Proceed with import?',

    // ===== CREDENTIALS / CARDS =====
    cards_title: 'Keys',
    empty_cards: 'No keys stored yet.',
    empty_cards_no_match: 'No keys match the current search or filter.',
    empty_cards_clear: 'Clear search and filter',
    add_first_card: 'Add your first key',
    search_placeholder: 'Search by title, username, link...',
    default_card_name: 'New key',

    // Card types & fields
    card_type_label: 'Key type',
    card_type_pass: 'Password',
    card_type_phrase: 'Seed phrase',
    card_type_note: 'Secure note',
    autofill_match_title: 'System autofill',
    autofill_match_desc_android:
      'While the vault is unlocked, PKEY offers logins to the system. The OS does not allow silent activation — you must pick PKEY in the autofill picker. The cache syncs automatically on unlock.',
    autofill_match_desc_ios:
      'iOS needs a Credential Provider extension, which is not shipped yet. Meanwhile, URL search in the vault ranks keys by domain.',
    autofill_status_on: 'PKEY is the active autofill service',
    autofill_status_off: 'PKEY is not the autofill service',
    autofill_status_unknown: 'Checking autofill…',
    autofill_enable_btn: 'Enable in system settings',
    autofill_open_settings: 'Open autofill settings',
    card_title_label: 'Key title (max 512 characters)',
    card_user_label: 'Username or email',
    card_pass_label: 'Secure password key',
    card_otp_secret_label: 'OTP secret (Base32)',
    card_otp_copy_btn: 'Copy OTP code',
    card_otp_code_label: 'OTP code',
    card_otp_show_code: 'Show OTP code',
    card_otp_hide_code: 'Hide OTP code',
    card_otp_countdown: 'Refreshes in {n}s',
    card_otp_paste_uri: 'Paste otpauth:// URI',
    card_otp_show: 'Show',
    card_otp_hide: 'Hide',
    card_phrase_inputs: 'Seed phrase words',
    add_phrase_word: 'Add seed word',
    seed_phrase_placeholder: 'Seed word',
    card_link_label: 'Site destination URL / Link',
    card_notes_label: 'Description / Notes box (max 10,000)',
    card_save_btn: 'Save',
    card_saved_btn: 'Saved',
    card_delete_btn: 'Wipe key',
    a11y_add_card: 'Add key',
    a11y_clear_search: 'Clear search',
    a11y_clear_filter: 'Clear filter',
    a11y_sort_cards_title: 'Sorted A to Z. Tap to sort by last updated',
    a11y_sort_cards_updated: 'Sorted by last updated. Tap to sort A to Z',
    a11y_copy_secret: 'Copy key secret',
    notif_dismiss_a11y: 'Close notification',

    // Card metadata
    created_label: 'Created',
    modified_label: 'Modified',

    // ===== LINKS & URLs =====
    go_to_link: 'Open link',
    no_link_placeholder: 'No link configured',
    invalid_link_title: 'Invalid link',
    invalid_link_desc:
      'Enter a valid URL (e.g. https://example.com, example.com, or an Android app link).',
    blocked_link_title: 'Link blocked',
    blocked_link_desc: 'This link type is not allowed for security reasons.',
    link_unavailable_title: 'Cannot open link',
    link_unavailable_desc: 'No app on this device can handle this link.',
    link_open_failed_title: 'Failed to open',
    link_open_failed_desc: 'The link could not be opened. Check the URL and try again.',
    android_link_ios_title: 'Android-only app',
    android_link_ios_desc:
      'This link belongs to an Android app and cannot be opened on this device.',
    android_link_open_web: 'Open website',
    android_link_copy_package: 'Copy app name',
    enable_favicon_lookup_title: 'Fetch favicons online',
    enable_favicon_lookup_desc:
      'When on, the application requests site icons from external servers using the domain on the card. That can reveal which sites you saved. Off by default.',
    open_links_in_app_title: 'Open links in in-app browser',
    open_links_in_app_desc:
      'Off = native app or system browser. On = embedded browser inside PKEY.',

    // ===== LEGAL (UI labels; canonical document body is English) =====
    legal_section_title: 'Legal',
    legal_section_desc:
      'Privacy Policy, Terms of Service, licenses, and other legal notices for the app.',
    legal_privacy_title: 'Privacy Policy',
    legal_privacy_desc: 'How the application handles information (vault on the device).',
    legal_terms_title: 'Terms of use',
    legal_terms_desc: 'End User License Agreement (EULA).',
    legal_third_party_title: 'Third-Party Notices',
    legal_third_party_desc: 'Open-source software and attributions.',
    legal_official_app_title: 'Official app & source',
    legal_official_app_desc: 'How to recognize the official application and its canonical source.',
    legal_source_title: 'Source Code License',
    legal_source_desc:
      'Terms for the audit-published repository (includes required copyright credits).',
    legal_english_notice: 'Legal documents are provided in English as the authoritative version.',
    legal_view_online: 'View on website',
    legal_applies_to_version: 'Text for this version',
    legal_close: 'Close',
    legal_app_version: 'App version',
    // ===== BUILD INTEGRITY (audit A7 + B3) =====
    integrity_section_title: 'Build integrity',
    integrity_section_desc:
      'Verify that the installed app matches the signed binary published in the official repository. Compare the commit and SHA-256 signature against the ones published on the GitHub releases page.',
    integrity_version_label: 'Version',
    integrity_build_label: 'Build',
    integrity_commit_label: 'Commit',
    integrity_commit_unknown: 'unknown',
    integrity_signature_label: 'SHA-256 signature',
    integrity_signature_unknown: 'not available at runtime',
    integrity_channel_label: 'Channel',
    integrity_channel_dev: 'development',
    integrity_channel_prod: 'production',
    integrity_view_releases: 'View official releases',
    integrity_dev_warning:
      'You are running a development build. Integrity CANNOT be verified against official releases.',
    // ===== HIBP CHECK (audit B5) =====
    enable_hibp_check_title: 'Check for breaches (opt-in)',
    enable_hibp_check_desc:
      'When on, the application may query a public breach service by sending only the first characters of a password hash, not the password. New passwords are checked when saved. Already saved passwords are sent only if you confirm a bulk check. Requires Internet. Off by default.',
    hibp_action_label: 'Check against HIBP',
    hibp_result_clean: 'Not found in any known breach.',
    hibp_result_breached: 'Found in {n} public breach(es). Rotate it.',
    hibp_result_error: 'Check unavailable ({reason}).',
    hibp_disabled_hint: 'HIBP check is disabled. Enable it in Settings to use this action.',
    hibp_badge_verified: 'Verified by HIBP',
    hibp_badge_breached: 'Exposed by HIBP · {n}',
    hibp_badge_error: 'HIBP unavailable',
    hibp_badge_pending: 'Not verified by HIBP',
    hibp_check_all_label: 'Check all',
    hibp_check_now_label: 'Check now',
    hibp_empty_password_hint: 'Save a password first to check it.',
    hibp_recheck_throttled:
      'This password was already checked recently. Check it again in {days} day(s).',
    hibp_none_to_check: 'All passwords are already verified.',
    hibp_enable_prompt_title: 'Turn on the breach check',
    hibp_enable_prompt_desc:
      'Only the first characters of a hash are sent, not the password. Cancel leaves the option off. Already saved passwords are checked only if you choose to check now.',
    hibp_enable_only_label: 'Turn on',
    hibp_enable_and_check_label: 'Turn on and check',
    hibp_check_progress: 'Checking passwords ({current}/{total})…',
    hibp_stop_label: 'Stop checking',
    hibp_bulk_done: 'HIBP: {checked} checked · {clean} safe · {breached} breached',
    hibp_no_cards: 'No passwords to check.',
    hibp_all_throttled: 'All passwords are in HIBP cooldown. Try again later.',
    hibp_throttled_or_checked:
      'Nothing pending: all passwords are already checked or in HIBP cooldown.',
    hibp_stopped_none: 'Check stopped. No password was checked.',
    hibp_stopped_partial: 'Check stopped: {done} of {total} checked.',
    help_a11y: 'Help',
    help_close: 'Close',

    card_type_change_blocked_title: 'Type change blocked',
    card_type_change_blocked_desc:
      'You cannot change the type of a key that has already been saved. Create a new key if you need a different format.',
    navigate_external: 'Navigate to site',
    external_redirect: 'External redirect to',

    // ===== PASSWORD GENERATOR =====
    generator_config: 'Password generator settings',
    generator_title: 'Password generator',
    gen_symbols: 'Include special symbols (@#$...)',
    gen_numbers: 'Include numbers (0-9)',
    gen_uppercase: 'Uppercase letters (A-Z)',
    gen_lowercase: 'Lowercase letters (a-z)',
    gen_length_label: 'Generated password characters',
    gen_option_required_title: 'Required option',
    gen_option_required_desc:
      'At least one character type must remain enabled in the generator. Enable another type before disabling this one.',
    gen_min_one_type_hint: 'At least one character type must remain enabled.',
    gen_length_min_hint: 'Recommended minimum length: 12 characters.',
    gen_not_configured_title: 'Generator not configured',
    gen_not_configured_desc:
      'Enable at least one character type (symbols, numbers, uppercase, or lowercase) in Settings → Password Generator.',

    // ===== NOTIFICATIONS =====
    notif_screenshot_title: 'Screenshot detected',
    notif_screenshot_body: 'A screenshot was taken while PKEY was open.',
    notif_card_deleted_title: 'Key deleted',
    notif_card_deleted_toast: 'Key "{title}" deleted.',
    notif_copy_success_title: 'Copied',
    notif_copy_success_message: 'The {label} of "{title}" is now in your clipboard',
    notif_copy_success_message_no_title: 'The {label} is now in your clipboard',
    notif_copy_cleared: 'Clipboard cleared',
    notif_copy_cleared_message: 'The copied data was removed from the clipboard.',
    notif_copy_package_message: 'The package name "{pkg}" is now in your clipboard',
    notif_copy_empty_title: 'Nothing to copy',
    notif_copy_empty_message: 'There is no content to copy in this key.',
    copy_label_password: 'password',
    copy_label_seed: 'seed phrase',
    copy_label_note: 'note',
    copy_label_otp: 'OTP code',
    card_swipe_a11y: 'Swipe right to copy, left to delete',

    // ===== SECURITY TAB =====
    security_title: 'Security',

    // ===== SETTINGS =====
    settings_title: 'Settings',
    control_access_security: 'Access control and security',

    // Auto-logout
    auto_logout: 'App auto-lock',
    auto_logout_desc:
      'When you leave the app (home screen or another app). On Android, with web access on, minimizing does not lock the vault.',
    foreground_idle_lock: 'Lock when unused',
    foreground_idle_lock_desc:
      'If the app stays open and you do not touch it, the master password or biometrics are required again.',
    strict_offline: 'Strictly offline mode',
    strict_offline_desc:
      'The vault stays off the network (LAN and Internet): turns off and hides web access, breach checks, and remote icons.',
    rooted_banner:
      'This device looks modified (root/jailbreak). Fast unlock and autofill are off by default.',
    fast_unlock_title: 'Fast unlock',
    fast_unlock_desc:
      'Stores the session key in hardware (TEE/StrongBox/Keychain). Biometrics are required; the device PIN is not used.',
    device_secret_title: 'Device secret',
    device_secret_desc:
      'A copied .pkey file will not open on another device without the recovery kit. Keep the printed code.',
    device_secret_recovery_title: 'Recovery kit',
    device_secret_recovery_body:
      'Write this code down. Without it you cannot open the vault on another device. PKEY cannot recover it.',
    device_secret_enable_failed:
      'Could not enable the device secret. Hardware Keystore/Keychain is required.',
    require_auth_device_secret: 'Authenticate to change the device secret',

    // Web PWA idle lock (independent of mobile auto-logout)
    web_auto_logout: 'Web auto-lock',
    web_auto_logout_desc:
      'Locks the browser vault after you stop using it for the chosen time, including while the tab is in the background. Does not change app auto-lock.',

    web_theme_title: 'Web theme',
    web_theme_description: 'Independent of the app theme. You can follow the browser.',
    web_lang_title: 'Web language',
    web_lang_description: 'Independent of the app language. You can follow the browser.',

    // Appearance (unified section)
    appearance_section_title: 'Appearance',
    app_label: 'App',
    web_label: 'Web',
    preferences_section_title: 'Preferences',

    // Language
    lang_title: 'Application language',
    lang_description: 'You can follow the device language.',

    // Auto-collapse
    auto_collapse_title: 'Auto-collapse keys',
    auto_collapse_desc: 'Collapses older open keys when a new key opens.',

    // Group by link
    group_by_link_title: 'Group keys by site',
    group_by_link_desc:
      'Combine keys that share the same host (domain or app) into one expandable group.',
    group_by_link_accounts: '{n} accounts',
    group_by_link_a11y: 'Site group {label}, {n} accounts',

    // Reveal password on copy
    reveal_copy_password_title: 'Reveal password when copying',
    reveal_copy_password_desc:
      'When copying, also shows the password in the field. If off, it only copies.',

    // Screenshots
    screenshots_title: 'Screenshots & Recording',
    screenshots_description: 'Allows or blocks screenshots and screen recording.',

    // Theme
    theme_title: 'Visual UI theme mode',
    theme_description: 'You can follow the device theme.',

    // ===== STATISTICS & REPORTS =====
    stats_title: 'Statistics',
    password_report: 'Passwords report',
    stats_security_hdr: 'Security report',
    stats_content_hdr: 'Content types',
    stat_total_cards: 'Total stored keys',
    stat_duplicated_pass: 'Duplicated keys',
    stat_weak_pass: 'Unsafe / Weak keys',
    stat_stale_pass: 'Stale (older than 3 months)',
    stat_hibp_checked: 'Verified (HIBP)',
    stat_hibp_breached: 'HIBP breached',
    stat_unique_users: 'Unique user accounts',
    session_details_hdr: 'Local session metadata',
    session_section_title: 'This vault session',
    session_id: 'Session ID:',
    session_id_hint:
      'UUID of this vault generation. Compare it with the PWA. The date is when the vault was created (today if you just created it), not a login clock.',
    session_created: 'Session established date:',
    session_modified: 'Vault last modified:',
    session_modified_hint: 'Includes settings changes and key edits.',
    session_age: 'Session age:',
    session_age_days: '{n} days ago',
    session_age_today: 'today',
    last_update: 'Last modified',
    stats_health_hdr: 'Vault health',
    stats_health_score: 'Health score',
    stats_loading: 'Calculating statistics…',
    stats_health_hint: 'Based on duplicates, weakness, staleness, 2FA, and data gaps.',
    stats_coverage_hdr: 'Coverage & data',
    stats_activity_hdr: 'Key activity',
    stats_device_hdr: 'Device posture',
    stats_unlock_hdr: 'Unlocks',
    stats_trend_hdr: 'Recent trend',
    stats_web_sync_hdr: 'Web access',
    stats_filter_active: 'Active filter',
    stats_tap_hint: 'Tap a metric to view matching keys.',
    stats_trend_empty: 'Not enough samples yet. Check back later.',
    stats_trend_point: '{date} · health {score} · weak {weak} · stale {stale}',
    stat_type_password: 'Passwords',
    stat_type_secret: 'Secret phrases',
    stat_type_note: 'Notes',
    stat_reused_username: 'Reused usernames',

    stat_otp_with: 'With 2FA/OTP',
    stat_otp_without: 'Without 2FA/OTP',
    stat_otp_coverage: '2FA coverage',
    stat_empty_username: 'Empty username',
    stat_empty_password: 'Empty password',
    stat_empty_link: 'Empty link',
    stat_unique_tags: 'Unique tags',
    stat_untagged: 'Untagged keys',
    stat_oldest_card: 'Oldest updated',
    stat_newest_card: 'Newest updated',
    stat_tombstones: 'Deleted (sync)',
    stat_biometrics: 'Biometrics available',
    stat_unlock_bundle: 'Biometric unlock saved',
    stat_auto_logout: 'App auto-lock',
    stat_screenshots: 'Screenshots',
    stat_yes: 'Yes',
    stat_no: 'No',
    stat_allowed: 'Allowed',
    stat_blocked: 'Blocked',
    stat_current_unlock: 'This session unlock:',
    stat_last_unlock: 'Last unlock:',
    stat_unlock_method_password: 'Password',
    stat_unlock_method_biometrics: 'Biometrics',
    stat_unlock_ok: 'OK',
    stat_unlock_fail: 'Failed',
    stat_unlock_history_empty: 'No unlock history yet.',
    stat_web_sync_off: 'Web server off',
    stat_web_sync_on: 'Web server on',
    stat_web_clients: 'Connected clients',

    // ===== CLOUD & BACKUP =====
    import_restoration: 'Import / Restore database file',
    import_manager_title: 'Import from another manager',
    import_manager_pick: 'Select file',
    import_manager_formats_hint:
      'Formats: Bitwarden/NordPass/Enpass/Keeper JSON; Chrome/Firefox/LastPass/Dashlane/Keeper CSV; 1Password .1pif or ZIP; generic CSV/TXT. Not PDF, video, or images.',
    import_manager_map: 'Map columns',
    import_manager_preview: 'Preview',
    import_manager_confirm: 'Import',
    import_manager_count: '{n} keys ready',
    import_manager_loading: 'Importing…',
    import_manager_icons_progress: 'Fetching icons ({current}/{total})…',
    import_manager_saving: 'Saving keys to vault…',
    import_manager_reading: 'Reading file…',
    import_manager_parsing: 'Detecting format and columns…',
    import_manager_building_preview: 'Building preview…',
    import_manager_headers_found: '{n} columns detected — tap each row to map.',
    card_tags_label: 'Tags',
    card_tags_placeholder: 'Type a tag...',
    card_tags_add_hint: 'Press Enter to add',
    card_tags_remove: 'Remove tag {name}',
    card_otp_scan: 'Scan QR',
    otp_invalid_secret_title: 'Invalid OTP secret',
    otp_invalid_secret_desc: 'Use Base32 characters only (A-Z, 2-7). Remove spaces and hyphens.',
    otp_invalid_uri_title: 'Invalid OTP URI',
    otp_invalid_uri_desc: 'The QR code does not contain a valid otpauth:// URI.',
    otp_window_prev: 'Previous period',
    otp_window_next: 'Next period',
    otp_window_label: 'Offset {n}',
    otp_scan_success_title: 'OTP imported',
    otp_scan_success_message: 'OTP settings saved to the key.',
    otp_camera_denied_desc:
      'Camera permission denied. Enable it in system Settings to scan QR codes.',
    import_action: 'Pick local .pkey backup file',
    import_pass_prompt: 'Enter master password used to encrypt the backup file:',
    import_success: 'Database imported successfully! Logging you in...',
    import_pkey_reading: 'Reading backup file…',
    import_pkey_decrypting: 'Decrypting backup and restoring vault…',
    decrypt_backup: 'Decrypt backup',
    backup_export_title: 'Backup & export',
    backup_export_desc:
      'A .pkey is an encrypted backup of the whole vault (keys and settings). CSV and JSON only export keys in cleartext for another app: PKEY does not keep them, it only shares them.',
    local_backup_btn: 'Create local file (.pkey)',
    export_csv_btn: 'Export CSV (unencrypted)',
    export_json_btn: 'Export JSON (unencrypted)',
    export_count_label: '{n} of {limit} .pkey backups',
    export_limit_hint:
      'You reached the .pkey backup limit. Delete the oldest one to create another.',
    export_limit_title: 'File limit reached',
    export_limit_reached:
      'You cannot create more than 10 .pkey backups on this device. It is recommended to delete older ones and review your backups if you no longer need them.',
    export_limit_delete_oldest: 'Delete the oldest and continue',
    export_files_empty: 'No .pkey backups on this device yet.',
    export_files_loading: 'Loading exports…',
    export_free_space: 'Free space: {size}',
    export_low_space_hint:
      'Low free space. Free up storage or delete old exports before creating another.',
    export_no_space:
      'Not enough free space on this device to export. Free up storage or delete old exports, then try again.',
    export_share_unavailable: 'Sharing files is not available on this device.',
    export_list_failed: 'Could not list exports on this device.',
    export_share_a11y: 'Share file',
    export_delete_a11y: 'Delete file',
    export_delete_title: 'Delete export',
    export_delete_confirm: 'Delete “{name}” from this device? This cannot be undone.',
    export_delete_failed: 'Could not delete the file.',
    require_auth_delete_export: 'Authenticate to delete this export',
    require_auth_export_plaintext: 'Authenticate to export the vault in cleartext',
    require_auth_export_backup: 'Authenticate to create a backup file',
    export_saved_ok: 'Saved to PKEY Exports',
    export_saved_message: 'Available in the exports list.',
    export_shared_ok: 'Ready to share',
    export_shared_message:
      'CSV/JSON is not kept on the phone. If you cancelled the share sheet, no copy remains.',
    export_plaintext_title: 'Unencrypted export',
    export_plaintext_warning:
      'The file will include passwords and secrets in cleartext. PKEY does not save it on the phone: it only opens the share sheet. If you cancel, no copy remains. Any destination you pick (Drive, mail, Files) is your responsibility.',
    export_needs_cards: 'No keys to export. Unlock the vault and try again.',
    export_failed: 'Export could not be completed.',
    export_no_database: 'There is no active vault to export.',

    // ===== DEVICE MIGRATION =====
    migration_section_title: 'Device migration',
    migration_section_desc:
      'Transfer your entire vault directly to a new phone on the same WiFi network. Ideal when switching devices.',
    migration_send_title: 'Migrate to new device',
    migration_receive_title: 'Receive migration',
    migration_send_btn: 'Migrate to new device',
    migration_receive_btn: 'Receive migration',
    migration_login_required: 'You must be logged in to migrate data from this device.',
    migration_dev_build_required:
      'Migration and web access require a development or production build (not Expo Go). Run eas build --profile development.',
    migration_wifi_hint: 'Both devices must be on the same WiFi network.',
    migration_biometrics_hint:
      'Biometrics are not transferred; set them up again on the new device.',
    migration_waiting_connection: 'Waiting for the old device…',
    migration_receiver_preparing: 'Preparing this device…',
    migration_receiver_qr_loading:
      'The QR code will appear here in a moment. On slower phones this can take a few seconds.',
    migration_receiver_details_loading: 'Preparing pairing code and network details…',
    migration_receiver_ip_pending: 'Getting network address…',
    migration_qr_scan_hint: 'Scan this QR from the device you are leaving.',
    migration_receiver_overview:
      'Keep this screen open. On the phone that has your keys, choose «Migrate to new device» and connect via QR, automatic list, or manual IP.',
    migration_receiver_qr_title: 'QR code',
    migration_devices_found: 'Available devices',
    migration_no_mdns: 'Devices (scan QR if none appear)',
    migration_scanning: 'Searching for devices on the network…',
    migration_scan_qr_btn: 'Scan receiver QR',
    migration_send_methods_title: 'How to connect to the new device?',
    migration_send_method_auto: 'Automatic',
    migration_send_method_qr: 'Scan QR',
    migration_send_method_manual: 'Manual IP',
    migration_send_auto_desc:
      'If both phones are on the same WiFi, the new device may appear below. Selecting it asks for the pairing code shown on its screen.',
    migration_mdns_pairing_required: "Enter the pairing code shown on the other device's screen.",
    migration_mdns_pairing_modal_title: 'Pairing code',
    migration_mdns_pairing_modal_desc:
      'Copy the large code from the new phone (up to 24 characters). Dashes are optional.',
    migration_mdns_pairing_confirm: 'Connect',
    migration_mdns_use_qr: 'Scan QR instead',
    migration_mdns_use_manual: 'Enter IP manually',
    migration_receiver_pairing_prominent: 'Pairing code',
    migration_receiver_pairing_help:
      'This is the secret the other phone needs. With or without dashes is fine. Without it, it cannot connect.',
    migration_tls_fingerprint_label: 'TLS certificate',
    migration_fingerprint_both_hint:
      'Optional: after connecting, check that these fingerprints match on both phones.',
    migration_send_qr_desc:
      'Scan the new phone’s QR. If connect fails, check WiFi and IP; the pairing code is inside the QR.',
    migration_qr_rescan: 'Keep scanning',
    migration_qr_torch: 'Torch',
    migration_qr_open_scanner: 'Open QR scanner',
    migration_qr_modern_hint:
      'Opens the system scanner (more reliable). Point at the new phone’s QR until it reads.',
    migration_qr_live_fallback: 'Use built-in camera',
    migration_send_manual_desc:
      'You need two values from the new phone: its IP and the pairing code (the large code). Everything else is fetched automatically.',
    migration_manual_ip_label: 'New device IP',
    migration_manual_ip_help: 'The same IP shown on the new phone under «Receive migration».',
    migration_manual_ip_placeholder: 'e.g. 192.168.1.42',
    migration_manual_port_label: 'Port',
    migration_manual_port_help: 'Leave 7393 unless the other phone shows a different port.',
    migration_manual_port_placeholder: '7393',
    migration_manual_session_label: 'Session ID',
    migration_manual_session_placeholder: 'Copy the code from the new device',
    migration_manual_connect_btn: 'Connect',
    migration_manual_required: 'Enter the new phone IP and pairing code.',
    migration_manual_pairing_invalid:
      'Invalid code. Enter the full code shown on the new phone (16 or 24 characters). Dashes are optional.',
    migration_manual_ip_invalid: 'Invalid IP address format (e.g. 192.168.1.42).',
    migration_manual_port_invalid: 'Port must be between 1 and 65535.',
    migration_receiver_qr_hint:
      'On the old phone: «Migrate to new device» → «Scan QR» and point here. Includes IP and pairing code.',
    migration_receiver_manual_title: 'Manual connection details',
    migration_receiver_manual_desc:
      'If the camera does not work, note these values and enter them on the old phone («Manual IP»).',
    migration_receiver_session_ref: 'Session reference',
    migration_receiver_session_help:
      'Only a quick visual check that you are on the same session. No need to copy it.',
    migration_receiver_manual_ip: "This device's IP",
    migration_receiver_ip_help:
      'Your WiFi address. The old phone uses it to find you on the network.',
    migration_receiver_manual_port: 'Port',
    migration_receiver_port_help: 'Usually 7393.',
    migration_receiver_manual_session: 'Session ID',
    migration_receiver_manual_pairing: 'Pairing code',
    migration_manual_pairing_label: 'Pairing code',
    migration_manual_pairing_help:
      'The large code on the new phone. With or without dashes (XXXX-XXXX-XXXX-XXXX-XXXX-XXXX).',
    migration_manual_pairing_placeholder: 'XXXX-XXXX-XXXX-XXXX-XXXX-XXXX',
    migration_fingerprint_title: 'Verification fingerprints',
    migration_fingerprint_desc: 'Confirm these values match on both devices before transferring.',
    migration_fingerprint_sender: 'Fingerprint on this device',
    migration_fingerprint_receiver: 'Fingerprint on receiver',
    migration_fingerprint_mismatch: 'Fingerprints do not match. Cancel and pair again.',
    migration_receiver_start_failed:
      'Could not start the migration server. Make sure you have a native build (not Expo Go) and are connected to WiFi.',
    migration_receiver_port_in_use:
      'Migration port is in use. Close the migration screen, wait a few seconds and try again.',
    migration_send_failed: 'Could not complete the migration.',
    migration_err_receiver_unreachable:
      'Cannot reach the receiver device. Check the IP, port, that both phones are on the same WiFi, and that «Receive migration» is still open on the new device.',
    migration_err_receiver_busy:
      'The receiver is busy with another migration. Close migration on the new device, tap «Receive migration» again, and retry.',
    migration_err_session_mismatch:
      'Session ID does not match the receiver. Copy it again from the «Receive migration» screen.',
    migration_err_protocol_mismatch:
      'Incompatible protocol version between devices. Update PKEY on both phones.',
    migration_err_challenge_failed:
      'Pairing verification failed. Check the pairing code on the new phone, or close «Receive migration» there, open it again, and use the new code.',
    migration_err_auth_failed:
      'Authentication rejected. If the receiver already had a vault, use the same master password; otherwise check the pairing code.',
    migration_err_no_local_db: 'No local database found on this device.',
    migration_err_meta_failed: 'Could not send migration metadata.',
    migration_err_chunk_failed: 'Failed to send a data chunk.',
    migration_err_receiver_error: 'Error on the receiver device during migration.',
    migration_err_timeout: 'Timed out while contacting the receiver.',
    migration_err_tcp_unavailable: 'Network migration requires a native build (not Expo Go).',
    migration_camera_permission: 'Camera permission',
    migration_camera_unavailable: 'Camera is not available. Use the «Manual IP» tab.',
    migration_qr_invalid: 'Invalid migration QR code.',
    migration_override_title: 'Overwrite local data',
    migration_override_body:
      'Receiving a migration will replace current data on this device. Continue?',
    migration_finalize_title: 'Complete migration',
    migration_finalize_body:
      'This will tell the old device to permanently erase its data. The received vault stays locked until that notification succeeds.',
    migration_finalize_btn: 'Finish migration',
    migration_finalize_working: 'Finishing…',
    migration_finalize_failed:
      'Could not notify the old device. Keep migration open on the same Wi‑Fi. You can retry or cancel migration (received data will be discarded).',
    migration_finalize_no_target:
      'No contact info for the old device. Cancel migration to discard received data and restore the previous state.',
    migration_staged_locked_hint:
      'Received data is not unlockable yet. It only becomes active after a successful finish.',
    migration_incomplete_resume_hint:
      'An incomplete migration was found. Finish notifying the old device, or cancel to discard the received data.',
    migration_abort_receive_title: 'Cancel migration',
    migration_abort_receive_body:
      'Received data will be discarded and this device will return to its previous state (with or without a local vault). The old device will not be wiped.',
    migration_abort_receive_confirm: 'Discard and cancel',
    migration_abort_receive_btn: 'Cancel migration',
    migration_abort_receive_done_title: 'Migration cancelled',
    migration_abort_receive_done_body:
      'Received data was discarded. This device is back to its previous state. Sign in if you already had a vault.',
    migration_cancel_send_title: 'Cancel on this device',
    migration_cancel_send_body:
      'Wipe wait is cancelled. Your local data stays intact. If the other phone received data, it must cancel or finish on its side.',
    migration_keep_local_btn: 'Keep data and leave',
    migration_cancel_send_btn: 'Cancel migration',
    migration_cancel_send_done_title: 'Migration cancelled here',
    migration_cancel_send_done_body:
      'Your data is still on this device, unchanged. The vault was not erased.',
    migration_wipe_done_title: 'Migration complete',
    migration_wipe_done_body:
      'Migration completed successfully. This device’s session and vault were cleared. Use only the new device.',
    migration_receive_done_title: 'Data received',
    migration_receive_done_body:
      'The vault is now active on this device. Unlock with your master password (biometrics will be set up again after you sign in).',
    migration_sender_waiting_finalize:
      'Waiting for the new device to tap «Finish migration». When it does, this screen will close and this phone’s vault will be cleared.',
    migration_sender_countdown: 'You can cancel in {s}s if the other device does not finish…',
    migration_sender_wait_expired:
      'The other device has not finished yet. You can cancel and keep your local data.',
    migration_unlock_btn: 'Unlock vault',
    migration_cancel_title: 'Cancel migration',
    migration_cancel_body: 'Transfer is in progress. Are you sure you want to cancel?',
    migration_phase_idle: 'Waiting',
    migration_phase_discovering: 'Searching for devices on the network',
    migration_phase_connecting: 'Connecting',
    migration_phase_authenticating: 'Verifying identity',
    migration_phase_preparing: 'Preparing vault',
    migration_phase_transferring: 'Transferring data',
    migration_phase_applying_cards: 'Applying keys',
    migration_phase_applying_settings: 'Applying settings',
    migration_phase_verifying: 'Verifying integrity',
    migration_phase_ready: 'Ready to finish',
    migration_phase_finalizing: 'Notifying old device',
    migration_phase_wipe_complete: 'Source data erased',
    migration_phase_complete: 'Migration complete',
    migration_phase_error: 'Error',
    migration_auth_send:
      'Confirm your identity to send the vault to another device. If migration completes, this phone will erase all its data.',
    migration_auth_receive: 'Confirm your identity to receive a migration on this device.',
    migration_auth_finalize:
      'Confirm your identity to finish migration and permanently erase data on the old device.',
    web_access_title: 'Web access',
    web_access_toggle: 'Web access (browser)',
    web_access_desc:
      'Serve the web vault on port {port} — accessible from any browser on the same WiFi.',
    web_access_transport_warning:
      'Web access uses plain HTTP on your local network (no certificate). Use only on trusted Wi‑Fi.',
    web_access_tls_fingerprint_label: 'TLS certificate fingerprint',
    web_access_tls_trust_hint: '',
    web_access_install_hint: '',
    web_access_reactivate_prompt: 'Web access was enabled before. Reactivate it now?',
    web_access_reactivate_btn: 'Reactivate',
    web_access_reactivate_dismiss: 'Dismiss',
    web_access_autostart_label: 'Re-enable web access automatically on login',
    web_confirm_on_phone_label: 'Confirm browser actions on this phone',
    web_confirm_on_phone_desc:
      'When on and the browser is online, edit, delete, reveal, or copy secrets asks for biometrics (or your master password) on this phone instead of typing it again on the PC. Browser login still requires the master password.',
    web_login_on_phone_label: 'Unlock the browser with this phone',
    web_login_on_phone_desc:
      'When on, PWA login shows a fingerprint button. Compare the 6-digit code on both screens, then approve with biometrics (or your master password) on this phone. You can always type the master password in the browser.',
    web_blocked_clients: 'BLOCKED CLIENTS',
    web_blocked_ips: 'BLOCKED IPs',
    web_server_active: 'Web server active',
    web_fg_service_minimal_title: 'PKEY',
    web_fg_service_minimal_body: 'LAN web access is running in the background.',
    web_stat_authenticated: 'authenticated',
    web_stat_connecting: 'connecting',
    web_connected_browsers: 'CONNECTED BROWSERS',
    web_client_rename: 'Rename browser',
    web_client_alias_title: 'Name this browser',
    web_client_alias_message:
      'A nickname stored only on this phone so you can recognize it in the list. Leave empty to clear.',
    web_client_alias_placeholder: 'e.g. Living-room laptop',
    web_client_unknown: 'Browser',
    web_client_block: 'Block browser',
    web_notif_browser_title: 'Browser synced',
    web_notif_browser_body: 'A browser synced with PKEY ({client}).',
    web_notif_block_action: 'Block',
    web_notif_deny_action: 'Deny',
    web_notif_pwa_confirm_title: 'Confirm on this phone',
    web_notif_pwa_confirm_body: '{client} wants to {action}. Open PKEY to confirm.',
    web_action_confirm_title: 'Browser needs confirmation',
    web_action_confirm_message: '{client} wants to {action}: {key}',
    web_action_confirm_card_unknown: 'a key',
    web_action_edit: 'edit secrets',
    web_action_delete: 'delete a key',
    web_action_reveal: 'reveal a secret',
    web_action_copy: 'copy a secret',
    web_action_copy_otp: 'copy an OTP code',
    web_action_reveal_otp: 'reveal an OTP code',
    web_action_copy_username: 'copy a username',
    web_action_confirm_approve: 'Confirm',
    web_action_confirm_deny: 'Deny',
    web_action_confirm_send_failed: 'Could not send the choice to the browser. Keep the app open.',
    web_notif_pwa_unlock_title: 'Browser unlock',
    web_notif_pwa_unlock_body:
      '{client} wants to unlock the vault. Open PKEY and compare the code.',
    web_unlock_title: 'Browser wants to unlock',
    web_unlock_message: '{client} is asking to unlock the web vault.',
    web_unlock_sas_hint: 'Compare this 6-digit code with the browser before you approve.',
    web_unlock_sas_a11y: 'Code {code}',
    web_unlock_approve: 'Approve',
    web_unlock_deny: 'Deny',
    web_unlock_send_failed: 'Could not send the unlock to the browser. Keep the app open.',
    web_pwa_request_expired_title: 'The browser request expired',
    web_pwa_request_expired_body:
      'Try again from the computer. The app had locked or restarted and can no longer complete that request.',
    web_notif_lan_changed_title: 'The computer needs the address again',
    web_notif_lan_changed_body: 'Open PKEY on the phone and tap Copy address again.',
    web_notif_lan_changed_inapp:
      'Open PKEY and tap Copy address again. On the computer, paste that address in the browser.',
    web_access_unavailable_title: 'Web access unavailable',
    web_access_unavailable_body:
      'Port {port} is still in use from a previous session. Fully close PKEY (remove from recents) and open it again, then enable web access.',
    web_access_start_failed:
      'Could not start web access (port in use or network error). It stays off — try again in a moment.',
    web_access_ip_label: 'Open in browser (same network):',
    web_access_mdns_label: 'Stable URL (.local):',
    web_access_copy: 'Copy URL',
    web_access_copied: 'Address copied. On the computer: paste and press Enter.',
    web_access_share: 'Send to the computer',
    web_access_steps:
      '1. Open the browser on the computer.\n2. Tap the green Copy address button.\n3. On the computer, paste and press Enter.',
    web_access_didnt_open: 'Did it not open on the computer?',
    web_access_fallback_hint:
      'The phone and the computer must be on the same home Wi‑Fi. Copy this other address:',
    web_access_other_phone: 'I am using another phone or tablet',
    web_access_keep_phone_open: 'Keep PKEY open on this phone while you use the computer.',
    web_access_leave_tab: 'On the computer, leave that tab open.',
    web_access_unlock_phone_label: 'Unlock with this phone',
    web_access_unlock_phone_desc:
      'The computer will show a 6-digit code. Compare it here and tap Approve.',
    web_access_autoreconnect_hint:
      'If Wi‑Fi or your IP changes, PKEY notifies you so you can open the new QR. The browser may find this device again while the tab stays open; use the stable link to come back.',
    lan_kind_wifi: 'Wi‑Fi',
    lan_kind_ethernet: 'Ethernet',
    lan_kind_cellular: 'Mobile data',
    lan_kind_none: 'No network',
    lan_kind_other: 'Other network',
    lan_status_ip: 'IP {ip}',
    lan_status_no_ip: 'No LAN address',
    lan_not_lan_warning:
      'This phone is not on home Wi‑Fi. Connect it to Wi‑Fi; the computer must be on that same Wi‑Fi.',
    lan_ssid_show: 'Show network name',
    lan_ssid_rationale:
      'On recent Android the system asks for nearby Wi‑Fi devices permission to read the network name. Older versions ask for location. GPS is not used and nothing is sent off this phone.',
    lan_ssid_blocked:
      'Permission to read the network name is blocked. You can enable it in system Settings.',
    lan_ssid_unavailable:
      'The system did not provide the network name. Make sure device location is on and try again.',
    web_access_no_lan_url: 'No LAN address. Connect to Wi‑Fi to see the URL and QR code.',
    vault_fork_title: 'Different sessions',
    vault_fork_message:
      'This browser has an older vault ({pwa} keys). This phone has a different session ({phone} keys). Pick one — they are not merged. Keeping the phone does not delete its keys.',
    vault_fork_message_locked:
      'This browser has an older encrypted vault (a different session). It could not be opened with this password. Using this phone deletes the browser copy. Recovering the browser keys requires the old password.',
    vault_fork_use_phone: 'Use this phone',
    vault_fork_use_pwa: 'Use the browser',
    vault_fork_defer: 'Decide later',
    vault_fork_send_failed: 'Could not send the choice to the browser. Keep the app open.',

    // ===== SECURITY & AUTHENTICATION =====
    require_auth_clipboard: 'Authenticate to copy sensitive parameters to clipboard',
    require_auth_otp_view: 'Authenticate to view the OTP code',
    require_auth_delete: 'Authenticate to wipe this credential forever',
    require_auth_delete_all_bio: 'Verify your identity to proceed with vault wipe',
    require_auth_delete_all_pass: 'Enter your master password to authorize deleting all keys',
    require_auth_reset_session_bio: 'Verify your identity to proceed with creating a new session',
    require_auth_reset_session_pass:
      'Enter your master password to authorize wiping the current session',
    require_auth_never_logout: 'Authenticate to disable automatic session logs',
    require_auth_web_confirm_on_phone: 'Authenticate to confirm browser actions on this phone',
    require_auth_web_login_on_phone: 'Authenticate to allow browser unlock with this phone',
    require_auth_web_unlock: 'Confirm this browser unlock',
    require_auth_pwa_action: 'Confirm this browser action',
    require_auth_block_web_client: 'Authenticate to block this browser',
    biometric_auth_failed: 'Biometric verification failed. Operation cancelled.',
    secure_file_alert: 'PKEY secure file',
    secure_actions_alert: 'PKEY secure actions',

    // ===== ERRORS & VALIDATION =====
    wrong_key_p: 'Master key provided is incorrect and cannot decrypt.',
    login_locked_countdown: 'Too many failed attempts. Try again in {n}s.',
    p_length_warn: 'Master password must be at least 12 characters.',
    p_strength_warn:
      'Password is too weak. Use 12+ unique characters or a passphrase made of several unpredictable words.',
    p_match_warn: 'Passwords do not match.',
    error_importing_file: 'An error occurred while importing the file.',
    error_exporting_file: 'An error occurred while exporting the file.',
    alert_error_title: 'Error',
    alert_success_title: 'Success',
    alert_ok_title: 'OK',
    alert_warning_title: 'Warning',
    filesystem_error_title: 'Storage error',
    filesystem_error_body: 'Could not save the database on this device.',
    filesystem_init_failed: 'Could not initialize storage.',
    crash_title: 'Something went wrong',
    crash_body:
      'PKey ran into an unexpected error. Your vault on disk is safe — nothing is written until you unlock. Restart the app; if this keeps happening, copy the technical details.',
    crash_copy_details: 'Copy technical details',
    crash_copied: 'Copied to clipboard',
    generate_replace_alert:
      'Do you want to overwrite your active password with a strong randomly generated value?',

    // ===== TAGS (Security indicators) =====
    tag_duplicated: 'Reused',
    tag_secure: 'Secure',
    tag_weak: 'Weak',
    tag_very_weak: 'Very weak',
    tag_strong: 'Strong',

    // ===== UI ACTIONS (Buttons, dialogs) =====
    confirm_delete:
      'Are you absolutely sure you want to permanently delete this key? This is irreversible.',
    confirm_delete_title: 'Confirm deletion',
    confirm_delete_all_title: 'Delete all keys',
    confirm_delete_all_message: '{n} keys will be permanently removed. This cannot be undone.',
    delete_all_section_title: 'Danger zone',
    delete_all_section_desc:
      'Irreversible actions on the local vault. Existing backup files are not modified.',
    delete_all_warning:
      'Irreversible action. Requires biometrics (when available) and master password.',
    delete_all_btn: 'Delete all keys',
    delete_all_count: '{n} keys in vault',
    delete_all_empty: 'There are no keys to delete.',
    delete_all_success_title: 'Vault cleared',
    delete_all_success_toast: '{n} keys deleted.',
    delete_all_error: 'Could not delete the keys. Please try again.',
    delete_all_busy: 'Deleting keys and saving to device…',
    confirm_reset_session_title: 'Create new session',
    confirm_reset_session_message:
      'The current local session will be permanently deleted (encrypted vault and biometric unlock). You can then create a new session. This cannot be undone.',
    reset_session_warning:
      'Wipes the entire session from this device. Requires biometrics (when available) and master password.',
    reset_session_btn: 'Create new session',
    reset_session_busy: 'Removing local session…',
    reset_session_error: 'Could not remove the session. Please try again.',
    delete_button: 'Delete',
    cancel_button: 'Cancel',
    continue_button: 'Continue',
    proceed_button: 'Proceed',
    generate_and_replace: 'Generate & replace',

    // ===== MISCELLANEOUS =====
    copiado_cop: 'Successfully copied to clipboard',
    sync_completed: 'Changes synchronized in local container.',
    status_online: 'Online encrypted',
    password_6chars: '(12+ characters)',
    example_email: 'user@example.com',
    example_instagram: 'e.g. Instagram Personal',
    placeholder_credentials: 'Alternative credentials, token, PIN...',
    placeholder_password_mask: '******',
    placeholder_tags_example: 'work, personal',
    placeholder_link_example: 'https://app.instagram.com',
    placeholder_secure_input: '••••••••',
    detecting_icon: 'Detecting icon…',
    icon_picker_title: 'Select preset icon',
    close_button: 'Close',
    duration_seconds: '{n}s',
    duration_minutes: '{n}m',
    duration_hours: '{n}h',
    import_manager_done: '{n} keys imported',
    import_manager_preview_skipped: '({n} skipped)',
    import_manager_summary: '{total} in file · {importing} to import · {skipped} skipped',
    import_manager_file_info: '{name} · {format} · {n} rows',
    import_manager_will_import: 'Will import',
    import_manager_skipped_title: 'Skipped',
    import_manager_skip_vault: 'Already in vault',
    import_manager_skip_vault_hint: 'Matches «{title}» in vault',
    import_manager_skip_file: 'Duplicate in file',
    import_manager_skip_password_mismatch: 'Same entry, different password',
    import_manager_skip_password_mismatch_hint:
      'Matches «{title}» but the file password differs (not updated)',
    import_manager_headerless: 'First row is data (no header row)',
    import_manager_warnings_title: 'Warnings',
    import_manager_warn_empty_password: 'Missing password',
    import_manager_warn_truncated_title: 'Title truncated',
    import_manager_warn_truncated_link: 'URL truncated',
    import_manager_warn_truncated_password: 'Password truncated',
    import_manager_warn_truncated_username: 'Username truncated',
    import_manager_warn_truncated_notes: 'Notes truncated',
    import_manager_warn_count: '{n} rows with {kind}',
    import_manager_list_more: '…and {n} more',
    import_manager_format_bitwarden: 'Bitwarden',
    import_manager_format_onepassword: '1Password',
    import_manager_format_dashlane: 'Dashlane',
    import_manager_format_csv: 'CSV',
    import_manager_format_unknown: 'Unknown',
    import_manager_format_nordpass: 'NordPass',
    import_manager_format_keeper: 'Keeper',
    import_manager_format_chrome: 'Chrome',
    import_manager_format_firefox: 'Firefox',
    import_manager_format_lastpass: 'LastPass',
    import_manager_format_enpass: 'Enpass',
    import_manager_error_missing_binary:
      'Could not read binary file content. Please re-select your 1Password export (.1pif or .zip).',
    import_manager_error_unsupported_1p:
      'Unsupported 1Password format (.1pux or archive without .1pif entries). Export as .1pif or a ZIP containing .1pif.',
    import_manager_error_parse_failed:
      'Could not parse the file. Check that it is not corrupt and that the format is supported.',
    import_manager_error_unsupported_format:
      'Unsupported format. Use a .csv, .json, .txt, .1pif, or ZIP-with-.1pif export (Bitwarden, Chrome, 1Password, etc.). PDF, video, and images cannot be imported.',
    import_manager_edit_mapping: 'Edit column mapping',

    // ===== SETTINGS BUTTON OPTIONS (with { label, value } format for backend mapping) =====
    settings_buttons_options: {
      auto_logout: [
        { label: 'Instantly', value: 'INSTANT' },
        { label: '1 minute', value: '1M' },
        { label: 'Never', value: 'NEVER' },
      ],
      foreground_idle_lock: [
        { label: '1 min', value: '1M' },
        { label: '5 min', value: '5M' },
        { label: '15 min', value: '15M' },
        { label: 'Never', value: 'NEVER' },
      ],
      web_auto_logout: [
        { label: '5 min', value: '5M' },
        { label: '15 min', value: '15M' },
        { label: '1 hour', value: '1H' },
        { label: 'Never', value: 'NEVER' },
      ],
      lang_title: [
        { label: 'Auto', value: 'AUTO' },
        { label: 'Spanish', value: 'ESP' },
        { label: 'English', value: 'ING' },
      ],
      auto_collapse_title: [
        { label: 'Enabled', value: true },
        { label: 'Disabled', value: false },
      ],
      screenshots: {
        screenshots_title: 'Screenshots & Recording',
        screenshots_description: 'Allows or blocks screenshots and screen recording.',
      },
      theme_title: [
        { label: 'Light', value: 'LIGHT' },
        { label: 'Dark', value: 'DARK' },
        { label: 'System', value: 'AUTO' },
      ],
      sync_status: {
        off: 'Off',
        master: 'Master',
        satellite: 'Satellite',
      },
      sync_status_desc: {
        off: 'Multi-device sync is disabled.',
        master: 'This device is acting as a master sync server.',
        satellite: 'This device is connected to a master sync server.',
      },
      sync_master_mode_title: 'Master Mode',
      sync_master_mode_desc: 'Host a local sync server so other devices can connect to this one.',
      sync_ip_addr: 'IP Address',
      sync_port: 'Port',
      sync_fingerprint: 'Session Fingerprint',
      sync_connected_devices: 'Connected Devices',
      sync_qr_hint: 'Point the camera at the QR code shown on the master device.',
      sync_manual_entry_title: 'Manual Entry',
      sync_master_unreachable: 'Master unreachable',
      sync_connect_btn: 'Connect',
      sync_disconnect_btn: 'Disconnect',
      sync_pair_btn: 'Pair',
      sync_rescan_qr: 'Scan again',
      sync_camera_perm_req: 'Camera permission required.',
      sync_camera_dev_build_req: 'Camera module requires a dev build.\nUse manual entry below.',
      sync_server_running_no_ip:
        'Server running. Connect to a Wi-Fi network to display the QR code.',
      sync_all_e2e:
        'All data is end-to-end encrypted with your master password. The sync server never leaves your local network.',
      sync_status_connected_synced: 'Connected & synced',
      sync_status_syncing: 'Syncing...',
      sync_status_sync_error: 'Sync error',
      sync_last_synced_at: 'Last sync:',
      sync_mode_select: [
        { label: 'Off', value: 'off' },
        { label: 'Master', value: 'master' },
        { label: 'Satellite', value: 'satellite' },
      ],
      sync_dev_build_warning:
        'Multi-device sync requires a development build. Run eas build --profile development to generate one.',
      sync_dev_build_android_warning:
        'Multi-device sync requires a development build. Run eas build --profile development --platform android to generate one.',
    },
  },
};

export type LocaleStrings = typeof LOCALE_DICT.ESP;

/** Resolve UI strings for the stored language preference (`AUTO` follows the device). */
export function getLocale(language?: string): LocaleStrings {
  return resolveUiLanguage(language, getDeviceLocaleTag()) === 'ESP'
    ? LOCALE_DICT.ESP
    : LOCALE_DICT.ING;
}
