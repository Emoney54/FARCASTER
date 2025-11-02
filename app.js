// petit helper DOM
const $ = (id) => document.getElementById(id);

// --- LOG SYSTEM -------------------------------------------------
function log(msg) {
  const box = $('log-box');
  const line = document.createElement('div');
  line.className = 'log-line';
  line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
  console.log(msg);
}

// --- STATE LOCAL ------------------------------------------------
// On stocke les choses dans localStorage pour les retrouver au refresh
const STATE_KEY = 'mammouth-app-state-v1';

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STATE_KEY)) || {
      gmStreak: 0,
      lastGMDate: null,
      pollYes: 0,
      pollNo: 0,
      walletAddress: null,
    };
  } catch {
    return {
      gmStreak: 0,
      lastGMDate: null,
      pollYes: 0,
      pollNo: 0,
      walletAddress: null,
    };
  }
}

function saveState() {
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

let state = loadState();

// --- GM STREAK LOGIC -------------------------------------------
// règle streak :
// - si tu cliques "GM" aujourd'hui et c'est un nouveau jour => streak++
// - si tu recliques le même jour => pas +1
// - si tu reviens après avoir "skippé" un jour => streak = 1
function sameDay(d1, d2) {
  if (!d1 || !d2) return false;
  const A = new Date(d1);
  const B = new Date(d2);
  return (
    A.getFullYear() === B.getFullYear() &&
    A.getMonth() === B.getMonth() &&
    A.getDate() === B.getDate()
  );
}

function isYesterday(d1, d2) {
  // d1 = yesterday of d2 ?
  const A = new Date(d1);
  const B = new Date(d2);
  const diffMs = B - A;
  const oneDay = 24 * 60 * 60 * 1000;
  return diffMs > 0 && diffMs <= oneDay * 1.5 &&
    A.getDate() !== B.getDate(); // évite même jour
}

function handleGMClick() {
  const today = new Date();
  const last = state.lastGMDate ? new Date(state.lastGMDate) : null;

  if (!last) {
    // premier GM ever
    state.gmStreak = 1;
    state.lastGMDate = today.toISOString();
    log('Premier GM envoyé. Streak = 1');
  } else if (sameDay(today, last)) {
    log('Tu as déjà dit GM aujourd\'hui.');
  } else {
    // pas le même jour
    if (isYesterday(last, today)) {
      // streak continue
      state.gmStreak += 1;
      log('Nouveau jour consécutif, streak +1');
    } else {
      // streak cassé, on recommence
      state.gmStreak = 1;
      log('Streak perdu, on repart à 1');
    }
    state.lastGMDate = today.toISOString();
  }

  saveState();
  refreshGMUI();
}

function refreshGMUI() {
  $('streak-count').textContent = state.gmStreak;

  if (!state.lastGMDate) {
    $('gm-today-status').textContent = '0';
    $('gm-note').textContent = 'Tu n\'as pas encore envoyé ton GM aujourd\'hui.';
    return;
  }

  const today = new Date();
  const last = new Date(state.lastGMDate);

  if (sameDay(today, last)) {
    $('gm-today-status').textContent = '✅';
    $('gm-note').textContent = 'GM déjà envoyé aujourd\'hui, gg.';
  } else {
    $('gm-today-status').textContent = '0';
    $('gm-note').textContent = 'Tu n\'as pas encore envoyé ton GM aujourd\'hui.';
  }
}

// --- POLL LOGIC ------------------------------------------------
function vote(choice) {
  if (choice === 'yes') {
    state.pollYes += 1;
    log('Vote OUI enregistré');
  } else if (choice === 'no') {
    state.pollNo += 1;
    log('Vote NON enregistré');
  }
  saveState();
  refreshPollUI();
}

function resetPoll() {
  state.pollYes = 0;
  state.pollNo = 0;
  saveState();
  refreshPollUI();
  log('Votes réinitialisés');
}

function refreshPollUI() {
  const yes = state.pollYes;
  const no = state.pollNo;
  const total = yes + no;

  let pctYes = 0;
  let pctNo = 0;
  if (total > 0) {
    pctYes = Math.round((yes / total) * 100);
    pctNo = Math.round((no / total) * 100);
  }

  $('pct-yes').textContent = pctYes + '%';
  $('pct-no').textContent = pctNo + '%';
  $('bar-yes').style.width = pctYes + '%';
  $('bar-no').style.width = pctNo + '%';
  $('poll-meta').textContent = `${total} vote${total > 1 ? 's' : ''} total`;
}

// --- WALLET LOGIC ----------------------------------------------

async function connectWallet() {
  // priorité: sdk Farcaster (dans Warpcast), sinon MetaMask
  const sdk = window.farcasterSDK;

  if (sdk) {
    // ici on ESSAIE d'utiliser le contexte mini-app (selon la doc miniapps.farcaster.xyz)
    try {
      log('Tentative récupération contexte Farcaster...');
      const context = await sdk.context;
      if (context && context.wallet && context.wallet.address) {
        state.walletAddress = context.wallet.address;
        saveState();
        refreshWalletUI();
        log('Wallet récupéré via Farcaster: ' + context.wallet.address);
        return;
      } else {
        log('Aucun wallet direct dans le contexte Farcaster.');
      }
    } catch (err) {
      log('Erreur contexte Farcaster: ' + err.message);
    }
  }

  // fallback navigateur: MetaMask / wallet EVM standard
  if (typeof window.ethereum === 'undefined') {
    log('MetaMask non détecté.');
    alert('Pas de wallet détecté. Installe MetaMask.');
    return;
  }

  try {
    log('Connexion MetaMask...');
    const accounts = await window.ethereum.request({
      method: 'eth_requestAccounts',
    });
    if (accounts && accounts.length > 0) {
      state.walletAddress = accounts[0];
      saveState();
      refreshWalletUI();
      log('Wallet MetaMask connecté: ' + accounts[0]);
    } else {
      log('Aucun compte MetaMask renvoyé.');
    }
  } catch (err) {
    log('Erreur MetaMask: ' + err.message);
    alert('Impossible de se connecter au wallet.');
  }
}

function refreshWalletUI() {
  const addr = state.walletAddress;
  if (!addr) {
    $('wallet-address').textContent = 'Aucun wallet connecté';
  } else {
    // on coupe l’adresse pour l’affichage
    const short = addr.slice(0, 6) + '...' + addr.slice(-4);
    $('wallet-address').textContent = `Connecté: ${short}`;
  }
}

// --- USER / CONTEXTE FARCASTER --------------------------------
async function connectUser() {
  const sdk = window.farcasterSDK;
  if (!sdk) {
    log('SDK pas dispo => mode invité');
    alert('Connexion utilisateur dispo seulement dans Farcaster.');
    return;
  }

  try {
    log('Demande infos utilisateur via SDK...');
    // dans la logique Farcaster Mini App, context.user contient fid / username
    const context = await sdk.context;
    if (context && context.user) {
      updateUserBox(context.user);
      log('Utilisateur Farcaster détecté: ' + context.user.username);
    } else {
      log('Pas d’utilisateur dans le contexte. Auth peut être requise.');
      if (sdk.actions && sdk.actions.signIn) {
        const nonce = Math.random().toString(36).slice(2);
        const result = await sdk.actions.signIn({ nonce });
        log('signIn résultat brut: '+ JSON.stringify(result));
        // après signIn, tu pourrais relire sdk.context
        const ctx2 = await sdk.context;
        if (ctx2 && ctx2.user) {
          updateUserBox(ctx2.user);
          log('Utilisateur authentifié: ' + ctx2.user.username);
        }
      }
    }
  } catch (err) {
    log('Erreur connectUser: ' + err.message);
    alert("Impossible de récupérer l'utilisateur.");
  }
}

function updateUserBox(user) {
  if (!user) return;
  $('user-name').textContent = user.displayName || user.username || 'User';
  $('user-id').textContent = `fid: ${user.fid ?? 'inconnu'}`;
}

// --- ENV HINT --------------------------------------------------
async function refreshEnvHint() {
  const sdk = window.farcasterSDK;
  if (!sdk) {
    $('env-hint').textContent = "Mode hors Farcaster (dev local / navigateur).";
    return;
  }
  try {
    const context = await sdk.context;
    if (context && context.client) {
      $('env-hint').textContent =
        `Client: ${context.client.name || 'Farcaster'} • safeAreaInsets: ${JSON.stringify(context.client.safeAreaInsets || {})}`;
    } else {
      $('env-hint').textContent = "SDK détecté mais contexte partiel.";
    }
  } catch (err) {
    $('env-hint').textContent = "SDK présent mais échec lecture contexte.";
  }
}

// --- INIT GLOBAL ----------------------------------------------
window.initMiniApp = function initMiniApp() {
  log('initMiniApp appelé ✅');

  // brancher les boutons
  $('btn-send-gm').addEventListener('click', handleGMClick);
  $('btn-connect-wallet').addEventListener('click', connectWallet);
  $('btn-connect-user').addEventListener('click', connectUser);

  document.querySelectorAll('.poll-options .btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const choice = btn.getAttribute('data-vote');
      vote(choice);
    });
  });

  $('btn-reset-poll').addEventListener('click', resetPoll);
  $('btn-clear-log').addEventListener('click', () => {
    $('log-box').innerHTML = '';
    log('Logs nettoyés');
  });

  // refresh UI initiale
  refreshGMUI();
  refreshPollUI();
  refreshWalletUI();
  refreshEnvHint();
};
