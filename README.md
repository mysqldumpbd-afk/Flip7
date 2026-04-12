# 🃏 FLIP 7 — Race to 200!

App web para llevar el marcador del juego de cartas Flip 7.

## Características
- 📷 Escaneo de cartas con IA (Claude)
- 🔥 Sincronización en tiempo real con Firebase Firestore
- 🔑 Sistema de salas con código de 4 letras
- 📺 Modo espectador (solo marcador)
- 🏆 Tabla de avance por rondas
- 💾 Historial de sesiones local

---

## Despliegue en GitHub Pages

### Paso 1 — Subir a GitHub

1. Crea un repositorio nuevo en [github.com](https://github.com) (ej. `flip7-app`)
2. Sube estos 3 archivos:
   - `index.html`
   - `styles.css`
   - `app.js`

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/TU_USUARIO/flip7-app.git
git push -u origin main
```

### Paso 2 — Activar GitHub Pages

1. Ve a tu repo → **Settings** → **Pages**
2. Source: **Deploy from a branch**
3. Branch: **main** / folder: **/ (root)**
4. Haz click en **Save**
5. En ~2 minutos tendrás tu URL: `https://TU_USUARIO.github.io/flip7-app`

---

## Configuración Firebase

### Reglas de Firestore
Ve a **Firebase Console → Firestore → Reglas** y pega:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /rooms/{roomId} {
      allow read, write: if true;
    }
  }
}
```

### Dominios autorizados (opcional)
Si tienes problemas con Authentication:
**Firebase Console → Authentication → Settings → Authorized domains**
Agrega tu dominio de GitHub Pages.

---

## Cómo jugar

1. **Host** abre la app y toca **CREAR NUEVO JUEGO**
2. Ingresa los nombres de todos los jugadores → **CREAR SALA**
3. El host comparte el **código de 4 letras** con todos
4. Cada jugador abre la app en su celular → **UNIRME CON CÓDIGO**
5. El espectador (TV, tablet) usa **MODO ESPECTADOR** con el mismo código

### En cada ronda:
- 📷 **Escanear** — toma foto de tus cartas, la IA las cuenta
- 0️⃣ **Cero** — si no tienes puntos esa ronda  
- ✏️ **Manual** — captura el número tú mismo
- Cuando todos tengan su puntaje → el host toca **CERRAR RONDA**

**¡El primero en llegar a 200 puntos gana!** 🏆
