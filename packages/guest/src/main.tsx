import React from 'react'
import ReactDOM from 'react-dom/client'
import { DemoMiniApp } from './DemoMiniApp'
import { MiniAppPage } from './packlets/guest'
import './main.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <MiniAppPage miniApp={DemoMiniApp} />
  </React.StrictMode>,
)
