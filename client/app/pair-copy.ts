// Phone-as-controller copy in en / zh / es / fr (claude-auth). DOM-free so it can be unit-tested.
import { LOCALES, type Locale } from '../../shared/i18n/locale';

let current: () => Locale = () => 'en';
/** pair.ts wires the app locale in; tests use trIn(). */
export const useLocale = (fn: () => Locale) => { current = fn; };
const locale = () => current();

// ---------- copy (en / zh / es / fr) ----------
// Hand-written so the panel is localized without touching the shared catalog; re-rendered on language change.
const COPY = {
  useTitle: ['📱 Use your phone as the controller', '📱 用手机当手柄', '📱 Usa tu móvil como mando', '📱 Utilisez votre téléphone comme manette'],
  openOn: ['Open {0} on your phone, signed in as {1}.', '在手机上打开 {0}，并用 {1} 登录。', 'Abre {0} en tu móvil con la sesión de {1}.', 'Ouvrez {0} sur votre téléphone, connecté en tant que {1}.'],
  stays: ['The fight stays on this screen; the phone moves your hero.', '战斗画面留在这块屏幕上，手机负责操控你的英雄。', 'La pelea se queda en esta pantalla; el móvil mueve a tu héroe.', 'Le combat reste sur cet écran ; le téléphone dirige votre héros.'],
  room: ['room', '房间', 'sala', 'salon'],
  copy: ['copy link', '复制链接', 'copiar enlace', 'copier le lien'],
  copied: ['copied ✓', '已复制 ✓', 'copiado ✓', 'copié ✓'],
  signInBoth: ['Sign in with GitHub here and on your phone. The same account links them.', '在这里和手机上都用 GitHub 登录，同一个账号会把两台设备连在一起。', 'Inicia sesión con GitHub aquí y en tu móvil. La misma cuenta los vincula.', 'Connectez-vous avec GitHub ici et sur votre téléphone. Le même compte les relie.'],
  connect: ['Connect GitHub', '连接 GitHub', 'Conectar GitHub', 'Connecter GitHub'],
  connected: ['📱 Phone connected ✓', '📱 手机已连接 ✓', '📱 Móvil conectado ✓', '📱 Téléphone connecté ✓'],
  connectedSub: ['Your phone drives this hero. Watch the fight here.', '手机正在操控这个英雄，在这里看战斗。', 'Tu móvil controla a este héroe. Mira la pelea aquí.', 'Votre téléphone dirige ce héros. Regardez le combat ici.'],
  disconnect: ['disconnect', '断开', 'desconectar', 'déconnecter'],
  offerTitle: ['📱 Controller mode', '📱 手柄模式', '📱 Modo mando', '📱 Mode manette'],
  offerUse: ['Use this phone as the controller for your seat on the big screen', '把这台手机当作大屏幕上你的座位的手柄', 'Usar este móvil como mando de tu puesto en la pantalla grande', 'Utiliser ce téléphone comme manette pour votre place sur le grand écran'],
  offerSeat: ['signed in as {0} · your seat: {1}', '已登录 {0} · 你的座位：{1}', 'sesión de {0} · tu puesto: {1}', 'connecté en tant que {0} · votre place : {1}'],
  offerTakeover: ['Another phone is linked now. This one will take over.', '已有另一台手机连接，这台会接管控制。', 'Ya hay otro móvil vinculado. Este tomará el control.', 'Un autre téléphone est relié. Celui-ci prendra le relais.'],
  offerPlayHere: ['play on this phone instead', '改为在这台手机上玩', 'jugar en este móvil', 'jouer sur ce téléphone'],
  offerSignIn: ['Sign in with GitHub to link this phone to your seat on the big screen.', '用 GitHub 登录，把这台手机连到大屏幕上你的座位。', 'Inicia sesión con GitHub para vincular este móvil a tu puesto en la pantalla grande.', 'Connectez-vous avec GitHub pour relier ce téléphone à votre place sur le grand écran.'],
  linking: ['linking…', '连接中…', 'vinculando…', 'connexion…'],
  tryAgain: ['try again', '重试', 'reintentar', 'réessayer'],
  ctrl: ['CONTROLLER', '手柄', 'MANDO', 'MANETTE'],
  linked: ['linked', '已连接', 'vinculado', 'relié'],
  reconnecting: ['reconnecting…', '重新连接中…', 'reconectando…', 'reconnexion…'],
  look: ['Look at your big screen 👀', '看你的大屏幕 👀', 'Mira tu pantalla grande 👀', 'Regardez votre grand écran 👀'],
  waiting: ['waiting for the host to start…', '等待房主开始…', 'esperando a que el anfitrión empiece…', 'en attente du lancement par l\'hôte…'],
  noHero: ['pick your repo on the big screen', '在大屏幕上选择你的仓库', 'elige tu repo en la pantalla grande', 'choisissez votre dépôt sur le grand écran'],
  fight: ['FIGHT!', '开战！', '¡A PELEAR!', 'COMBAT !'],
  downed: ['DOWNED: a teammate can revive you', '倒地：队友可以救你', 'DERRIBADO: un compañero puede revivirte', 'À TERRE : un coéquipier peut vous relever'],
  victory: ['VICTORY', '胜利', 'VICTORIA', 'VICTOIRE'],
  defeat: ['DEFEAT', '失败', 'DERROTA', 'DÉFAITE'],
  hp: ['HP', '生命', 'VIDA', 'PV'],
  armor: ['ARMOR', '护甲', 'ARMADURA', 'ARMURE'],
  energy: ['ENERGY', '能量', 'ENERGÍA', 'ÉNERGIE'],
  dash: ['DASH', '冲刺', 'ESQUIVA', 'ESQUIVE'],
  skill: ['SKILL', '技能', 'HABILIDAD', 'COMPÉTENCE'],
  ready: ['READY', '就绪', 'LISTO', 'PRÊT'],
  sensorMotion: ['● motion', '● 体感', '● movimiento', '● mouvement'],
  sensorTouch: ['● touch', '● 触控', '● táctil', '● tactile'],
  recal: ['⟲ recalibrate', '⟲ 重新校准', '⟲ recalibrar', '⟲ recalibrer'],
  padTouch: ['drag to move · tap = attack', '拖动移动 · 轻点攻击', 'arrastra para moverte · toca = atacar', 'glissez pour bouger · touchez = attaquer'],
  padMotion: ['tilt to move · swing = attack', '倾斜移动 · 挥动攻击', 'inclina para moverte · agita = atacar', 'inclinez pour bouger · balancez = attaquer'],
  unlinked: ['Phone disconnected', '手机已断开', 'Móvil desconectado', 'Téléphone déconnecté'],
  error: ['Phone disconnected', '手机已断开', 'Móvil desconectado', 'Téléphone déconnecté'],
  replaced: ['Another phone took over the controls', '另一台手机接管了控制', 'Otro móvil tomó el control', 'Un autre téléphone a pris les commandes'],
  kicked: ['You were removed from this room by the host.', '你已被房主移出这个房间。', 'El anfitrión te quitó de esta sala.', 'L\'hôte vous a retiré de ce salon.'],
  relink: ['link this phone again', '重新连接这台手机', 'vincular este móvil otra vez', 'relier ce téléphone à nouveau'],
  home: ['back to start', '返回首页', 'volver al inicio', 'retour à l\'accueil'],
  // headset (required) variant
  reqHead: ['🥽 Connect your phone to play', '🥽 连接手机后才能开始', '🥽 Conecta tu móvil para jugar', '🥽 Connectez votre téléphone pour jouer'],
  reqWhy: ['Your headset shows the fight. Your phone is the controller.', '头显负责显示战斗，手机就是你的手柄。', 'El visor muestra la pelea. Tu móvil es el mando.', 'Le casque affiche le combat. Votre téléphone sert de manette.'],
  step1: ['Sign in with GitHub here', '在这里用 GitHub 登录', 'Inicia sesión con GitHub aquí', 'Connectez-vous avec GitHub ici'],
  step1Done: ['Signed in as {0}', '已登录为 {0}', 'Sesión iniciada como {0}', 'Connecté en tant que {0}'],
  step2: ['On your phone, open', '在手机上打开', 'En tu móvil, abre', 'Sur votre téléphone, ouvrez'],
  step2As: ['signed in as {0}', '并以 {0} 登录', 'con la sesión de {0}', 'connecté en tant que {0}'],
  step2Same: ['signed in with the same GitHub account', '并用同一个 GitHub 账号登录', 'con la misma cuenta de GitHub', 'avec le même compte GitHub'],
  step3: ['Tap “{0}”', '点按“{0}”', 'Toca «{0}»', 'Touchez « {0} »'],
  waitSignIn: ['Sign in first, then link your phone', '请先登录，再连接手机', 'Primero inicia sesión y luego vincula tu móvil', 'Connectez-vous d\'abord, puis reliez votre téléphone'],
  waitPhone: ['Waiting for your phone…', '正在等待你的手机…', 'Esperando tu móvil…', 'En attente de votre téléphone…'],
  pairedChoose: ['📱 Phone connected ✓ · choose controls on your phone', '📱 手机已连接 ✓ · 请在手机上选择操作方式', '📱 Móvil conectado ✓ · elige los controles en tu móvil', '📱 Téléphone connecté ✓ · choisissez les commandes sur le téléphone'],
  pairedReady: ['📱 Phone connected ✓ · ready to fight', '📱 手机已连接 ✓ · 准备战斗', '📱 Móvil conectado ✓ · listo para pelear', '📱 Téléphone connecté ✓ · prêt au combat'],
} as const satisfies Record<string, readonly [string, string, string, string]>;
type CopyKey = keyof typeof COPY;
/** Localized copy; {0}, {1} are filled from args. */
export function tr(key: CopyKey, ...args: (string | number)[]): string {
  return trIn(locale(), key, ...args);
}
export function trIn(lang: Locale, key: CopyKey, ...args: (string | number)[]): string {
  const i = Math.max(0, LOCALES.indexOf(lang));
  return COPY[key][i].replace(/\{(\d)\}/g, (_, n) => String(args[Number(n)] ?? ''));
}
export const PAIR_COPY = COPY; // tests: every key has four non-empty rows
