import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Overlay } from './Overlay';
import './overlay.css';

createRoot(document.getElementById('overlay-root')!).render(
  <StrictMode>
    <Overlay />
  </StrictMode>,
);
