import { StudioProvider, useStudio } from './context/StudioContext';
import { StudioLayout } from './components/studio/StudioLayout';
import { ImageCanvas } from './components/studio/ImageCanvas';
import { PromptPanel } from './components/controls/PromptPanel';
import { Header } from './components/layout/Header';
import { Dashboard } from './components/layout/Dashboard';
import './index.css';

function MainView() {
  const { viewMode } = useStudio();

  return (
    <div style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column' }}>
      <Header />
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {viewMode === 'DASHBOARD' ? (
          <Dashboard />
        ) : (
          <StudioLayout
            canvas={<ImageCanvas />}
            sidebar={<PromptPanel />}
          />
        )}
      </div>
    </div>
  );
}

import { LogConsole } from './components/common/LogConsole';

function App() {
  return (
    <StudioProvider>
      <MainView />
      <LogConsole />
    </StudioProvider>
  );
}

export default App;
