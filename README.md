# StudioAI - Salon de Fotos

Aplicación de edición de imágenes profesional con eliminación de fondo y herramientas de recorte manual.
Backend: Python (FastAPI + rembg + OpenCV)
Frontend: React (Vite + TypeScript)

## 🚀 Cómo ejecutar

Necesitas abrir **dos terminales** diferentes para ejecutar el backend y el frontend simultáneamente.

### Terminal 1: Backend (Servidor de Procesamiento)
Este servidor maneja la IA para quitar el fondo y los ajustes de imagen.

```bash
cd server
# (Opcional) Crea un entorno virtual
# py -m venv venv
# .\venv\Scripts\activate

# Instala las dependencias (solo la primera vez)
pip install -r requirements.txt

# Inicia el servidor
py main.py
```
El servidor backend estará escuchando en: `http://localhost:8000`

### Terminal 2: Frontend (Interfaz de Usuario)
Esta es la aplicación web que verás en tu navegador.

```bash
# Instala las dependencias (solo la primera vez)
npm install

# Inicia el servidor de desarrollo
cmd /c "npm run dev"
```
La aplicación se abrirá automáticamente o podrás verla en: `http://localhost:5173`

---

## 🔄 Cómo actualizar los terminales

Si el código ha cambiado y necesitas actualizar los servidores:

**Terminal 2 (Frontend):**
*   Generalmente se actualiza **automáticamente**. Simplemente guarda los archivos y ve a tu navegador.
*   Si necesitas reiniciar: Pulsa `Ctrl + C`, escribe `S` (Sí) para terminar, y vuelve a ejecutar `cmd /c "npm run dev"`.

**Terminal 1 (Backend):**
*   Debes reiniciarlo manualmente para aplicar cambios en Python.
*   Pulsa `Ctrl + C` en la terminal para detenerlo.
*   Vuelve a ejecutar `py main.py`.

---

## Funcionalidades Principales

*   **Subida por Lotes**: Arrastra y suelta múltiples imágenes.
*   **Procesamiento Inteligente**: Elimina el fondo de todas las imágenes con un clic.
*   **Editor Manual**:
    *   **Recorte**: Herramienta de pincel para borrar o restaurar partes de la imagen original.
    *   **Ajustes**: Control deslizante para Brillo, Saturación y Contraste.
    *   **Efectos**: Añadir sombra suave.
*   **Descarga**: Descarga las imágenes procesadas individualmente o todas juntas en un ZIP.
