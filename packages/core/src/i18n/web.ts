/**
 * @fileoverview Web client i18n keys, lookups, and language helpers.
 *
 * Locale string values themselves are not documented here; use {@link t} to resolve them.
 */

import type { AppSettings } from '../types';
import { resolveUiLanguage } from '../util/language';

/** Supported web UI languages (`ESP` Spanish, `ING` English). */
export type WebLang = 'ESP' | 'ING';

/** Stable message keys for the web vault UI. */
export type WebI18nKey =
  | 'conn_connecting'
  | 'conn_authenticating'
  | 'conn_ready'
  | 'conn_lost'
  | 'conn_reconnecting'
  | 'conn_recovering'
  | 'conn_discovering'
  | 'conn_computer_offline'
  | 'discovery_help_title'
  | 'discovery_help_body'
  | 'discovery_retry'
  | 'stay_open_banner'
  | 'stay_open_bookmark'
  | 'stay_open_dismiss'
  | 'relogin_prompt'
  | 'relogin_title'
  | 'relogin_desc'
  | 'continue_offline'
  | 'readonly_banner'
  | 'vault_fork_banner'
  | 'vault_fork_waiting'
  | 'vault_fork_locked'
  | 'session_expired'
  | 'not_connected'
  | 'write_blocked'
  | 'copied'
  | 'copy_failed'
  | 'sync_error'
  | 'sync_error_watchdog'
  | 'sync_error_auth'
  | 'sync_error_conflict'
  | 'sync_field_overwrite'
  | 'lan_warning'
  | 'unlock_secrets'
  | 'verify_password'
  | 'delete_confirm'
  | 'title_required'
  | 'default_card_name'
  | 'card_type_change_blocked'
  | 'otp_invalid_secret'
  | 'otp_invalid_uri'
  | 'add_phrase_word'
  | 'generate_replace'
  | 'tag_note'
  | 'link_blocked'
  | 'app_link_hint'
  | 'generate'
  | 'synced'
  | 'syncing'
  | 'offline'
  | 'idle'
  | 'readonly'
  | 'login_unlock'
  | 'auth_busy_unlock'
  | 'auth_busy_verify'
  | 'auth_busy_save'
  | 'login_looking'
  | 'auth_timeout'
  | 'session_id_label'
  | 'logout'
  | 'sync'
  | 'search_placeholder'
  | 'new_card'
  | 'edit_card'
  | 'no_cards'
  | 'no_results'
  | 'incorrect_password'
  | 'unlock'
  | 'cancel'
  | 'confirm'
  | 'save'
  | 'delete'
  | 'edit'
  | 'username'
  | 'password'
  | 'seed_phrase'
  | 'url'
  | 'notes'
  | 'title'
  | 'type_password'
  | 'type_seed'
  | 'type_note'
  | 'web_onboard_master'
  | 'web_onboard_keep_phone'
  | 'login_password_placeholder'
  | 'app_desc'
  | 'login_required'
  | 'vault_title'
  | 'add_first_card'
  | 'no_link_placeholder'
  | 'created_label'
  | 'modified_label'
  | 'tag_pass'
  | 'tag_seed'
  | 'hibp_verified'
  | 'hibp_breached'
  | 'hibp_unavailable'
  | 'hibp_not_verified'
  | 'web_vault_sub'
  | 'gen_not_configured'
  | 'icon_picker_title'
  | 'open_link'
  | 'show'
  | 'hide'
  | 'otp_secret'
  | 'otp_code'
  | 'otp_copy'
  | 'otp_countdown'
  | 'tags_label'
  | 'card_tags_label'
  | 'card_tags_placeholder'
  | 'card_tags_add_hint'
  | 'card_tags_remove'
  | 'stats_title'
  | 'stats_total'
  | 'stats_duplicates'
  | 'stats_weak'
  | 'stats_stale'
  | 'stats_hibp_checked'
  | 'stats_hibp_breached'
  | 'stats_users'
  | 'stats_health_hdr'
  | 'stats_health_score'
  | 'stats_health_hint'
  | 'stats_password_report'
  | 'stats_coverage_hdr'
  | 'stats_type_password'
  | 'stats_type_secret'
  | 'stats_type_note'
  | 'stats_reused_username'
  | 'stats_otp_with'
  | 'stats_otp_without'
  | 'stats_otp_coverage'
  | 'stats_empty_username'
  | 'stats_empty_password'
  | 'stats_empty_link'
  | 'stats_unique_tags'
  | 'stats_untagged'
  | 'stats_tombstones'
  | 'stats_activity_hdr'
  | 'stats_oldest_card'
  | 'stats_newest_card'
  | 'stats_session_hdr'
  | 'stats_auto_logout'
  | 'stats_web_auto_logout'
  | 'stats_conn_mode'
  | 'stats_conn_live'
  | 'stats_conn_offline'
  | 'stats_conn_other'
  | 'stats_offline_vault'
  | 'stats_yes'
  | 'stats_no'
  | 'stats_pending_ops'
  | 'stats_auto_logout_instant'
  | 'stats_auto_logout_1m'
  | 'stats_auto_logout_never'
  | 'stats_web_auto_logout_5m'
  | 'stats_web_auto_logout_15m'
  | 'stats_web_auto_logout_1h'
  | 'stats_web_auto_logout_never'
  | 'unlock_edit_helper'
  | 'save_locked_hint'
  | 'unlock_to_save'
  | 'secret_locked'
  | 'vault_loading'
  | 'stats_loading'
  | 'verify_unlock_edit_desc'
  | 'phone_confirm_title'
  | 'phone_confirm_desc'
  | 'phone_confirm_use_password'
  | 'login_bio_btn'
  | 'unlock_sas_title'
  | 'unlock_sas_desc'
  | 'unlock_sas_use_password'
  | 'unlock_sas_connection_lost'
  | 'stats_web_confirm_on_phone'
  | 'stats_web_login_on_phone'
  | 'settings_title'
  | 'theme_title'
  | 'theme_auto'
  | 'theme_light'
  | 'theme_dark'
  | 'lang_title'
  | 'generator_title'
  | 'gen_symbols'
  | 'gen_numbers'
  | 'gen_uppercase'
  | 'gen_lowercase'
  | 'auto_collapse'
  | 'group_by_link_accounts'
  | 'tab_cards'
  | 'tab_stats'
  | 'tab_settings'
  | 'import_title'
  | 'offline_banner'
  | 'pending_changes'
  | 'sync_complete'
  | 'offline_unlock_hint'
  | 'offline_unlock_failed'
  | 'crash_title'
  | 'crash_body'
  | 'crash_copy_details'
  | 'crash_copied';

