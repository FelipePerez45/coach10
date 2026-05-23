// Integración con Firebase: auth con Google + sync de la BD por workspace + compartir por email.
// El SQLite se sube/baja entero a Firebase Storage; en Firestore guardamos sólo metadatos.

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDGfAOPyRs9Oh7I6RLNnntOcS2FnM_1sYs",
  authDomain: "coach10-6abd7.firebaseapp.com",
  projectId: "coach10-6abd7",
  storageBucket: "coach10-6abd7.firebasestorage.app",
  messagingSenderId: "326819575376",
  appId: "1:326819575376:web:699beeb57bf88ff29d8355",
};

const SYNC_DEBOUNCE_MS = 3000;

const INLINE_BLOB_LIMIT_BYTES = 700 * 1024;  // umbral seguro para caber en doc Firestore (1 MiB)

function uint8ToBase64(u8) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    bin += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function base64ToUint8(base64) {
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function isMobileLikeBrowser() {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

function explainAuthError(e) {
  if (!e) return 'Error desconocido';
  const code = (e.code || '').toString();
  const map = {
    'auth/unauthorized-domain':
      'Este dominio no está autorizado en Firebase. Ve a Firebase → Authentication → Settings → Authorized domains y añade el dominio donde tienes alojada la app (ej. tu-usuario.github.io).',
    'auth/operation-not-allowed':
      'El proveedor Google no está habilitado. Ve a Firebase → Authentication → Sign-in method → Google → Enable.',
    'auth/popup-blocked':
      'El navegador bloqueó la ventana de Google. Permite popups o usa el botón de nuevo (en móvil intentaré redirigir).',
    'auth/popup-closed-by-user':
      'Cerraste la ventana antes de completar el login.',
    'auth/cancelled-popup-request':
      'Otra ventana de login estaba abierta; reintenta.',
    'auth/network-request-failed':
      'Error de red. Comprueba la conexión.',
    'auth/web-storage-unsupported':
      'Tu navegador bloquea cookies / storage. Desactiva el modo privado o "Prevent cross-site tracking" en Safari → Ajustes.',
    'auth/internal-error':
      'Error interno de Firebase. Si persiste, revisa Authentication y reglas.',
  };
  return map[code] || (e.message || code || 'Error al iniciar sesión');
}

const CLOUD = (() => {
  let app, auth, fs;
  let user            = null;
  let workspaceId     = null;
  let workspaceData   = null;
  let unsubWorkspace  = null;
  let unsubAuth       = null;
  let dirty           = false;
  let syncTimer       = null;
  let isPushing       = false;
  let lastPushedId    = null;
  let onReadyResolve;
  const onReadyPromise = new Promise(r => { onReadyResolve = r; });

  const statusListeners = [];
  const workspaceListeners = [];
  let status = 'idle';   // 'idle' | 'signed-out' | 'syncing' | 'synced' | 'pending' | 'offline' | 'error'

  function setStatus(s, detail) {
    status = s;
    statusListeners.forEach(cb => { try { cb(s, detail); } catch (e) { console.error(e); } });
  }

  async function init() {
    try {
      app  = firebase.initializeApp(FIREBASE_CONFIG);
      auth = firebase.auth();
      fs   = firebase.firestore();
    } catch (e) {
      console.error('Firebase init failed', e);
      setStatus('error', e.message);
      onReadyResolve();
      return;
    }

    // Cache offline de Firestore (best effort, no crítico)
    try { await fs.enablePersistence({ synchronizeTabs: true }); } catch (_) { /* ignore */ }

    // Recoge el resultado de un redirect previo (login móvil). Si no había, no hace nada.
    try { await auth.getRedirectResult(); }
    catch (e) {
      console.error('getRedirectResult', e);
      setStatus('error', explainAuthError(e));
    }

    unsubAuth = auth.onAuthStateChanged(async (u) => {
      user = u || null;
      if (!user) {
        setStatus('signed-out');
        workspaceId = null;
        workspaceData = null;
        notifyWorkspace();
        onReadyResolve();
        return;
      }
      try {
        await onSignedIn();
      } catch (e) {
        console.error('signed-in flow failed', e);
        setStatus('error', e.message);
      }
      onReadyResolve();
    });
  }

  function ready() { return onReadyPromise; }

  async function signIn() {
    if (!auth) throw new Error('Firebase no inicializado');
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      if (isMobileLikeBrowser()) {
        // En iOS/Android los popups suelen fallar; redirige.
        setStatus('syncing');
        await auth.signInWithRedirect(provider);
        // La página se recarga; al volver, onAuthStateChanged completa el login.
      } else {
        await auth.signInWithPopup(provider);
      }
    } catch (e) {
      // Fallback: si popup falla en escritorio, intenta redirect
      if (!isMobileLikeBrowser() && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) {
        try { await auth.signInWithRedirect(provider); return; } catch (_) {}
      }
      console.error('signIn failed', e);
      throw e;
    }
  }

  async function signOut() {
    if (unsubWorkspace) { unsubWorkspace(); unsubWorkspace = null; }
    workspaceId = null;
    workspaceData = null;
    if (auth) await auth.signOut();
    setStatus('signed-out');
    notifyWorkspace();
  }

  async function onSignedIn() {
    setStatus('syncing');
    // 1) Busca workspace propio
    const owned = await fs.collection('workspaces')
      .where('owner_uid', '==', user.uid).limit(1).get();

    if (owned.empty) {
      // Crea uno nuevo desde el contenido local
      const ref = await fs.collection('workspaces').add({
        name:         `Workspace de ${user.displayName || user.email}`,
        owner_uid:    user.uid,
        owner_email:  user.email,
        member_emails:[user.email],
        snapshot_id:   null,
        snapshot_inline: null,
        created_at:    firebase.firestore.FieldValue.serverTimestamp(),
        updated_at:    firebase.firestore.FieldValue.serverTimestamp(),
      });
      workspaceId = ref.id;
      subscribeToWorkspace();
      // Sube el contenido local actual como primer snapshot
      dirty = true;
      await pushSnapshot();
    } else {
      const docSnap = owned.docs[0];
      workspaceId = docSnap.id;
      workspaceData = docSnap.data();
      subscribeToWorkspace();
      // Decidir push vs pull
      const localHasData = countLocalCombos() > 0;
      const cloudHasData = !!workspaceData.snapshot_inline;
      if (cloudHasData && !localHasData) {
        await pullSnapshot();
      } else if (cloudHasData && localHasData) {
        const useCloud = confirm(
          `Tienes datos en este dispositivo y también en la nube.\n\n` +
          `• Aceptar → Sustituir local por los de la nube\n` +
          `• Cancelar → Subir los datos locales y sobreescribir la nube`
        );
        if (useCloud) await pullSnapshot();
        else { dirty = true; await pushSnapshot(); }
      } else if (!cloudHasData && localHasData) {
        dirty = true;
        await pushSnapshot();
      } else {
        setStatus('synced');
      }
    }
    notifyWorkspace();
  }

  function subscribeToWorkspace() {
    if (unsubWorkspace) unsubWorkspace();
    unsubWorkspace = fs.collection('workspaces').doc(workspaceId)
      .onSnapshot(async (snap) => {
        if (!snap.exists) return;
        if (isPushing) return;
        const data = snap.data();
        workspaceData = data;
        notifyWorkspace();

        // Si la última snapshot la subió otro dispositivo, baja la BD
        if (data.snapshot_id && data.snapshot_id !== lastPushedId && data.snapshot_inline) {
          try {
            await pullSnapshot();
          } catch (e) {
            console.error('pull failed', e);
            setStatus('error', e.message);
          }
        }
      }, err => {
        console.error('workspace listener error', err);
        setStatus('error', err.message);
      });
  }

  async function pullSnapshot() {
    if (!workspaceData || !workspaceData.snapshot_inline) return;
    setStatus('syncing');
    const blob = base64ToUint8(workspaceData.snapshot_inline);
    await DB.replaceFromBlob(blob);
    lastPushedId = workspaceData.snapshot_id;
    setStatus('synced');
    if (window.refreshCurrentView) window.refreshCurrentView();
  }

  function markDirty() {
    if (!user || !workspaceId) return;
    dirty = true;
    setStatus('pending');
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => { pushSnapshot().catch(e => console.error(e)); }, SYNC_DEBOUNCE_MS);
  }

  async function syncNow() {
    if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
    if (dirty) await pushSnapshot();
  }

  async function pushSnapshot() {
    if (!user || !workspaceId) return;
    if (!dirty) return;
    isPushing = true;
    try {
      setStatus('syncing');
      const blob = DB.exportBlob();
      if (blob.byteLength > INLINE_BLOB_LIMIT_BYTES) {
        throw new Error(`BD demasiado grande (${Math.round(blob.byteLength/1024)} KB). Quita fotos antiguas o activa Firebase Storage. Sincronización pausada.`);
      }
      const id   = (crypto.randomUUID && crypto.randomUUID()) || ('id-' + Date.now() + '-' + Math.random());
      const inline = uint8ToBase64(blob);
      await fs.collection('workspaces').doc(workspaceId).update({
        snapshot_id:     id,
        snapshot_inline: inline,
        snapshot_size:   blob.byteLength,
        snapshot_at:     firebase.firestore.FieldValue.serverTimestamp(),
        updated_at:      firebase.firestore.FieldValue.serverTimestamp(),
      });
      lastPushedId = id;
      dirty = false;
      setStatus('synced');
    } catch (e) {
      console.error('push failed', e);
      setStatus('error', e.message);
      throw e;
    } finally {
      isPushing = false;
    }
  }

  function countLocalCombos() {
    try { return DB.listCombos().length; } catch (e) { return 0; }
  }

  // ---- Compartir workspace ----------------------------------------------

  async function invite(email) {
    if (!workspaceId) throw new Error('No workspace activo');
    const norm = email.toLowerCase().trim();
    if (!norm) throw new Error('Email vacío');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(norm)) throw new Error('Email no válido');
    await fs.collection('workspaces').doc(workspaceId).update({
      member_emails: firebase.firestore.FieldValue.arrayUnion(norm),
      updated_at:    firebase.firestore.FieldValue.serverTimestamp(),
    });
  }

  async function uninvite(email) {
    if (!workspaceId) throw new Error('No workspace activo');
    if (email === workspaceData.owner_email) throw new Error('No puedes quitar al propietario');
    await fs.collection('workspaces').doc(workspaceId).update({
      member_emails: firebase.firestore.FieldValue.arrayRemove(email.toLowerCase().trim()),
      updated_at:    firebase.firestore.FieldValue.serverTimestamp(),
    });
  }

  function notifyWorkspace() {
    workspaceListeners.forEach(cb => { try { cb(workspaceData); } catch (e) { console.error(e); } });
  }

  return {
    init, ready,
    signIn, signOut,
    currentUser:     () => user,
    currentWorkspace:() => workspaceData,
    workspaceId:     () => workspaceId,
    isAuthenticated: () => !!user,
    status:          () => status,
    onStatus:        (cb) => { statusListeners.push(cb); cb(status); },
    onWorkspace:     (cb) => { workspaceListeners.push(cb); cb(workspaceData); },
    markDirty,
    syncNow,
    invite, uninvite,
    explainError: explainAuthError,
  };
})();

window.CLOUD = CLOUD;
