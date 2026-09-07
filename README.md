# Mi Vida 🧬 — App personal de Emmanuel

App web para llevar el registro de tu día a día: **dinero, comida, gym y universidad**, con un **coach de IA** (Claude) que te da recomendaciones usando tus datos reales.

- 📱 Pensada para el móvil (se instala como app).
- 🔒 **Todo se guarda solo en tu teléfono** (localStorage). Sin cuentas, sin servidor, sin que nadie más vea tus datos.
- ⚡ Se actualiza sola cada vez que registras algo.

---

## ¿Qué hace?

### 💰 Dinero
- Defines tu dinero semanal (ej. $7,000).
- Categorías: mandado/alimentos, gastos hormiga 🐜, inversiones, deudas, psicólogo, suscripciones y libre.
- Te sugiere **cómo repartir** el dinero y te avisa si te estás pasando o si los gastos hormiga suben.
- Ves cuánto te queda y **cuánto puedes gastar por día** sin pasarte.

### 🍽️ Comida
- Con tu **peso, altura, edad, sexo y meta**, calcula tus calorías y macros (fórmula Mifflin-St Jeor).
- Te dice las **porciones caseras** de cada comida ("1.5 palmas de pechuga, 1 taza de arroz…").
- Si entrenaste fuerte hoy, sube un poco las porciones para que no te desgastes.
- Contador de vasos de agua.

### 🏋️ Gym
- Defines tu **rutina por día** (tú pones los ejercicios).
- Registras tus entrenos (duración e intensidad).
- Checklist de **suplementos** (creatina, omega 3, proteína…) que marcas cada día.

### 🎓 Universidad
- Agregas tareas con **materia y fecha límite**.
- La app te **sugiere cuándo hacer cada una** y te avisa cuando están cerca.

### ✦ Coach (IA)
Un botón arriba a la derecha. Le preguntas en lenguaje natural ("¿cómo reparto mejor mi dinero?", "¿qué como hoy?") y responde usando **tus datos reales de hoy**. Funciona con tu propia API key de Anthropic (ver abajo).

---

## Cómo usarla en tu móvil

1. Abre la app (ver "Publicar" abajo).
2. En el navegador del móvil, menú → **"Agregar a pantalla de inicio"**.
3. Se abre como una app normal, incluso sin internet.

## Activar el Coach de IA

1. Entra a <https://console.anthropic.com/settings/keys> y crea una **API key** (empieza con `sk-ant-`).
2. En la app: **⚙️ Ajustes → API Key**, pégala y guarda.
3. Listo. Tu key se guarda **solo en tu teléfono** y solo se usa para hablar con Claude.

> Costo aproximado de uso personal: unos pocos dólares al mes con el modelo Haiku. Puedes cambiar de modelo en Ajustes.

---

## Publicar la app (GitHub Pages, gratis)

1. En GitHub → **Settings → Pages**.
2. En "Source", elige la rama `claude/personal-life-tracker-app-uf2u5e` (o `main` si ya la fusionaste) y carpeta `/root`.
3. Guarda. En un minuto te da una URL tipo `https://tu-usuario.github.io/continuidad-de-proyecto/`.
4. Abre esa URL en tu móvil e instálala.

> El coach y las notificaciones necesitan que la app se abra por **https** (como GitHub Pages), no como archivo local.

---

## Respaldo de tus datos

Como todo vive en tu teléfono, en **⚙️ Ajustes** puedes:
- **Respaldar datos** → descarga un archivo `.json`.
- **Restaurar** → vuelve a cargar ese archivo (útil al cambiar de teléfono).

---

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | La app (estructura y estilos). |
| `app.js` | Toda la lógica: dinero, nutrición, gym, tareas y coach. |
| `manifest.webmanifest` | Para instalarla como app. |
| `sw.js` | Para que funcione sin internet. |
| `icon.svg` | Ícono de la app. |

---

## Próximas fases (lo que iremos agregando)

- 🔔 Recordatorios que lleguen aunque la app esté cerrada (necesita un pequeño servidor).
- 📊 Gráficas de progreso de peso y gastos por mes.
- 💼 Sección de trabajo y agenda combinada.

Hecho para Emmanuel. Se va construyendo poco a poco. 🚀
