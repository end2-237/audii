import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import './styles/app.css'
import App from './App'
import { AudiiProvider } from './state/AudiiProvider'

// Le drag & drop de fichiers dans la fenêtre ne doit jamais naviguer.
window.addEventListener('dragover', (event) => event.preventDefault())
window.addEventListener('drop', (event) => event.preventDefault())

const container = document.getElementById('root')
if (!container) throw new Error('#root introuvable')

createRoot(container).render(
  <StrictMode>
    <AudiiProvider>
      <App />
    </AudiiProvider>
  </StrictMode>
)
