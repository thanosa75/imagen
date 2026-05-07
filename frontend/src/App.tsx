import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import CapturePage from './features/capture/CapturePage';
import PromptsPage from './features/prompts/PromptsPage';
import PromptDetailPage from './features/prompts/PromptDetailPage';
import PromptFormPage from './features/prompts/PromptFormPage';
import JobsPage from './features/jobs/JobsPage';
import JobDetailPage from './features/jobs/JobDetailPage';
import SettingsPage from './features/settings/SettingsPage';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/capture" replace />} />
        <Route path="/capture" element={<CapturePage />} />
        <Route path="/prompts" element={<PromptsPage />} />
        <Route path="/prompts/new" element={<PromptFormPage />} />
        <Route path="/prompts/:id" element={<PromptDetailPage />} />
        <Route path="/prompts/:id/edit" element={<PromptFormPage />} />
        <Route path="/jobs" element={<JobsPage />} />
        <Route path="/jobs/:id" element={<JobDetailPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </Layout>
  );
}