const STRINGS: Record<WebLang, Record<WebI18nKey, string>> = {
  ING: {
    conn_connecting: 'Connecting…',
    conn_authenticating: 'Authenticating…',
    conn_ready: 'Connected to this phone.',
    conn_lost: 'Connection lost — reconnecting…',
    conn_reconnecting: 'Trying again in {n}s…',
    conn_recovering: 'One moment, restoring the connection…',
    conn_discovering: 'Looking for the phone…',
    conn_computer_offline: 'This computer is offline. Check the Wi‑Fi and try again.',
    discovery_help_title: 'We cannot find the phone',
    discovery_help_body:
      'Open PKEY on the phone, leave it on the screen, and tap Retry. Your changes on this computer are saved.',
    discovery_retry: 'Retry',
    stay_open_banner:
      'To come back another day, open PKEY on the phone and tap Copy address. Leave this tab open while you work.',
    stay_open_bookmark: 'On this computer you can also save this page as a favorite.',
    stay_open_dismiss: 'Got it',
    relogin_prompt: 'Master reconnected — re-enter password',
    relogin_title: 'Reconnect to master',
    relogin_desc:
      'Enter your master password to sync, or continue offline and keep editing locally.',
    continue_offline: 'Continue offline',
    readonly_banner: 'Master disconnected — read-only mode. Edits disabled until reconnected.',
    vault_fork_banner:
      'This browser has a different vault than the phone. Choose a session on the phone — one side replaces the other; they are not merged.',
    vault_fork_waiting: 'Waiting for the phone to choose which vault to keep',
    vault_fork_locked:
      'The previous browser vault is still encrypted — this password cannot open it.',
    session_expired: 'Session expired due to inactivity',
    not_connected: 'Not connected',
    write_blocked: 'Cannot save in read-only mode',
    copied: 'Copied!',
    copy_failed: 'Failed to copy',
    sync_error: 'Sync error',
    sync_error_watchdog: 'Sync timed out — will retry in the background',
    sync_error_auth: 'Sync auth failed — please re-enter your master password',
    sync_error_conflict: 'Sync conflict — vault kept newer values, older edits merged',
    sync_field_overwrite:
      'Sync merged {n} key(s) with conflicting fields — newest values kept, empty fields filled from the other side.',
    lan_warning: 'Local network HTTP — use only on trusted Wi‑Fi',
    unlock_secrets: 'Unlock secrets to edit',
    unlock_edit_helper: 'Enter your master password to enable editing',
    save_locked_hint: 'Unlock secrets to enable Save',
    unlock_to_save: 'Unlock to save',
    secret_locked: 'Locked content',
    vault_loading: 'Loading vault…',
    stats_loading: 'Calculating statistics…',
    verify_password: 'Verify master password',
    verify_unlock_edit_desc: 'Enter your master password to unlock secrets for this key.',
    phone_confirm_title: 'Confirm on your phone',
    phone_confirm_desc:
      'Approve this action with biometrics or your master password on the PKEY app. Keep the phone nearby.',
    phone_confirm_use_password: 'Use master password',
    login_bio_btn: 'Unlock with phone biometrics',
    unlock_sas_title: 'Confirm on your phone',
    unlock_sas_desc:
      'Compare this 6-digit code with the PKEY app, then approve with Face ID or your master password on the phone.',
    unlock_sas_use_password: 'Use master password',
    unlock_sas_connection_lost:
      'Connection to the phone was lost. Tap the fingerprint button again.',
    delete_confirm: 'Delete this key? This cannot be undone.',
    title_required: 'Title is required',
    default_card_name: 'New key',
    card_type_change_blocked: 'You cannot change the type of a key that has already been saved.',
    otp_invalid_secret: 'Use Base32 characters only (A-Z, 2-7).',
    otp_invalid_uri: 'That is not a valid otpauth:// URI.',
    add_phrase_word: 'Add seed word',
    generate_replace: 'Replace the current password with a generated one?',
    tag_note: 'note',
    link_blocked: 'That link cannot be opened.',
    app_link_hint: 'Also linked to {name} on Android',
    generate: 'Generate',
    synced: 'Synced',
    syncing: 'Syncing…',
    offline: 'Offline',
    idle: 'Idle',
    readonly: 'Read-only',
    login_unlock: 'Unlock',
    auth_busy_unlock: 'Unlocking…',
    auth_busy_verify: 'Verifying…',
    auth_busy_save: 'Saving…',
    login_looking: 'Looking for PKEY master on this network…',
    auth_timeout: 'Unlock timed out — try again',
    session_id_label: 'Session',
    logout: 'Logout',
    sync: 'Sync',
    search_placeholder: 'Search keys…',
    new_card: 'New key',
    edit_card: 'Edit key',
    no_cards: 'No keys yet. Tap + to add one.',
    no_results: 'No results',
    incorrect_password: 'Incorrect password',
    unlock: 'Unlock',
    cancel: 'Cancel',
    confirm: 'Confirm',
    save: 'Save',
    delete: 'Delete',
    edit: 'Edit',
    username: 'Username',
    password: 'Password',
    seed_phrase: 'Seed phrase',
    url: 'URL',
    notes: 'Notes',
    title: 'Title',
    type_password: 'Password',
    type_seed: 'Seed phrase',
    type_note: 'Note',
    web_onboard_master: 'Unlock with the same master password as the mobile app.',
    web_onboard_keep_phone:
      'Keep PKEY open on your phone. Leave this browser tab open while you work.',
    login_password_placeholder: 'Master password',

    app_desc: 'Secure password vault — web client',
    login_required: 'Enter master password',
    vault_title: 'PKEY',
    add_first_card: 'Add first key',
    no_link_placeholder: 'No link',
    created_label: 'Created',
    modified_label: 'Modified',
    tag_pass: 'pass',
    tag_seed: 'seed',
    hibp_verified: 'verified by HIBP',
    hibp_breached: 'exposed by HIBP · {n}',
    hibp_unavailable: 'HIBP unavailable',
    hibp_not_verified: 'not verified',
    web_vault_sub: 'Web Vault',
    gen_not_configured: 'Configure password generator in app settings',
    icon_picker_title: 'Select icon',
    open_link: 'Open link',
    show: 'Show',
    hide: 'Hide',
    otp_secret: 'OTP secret (Base32)',
    otp_code: 'OTP code',
    otp_copy: 'Copy OTP',
    otp_countdown: 'Refreshes in {n}s',
    tags_label: 'Tags',
    card_tags_label: 'Tags',
    card_tags_placeholder: 'Type a tag...',
    card_tags_add_hint: 'Press Enter to add',
    card_tags_remove: 'Remove tag {name}',
    stats_title: 'Statistics',
    stats_total: 'Total keys',
    stats_duplicates: 'Duplicated passwords',
    stats_weak: 'Weak passwords',
    stats_stale: 'Stale (>3 months)',
    stats_hibp_checked: 'HIBP checked',
    stats_hibp_breached: 'HIBP breached',
    stats_users: 'Unique usernames',
    stats_health_hdr: 'Vault health',
    stats_health_score: 'Health score',
    stats_health_hint: 'Based on duplicates, weakness, staleness, 2FA, and data gaps.',
    stats_password_report: 'Passwords report',
    stats_coverage_hdr: 'Coverage & data',
    stats_type_password: 'Passwords',
    stats_type_secret: 'Secret phrases',
    stats_type_note: 'Notes',
    stats_reused_username: 'Reused usernames',
    stats_otp_with: 'With 2FA/OTP',
    stats_otp_without: 'Without 2FA/OTP',
    stats_otp_coverage: '2FA coverage',
    stats_empty_username: 'Empty username',
    stats_empty_password: 'Empty password',
    stats_empty_link: 'Empty link',
    stats_unique_tags: 'Unique tags',
    stats_untagged: 'Untagged keys',
    stats_tombstones: 'Deleted (sync)',
    stats_activity_hdr: 'Key activity',
    stats_oldest_card: 'Oldest updated',
    stats_newest_card: 'Newest updated',
    stats_session_hdr: 'Session',
    stats_auto_logout: 'App auto-lock',
    stats_web_auto_logout: 'Web auto-lock',
    stats_web_confirm_on_phone: 'Confirm on phone',
    stats_web_login_on_phone: 'Unlock with phone',
    stats_conn_mode: 'Connection',
    stats_conn_live: 'Live',
    stats_conn_offline: 'Offline',
    stats_conn_other: 'Disconnected',
    stats_offline_vault: 'Offline vault',
    stats_yes: 'Yes',
    stats_no: 'No',
    stats_pending_ops: 'Pending changes',
    stats_auto_logout_instant: 'Instant',
    stats_auto_logout_1m: '1 min',
    stats_auto_logout_never: 'Never',
    stats_web_auto_logout_5m: '5 min',
    stats_web_auto_logout_15m: '15 min',
    stats_web_auto_logout_1h: '1 hour',
    stats_web_auto_logout_never: 'Never',
    settings_title: 'Settings',
    theme_title: 'Theme',
    theme_auto: 'Auto',
    theme_light: 'Light',
    theme_dark: 'Dark',
    lang_title: 'Language',
    generator_title: 'Password generator',
    gen_symbols: 'Symbols',
    gen_numbers: 'Numbers',
    gen_uppercase: 'Uppercase',
    gen_lowercase: 'Lowercase',
    auto_collapse: 'Auto-collapse keys',
    group_by_link_accounts: '{n} accounts',
    tab_cards: 'Keys',
    tab_stats: 'Stats',
    tab_settings: 'Settings',
    import_title: 'Import',
    offline_banner: 'Offline — edits are saved locally and will sync when the master reconnects.',
    pending_changes: '{n} pending change(s)',
    sync_complete: 'Synced {n} offline change(s)',
    offline_unlock_hint: 'Master not found — unlock your offline vault',
    offline_unlock_failed: 'Could not unlock offline vault',
    crash_title: 'Something went wrong',
    crash_body:
      'PKey ran into an unexpected error. Your vault on this device is unchanged. Reload the page; if it keeps happening, copy the technical details.',
    crash_copy_details: 'Copy technical details',
    crash_copied: 'Copied',
  },
  ESP: {
    conn_connecting: 'Conectando…',
    conn_authenticating: 'Autenticando…',
    conn_ready: 'Conectado a este teléfono.',
    conn_lost: 'Conexión perdida — reconectando…',
    conn_reconnecting: 'Reintentando en {n}s…',
    conn_recovering: 'Un momento, recuperando la conexión…',
    conn_discovering: 'Buscando el teléfono…',
    conn_computer_offline: 'Esta computadora no tiene red. Revise el Wi‑Fi e intente de nuevo.',
    discovery_help_title: 'No encontramos el teléfono',
    discovery_help_body:
      'Ábralo, deje PKEY en pantalla y pulse Reintentar. Los cambios en esta computadora están guardados.',
    discovery_retry: 'Reintentar',
    stay_open_banner:
      'Para volver otro día, abra PKEY en el teléfono y pulse Copiar dirección. Deje esta pestaña abierta mientras trabaja.',
    stay_open_bookmark: 'En esta computadora también puede guardar esta página como favorita.',
    stay_open_dismiss: 'Entendido',
    relogin_prompt: 'Master reconectado — reingresá contraseña',
    relogin_title: 'Reconectá al master',
    relogin_desc:
      'Ingresá tu contraseña maestra para sincronizar, o continuá offline y seguí editando en local.',
    continue_offline: 'Continuar offline',
    readonly_banner:
      'Master desconectado — modo solo lectura. Edición deshabilitada hasta reconectar.',
    vault_fork_banner:
      'Este navegador tiene una bóveda distinta a la del teléfono. Elegí una sesión en el teléfono: un lado reemplaza al otro; no se combinan.',
    vault_fork_waiting: 'Esperando que el teléfono elija qué bóveda conservar',
    vault_fork_locked:
      'La bóveda anterior del navegador sigue cifrada: esta contraseña no la abre.',
    session_expired: 'Sesión expirada por inactividad',
    not_connected: 'Sin conexión',
    write_blocked: 'No se puede guardar en modo solo lectura',
    copied: '¡Copiado!',
    copy_failed: 'Error al copiar',
    sync_error: 'Error de sync',
    sync_error_watchdog: 'Sync agotó su tiempo — se reintenta en segundo plano',
    sync_error_auth: 'Fallo de auth de sync — reingresá tu contraseña maestra',
    sync_error_conflict: 'Conflicto de sync — se conservaron los valores más recientes',
    sync_field_overwrite:
      'Sync fusionó {n} llave(s) con campos en conflicto — se conservó lo más reciente y se rellenaron vacíos.',
    lan_warning: 'HTTP en red local — usá solo en Wi‑Fi de confianza',
    unlock_secrets: 'Desbloquear secretos para editar',
    unlock_edit_helper: 'Introduce tu clave maestra para habilitar la edición',
    save_locked_hint: 'Desbloqueá los secretos para habilitar Guardar',
    unlock_to_save: 'Desbloquear para guardar',
    secret_locked: 'Contenido bloqueado',
    vault_loading: 'Cargando bóveda…',
    stats_loading: 'Calculando estadísticas…',
    verify_password: 'Verificar contraseña maestra',
    verify_unlock_edit_desc:
      'Ingresá tu contraseña maestra para desbloquear los secretos de esta llave.',
    phone_confirm_title: 'Confirmá en el teléfono',
    phone_confirm_desc:
      'Aprobá esta acción con biometría o tu contraseña maestra en la app PKEY. Mantené el teléfono cerca.',
    phone_confirm_use_password: 'Usar contraseña maestra',
    login_bio_btn: 'Desbloquear con biometría del teléfono',
    unlock_sas_title: 'Confirmá en el teléfono',
    unlock_sas_desc:
      'Compará este código de 6 dígitos con la app PKEY y aprobá con Face ID o tu contraseña maestra en el teléfono.',
    unlock_sas_use_password: 'Usar contraseña maestra',
    unlock_sas_connection_lost:
      'Se cortó la conexión con el teléfono. Volvé a tocar el botón de huella.',
    delete_confirm: '¿Eliminar esta llave? No se puede deshacer.',
    title_required: 'El título es obligatorio',
    default_card_name: 'Nueva llave',
    card_type_change_blocked: 'No puedes cambiar el tipo de una llave que ya fue guardada.',
    otp_invalid_secret: 'Usa solo caracteres Base32 (A-Z, 2-7).',
    otp_invalid_uri: 'Esa no es una URI otpauth:// válida.',
    add_phrase_word: 'Añadir palabra semilla',
    generate_replace: '¿Reemplazar la contraseña actual por una generada?',
    tag_note: 'nota',
    link_blocked: 'Ese enlace no se puede abrir.',
    app_link_hint: 'También vinculado a {name} en Android',
    generate: 'Generar',
    synced: 'Sincronizado',
    syncing: 'Sincronizando…',
    offline: 'Sin conexión',
    idle: 'Inactivo',
    readonly: 'Solo lectura',
    login_unlock: 'Desbloquear',
    auth_busy_unlock: 'Desbloqueando…',
    auth_busy_verify: 'Verificando…',
    auth_busy_save: 'Guardando…',
    login_looking: 'Buscando master PKEY en esta red…',
    auth_timeout: 'El desbloqueo agotó su tiempo — reintentá',
    session_id_label: 'Sesión',
    logout: 'Cerrar sesión',
    sync: 'Sync',
    search_placeholder: 'Buscar llaves…',
    new_card: 'Nueva llave',
    edit_card: 'Editar llave',
    no_cards: 'Sin llaves. Tocá + para agregar.',
    no_results: 'Sin resultados',
    incorrect_password: 'Contraseña incorrecta',
    unlock: 'Desbloquear',
    cancel: 'Cancelar',
    confirm: 'Confirmar',
    save: 'Guardar',
    delete: 'Eliminar',
    edit: 'Editar',
    username: 'Usuario',
    password: 'Contraseña',
    seed_phrase: 'Seed phrase',
    url: 'URL',
    notes: 'Notas',
    title: 'Título',
    type_password: 'Contraseña',
    type_seed: 'Seed phrase',
    type_note: 'Nota',
    web_onboard_master: 'Desbloqueá con la misma contraseña maestra que en el móvil.',
    web_onboard_keep_phone:
      'Mantené PKEY abierto en el teléfono. Dejá esta pestaña abierta mientras trabajás.',
    login_password_placeholder: 'Contraseña maestra',

    app_desc: 'Bóveda segura — cliente web',
    login_required: 'Ingresá contraseña maestra',
    vault_title: 'PKEY',
    add_first_card: 'Agregar primera llave',
    no_link_placeholder: 'Sin enlace',
    created_label: 'Creado',
    modified_label: 'Modificado',
    tag_pass: 'clave',
    tag_seed: 'frase',
    hibp_verified: 'verificada por HIBP',
    hibp_breached: 'expuesta por HIBP · {n}',
    hibp_unavailable: 'HIBP no disponible',
    hibp_not_verified: 'no verificada',
    web_vault_sub: 'Bóveda Web',
    gen_not_configured: 'Configurá el generador en ajustes de la app',
    icon_picker_title: 'Seleccionar icono',
    open_link: 'Abrir enlace',
    show: 'Mostrar',
    hide: 'Ocultar',
    otp_secret: 'Secreto OTP (Base32)',
    otp_code: 'Código OTP',
    otp_copy: 'Copiar OTP',
    otp_countdown: 'Renueva en {n}s',
    tags_label: 'Etiquetas',
    card_tags_label: 'Etiquetas',
    card_tags_placeholder: 'Escribe una etiqueta...',
    card_tags_add_hint: 'Pulsa Enter para añadir',
    card_tags_remove: 'Eliminar etiqueta {name}',
    stats_title: 'Estadísticas',
    stats_total: 'Total llaves',
    stats_duplicates: 'Contraseñas duplicadas',
    stats_weak: 'Contraseñas débiles',
    stats_stale: 'Sin actualizar (>3 meses)',
    stats_hibp_checked: 'Revisadas HIBP',
    stats_hibp_breached: 'Expuestas HIBP',
    stats_users: 'Usuarios únicos',
    stats_health_hdr: 'Salud de la bóveda',
    stats_health_score: 'Puntuación de salud',
    stats_health_hint: 'Basada en duplicados, debilidad, antigüedad, 2FA y huecos de datos.',
    stats_password_report: 'Reporte de contraseñas',
    stats_coverage_hdr: 'Cobertura y datos',
    stats_type_password: 'Contraseñas',
    stats_type_secret: 'Frases secretas',
    stats_type_note: 'Notas',
    stats_reused_username: 'Usuarios reutilizados',
    stats_otp_with: 'Con 2FA/OTP',
    stats_otp_without: 'Sin 2FA/OTP',
    stats_otp_coverage: 'Cobertura 2FA',
    stats_empty_username: 'Sin usuario',
    stats_empty_password: 'Sin contraseña',
    stats_empty_link: 'Sin enlace',
    stats_unique_tags: 'Etiquetas únicas',
    stats_untagged: 'Sin etiquetas',
    stats_tombstones: 'Eliminadas (sync)',
    stats_activity_hdr: 'Actividad de llaves',
    stats_oldest_card: 'Más antigua (act.)',
    stats_newest_card: 'Más reciente (act.)',
    stats_session_hdr: 'Sesión',
    stats_auto_logout: 'Autobloqueo de la app',
    stats_web_auto_logout: 'Autobloqueo web',
    stats_web_confirm_on_phone: 'Confirmar en el teléfono',
    stats_web_login_on_phone: 'Desbloquear con el teléfono',
    stats_conn_mode: 'Conexión',
    stats_conn_live: 'En vivo',
    stats_conn_offline: 'Offline',
    stats_conn_other: 'Desconectado',
    stats_offline_vault: 'Bóveda offline',
    stats_yes: 'Sí',
    stats_no: 'No',
    stats_pending_ops: 'Cambios pendientes',
    stats_auto_logout_instant: 'Instantáneo',
    stats_auto_logout_1m: '1 min',
    stats_auto_logout_never: 'Nunca',
    stats_web_auto_logout_5m: '5 min',
    stats_web_auto_logout_15m: '15 min',
    stats_web_auto_logout_1h: '1 hora',
    stats_web_auto_logout_never: 'Nunca',
    settings_title: 'Ajustes',
    theme_title: 'Tema',
    theme_auto: 'Auto',
    theme_light: 'Claro',
    theme_dark: 'Oscuro',
    lang_title: 'Idioma',
    generator_title: 'Generador',
    gen_symbols: 'Símbolos',
    gen_numbers: 'Números',
    gen_uppercase: 'Mayúsculas',
    gen_lowercase: 'Minúsculas',
    auto_collapse: 'Autoplegado',
    group_by_link_accounts: '{n} cuentas',
    tab_cards: 'Llaves',
    tab_stats: 'Stats',
    tab_settings: 'Ajustes',
    import_title: 'Importar',
    offline_banner:
      'Sin conexión — los cambios se guardan localmente y se sincronizarán al reconectar con el master.',
    pending_changes: '{n} cambio(s) pendiente(s)',
    sync_complete: 'Sincronizados {n} cambio(s) offline',
    offline_unlock_hint: 'Master no encontrado — desbloqueá tu bóveda offline',
    offline_unlock_failed: 'No se pudo desbloquear la bóveda offline',
    crash_title: 'Algo salió mal',
    crash_body:
      'PKey encontró un error inesperado. La bóveda en este dispositivo no se modificó. Recargá la página; si se repite, copiá los detalles técnicos.',
    crash_copy_details: 'Copiar detalles técnicos',
    crash_copied: 'Copiado',
  },
};

/**
 * Looks up a localized web UI string and optionally interpolates `{var}` placeholders.
 *
 * @param key - Message key.
 * @param lang - Target language.
 * @param vars - Optional substitution map for `{name}` placeholders.
 * @returns Resolved string (falls back to English, then the raw key).
 */
export function t(key: WebI18nKey, lang: WebLang, vars?: Record<string, string | number>): string {
  let str = STRINGS[lang]?.[key] ?? STRINGS.ING[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(`{${k}}`, String(v));
    }
  }
  return str;
}

/**
 * Derives {@link WebLang} from vault settings (defaults to English).
 *
 * @param settings - App settings or null/undefined.
 * @param localeTag - Browser/device locale used when the preference is `AUTO`.
 * @returns `'ESP'` or `'ING'` (never `'AUTO'`).
 */
export function langFromSettings(settings?: AppSettings | null, localeTag = 'en'): WebLang {
  return resolveUiLanguage(settings?.webLanguage ?? settings?.language, localeTag);
}
